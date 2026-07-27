import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeckRenderer, MOTION_KEYFRAMES } from '@shared/DeckRenderer'
import { defaultDeck } from '@shared/deck'
import { CustomEffectStyles } from '@shared/useCustomEffects'
import { overlayStreamUrl, serverUrl } from '@shared/constants'
import { OVERLAY_STALE_MS, type OverlayState } from '@shared/overlay'

/**
 * OBS 브라우저 소스가 로드하는 페이지.
 * 앱과는 SSE 한 줄로만 연결된다 — 상태를 받아 그리기만 하고, 아무것도 되돌려 보내지 않는다.
 */

function Overlay(): React.JSX.Element {
  const [state, setState] = useState<OverlayState | null>(null)
  const [connected, setConnected] = useState(false)
  /** 앱에서 마지막으로 뭔가 온 시각. 이게 오래되면 앱이 죽은 것이다 */
  const [stale, setStale] = useState(false)
  const lastSeen = useRef(Date.now())

  useEffect(() => {
    const es = new EventSource(overlayStreamUrl(window.location))
    const seen = (): void => {
      lastSeen.current = Date.now()
      setStale(false)
    }

    es.addEventListener('state', (e) => {
      setState(JSON.parse((e as MessageEvent).data) as OverlayState)
      setConnected(true)
      seen()
    })
    // 상태가 안 바뀌어도 앱이 살아 있으면 이게 계속 온다
    es.addEventListener('ping', seen)
    es.onopen = (): void => {
      setConnected(true)
      seen()
    }
    es.onerror = (): void => setConnected(false)

    /*
     * `onerror` 만으로는 부족하다 — 앱이 죽어도 연결이 반쯤 열린 채 한참 남을 수 있고,
     * 그동안 마지막 장이 방송 화면에 박혀 있게 된다. 실제로 온 것이 있는지로 판단한다.
     */
    const watch = setInterval(() => {
      if (Date.now() - lastSeen.current > OVERLAY_STALE_MS) setStale(true)
    }, 1000)

    return () => {
      es.close()
      clearInterval(watch)
    }
  }, [])

  // 아직 앱과 연결되기 전 — OBS 화면에 아무것도 그리지 않는다 (투명 유지)
  if (!state) {
    return (
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          font: '13px "Malgun Gothic", sans-serif',
          color: connected ? 'rgba(255,255,255,.4)' : 'rgba(255,120,120,.85)',
          textShadow: '0 1px 4px #000'
        }}
      >
        {connected ? 'endcredit · 대기 중' : 'endcredit · 앱에 연결되지 않음'}
      </div>
    )
  }

  /*
   * 앱에서 소식이 끊겼다 — **아무것도 그리지 않는다.**
   *
   * 앱이 죽는 순간 재생 중이었다면, 여기서 비우지 않으면 그 장이 방송 화면에 그대로
   * 박힌 채 남는다. 안내 문구조차 띄우지 않는다 — 방송에 글자가 뜨는 것 자체가 사고다.
   */
  if (stale) return <div />

  const deck = state.deck ?? defaultDeck()

  return (
    <>
      {/* 문서에 담겨 온 "내가 만든 효과"를 여기서도 등록·주입한다.
          이게 없으면 방송에서만 그 효과가 페이드로 바뀌어 나간다. */}
      <CustomEffectStyles deck={deck} />
      <DeckRenderer
        deck={deck}
        data={state.data}
        playing={state.playing}
        generation={state.generation}
        onlySlide={state.onlySlide ?? null}
        audio
        onFinished={() => {
          // 총 길이는 내용 높이에 따라 달라져 메인이 알 수 없다.
          // 실제로 다 그린 이 페이지가 알려주는 게 유일하게 정확하다.
          fetch(serverUrl(window.location, '/overlay/finished'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generation: state.generation })
          }).catch(() => {
            /* 앱이 닫힌 경우 등 — 오버레이가 할 수 있는 건 없다 */
          })
        }}
      />
      {/* 가짜 데이터가 방송에 그대로 나가는 사고를 막는다.
          정지 중에는 화면이 비어야 하므로 재생 중에만 띄운다. */}
      {state.sample && state.playing && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: 999,
            background: 'rgba(255,90,90,.9)',
            color: '#fff',
            font: '600 15px "Malgun Gothic", sans-serif',
            letterSpacing: '.02em'
          }}
        >
          샘플 데이터 (실제 방송 데이터 아님)
        </div>
      )}
    </>
  )
}

const style = document.createElement('style')
style.textContent = MOTION_KEYFRAMES
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>
)

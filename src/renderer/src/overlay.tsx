import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeckRenderer, MOTION_KEYFRAMES } from '@shared/DeckRenderer'
import { defaultDeck } from '@shared/deck'
import { overlayStreamUrl, serverUrl } from '@shared/constants'
import type { OverlayState } from '@shared/overlay'

/**
 * OBS 브라우저 소스가 로드하는 페이지.
 * 앱과는 SSE 한 줄로만 연결된다 — 상태를 받아 그리기만 하고, 아무것도 되돌려 보내지 않는다.
 */

function Overlay(): React.JSX.Element {
  const [state, setState] = useState<OverlayState | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const es = new EventSource(overlayStreamUrl(window.location))

    es.addEventListener('state', (e) => {
      setState(JSON.parse((e as MessageEvent).data) as OverlayState)
      setConnected(true)
    })
    es.onopen = (): void => setConnected(true)
    es.onerror = (): void => setConnected(false)

    return () => es.close()
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

  return (
    <>
      <DeckRenderer
        deck={state.deck ?? defaultDeck()}
        data={state.data}
        playing={state.playing}
        generation={state.generation}
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

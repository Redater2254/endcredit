import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MOTION_KEYFRAMES } from '@shared/DeckRenderer'
import type { CustomEffect } from '@shared/custom-effect'
import { EffectEditor } from './EffectEditor'
import { isTyping } from './keys'
import './styles.css'

/**
 * 효과 편집기 **전용 창**.
 *
 * 처음에는 편집 화면 위에 덮는 큰 상자로 만들었는데, 창을 나눠 쓰다 보니 키가 계속 부딪혔다 —
 * `Ctrl+Z` 는 효과가 아니라 문서를 되돌렸고, `Space` 는 캔버스 손도구가 먼저 가로챘다.
 * 창을 따로 띄우면 키보드가 통째로 이 창 것이 되어 그런 다툼이 원천적으로 사라진다.
 * 크레딧을 보면서 효과를 다듬을 수도 있다.
 */

// 테마는 그리기 전에 정해야 한다 (본 창과 같은 저장소를 본다)
document.documentElement.dataset.theme = localStorage.getItem('ui:theme') || 'dark'

const style = document.createElement('style')
style.textContent = MOTION_KEYFRAMES
document.head.appendChild(style)

/** 되돌리기 한 단계로 합칠 시간 — 손잡이를 끄는 동안은 한 덩어리다 */
const COALESCE_MS = 350

function FxWindow(): React.JSX.Element {
  const [effect, setEffect] = useState<CustomEffect | null>(null)
  const [fresh, setFresh] = useState(true)

  /**
   * 이 창만의 되돌리기.
   *
   * 본 창의 문서 기록과 섞이면 안 된다 — 효과를 다듬다 Ctrl+Z 를 눌렀는데
   * 슬라이드가 되돌아가면 무엇이 사라졌는지 알 수 없다.
   */
  const past = useRef<CustomEffect[]>([])
  const future = useRef<CustomEffect[]>([])
  const lastPush = useRef(0)
  const [histLen, setHistLen] = useState({ past: 0, future: 0 })

  useEffect(() => {
    window.endcredit.fx.onLoad((fx, isNew) => {
      setEffect(fx)
      setFresh(isNew)
      past.current = []
      future.current = []
      setHistLen({ past: 0, future: 0 })
    })
    window.endcredit.fx.ready()
  }, [])

  const change = useCallback((next: CustomEffect) => {
    setEffect((prev) => {
      if (prev) {
        const now = Date.now()
        // 연속된 미세 변경(손잡이 끌기)은 한 단계로 합친다
        if (now - lastPush.current > COALESCE_MS || past.current.length === 0) {
          past.current.push(prev)
          if (past.current.length > 100) past.current.shift()
        }
        lastPush.current = now
        future.current = []
        setHistLen({ past: past.current.length, future: 0 })
      }
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setEffect((cur) => {
      const prev = past.current.pop()
      if (!prev || !cur) return cur
      future.current.push(cur)
      lastPush.current = 0
      setHistLen({ past: past.current.length, future: future.current.length })
      return prev
    })
  }, [])

  const redo = useCallback(() => {
    setEffect((cur) => {
      const next = future.current.pop()
      if (!next || !cur) return cur
      past.current.push(cur)
      lastPush.current = 0
      setHistLen({ past: past.current.length, future: future.current.length })
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 글자를 치는 중에는 그 칸의 되돌리기가 우선이다 (슬라이더·체크상자는 우리 것)
      if (isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  if (!effect) return <div className="fxw-wait">불러오는 중…</div>

  return (
    <EffectEditor
      standalone
      effect={effect}
      history={histLen}
      onUndo={undo}
      onRedo={redo}
      onChange={change}
      onSave={() => window.endcredit.fx.done({ action: 'save', effect })}
      onCancel={() => window.endcredit.fx.done({ action: 'cancel' })}
      onDelete={fresh ? undefined : () => window.endcredit.fx.done({ action: 'delete', effect })}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FxWindow />
  </StrictMode>
)

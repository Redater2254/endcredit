import { useEffect, useRef, useState } from 'react'

/**
 * 포토샵식 캔버스 조작.
 *
 *   Space          누른 채 끌기 → 손도구 (화면 이동)
 *   Ctrl + Space   누른 채 클릭  → 확대 (Alt 함께 누르면 축소)
 *   Ctrl + 휠                    → 확대/축소
 *
 * 키를 누르고 있는 동안만 도구가 바뀌므로, 도구를 눌러 바꾸고 되돌리는 수고가 없다.
 */
export type NavMode = 'none' | 'hand' | 'zoom'

export function useCanvasNav({
  onPan,
  onZoomBy
}: {
  /** 화면 픽셀 이동량 */
  onPan: (dx: number, dy: number) => void
  /**
   * 현재 배율에 곱할 값 (1보다 크면 확대).
   * `at` 은 그 자리를 **고정한 채** 확대하라는 화면 좌표다 — 없으면 화면 한가운데.
   */
  onZoomBy: (factor: number, at?: { x: number; y: number }) => void
}): {
  mode: NavMode
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onWheel: (e: React.WheelEvent) => void
  }
} {
  const [mode, setMode] = useState<NavMode>('none')
  /** anchor 는 누른 자리 — 옆으로 끌어도 **처음 누른 지점**을 축으로 확대한다 */
  const drag = useRef<{ x: number; y: number; anchor: { x: number; y: number } } | null>(null)
  const modeRef = useRef<NavMode>('none')
  const space = useRef(false)
  // 콜백 identity 가 매 렌더 바뀌어도 리스너를 다시 달지 않도록 ref 로 잡는다
  const panRef = useRef(onPan)
  const zoomRef = useRef(onZoomBy)
  panRef.current = onPan
  modeRef.current = mode
  zoomRef.current = onZoomBy

  useEffect(() => {
    function apply(ctrl: boolean): void {
      setMode(space.current ? (ctrl ? 'zoom' : 'hand') : 'none')
    }

    function onKeyDown(e: KeyboardEvent): void {
      // 입력란에서 스페이스를 치는 중이면 건드리지 않는다
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return

      if (e.code === 'Space') {
        e.preventDefault()
        space.current = true
      }
      apply(e.ctrlKey)
    }

    function onKeyUp(e: KeyboardEvent): void {
      if (e.code === 'Space') space.current = false
      apply(e.ctrlKey)
    }

    // 창이 포커스를 잃으면 키를 뗀 걸 못 받으므로 초기화한다
    function reset(): void {
      space.current = false
      setMode('none')
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', reset)
    }
  }, [])

  useEffect(() => {
    function move(e: PointerEvent): void {
      if (!drag.current) return
      const dx = e.clientX - drag.current.x
      const dy = e.clientY - drag.current.y
      drag.current = { ...drag.current, x: e.clientX, y: e.clientY }
      if (modeRef.current === 'zoom') {
        // 포토샵처럼 오른쪽으로 끌면 확대, 왼쪽이면 축소 — 연속적으로 움직인다
        if (dx !== 0) zoomRef.current(Math.exp(dx / 220), drag.current.anchor)
      } else {
        panRef.current(dx, dy)
      }
    }
    function up(): void {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  return {
    mode,
    handlers: {
      onPointerDown: (e: React.PointerEvent): void => {
        const anchor = { x: e.clientX, y: e.clientY }
        if (mode === 'hand') {
          e.preventDefault()
          e.stopPropagation()
          drag.current = { x: e.clientX, y: e.clientY, anchor }
        } else if (mode === 'zoom') {
          e.preventDefault()
          e.stopPropagation()
          // 누른 채 끌면 계속 확대되도록 드래그도 받는다
          drag.current = { x: e.clientX, y: e.clientY, anchor }
          zoomRef.current(e.altKey ? 1 / 1.25 : 1.25, anchor)
        }
      },
      onWheel: (e: React.WheelEvent): void => {
        if (!e.ctrlKey) return
        // 휠 델타에 비례해 부드럽게 — 단계로 끊으면 확대가 뚝뚝 끊긴다
        zoomRef.current(Math.exp(-e.deltaY / 400), { x: e.clientX, y: e.clientY })
      }
    }
  }
}

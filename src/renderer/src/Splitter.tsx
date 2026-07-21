import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 패널 사이 크기 조절 손잡이.
 *
 * 고정 폭이면 창이 작을 때 패널이 잘려 보인다. 사용자가 직접 늘릴 수 있어야 한다.
 * 조절한 크기는 저장해 두어, 다시 켤 때마다 다시 맞추지 않게 한다.
 */

export function useSplit(
  key: string,
  initial: number,
  min: number,
  max: number
): [number, (v: number) => void] {
  const [value, setValue] = useState(() => {
    const saved = Number(localStorage.getItem(`split:${key}`))
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : initial
  })

  const set = useCallback(
    (v: number) => {
      const clamped = Math.min(max, Math.max(min, v))
      setValue(clamped)
      localStorage.setItem(`split:${key}`, String(clamped))
    },
    [key, min, max]
  )

  return [value, set]
}

export function Splitter({
  axis,
  value,
  onChange,
  /** 손잡이를 끌 때 값이 커지는 방향. 오른쪽 패널은 반대로 움직인다. */
  invert = false
}: {
  axis: 'x' | 'y'
  value: number
  onChange: (v: number) => void
  invert?: boolean
}): React.JSX.Element {
  const drag = useRef<{ pos: number; start: number } | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange

  useEffect(() => {
    function move(e: PointerEvent): void {
      const d = drag.current
      if (!d) return
      const cur = axis === 'x' ? e.clientX : e.clientY
      const delta = (cur - d.pos) * (invert ? -1 : 1)
      changeRef.current(d.start + delta)
    }
    function up(): void {
      drag.current = null
      document.body.classList.remove('splitting')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [axis, invert])

  return (
    <div
      className={`splitter split-${axis}`}
      onPointerDown={(e) => {
        e.preventDefault()
        drag.current = { pos: axis === 'x' ? e.clientX : e.clientY, start: value }
        document.body.classList.add('splitting')
      }}
    >
      <span />
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * 패널 사이 크기 조절 손잡이.
 *
 * 고정 폭이면 창이 작을 때 패널이 잘려 보인다. 사용자가 직접 늘릴 수 있어야 한다.
 * 조절한 크기는 저장해 두어, 다시 켤 때마다 다시 맞추지 않게 한다.
 */

/**
 * 요소의 현재 크기. 창 크기·화면 배율이 바뀌면 따라온다.
 *
 * 저장된 패널 크기를 **지금 창에 맞춰 조이는** 데 쓴다. 이게 없으면 4K 에서 넓게
 * 벌려둔 값이 노트북에서도 그대로 복원되어, 캔버스 자리가 0 이하로 밀리고 화면이
 * 통째로 무너진다. `window.innerWidth` 가 아니라 **실제 그릇**을 재는 이유는
 * 그릇마다 바깥 여백이 다르고, 앱 줌이 걸리면 창 크기와 CSS px 가 어긋나기 때문이다.
 */
export function useBoxSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      setSize((p) => (p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return size
}

/**
 * 저장된 패널 크기를 지금 그릇에 맞춰 조인다.
 *
 * **저장값은 건드리지 않는다.** 좁은 화면에서 눌린 값을 되쓰면 큰 모니터로 돌아왔을 때
 * 원래 배치가 영영 사라진다 — 포토샵도 창을 줄였다 늘리면 패널이 제자리로 돌아온다.
 * 그릇을 아직 못 쟀으면(`room <= 0`) 저장값을 그대로 쓴다. 첫 렌더에 0 으로 눌러버리면
 * 패널이 접혔다 펴지며 깜빡인다.
 *
 * @param keep 그 축에서 패널에 내주면 안 되는 몫 — 캔버스 최소 크기 + 여백·손잡이
 */
export function fitSplit(value: number, min: number, room: number, keep: number): number {
  if (room <= 0) return value
  return Math.max(min, Math.min(value, room - keep))
}

/**
 * 양쪽 패널을 한꺼번에 조인다. 둘이 같은 그릇을 나눠 쓰므로 따로 조이면
 * 각자는 통과하는데 합이 넘치는 일이 생긴다.
 */
export function fitSides(
  room: number,
  left: number,
  right: number,
  minLeft: number,
  minRight: number,
  keep: number
): { left: number; right: number } {
  if (room <= 0) return { left, right }
  const budget = room - keep
  if (budget >= left + right) return { left, right }
  // 최소치로도 안 들어가면 최소치까지만 — 그 아래로는 패널이 제 구실을 못 한다
  if (budget <= minLeft + minRight) return { left: minLeft, right: minRight }
  const k = budget / (left + right)
  const l = Math.max(minLeft, Math.round(left * k))
  return { left: l, right: Math.max(minRight, budget - l) }
}

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

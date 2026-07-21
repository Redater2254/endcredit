import type { Frame, SlideElement } from '@shared/deck'

/**
 * 스냅(자석) — 끌어 옮길 때 기준선에 착 달라붙게 한다.
 *
 * 붙는 대상은 **캔버스의 좌·중앙·우/상·중앙·하**, 그리고 **다른 요소의 각 변과 중심선**.
 * 눈으로 대충 맞추면 1~2% 씩 어긋나는데, 그 어긋남이 방송 화면에서는 꽤 크게 보인다.
 */

export interface Guide {
  axis: 'x' | 'y'
  /** 캔버스 대비 % */
  at: number
}

export interface SnapResult {
  frame: Frame
  guides: Guide[]
}

/** 한 축에서 후보 기준선들 */
function targetsFor(others: SlideElement[], axis: 'x' | 'y'): number[] {
  const out = [0, 50, 100]
  for (const e of others) {
    const p = axis === 'x' ? e.frame.x : e.frame.y
    const size = axis === 'x' ? e.frame.w : e.frame.h
    out.push(p, p + size / 2, p + size)
  }
  return out
}

/** 움직이는 상자가 내미는 위치들 (앞·중간·뒤) */
function edgesOf(frame: Frame, axis: 'x' | 'y'): number[] {
  const p = axis === 'x' ? frame.x : frame.y
  const size = axis === 'x' ? frame.w : frame.h
  return [p, p + size / 2, p + size]
}

/**
 * 이동 중인 프레임을 기준선에 붙인다.
 * `threshold` 는 캔버스 대비 % (화면 픽셀에서 환산해 넘긴다).
 */
export function snapMove(frame: Frame, others: SlideElement[], threshold: number): SnapResult {
  const guides: Guide[] = []
  const next = { ...frame }

  for (const axis of ['x', 'y'] as const) {
    const targets = targetsFor(others, axis)
    let best: { delta: number; at: number } | null = null

    for (const edge of edgesOf(frame, axis)) {
      for (const t of targets) {
        const delta = t - edge
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, at: t }
        }
      }
    }

    if (best) {
      if (axis === 'x') next.x += best.delta
      else next.y += best.delta
      guides.push({ axis, at: best.at })
    }
  }

  return { frame: next, guides }
}

/**
 * 크기 조절 중 — **끌고 있는 변만** 붙인다.
 * 반대쪽 변까지 움직이면 크기가 제멋대로 바뀐다.
 */
export function snapResize(
  frame: Frame,
  others: SlideElement[],
  threshold: number,
  handle: string
): SnapResult {
  const guides: Guide[] = []
  const next = { ...frame }

  const stick = (axis: 'x' | 'y', edge: number, apply: (delta: number) => void): void => {
    let best: { delta: number; at: number } | null = null
    for (const t of targetsFor(others, axis)) {
      const delta = t - edge
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, at: t }
      }
    }
    if (best) {
      apply(best.delta)
      guides.push({ axis, at: best.at })
    }
  }

  if (handle.includes('w')) {
    stick('x', next.x, (d) => {
      next.x += d
      next.w -= d
    })
  }
  if (handle.includes('e')) stick('x', next.x + next.w, (d) => (next.w += d))
  if (handle.includes('n')) {
    stick('y', next.y, (d) => {
      next.y += d
      next.h -= d
    })
  }
  if (handle.includes('s')) stick('y', next.y + next.h, (d) => (next.h += d))

  return { frame: next, guides }
}

/** 화면 픽셀 기준 스냅 거리 → 캔버스 % */
export function thresholdPct(px: number, canvasSize: number, scale: number): number {
  return (px / (canvasSize * scale)) * 100
}

import { useEffect, useRef } from 'react'
import type { Frame, SlideElement } from '@shared/deck'
import { snapMove, thresholdPct, type Guide } from './snap'

/**
 * 여러 요소를 함께 다루는 변형 상자.
 *
 * 선택한 요소들을 감싸는 바깥 상자를 그리고, 끌면 전부 같이 움직이고
 * 손잡이를 끌면 **상자 기준으로 비율을 유지한 채** 전부 늘어난다.
 * 요소마다 따로 옮기면 간격이 흐트러지므로, 묶음 작업은 이 방식이어야 한다.
 */

type Handle = 'move' | 'se' | 'sw' | 'ne' | 'nw'

export function MultiSelectionBox({
  elements,
  others,
  transform,
  canvasW,
  canvasH,
  scale,
  onChange,
  onCommit,
  onGuides
}: {
  elements: SlideElement[]
  /** 붙을 대상이 되는 나머지 요소들 */
  others: SlideElement[]
  /** 자유 변형(Ctrl+T) 중인지 */
  transform: boolean
  canvasW: number
  canvasH: number
  scale: number
  /** 요소 id → 새 프레임 */
  onChange: (frames: Record<string, Frame>) => void
  onCommit: () => void
  onGuides: (guides: Guide[]) => void
}): React.JSX.Element | null {
  const drag = useRef<{
    handle: Handle
    x: number
    y: number
    box: Frame
    starts: Record<string, Frame>
  } | null>(null)
  const changeRef = useRef(onChange)
  const commitRef = useRef(onCommit)
  const guidesRef = useRef(onGuides)
  const othersRef = useRef(others)
  changeRef.current = onChange
  commitRef.current = onCommit
  guidesRef.current = onGuides
  othersRef.current = others

  useEffect(() => {
    function move(e: PointerEvent): void {
      const d = drag.current
      if (!d) return
      let dx = ((e.clientX - d.x) / (canvasW * scale)) * 100
      let dy = ((e.clientY - d.y) / (canvasH * scale)) * 100

      // Shift + 이동 = 축 고정
      if (e.shiftKey && d.handle === 'move') {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }

      const next: Record<string, Frame> = {}
      let guides: Guide[] = []

      if (d.handle === 'move') {
        // 바깥 상자를 먼저 붙이고, 그 이동량을 전원에게 똑같이 적용한다.
        // 요소마다 따로 붙이면 서로 어긋나 간격이 무너진다.
        const moved = { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
        let finalX = moved.x
        let finalY = moved.y

        if (!e.ctrlKey && !e.metaKey) {
          const t = Math.min(
            thresholdPct(7, canvasW, scale),
            thresholdPct(7, canvasH, scale)
          )
          const r = snapMove(moved, othersRef.current, t)
          finalX = r.frame.x
          finalY = r.frame.y
          guides = r.guides
        }

        const ddx = finalX - d.box.x
        const ddy = finalY - d.box.y
        for (const [id, f] of Object.entries(d.starts)) {
          next[id] = { ...f, x: f.x + ddx, y: f.y + ddy }
        }
      } else {
        // 모서리 손잡이 — 상자 크기 변화만큼 모든 요소를 같은 비율로 늘린다
        const signX = d.handle.includes('e') ? 1 : -1
        const signY = d.handle.includes('s') ? 1 : -1
        const nw = Math.max(2, d.box.w + dx * signX)
        const nh = Math.max(2, d.box.h + dy * signY)
        const sx = nw / d.box.w
        const sy = nh / d.box.h
        // 잡지 않은 쪽 모서리를 고정점으로 삼는다
        const ax = signX > 0 ? d.box.x : d.box.x + d.box.w
        const ay = signY > 0 ? d.box.y : d.box.y + d.box.h

        for (const [id, f] of Object.entries(d.starts)) {
          next[id] = {
            x: ax + (f.x - ax) * sx,
            y: ay + (f.y - ay) * sy,
            w: f.w * sx,
            h: f.h * sy
          }
        }
      }

      guidesRef.current(guides)
      changeRef.current(next)
    }

    function up(): void {
      if (drag.current) {
        drag.current = null
        guidesRef.current([])
        commitRef.current()
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [canvasW, canvasH, scale])

  if (elements.length === 0) return null
  const box = boundingBox(elements)

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const starts: Record<string, Frame> = {}
    elements.forEach((el) => (starts[el.id] = { ...el.frame }))
    drag.current = { handle, x: e.clientX, y: e.clientY, box, starts }
  }

  return (
    <div
      className={`sel-box multi ${transform ? 'xform' : 'plain'}`}
      style={{
        left: (box.x / 100) * canvasW * scale,
        top: (box.y / 100) * canvasH * scale,
        width: (box.w / 100) * canvasW * scale,
        height: (box.h / 100) * canvasH * scale
      }}
      onPointerDown={start('move')}
    >
      {transform &&
        (['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => (
          <span key={h} className={`sel-h sel-${h}`} onPointerDown={start(h)} />
        ))}
      <span className="sel-label">
        {elements.length}개 선택됨{transform ? '' : ' · 자유 변형 Ctrl+T'}
      </span>
    </div>
  )
}

export function boundingBox(elements: SlideElement[]): Frame {
  const x = Math.min(...elements.map((e) => e.frame.x))
  const y = Math.min(...elements.map((e) => e.frame.y))
  const r = Math.max(...elements.map((e) => e.frame.x + e.frame.w))
  const b = Math.max(...elements.map((e) => e.frame.y + e.frame.h))
  return { x, y, w: Math.max(2, r - x), h: Math.max(2, b - y) }
}

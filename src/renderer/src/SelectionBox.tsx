import { useEffect, useRef } from 'react'
import type { Frame, SlideElement } from '@shared/deck'
import { snapMove, snapResize, thresholdPct, type Guide } from './snap'

/**
 * 선택한 요소의 변형 상자. 파워포인트/포토샵과 같은 8방향 손잡이.
 *
 * 좌표는 캔버스 대비 % 로 저장하고, 화면에는 px 로 그린다.
 * 마우스 이동량을 배율로 나눠 % 로 되돌리므로 확대 상태에서도 커서를 정확히 따라간다.
 *
 *   Shift  — 이동은 축 고정(가로/세로만), 크기는 비율 유지, 회전은 15° 단위
 *   Ctrl   — 스냅(자석) 잠시 끄기
 */

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP_PX = 7

export function SelectionBox({
  element,
  others,
  transform,
  canvasW,
  canvasH,
  scale,
  onChange,
  onRotate,
  onCommit,
  onGuides,
  onDoubleClick
}: {
  element: SlideElement
  /** 붙을 대상이 되는 나머지 요소들 */
  others: SlideElement[]
  /** 자유 변형(Ctrl+T) 중인지. 꺼져 있으면 옮기기만 된다 */
  transform: boolean
  canvasW: number
  canvasH: number
  scale: number
  onChange: (frame: Frame) => void
  /** 회전각(도). 손잡이를 돌리는 동안 계속 불린다 */
  onRotate: (deg: number) => void
  onCommit: () => void
  onGuides: (guides: Guide[]) => void
  /**
   * 선택 상자가 요소를 덮기 때문에, 두 번 클릭도 여기서 받아야 한다.
   * 아래쪽 클릭판까지 이벤트가 내려가지 않아 글자 편집에 들어갈 수 없다.
   */
  onDoubleClick?: () => void
}): React.JSX.Element {
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Frame } | null>(null)
  /** 회전 중인 정보 — 상자 중심(화면 좌표)과 시작 각도 */
  const spin = useRef<{ cx: number; cy: number; from: number; base: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const rotateRef = useRef(onRotate)
  rotateRef.current = onRotate
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
      const r = spin.current
      if (r) {
        const now = angleOf(r.cx, r.cy, e.clientX, e.clientY)
        let deg = r.base + (now - r.from)
        // Shift 로 15° 단위 — 눈대중으로 수평·수직을 맞추기가 의외로 어렵다
        if (e.shiftKey) deg = Math.round(deg / 15) * 15
        rotateRef.current(normalizeDeg(deg))
        return
      }

      const d = drag.current
      if (!d) return

      let dx = ((e.clientX - d.x) / (canvasW * scale)) * 100
      let dy = ((e.clientY - d.y) / (canvasH * scale)) * 100

      // Shift + 이동 = 축 고정. 더 많이 움직인 쪽만 살린다
      if (e.shiftKey && d.handle === 'move') {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0
        else dx = 0
      }

      let next = resize(d.start, d.handle, dx, dy, e.shiftKey)
      let guides: Guide[] = []

      if (!e.ctrlKey && !e.metaKey) {
        const tx = thresholdPct(SNAP_PX, canvasW, scale)
        const ty = thresholdPct(SNAP_PX, canvasH, scale)
        const t = Math.min(tx, ty)
        const snapped =
          d.handle === 'move'
            ? snapMove(next, othersRef.current, t)
            : snapResize(next, othersRef.current, t, d.handle)
        next = snapped.frame
        guides = snapped.guides
      }

      guidesRef.current(guides)
      changeRef.current(next)
    }

    function up(): void {
      if (drag.current || spin.current) {
        drag.current = null
        spin.current = null
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

  const f = element.frame
  const start = (handle: Handle) => (e: React.PointerEvent) => {
    if (element.locked) return
    e.preventDefault()
    e.stopPropagation()
    drag.current = { handle, x: e.clientX, y: e.clientY, start: { ...f } }
  }

  const startSpin = (e: React.PointerEvent): void => {
    if (element.locked) return
    e.preventDefault()
    e.stopPropagation()
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    spin.current = {
      cx,
      cy,
      from: angleOf(cx, cy, e.clientX, e.clientY),
      base: element.rotation
    }
  }

  return (
    <div
      ref={boxRef}
      className={`sel-box ${element.locked ? 'locked' : ''} ${transform ? 'xform' : 'plain'}`}
      style={{
        left: (f.x / 100) * canvasW * scale,
        top: (f.y / 100) * canvasH * scale,
        width: (f.w / 100) * canvasW * scale,
        height: (f.h / 100) * canvasH * scale,
        // 요소가 돌아가 있으면 상자도 같이 돌아야 손잡이가 모서리에 붙는다
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined
      }}
      onPointerDown={start('move')}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onDoubleClick?.()
      }}
    >
      {/* 손잡이는 변형 모드에서만 — 평소에 떠 있으면 옮기려다 크기를 건드리게 된다 */}
      {transform &&
        !element.locked &&
        HANDLES.map((h) => <span key={h} className={`sel-h sel-${h}`} onPointerDown={start(h)} />)}
      {transform && !element.locked && (
        <span className="sel-rot" title="끌어서 회전 (Shift 15°씩)" onPointerDown={startSpin} />
      )}
      <span className="sel-label">
        {transform
          ? `${Math.round(f.x)}, ${Math.round(f.y)} · ${Math.round(f.w)}×${Math.round(f.h)}` +
            (element.rotation ? ` · ${Math.round(element.rotation)}°` : '')
          : '자유 변형 Ctrl+T'}
      </span>
    </div>
  )
}

/** 중심에서 커서까지의 각도(도). 위쪽이 0 이 되게 90 을 더한다. */
function angleOf(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90
}

function normalizeDeg(d: number): number {
  const n = d % 360
  return n > 180 ? n - 360 : n < -180 ? n + 360 : n
}

const MIN = 2

function resize(s: Frame, handle: Handle, dx: number, dy: number, keepRatio: boolean): Frame {
  if (handle === 'move') return { ...s, x: s.x + dx, y: s.y + dy }

  let { x, y, w, h } = s

  if (handle.includes('w')) {
    const nw = Math.max(MIN, s.w - dx)
    x = s.x + (s.w - nw)
    w = nw
  }
  if (handle.includes('e')) w = Math.max(MIN, s.w + dx)
  if (handle.includes('n')) {
    const nh = Math.max(MIN, s.h - dy)
    y = s.y + (s.h - nh)
    h = nh
  }
  if (handle.includes('s')) h = Math.max(MIN, s.h + dy)

  // Shift 를 누르면 비율 유지 — 이미지가 찌그러지는 걸 막는다
  if (keepRatio && handle.length === 2 && s.w > 0 && s.h > 0) {
    const ratio = s.h / s.w
    h = w * ratio
    if (handle.includes('n')) y = s.y + (s.h - h)
  }

  return { x, y, w, h }
}

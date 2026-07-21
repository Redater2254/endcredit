import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * 오른쪽 클릭 메뉴.
 *
 * 단축키를 아는 사람에게는 필요 없지만, 처음 여는 사람에게는 **여기가 기능 목록**이다.
 * 도구 막대까지 마우스를 옮기지 않고 요소 위에서 바로 처리할 수 있어야 한다.
 */

export interface MenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  /** 오른쪽에 흐리게 붙는 단축키 안내 */
  hint?: string
  /** 참이면 구분선 (label 은 무시) */
  sep?: boolean
  danger?: boolean
}

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState({ x, y })

  // 화면 밖으로 나가면 안쪽으로 당긴다 — 캔버스 오른쪽 끝에서 열면 잘린다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.min(x, window.innerWidth - r.width - 8)
    const ny = Math.min(y, window.innerHeight - r.height - 8)
    setPos({ x: Math.max(4, nx), y: Math.max(4, ny) })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    // 다음 tick 부터 듣는다 — 메뉴를 연 그 클릭이 곧바로 닫아버리지 않게
    const t = setTimeout(() => {
      window.addEventListener('pointerdown', close)
      window.addEventListener('wheel', close, { passive: true })
    }, 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('wheel', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <ul
      ref={ref}
      className="ctx-menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <li key={`s${i}`} className="ctx-sep" />
        ) : (
          <li key={it.label}>
            <button
              className={it.danger ? 'danger' : ''}
              disabled={it.disabled}
              onClick={() => {
                it.onClick?.()
                onClose()
              }}
            >
              <span>{it.label}</span>
              {it.hint && <em>{it.hint}</em>}
            </button>
          </li>
        )
      )}
    </ul>
  )
}

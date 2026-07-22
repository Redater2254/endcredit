import { useEffect, useLayoutEffect, useState } from 'react'
import { useOutsideClose } from './useOutsideClose'

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
  /**
   * 바깥 클릭은 **document 의 capture 단계**로 받는다.
   *
   * 예전에는 window 에 거품 단계로 붙였는데, 캔버스를 왼쪽 클릭하면 메뉴가 안 닫혔다.
   * 순서를 따라가면 이렇다:
   *
   *   1. pointerdown 이 리액트 루트에 닿아 캔버스 핸들러가 setSelected([]) 를 부른다
   *   2. pointerdown 은 **즉시 처리되는 이벤트**라 리액트가 그 자리에서 다시 그린다
   *   3. onClose 가 매번 새로 만들어지는 화살표 함수여서 이 효과가 통째로 재실행된다
   *      → 정리 단계에서 window 의 pointerdown 청취를 **떼어낸다**
   *   4. 그제서야 네이티브 이벤트가 window 에 도착한다 — 들을 사람이 없다
   *
   * 캔버스 밖(다시 그리지 않는 패널)을 누를 때만 닫혔던 이유가 이것이다.
   * useOutsideClose 는 onClose 를 ref 에 담아 열림 여부에만 반응하므로 다시 그려도
   * 청취가 끊기지 않고, capture 단계라 리액트 핸들러보다 **먼저** 실행된다.
   */
  const ref = useOutsideClose<HTMLUListElement>(true, onClose)
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

  // 화면을 굴리면 메뉴만 제자리에 남는다 — 같이 닫는다 (바깥 클릭은 위에서 처리)
  useEffect(() => {
    const close = (): void => onClose()
    window.addEventListener('wheel', close, { passive: true, capture: true })
    return () => window.removeEventListener('wheel', close, { capture: true })
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

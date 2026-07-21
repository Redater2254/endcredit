import { useEffect, useRef } from 'react'

/**
 * 바깥을 누르면 닫는다.
 *
 * 투명한 `fixed` 배경판을 깔아 클릭을 가로채는 방법은, 그 배경판이 여는 버튼을
 * 덮느냐 마느냐가 부모의 쌓임 맥락(transform·z-index)에 따라 달라져 조용히 깨진다.
 * 문서에서 직접 듣고 **컨테이너 안쪽인지**만 보면 그런 사정에 흔들리지 않는다.
 */
export function useOutsideClose<T extends HTMLElement>(
  open: boolean,
  onClose: () => void
): React.RefObject<T | null> {
  const ref = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return

    function onDown(e: PointerEvent): void {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) closeRef.current()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeRef.current()
    }

    // capture 로 받아야, 안쪽 요소가 이벤트를 멈춰도 바깥 클릭을 놓치지 않는다
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return ref
}

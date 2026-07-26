import { useMemo } from 'react'
import { setCustomEffects } from './effects'
import { customFiltersSvg, customKeyframesCss, normalize, toEffect } from './custom-effect'
import type { Deck } from './deck'

/**
 * 문서에 담긴 "내가 만든 효과"를 화면에 쓸 수 있게 준비한다.
 *
 * 세 가지를 한다:
 *   1. 카탈로그에 등록 — `getEffect(id)` 가 기본 효과처럼 찾아낸다
 *   2. `@keyframes` CSS 를 만든다 — 이걸 `<style>` 에 넣어야 실제로 움직인다
 *   3. 파도 비틀기용 SVG 필터를 만든다 — `filter: url(#...)` 이 가리킬 대상
 *
 * 등록은 **그리는 도중에** 해야 한다. useEffect 로 미루면 그 프레임의 속성 패널·라이브러리가
 * 아직 없는 효과를 찾다가 페이드로 대체해버려, 문서를 열자마자 효과가 바뀐 것처럼 보인다.
 */
export function useCustomEffects(deck: Deck | null): { css: string; svg: string } {
  /*
   * 효과 배열 **자체**를 의존성으로 쓴다.
   *
   * 예전에는 `JSON.stringify(list)` 를 의존성으로 걸었는데, 그러면 비교하려고 매 렌더마다
   * 전체를 직렬화한다 — 아끼려던 비용을 감시하는 데 쓰는 셈이다. 효과를 고치는 길은
   * `update({ ...deck, effects: next })` 하나뿐이라 배열이 바뀌면 참조도 반드시 바뀐다.
   */
  const effects = deck?.effects
  return useMemo(() => {
    // 예전 모양으로 저장된 효과도 여기서 트랙으로 옮겨 읽는다
    const list = (effects ?? []).map(normalize)
    setCustomEffects(list.map(toEffect))
    return { css: customKeyframesCss(list), svg: customFiltersSvg(list) }
  }, [effects])
}

/** 만든 효과의 키프레임과 필터를 문서에 심는다. */
export function CustomEffectStyles({ deck }: { deck: Deck | null }): React.JSX.Element {
  const { css, svg } = useCustomEffects(deck)
  return (
    <>
      <style>{css}</style>
      {/* 필터 정의만 담은 SVG — 그림은 없고 참조 대상만 있으므로 자리를 차지하지 않는다 */}
      {svg && (
        <svg
          aria-hidden
          width="0"
          height="0"
          style={{ position: 'absolute', pointerEvents: 'none' }}
          dangerouslySetInnerHTML={{ __html: `<defs>${svg}</defs>` }}
        />
      )}
    </>
  )
}

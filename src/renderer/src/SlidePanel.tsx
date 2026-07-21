import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { DeckRenderer } from '@shared/DeckRenderer'
import { slideHeightRatio, transitionOf, type Deck, type Slide } from '@shared/deck'
import { getEffect } from '@shared/effects'
import { getScreenEffect } from '@shared/screen-fx'
import { EFFECT_DRAG_TYPE, SCREEN_FX_DRAG_TYPE } from './EffectLibrary'
import type { CreditData } from '@shared/aggregate'

/**
 * 썸네일 하나.
 *
 * 슬라이드 수만큼 렌더러가 돌기 때문에, **자기 슬라이드가 바뀌지 않으면 다시 그리지 않는다.**
 * 그러지 않으면 요소 하나를 끌 때마다 모든 썸네일이 함께 다시 그려져 눈에 띄게 버벅인다.
 */
const SlideThumb = memo(
  function SlideThumb({
    slide,
    canvasW,
    canvasH,
    fontFamily,
    data,
    width,
    height,
    scale,
    ratio
  }: {
    slide: Slide
    canvasW: number
    canvasH: number
    fontFamily: string
    data: CreditData
    width: number
    height: number
    scale: number
    ratio: number
  }): React.JSX.Element {
    const miniDeck = useMemo<Deck>(
      () => ({
        version: 2,
        name: '',
        author: '',
        canvas: { width: canvasW, height: canvasH },
        font: { family: fontFamily },
        slides: [slide]
      }),
      [slide, canvasW, canvasH, fontFamily]
    )

    return (
      <div className="sp-thumb" style={{ width, height }}>
        <div
          className="sp-thumb-inner"
          style={{ width: canvasW, height: canvasH * ratio, transform: `scale(${scale})` }}
        >
          <DeckRenderer deck={miniDeck} data={data} playing={false} generation={0} slideIndex={0} />
        </div>
      </div>
    )
  },
  (a, b) =>
    a.slide === b.slide &&
    a.data === b.data &&
    a.width === b.width &&
    a.scale === b.scale &&
    a.ratio === b.ratio &&
    a.canvasW === b.canvasW &&
    a.canvasH === b.canvasH &&
    a.fontFamily === b.fontFamily
)

/**
 * 파워포인트식 슬라이드 목록.
 *
 * 썸네일은 실제 렌더러를 축소해 그린다 — 목록에서 본 모습과 실제가 다르면
 * 슬라이드를 하나하나 열어봐야 해서 목록의 의미가 없어진다.
 */
export function SlidePanel({
  deck,
  data,
  activeIndex,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
  onDropTransition,
  onDropScreenFx
}: {
  deck: Deck
  data: CreditData
  activeIndex: number
  onSelect: (i: number) => void
  onAdd: (kind: 'static' | 'scroll') => void
  onDuplicate: (i: number) => void
  onDelete: (i: number) => void
  onReorder: (from: number, to: number) => void
  /** 효과를 슬라이드에 떨구면 장 전환 효과가 된다 */
  onDropTransition: (i: number, effectId: string) => void
  /** 화면 효과(폭죽 등)를 떨구면 그 장에 걸린다 */
  onDropScreenFx: (i: number, effectId: string) => void
}): React.JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  // 썸네일은 패널 폭을 따라간다 — 패널을 넓혔는데 썸네일이 그대로면 넓힌 의미가 없다
  const listRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(168)
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(90, Math.min(520, e.contentRect.width - 34)))
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="sp">
      <div className="sp-list" ref={listRef}>
        {deck.slides.map((slide, i) => {
          const ratio = slideHeightRatio(slide)
          // 스크롤 슬라이드는 내용이 길어서, 폭이 아니라 **높이에 맞춰** 줄여야 전체가 보인다.
          // 폭 기준으로 줄이면 아래로 한없이 길어져 썸네일에 첫 화면만 걸린다.
          const h = (W * deck.canvas.height) / deck.canvas.width
          const thumbScale =
            ratio > 1
              ? Math.min(W / deck.canvas.width, h / (deck.canvas.height * ratio))
              : W / deck.canvas.width

          return (
            <div
              key={slide.id}
              className={[
                'sp-item',
                i === activeIndex ? 'sel' : '',
                dropAt === i ? 'drop' : '',
                dragFrom === i ? 'dragging' : ''
              ].join(' ')}
              draggable
              onClick={() => onSelect(i)}
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(i))
              }}
              onDragEnd={() => {
                setDragFrom(null)
                setDropAt(null)
              }}
              onDragOver={(e) => {
                const t = e.dataTransfer.types
                if (
                  dragFrom === null &&
                  !t.includes(EFFECT_DRAG_TYPE) &&
                  !t.includes(SCREEN_FX_DRAG_TYPE)
                ) {
                  return
                }
                e.preventDefault()
                setDropAt(i)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDropAt(null)
                const screen = e.dataTransfer.getData(SCREEN_FX_DRAG_TYPE)
                if (screen) return onDropScreenFx(i, screen)
                const fx = e.dataTransfer.getData(EFFECT_DRAG_TYPE)
                if (fx) return onDropTransition(i, fx)
                if (dragFrom !== null && dragFrom !== i) onReorder(dragFrom, i)
                setDragFrom(null)
              }}
            >
              <span className="sp-num">{i + 1}</span>

              <SlideThumb
                slide={slide}
                canvasW={deck.canvas.width}
                canvasH={deck.canvas.height}
                fontFamily={deck.font.family}
                data={data}
                width={W}
                height={h}
                scale={thumbScale}
                ratio={ratio}
              />

              <div className="sp-meta">
                <b>
                  {slide.kind === 'scroll' && <i className="sp-badge">스크롤</i>}
                  {slide.name || `슬라이드 ${i + 1}`}
                </b>
                <em>
                  {slide.kind === 'scroll'
                    ? `스크롤 · ${slide.scroll.speed}px/s`
                    : `${(slide.holdMs / 1000).toFixed(1)}초`}
                  {` · 요소 ${slide.elements.length}`}
                  {transitionOf(slide).preset !== 'none' &&
                    ` · ${getEffect(transitionOf(slide).preset).name}`}
                  {slide.screen && ` · ✨${getScreenEffect(slide.screen.effect)?.name ?? ''}`}
                </em>
              </div>

              <span className="sp-ops">
                <button
                  title="복제"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicate(i)
                  }}
                >
                  ⧉
                </button>
                <button
                  title="삭제"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(i)
                  }}
                >
                  🗑
                </button>
              </span>
            </div>
          )
        })}
      </div>

      <div className="sp-add">
        <button onClick={() => onAdd('static')}>＋ 새 슬라이드</button>
        <button onClick={() => onAdd('scroll')} title="내용이 위로 흐르는 긴 슬라이드">
          ＋ 스크롤
        </button>
      </div>
    </div>
  )
}

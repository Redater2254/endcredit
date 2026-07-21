import { useMemo, useState } from 'react'
import { DeckRenderer } from '@shared/DeckRenderer'
import { slideHeightRatio, type Deck } from '@shared/deck'
import { TEMPLATES } from '@shared/templates'
import type { CreditData } from '@shared/aggregate'
import { sampleCreditData } from '@shared/sample'

/**
 * 템플릿 고르기.
 *
 * 이름만 늘어놓으면 무엇이 다른지 알 수 없으므로 **실제 렌더러로 미리 그려** 보여준다.
 * 값이 비어 있으면 아무것도 안 보이니 미리보기에는 항상 샘플 데이터를 쓴다.
 */
export function TemplateGallery({
  onPick,
  onClose
}: {
  onPick: (deck: Deck) => void
  onClose: () => void
}): React.JSX.Element {
  const sample: CreditData = useMemo(() => sampleCreditData(), [])
  const built = useMemo(() => TEMPLATES.map((t) => ({ ...t, deck: t.build() })), [])
  const [slideIdx, setSlideIdx] = useState<Record<string, number>>({})

  return (
    <div className="help-back" onClick={onClose}>
      <div className="tpl" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>템플릿에서 시작</h2>
          <span className="mono">고르면 지금 문서를 대체합니다 (되돌리기 가능)</span>
          <div className="spacer" />
          <button onClick={onClose}>닫기</button>
        </header>

        <div className="tpl-grid">
          {built.map((t) => {
            const idx = slideIdx[t.id] ?? 0
            const slide = t.deck.slides[idx]
            const ratio = slideHeightRatio(slide)
            const W = 300
            const H = (W * t.deck.canvas.height) / t.deck.canvas.width
            const scale =
              ratio > 1
                ? Math.min(W / t.deck.canvas.width, H / (t.deck.canvas.height * ratio))
                : W / t.deck.canvas.width

            return (
              <div key={t.id} className="tpl-card">
                <div className="tpl-thumb" style={{ width: W, height: H }}>
                  <div
                    className="tpl-thumb-inner"
                    style={{
                      width: t.deck.canvas.width,
                      height: t.deck.canvas.height * ratio,
                      transform: `scale(${scale})`
                    }}
                  >
                    <DeckRenderer
                      deck={t.deck}
                      data={sample}
                      playing={false}
                      generation={0}
                      slideIndex={idx}
                    />
                  </div>
                </div>

                {/* 장이 여럿이면 넘겨보며 고를 수 있어야 한다 */}
                {t.deck.slides.length > 1 && (
                  <div className="tpl-dots">
                    {t.deck.slides.map((s, i) => (
                      <button
                        key={s.id}
                        className={i === idx ? 'on' : ''}
                        title={s.name}
                        onClick={() => setSlideIdx((p) => ({ ...p, [t.id]: i }))}
                      />
                    ))}
                  </div>
                )}

                <div className="tpl-meta">
                  <strong>{t.name}</strong>
                  <p>{t.description}</p>
                  <span className="mono">슬라이드 {t.deck.slides.length}장</span>
                </div>

                <button className="primary tpl-use" onClick={() => onPick(t.build())}>
                  이걸로 시작
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

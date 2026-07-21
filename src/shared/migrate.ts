import {
  createData,
  createImage,
  createSlide,
  createText,
  defaultDeck,
  DEFAULT_TEXT_STYLE,
  rankSlide,
  type Deck,
  type Slide
} from './deck'
import type { Preset as PresetV1, Section as SectionV1 } from './preset'

/**
 * v1(평면 섹션 목록) → v2(슬라이드) 변환.
 *
 * **섹션 하나당 슬라이드 한 장**으로 편다. v1 은 전부 한 흐름이었지만,
 * 그걸 한 장에 몰아넣으면 슬라이드로 나눈 의미가 사라진다.
 * 순위 섹션은 제목 + 1·2·3등 요소로 나눠, 등수마다 효과를 줄 수 있게 한다.
 */

const RANK_SOURCES = new Set([
  'chatRank',
  'balloonRank',
  'stickerRank',
  'newFans',
  'newTopFans',
  'newFollowers',
  'newSupporters'
])

export function migrateV1(old: PresetV1): Deck {
  const slides: Slide[] = []

  for (const s of old.sections ?? []) {
    const slide = convert(s)
    if (slide) slides.push(slide)
  }

  if (slides.length === 0) return defaultDeck()

  return {
    version: 2,
    name: old.name || '기본 프리셋',
    author: old.author ?? '',
    canvas: {
      width: old.canvas?.width ?? 1920,
      height: old.canvas?.height ?? 1080
    },
    font: { family: old.font?.family ?? 'Pretendard, "Malgun Gothic", sans-serif' },
    slides
  }
}

function convert(s: SectionV1): Slide | null {
  if (s.source === 'spacer') return null

  if (s.source === 'image') {
    const slide = createSlide(s.title || '이미지')
    const img = createImage(s.content, { x: 25, y: 15, w: 50, h: 70 })
    img.motion = { ...s.motion }
    slide.elements = [img]
    return slide
  }

  if (s.source === 'text') {
    const slide = createSlide(s.title || '문구')
    const t = createText(s.content || s.title, { x: 8, y: 36, w: 84, h: 28 })
    t.motion = { ...s.motion }
    t.style = {
      ...DEFAULT_TEXT_STYLE,
      size: s.style.titleSize,
      color: s.style.titleColor,
      align: s.style.align
    }
    slide.elements = [t]
    return slide
  }

  // 순위 계열은 등수별 요소로 나눈다 — 등수마다 다른 효과를 줄 수 있어야 한다
  if (RANK_SOURCES.has(s.source)) {
    const count = Math.max(1, Math.min(5, s.limit))
    const slide = rankSlide(s.title || '순위', s.source, count)
    slide.elements = slide.elements.map((el) =>
      el.kind === 'rank' ? { ...el, showValue: s.showValue } : el
    )
    return slide
  }

  // 명단 계열(구독자 등)은 목록 하나로 둔다
  const slide = createSlide(s.title || '명단')
  const heading = createText(s.title, { x: 10, y: 8, w: 80, h: 14 })
  heading.style = { ...DEFAULT_TEXT_STYLE, size: s.style.titleSize, color: s.style.titleColor }
  heading.name = '제목'

  const list = createData(s.source, { x: 12, y: 26, w: 76, h: 62 })
  list.motion = { ...s.motion }
  list.title = ''
  list.limit = s.limit
  list.showValue = s.showValue
  list.columns = s.style.columns
  list.gap = s.style.gap
  list.emptyBehavior = s.emptyBehavior
  list.placeholder = s.placeholder
  list.itemStyle = {
    ...DEFAULT_TEXT_STYLE,
    size: s.style.itemSize,
    color: s.style.color,
    weight: 500,
    align: s.style.align
  }
  list.valueColor = s.style.accentColor

  slide.elements = [heading, list]
  return slide
}

/** 저장 파일이 어떤 버전이든 v2 Deck 으로 만들어 돌려준다. */
export function toDeck(raw: unknown): Deck {
  if (!raw || typeof raw !== 'object') return defaultDeck()
  const v = (raw as { version?: number }).version

  if (v === 2) return raw as Deck
  if (v === 1) {
    try {
      return migrateV1(raw as PresetV1)
    } catch (err) {
      console.warn('[migrate] v1 → v2 변환 실패, 기본 문서를 씁니다:', err)
      return defaultDeck()
    }
  }
  return defaultDeck()
}

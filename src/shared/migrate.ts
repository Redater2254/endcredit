import {
  createData,
  createImage,
  createSlide,
  createText,
  defaultDeck,
  DEFAULT_TEXT_STYLE,
  delaysFor,
  makeSmart,
  rankSlide,
  type Deck,
  type Slide,
  type SlideElement,
  type SlideGroup,
  type SmartDoc
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

/** 예전 '고급 개체'가 묶음에 켜두던 플래그. 지금은 요소 한 종류다. */
type OldSmartGroup = SlideGroup & { smart?: boolean; scale?: number; rotate?: number }

/**
 * v2 문서 다듬기 — 예전 고급 개체(묶음 플래그)를 고급 개체 **요소**로 옮긴다.
 *
 * 그냥 두면 화면에 아무 표시도 없이 크기·회전이 사라진다. 새로 만드는 길과 **같은
 * `makeSmart()`** 를 쓰므로 변환본과 새로 만든 것이 따로 놀지 않는다.
 * 기차의 수치 표시도 여기서 함께 깨워준다.
 */

/**
 * 예전 기차는 **수치가 기본으로 꺼져** 있었다.
 *
 * 순위를 태우면서 몇 번 쳤는지·몇 개 쐈는지가 안 보이면 그냥 이름 행렬이 지나가는 것과
 * 같다. 등수 기능이 붙기 전(showRank 가 아예 없는) 문서만 골라 켜준다 — 그 뒤에 만든
 * 문서는 사용자가 직접 정한 값이므로 건드리지 않는다.
 */
function wakeTrainValues(els: SlideElement[]): SlideElement[] {
  return els.map((e) =>
    e.kind === 'train' && e.showRank === undefined ? { ...e, showValue: true } : e
  )
}

function normalizeV2(deck: Deck): Deck {
  const smarts: Record<string, SmartDoc> = { ...(deck.smarts ?? {}) }
  let touched = false

  for (const [id, d] of Object.entries(smarts)) {
    smarts[id] = { ...d, elements: wakeTrainValues(d.elements) }
  }

  const slides = deck.slides.map((s0) => {
    const slide = { ...s0, elements: wakeTrainValues(s0.elements) }
    const gids = Object.entries(slide.groups ?? {})
      .filter(([, g]) => (g as OldSmartGroup).smart)
      .map(([gid]) => gid)
    if (gids.length === 0) return stripSmartFlags(slide)

    touched = true
    const delays = delaysFor(slide)
    let elements: SlideElement[] = slide.elements
    const groups = { ...(slide.groups ?? {}) }

    for (const gid of gids) {
      const members = elements.filter((e) => e.groupId === gid)
      if (members.length === 0) {
        delete groups[gid]
        continue
      }
      const old = groups[gid] as OldSmartGroup
      const { el, doc } = makeSmart(
        members.map((m) => ({ ...m, groupId: null })),
        {},
        deck.canvas,
        old.name || '고급 개체',
        delays
      )

      // 예전 배율·회전은 요소 자신의 크기·회전으로 옮긴다 (가운데를 축으로 늘어나 있었다)
      const k = old.scale ?? 1
      if (k !== 1) {
        const cx = el.frame.x + el.frame.w / 2
        const cy = el.frame.y + el.frame.h / 2
        el.frame = { x: cx - (el.frame.w * k) / 2, y: cy - (el.frame.h * k) / 2, w: el.frame.w * k, h: el.frame.h * k }
      }
      el.rotation = old.rotate ?? 0
      // 묶음 효과가 걸려 있었다면 그대로 요소 효과로 넘긴다
      if (old.motion) el.motion = { ...old.motion }

      smarts[doc.id] = doc
      const at = elements.findIndex((e) => e.groupId === gid)
      elements = elements.filter((e) => e.groupId !== gid)
      elements.splice(Math.max(0, at), 0, el)
      delete groups[gid]
    }

    return stripSmartFlags({ ...slide, elements, groups })
  })

  if (!touched && !deck.smarts) return { ...deck, slides }
  return { ...deck, slides, smarts }
}

/** 남아 있는 묶음에서 예전 플래그를 떨군다 — 이제 아무도 읽지 않는다. */
function stripSmartFlags(slide: Slide): Slide {
  if (!slide.groups) return slide
  const groups: Record<string, SlideGroup> = {}
  for (const [gid, g] of Object.entries(slide.groups)) {
    const { smart: _s, scale: _c, rotate: _r, ...rest } = g as OldSmartGroup
    groups[gid] = rest
  }
  return { ...slide, groups }
}

/** 저장 파일이 어떤 버전이든 v2 Deck 으로 만들어 돌려준다. */
export function toDeck(raw: unknown): Deck {
  if (!raw || typeof raw !== 'object') return defaultDeck()
  const v = (raw as { version?: number }).version

  if (v === 2) return normalizeV2(raw as Deck)
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

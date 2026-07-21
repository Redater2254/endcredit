import {
  createImage,
  createShape,
  createSlide,
  createText,
  DEFAULT_TEXT_STYLE,
  listSlide,
  rankSlide,
  type Deck,
  type Slide,
  type SourceKind,
  type TextElement,
  type TextRun
} from './deck'
import { DEFAULT_MOTION } from './preset'
import { builtinAudioUrl } from './builtin-audio'

/**
 * 시작용 템플릿.
 *
 * **전부 텍스트 + 데이터 필드로 만든다.** 순위 위젯은 두 번 클릭 편집이 안 되지만,
 * `1등 {chatRank.1.name}` 같은 텍스트는 어느 장에서든 사용자가 문구·서식을
 * 직접 고칠 수 있다 — 템플릿은 고쳐 쓰라고 있는 것이니까.
 */

export interface Template {
  id: string
  name: string
  description: string
  build: () => Deck
}

const FONT = 'Pretendard, "Malgun Gothic", sans-serif'

/** 배경음악을 곁들인 문서. 기본 소리는 앱이 직접 만든 것이라 공유해도 문제없다. */
function deck(name: string, slides: Slide[], bgm?: { id: string; volume: number }): Deck {
  return {
    version: 2,
    name,
    author: '',
    canvas: { width: 1920, height: 1080 },
    font: { family: FONT },
    audio: bgm
      ? { bgm: { src: builtinAudioUrl(bgm.id), volume: bgm.volume }, fadeInMs: 1200, fadeOutMs: 1800, loop: true }
      : undefined,
    slides
  }
}

/** 이 장이 나올 때 울릴 효과음. */
function withSound(slide: Slide, id: string, volume = 80): Slide {
  slide.sound = { src: builtinAudioUrl(id), volume }
  return slide
}

function text(
  content: string,
  frame: { x: number; y: number; w: number; h: number },
  style: Partial<typeof DEFAULT_TEXT_STYLE> = {},
  motion: Partial<typeof DEFAULT_MOTION> = {}
): TextElement {
  const t = createText(content, frame)
  t.style = { ...DEFAULT_TEXT_STYLE, ...style }
  t.motion = { ...DEFAULT_MOTION, ...motion }
  t.name = content.replace(/\{[^}]+\}/g, '…').slice(0, 12) || '텍스트'
  return t
}

/** 부분 서식(runs)이 미리 입혀진 텍스트. */
function richText(
  runs: TextRun[],
  frame: { x: number; y: number; w: number; h: number },
  style: Partial<typeof DEFAULT_TEXT_STYLE> = {},
  motion: Partial<typeof DEFAULT_MOTION> = {}
): TextElement {
  const t = text(runs.map((r) => r.text).join(''), frame, style, motion)
  t.runs = runs
  return t
}

// ── 1. 심플 ────────────────────────────────────────────────
function simple(): Deck {
  const intro = createSlide('인사')
  intro.elements = [
    text('오늘도 함께해주셔서 감사합니다', { x: 8, y: 40, w: 84, h: 20 }, { size: 56 }, {
      preset: 'fade',
      durationMs: 800
    })
  ]

  const outro = createSlide('마무리')
  outro.elements = [text('내일도 만나요', { x: 15, y: 42, w: 70, h: 16 }, { size: 52 })]

  return deck(
    '심플',
    [
      intro,
      withSound(rankSlide('오늘의 수다왕', 'chatRank'), 'ding', 70),
      withSound(rankSlide('별풍선 감사합니다', 'balloonRank'), 'ding', 70),
      listSlide('오늘의 신규 구독자', 'newSubscribers'),
      outro
    ],
    { id: 'calm', volume: 50 }
  )
}

// ── 2. 화려하게 ────────────────────────────────────────────
function flashy(): Deck {
  const intro = createSlide('오프닝')
  intro.transition = { preset: 'zoom-in', durationMs: 600, easing: 'ease-out' }
  intro.elements = [
    text(
      '오늘 방송 함께해주셔서\n정말 감사합니다!',
      { x: 8, y: 34, w: 84, h: 32 },
      { size: 68, stroke: 3, strokeColor: '#1b1030' },
      { preset: 'pop', durationMs: 700 }
    )
  ]

  const podium = createSlide('수다왕 TOP3')
  podium.screen = { effect: 'sparkle', intensity: 80, durationMs: 2000, delayMs: 0 }
  podium.holdMs = 5200
  podium.transition = { preset: 'slide-up', durationMs: 550, easing: 'cubic-bezier(.22,1,.36,1)' }
  const gold = richText(
    [
      { text: '🥇 ', size: 72 },
      { text: '{chatRank.1.name}', size: 72, color: '#ffd166', weight: 900 },
      { text: '  {chatRank.1.value}', size: 36, color: '#b9a56b' }
    ],
    { x: 15, y: 28, w: 70, h: 20 },
    {},
    { preset: 'pop', durationMs: 700, loop: 'glow', loopDurationMs: 1600 }
  )
  gold.name = '1등'
  const silver = richText(
    [
      { text: '🥈 ', size: 44 },
      { text: '{chatRank.2.name}', size: 44 },
      { text: '  {chatRank.2.value}', size: 26, color: '#9aa0b5' }
    ],
    { x: 20, y: 52, w: 60, h: 13 },
    {},
    { preset: 'jelly', durationMs: 720 }
  )
  silver.name = '2등'
  const bronze = richText(
    [
      { text: '🥉 ', size: 44 },
      { text: '{chatRank.3.name}', size: 44 },
      { text: '  {chatRank.3.value}', size: 26, color: '#9aa0b5' }
    ],
    { x: 20, y: 67, w: 60, h: 13 },
    {},
    { preset: 'jelly', durationMs: 720 }
  )
  bronze.name = '3등'
  podium.elements = [
    text('오늘의 수다왕', { x: 10, y: 8, w: 80, h: 12 }, { size: 58, color: '#ffd166' }, {
      preset: 'bounce-drop',
      durationMs: 900
    }),
    gold,
    silver,
    bronze
  ]

  const balloon = rankSlide('별풍선 감사합니다', 'balloonRank')
  balloon.transition = { preset: 'flip-y', durationMs: 700, easing: 'cubic-bezier(.22,1,.36,1)' }
  balloon.elements = balloon.elements.map((e) =>
    e.kind === 'text' && e.name !== '제목'
      ? { ...e, motion: { ...e.motion, preset: 'spring', durationMs: 700 } }
      : e
  )

  const outro = createSlide('엔딩')
  outro.transition = { preset: 'fade', durationMs: 600, easing: 'ease-out' }
  // 마지막에 한 번 터뜨린다 — 크레딧의 마무리는 화려한 편이 낫다
  outro.screen = { effect: 'confetti', intensity: 120, durationMs: 3400, delayMs: 200 }
  outro.elements = [
    text('내일도 놀러오세요!', { x: 10, y: 40, w: 80, h: 20 }, { size: 64 }, {
      preset: 'swing-in',
      durationMs: 900,
      loop: 'float',
      loopDurationMs: 2600
    })
  ]

  return deck(
    '화려하게',
    [
      withSound(intro, 'whoosh', 75),
      // 1등 발표 앞에는 긴장감을, 발표 뒤에는 반짝임을
      withSound(podium, 'rise', 80),
      withSound(balloon, 'sparkle', 75),
      withSound(outro, 'pop', 70)
    ],
    { id: 'warm', volume: 58 }
  )
}

// ── 3. 클래식 롤 (영화 엔딩) ────────────────────────────────
function classicRoll(): Deck {
  const roll = createSlide('엔딩 크레딧', 'scroll')
  roll.scroll = { speed: 80, direction: 'up', contentHeight: 420 }

  const block = (title: string, source: SourceKind, y: number): TextElement[] => [
    text(title, { x: 15, y, w: 70, h: 8 }, { size: 40, color: '#cfd6ff' }),
    text(
      `{${source}.list}`,
      { x: 15, y: y + 10, w: 70, h: 40 },
      { size: 28, weight: 400, lineHeight: 1.8 }
    )
  ]

  roll.elements = [
    text('감사합니다', { x: 15, y: 6, w: 70, h: 12 }, { size: 64 }),
    ...block('오늘의 수다왕', 'chatRank', 30),
    ...block('별풍선', 'balloonRank', 90),
    ...block('신규 구독자', 'newSubscribers', 150),
    ...block('신규 팬클럽', 'newFans', 210),
    ...block('열혈 승급', 'newTopFans', 270),
    text('내일도 만나요', { x: 15, y: 340, w: 70, h: 14 }, { size: 52 })
  ]

  return deck('클래식 롤', [roll], { id: 'quiet', volume: 55 })
}

// ── 4. 미니멀 ──────────────────────────────────────────────
function minimal(): Deck {
  const line = (y: number): ReturnType<typeof createShape> => {
    const s = createShape({ x: 30, y, w: 40, h: 0.4 })
    s.fill = '#ffffff'
    s.opacity = 35
    return s
  }

  const page = (title: string, source: SourceKind): Slide => {
    const s = createSlide(title)
    s.holdMs = 3800
    s.transition = { preset: 'fade', durationMs: 700, easing: 'ease-out' }
    s.elements = [
      text(title, { x: 20, y: 26, w: 60, h: 8 }, { size: 26, color: '#9aa0b5', weight: 400 }, {
        preset: 'fade',
        durationMs: 700
      }),
      line(37),
      richText(
        [{ text: `{${source}.1.name}`, size: 52, weight: 700 }],
        { x: 20, y: 44, w: 60, h: 12 },
        {},
        { preset: 'fade', durationMs: 600, delayMs: 200 }
      ),
      richText(
        [
          { text: `{${source}.2.name}`, size: 32, weight: 300 },
          { text: '   ·   ', size: 32, weight: 300, color: '#4d5060' },
          { text: `{${source}.3.name}`, size: 32, weight: 300 }
        ],
        { x: 20, y: 60, w: 60, h: 10 },
        {},
        { preset: 'fade', durationMs: 600, delayMs: 450 }
      )
    ]
    return s
  }

  const thanks = createSlide('감사')
  thanks.transition = { preset: 'fade', durationMs: 800, easing: 'ease-out' }
  thanks.elements = [
    text('thank you', { x: 20, y: 44, w: 60, h: 14 }, { size: 64, weight: 300, shadow: false }, {
      preset: 'blur-in',
      durationMs: 900
    })
  ]

  return deck(
    '미니멀',
    [
      thanks,
      withSound(page('오늘의 수다왕', 'chatRank'), 'ding', 55),
      withSound(page('별풍선', 'balloonRank'), 'ding', 55)
    ],
    { id: 'calm', volume: 45 }
  )
}

// ── 5. 사진 한 장 ──────────────────────────────────────────
function withPhoto(): Deck {
  const cover = createSlide('표지')
  cover.holdMs = 4000
  cover.elements = [
    createImage('', { x: 34, y: 14, w: 32, h: 42 }),
    text('오늘도 감사합니다', { x: 10, y: 60, w: 80, h: 14 }, { size: 54 }, { preset: 'slide-up' }),
    text(
      '채팅 {total.messages}회 · 별풍선 {total.balloons}개 · {total.duration}',
      { x: 10, y: 76, w: 80, h: 8 },
      { size: 28, color: '#9aa0b5' },
      { preset: 'fade', delayMs: 400 }
    )
  ]

  const best = createSlide('오늘의 1등')
  best.holdMs = 4500
  best.elements = [
    text('오늘의 수다왕', { x: 10, y: 14, w: 80, h: 10 }, { size: 40, color: '#8ab4ff' }),
    createImage('', { x: 38, y: 26, w: 24, h: 32 }),
    richText(
      [
        { text: '{chatRank.1.name}', size: 58 },
        { text: ' 님', size: 34, color: '#9aa0b5' }
      ],
      { x: 15, y: 62, w: 70, h: 14 },
      {},
      { preset: 'pop', durationMs: 650 }
    )
  ]

  const outro = createSlide('마무리')
  outro.elements = [text('내일 봐요', { x: 15, y: 42, w: 70, h: 16 }, { size: 56 })]

  return deck(
    '사진 한 장',
    [withSound(cover, 'whoosh', 70), withSound(best, 'sparkle', 75), outro],
    { id: 'warm', volume: 52 }
  )
}

export const TEMPLATES: Template[] = [
  {
    id: 'simple',
    name: '심플',
    description: '한 장에 하나씩. 모든 글이 텍스트라 그대로 고쳐 쓰면 됩니다. 잔잔한 배경음악 포함.',
    build: simple
  },
  {
    id: 'flashy',
    name: '화려하게',
    description: '큰 글씨에 뽀잉·젤리·네온. 메달로 1·2·3등을 표시하고 효과음도 깔려 있습니다.',
    build: flashy
  },
  {
    id: 'classic',
    name: '클래식 롤',
    description: '영화 엔딩처럼 전체가 위로 흐릅니다. 조용한 피아노가 함께 흐릅니다.',
    build: classicRoll
  },
  {
    id: 'minimal',
    name: '미니멀',
    description: '얇은 글씨와 가는 선. 1등만 크게 두고 나머지는 조용하게.',
    build: minimal
  },
  {
    id: 'photo',
    name: '사진 한 장',
    description: '이미지 자리를 미리 잡아둔 구성. 합계 숫자도 함께 보여줍니다.',
    build: withPhoto
  }
]

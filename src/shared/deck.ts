import type { CreditData } from './aggregate'
import { builtinAudioUrl } from './builtin-audio'
import { DEFAULT_MOTION, exitDurationOf, type Motion, type SourceKind } from './preset'
export { DEFAULT_MOTION }
import { getScreenEffect, type ScreenFx } from './screen-fx'

/** 이 화면 효과가 계속 반복되는지 (반복이면 장 길이에 영향을 주지 않는다) */
function screenLoops(id: string): boolean {
  return getScreenEffect(id)?.loop ?? false
}

/**
 * 슬라이드 기반 문서 모델 (v2).
 *
 * 이전 모델(v1)은 "레이어" 하나가 *화면 한 장* 이기도 하고 *그 안의 요소* 이기도 해서,
 * 위치를 잡아도 어색하고 텍스트를 넣기도 불편했다. 파워포인트처럼 둘을 갈랐다.
 *
 *   슬라이드 = 화면 한 장  (좌측 썸네일)
 *   요소     = 그 안의 텍스트·이미지·순위  (캔버스에서 자유 배치)
 *
 * 좌표는 전부 캔버스 대비 % 라 해상도가 바뀌어도 그대로 맞는다.
 */

export type { Motion, SourceKind }

export interface Frame {
  /** 왼쪽 위 모서리 (%) */
  x: number
  y: number
  /** 폭·높이 (%) */
  w: number
  h: number
}

export interface TextStyle {
  /** 이 요소만의 글꼴. 비워두면 문서 기본 글꼴을 따른다. */
  fontFamily?: string
  size: number
  color: string
  weight: number
  align: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  lineHeight: number
  italic: boolean
  /** 밝은 방송 화면 위에서 읽히게 */
  shadow: boolean
  stroke: number
  strokeColor: string
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  size: 44,
  color: '#ffffff',
  weight: 700,
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.3,
  italic: false,
  shadow: true,
  stroke: 0,
  strokeColor: '#000000'
}

interface ElementBase {
  id: string
  name: string
  /**
   * 같은 값을 가진 요소끼리 한 덩어리로 다뤄진다.
   * 별도의 컨테이너를 만들지 않고 표시만 묶는 방식이라, 좌표 체계가 그대로 유지된다.
   */
  groupId?: string | null
  visible: boolean
  locked: boolean
  frame: Frame
  rotation: number
  opacity: number
  motion: Motion
}

/**
 * 글자 일부에만 걸리는 서식.
 * 없는 값은 요소 전체 스타일을 따른다 — 부분만 덮어쓰는 개념이다.
 */
export interface TextRun {
  text: string
  color?: string
  size?: number
  weight?: number
  italic?: boolean
}

export interface TextElement extends ElementBase {
  kind: 'text'
  /** 서식 없는 전체 글. runs 가 있으면 그쪽이 우선이고 이 값은 검색·표시용 사본이다. */
  text: string
  /** 부분 서식이 걸린 조각들. 없으면 text 를 통째로 한 가지 스타일로 그린다. */
  runs?: TextRun[]
  style: TextStyle
}

/** runs 를 평문으로 (목록 표시·검색용) */
export function runsToText(runs: TextRun[] | undefined, fallback: string): string {
  return runs && runs.length > 0 ? runs.map((r) => r.text).join('') : fallback
}

export interface ImageElement extends ElementBase {
  kind: 'image'
  src: string
  fit: 'contain' | 'cover'
  radius: number
}

export interface DataElement extends ElementBase {
  kind: 'data'
  source: SourceKind
  title: string
  limit: number
  showValue: boolean
  columns: 1 | 2 | 3
  /**
   * 여러 열일 때 채우는 순서.
   *  column — 한 열을 위에서 아래로 다 채우고 다음 열로 (명단·순위에 자연스럽다)
   *  row    — 왼쪽에서 오른쪽으로 한 줄씩
   */
  columnFlow?: 'row' | 'column'
  gap: number
  emptyBehavior: 'hide' | 'placeholder'
  placeholder: string
  titleStyle: TextStyle
  itemStyle: TextStyle
  valueColor: string
}

/**
 * 등수 **하나**만 보여주는 요소.
 *
 * 순위를 통짜 목록으로 그리면 1등·2등·3등에 서로 다른 효과를 줄 수 없다.
 * 등수마다 요소를 나눠야 "1등은 크게 뽀잉, 2·3등은 작게 페이드" 같은 게 가능해진다.
 */
export interface RankElement extends ElementBase {
  kind: 'rank'
  source: SourceKind
  /** 1부터 */
  rank: number
  showRank: boolean
  showValue: boolean
  /** 등수 표기 (예: "1등", "#1", "1") */
  rankFormat: string
  rankStyle: TextStyle
  nameStyle: TextStyle
  valueColor: string
  /** 해당 등수가 없을 때 */
  emptyBehavior: 'hide' | 'placeholder'
  placeholder: string
}

export interface ShapeElement extends ElementBase {
  kind: 'shape'
  shape: 'rect' | 'ellipse' | 'line'
  fill: string
  radius: number
}

export type SlideElement =
  | TextElement
  | ImageElement
  | DataElement
  | RankElement
  | ShapeElement

/** 소리 하나 — 배경음악이든 효과음이든 같은 모양이다. */
export interface AudioClip {
  /** 로컬 서버가 내보내는 주소 (OBS 는 file:// 을 못 읽는다) */
  src: string
  /** 0~100 */
  volume: number
}

export interface DeckAudio {
  /** 크레딧이 재생되는 내내 흐르는 배경음악 */
  bgm: AudioClip | null
  fadeInMs: number
  fadeOutMs: number
  /** 크레딧이 음악보다 길면 다시 처음부터 */
  loop: boolean
}

export const DEFAULT_DECK_AUDIO: DeckAudio = {
  bgm: null,
  fadeInMs: 1200,
  fadeOutMs: 1800,
  loop: true
}

/**
 * 장의 바닥.
 *
 * 색과 이미지는 **겹쳐서** 깔린다 — 이미지가 투명한 PNG 여도 뒤가 비지 않고,
 * 이미지를 반투명하게 낮추면 색이 배어 나와 톤을 잡을 수 있다.
 * 예전 문서에는 이미지 항목이 없으므로 전부 선택 항목이고, backgroundOf() 로 채운다.
 */
export interface SlideBackground {
  transparent: boolean
  color: string
  /** 로컬 서버가 내보내는 주소. 없으면 이미지 없음 */
  image?: string | null
  /**
   * cover   — 화면을 꽉 채운다 (넘치는 부분은 잘림)
   * contain — 잘리지 않게 전부 보이게 (남는 곳은 배경색)
   * stretch — 비율을 무시하고 화면에 맞춰 늘인다
   */
  imageFit?: 'cover' | 'contain' | 'stretch'
  /** 0~100. 낮추면 글자가 잘 읽힌다 */
  imageOpacity?: number
  /** 흐림 (px). 사진 위에 글자를 얹을 때 쓴다 */
  imageBlur?: number
}

const DEFAULT_BACKGROUND: Required<SlideBackground> = {
  transparent: true,
  color: '#000000',
  image: null,
  imageFit: 'cover',
  imageOpacity: 100,
  imageBlur: 0
}

/** 예전 문서에도 안전하게 배경 설정을 얻는다. */
export function backgroundOf(slide: Slide): Required<SlideBackground> {
  return { ...DEFAULT_BACKGROUND, ...slide.background }
}

/**
 * 묶음(폴더) 하나.
 *
 * 이름만 있던 값에 **묶음 자체의 효과**가 붙었다. 묶음 효과는 덩어리 전체를 감싼
 * 상자에 걸리고, 안의 요소 효과는 그 상자 안에서 따로 논다 — 둘은 서로를 덮지 않는다.
 */
export interface SlideGroup {
  name: string
  /** 덩어리 전체에 걸리는 효과. 없으면 상자를 만들지 않고 예전처럼 납작하게 그린다 */
  motion?: Motion | null
  /**
   * 안의 요소가 등장하는 방식 ('순서대로' 모드에서만 의미가 있다).
   *  together — 한 차례를 공유해 함께 (기본, 예전 동작)
   *  sequence — 각자 한 차례씩 차례로
   */
  inner?: 'together' | 'sequence'
}

export interface Slide {
  id: string
  name: string
  /** static = 한 화면에 머문다 · scroll = 내용이 위아래로 흐른다 */
  kind: 'static' | 'scroll'
  /** static 일 때 화면에 머무는 시간 */
  holdMs: number
  /** scroll 일 때 */
  scroll: {
    /** px/초 */
    speed: number
    direction: 'up' | 'down'
    /** 내용 높이 (캔버스 높이 대비 %, 100 = 한 화면) */
    contentHeight: number
  }
  background: SlideBackground
  /** 이 슬라이드가 화면에 나타날 때의 전환 효과 (요소 효과와 별개로 장 전체에 걸린다) */
  transition: { preset: string; durationMs: number; easing: string }
  /**
   * 요소 등장 순서.
   *  order  — 요소 목록 **위에서부터 차례로** 등장한다 (묶음은 한 차례로 센다)
   *  manual — 요소마다 지정한 시작 지연을 그대로 쓴다
   */
  order?: { mode: 'order' | 'manual'; gapMs: number }
  /** 묶음(폴더). 요소에는 groupId 만 두고 이름·효과는 여기 모아둔다. */
  groups?: Record<string, SlideGroup>
  /** 이 장이 화면에 나타날 때 한 번 울리는 효과음 */
  sound?: AudioClip | null
  /**
   * 화면 전체를 덮는 효과 (폭죽·눈·반짝이 …).
   * 요소 효과가 "이 글자가 어떻게 나오는가"라면, 이건 **장 전체의 분위기**다.
   */
  screen?: ScreenFx | null
  elements: SlideElement[]
}

export interface Deck {
  version: 2
  name: string
  author: string
  canvas: { width: number; height: number }
  font: { family: string }
  /** 예전 문서에는 없다 — 읽을 때 audioOf() 로 기본값을 채운다 */
  audio?: DeckAudio
  slides: Slide[]
}

/** 예전 문서에도 안전하게 소리 설정을 얻는다. */
export function audioOf(deck: Deck): DeckAudio {
  return { ...DEFAULT_DECK_AUDIO, ...(deck.audio ?? {}) }
}

export const DEFAULT_FRAME: Frame = { x: 10, y: 40, w: 80, h: 20 }

let counter = 0
export function newId(prefix = 'e'): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`
}

function base(name: string, frame?: Partial<Frame>): ElementBase {
  return {
    id: newId(),
    name,
    groupId: null,
    visible: true,
    locked: false,
    frame: { ...DEFAULT_FRAME, ...frame },
    rotation: 0,
    opacity: 100,
    motion: { ...DEFAULT_MOTION }
  }
}

export function createText(text = '텍스트를 입력하세요', frame?: Partial<Frame>): TextElement {
  return { ...base('텍스트', frame), kind: 'text', text, style: { ...DEFAULT_TEXT_STYLE } }
}

export function createImage(src = '', frame?: Partial<Frame>): ImageElement {
  return {
    ...base('이미지', { x: 30, y: 25, w: 40, h: 50, ...frame }),
    kind: 'image',
    src,
    fit: 'contain',
    radius: 0
  }
}

export function createData(source: SourceKind = 'chatRank', frame?: Partial<Frame>): DataElement {
  return {
    ...base('순위', { x: 15, y: 15, w: 70, h: 70, ...frame }),
    kind: 'data',
    source,
    title: '오늘의 수다왕',
    limit: 10,
    showValue: true,
    columns: 1,
    columnFlow: 'column',
    gap: 8,
    emptyBehavior: 'hide',
    placeholder: '없음',
    titleStyle: { ...DEFAULT_TEXT_STYLE, size: 40, color: '#8ab4ff' },
    itemStyle: { ...DEFAULT_TEXT_STYLE, size: 28, weight: 500 },
    valueColor: '#ffd166'
  }
}

export function createRank(
  source: SourceKind = 'chatRank',
  rank = 1,
  frame?: Partial<Frame>
): RankElement {
  const big = rank === 1
  return {
    ...base(`${rank}등`, { x: 20, y: 30 + (rank - 1) * 18, w: 60, h: 15, ...frame }),
    kind: 'rank',
    source,
    rank,
    showRank: true,
    showValue: true,
    rankFormat: '{n}등',
    rankStyle: {
      ...DEFAULT_TEXT_STYLE,
      size: big ? 56 : 38,
      color: big ? '#ffd166' : '#8ab4ff',
      align: 'right'
    },
    nameStyle: { ...DEFAULT_TEXT_STYLE, size: big ? 56 : 38, align: 'left' },
    valueColor: '#9aa0b5',
    emptyBehavior: 'hide',
    placeholder: '—'
  }
}

export function createShape(frame?: Partial<Frame>): ShapeElement {
  return {
    ...base('도형', { x: 20, y: 45, w: 60, h: 1, ...frame }),
    kind: 'shape',
    shape: 'rect',
    fill: '#ffffff',
    radius: 2
  }
}

export function createSlide(name: string, kind: Slide['kind'] = 'static'): Slide {
  return {
    id: newId('s'),
    name,
    kind,
    holdMs: 3500,
    scroll: { speed: 90, direction: 'up', contentHeight: 300 },
    background: { transparent: true, color: '#000000' },
    transition: { preset: 'fade', durationMs: 500, easing: 'ease-out' },
    order: { mode: 'order', gapMs: 260 },
    elements: []
  }
}

/** 폴더 이름. 없으면 순번으로 자동 이름을 만든다. */
export function groupName(slide: Slide, gid: string, index: number): string {
  return slide.groups?.[gid]?.name || `그룹 ${index}`
}

/** 묶음 자체에 걸린 효과. 없으면 null (= 상자를 만들지 않는다). */
export function groupMotion(slide: Slide, gid: string): Motion | null {
  return slide.groups?.[gid]?.motion ?? null
}

/** 실제로 화면에서 움직이는 효과가 걸려 있는지. 전부 비었으면 상자가 필요 없다. */
export function hasMotion(m: Motion | null | undefined): boolean {
  if (!m) return false
  return (m.preset !== 'none' && m.durationMs > 0) || Boolean(m.loop) || Boolean(m.exit)
}

/** 묶음에 속한 요소들 (목록 순서 그대로). */
export function groupMembers(slide: Slide, gid: string): SlideElement[] {
  return slide.elements.filter((e) => e.groupId === gid)
}

/** 요소 여럿을 감싸는 최소 사각형 (캔버스 대비 %). */
export function boundsOf(elements: SlideElement[]): Frame {
  const x = Math.min(...elements.map((e) => e.frame.x))
  const y = Math.min(...elements.map((e) => e.frame.y))
  const r = Math.max(...elements.map((e) => e.frame.x + e.frame.w))
  const b = Math.max(...elements.map((e) => e.frame.y + e.frame.h))
  // 폭이 0 이면 나눗셈이 무너진다 — 아주 얇은 도형도 상자 하나는 갖게 한다
  return { x, y, w: Math.max(0.01, r - x), h: Math.max(0.01, b - y) }
}

/** 바깥 상자 기준의 상대 좌표로 옮긴다 (상자 안에서 다시 % 로 잡히도록). */
export function rebaseFrame(f: Frame, box: Frame): Frame {
  return {
    x: ((f.x - box.x) / box.w) * 100,
    y: ((f.y - box.y) / box.h) * 100,
    w: (f.w / box.w) * 100,
    h: (f.h / box.h) * 100
  }
}

/** 예전 문서에는 order 가 없다 — 읽을 때 기본값을 채운다. */
export function orderOf(slide: Slide): { mode: 'order' | 'manual'; gapMs: number } {
  return slide.order ?? { mode: 'order', gapMs: 260 }
}

/**
 * 요소별 시작 지연을 계산한다.
 *
 * `order` 모드에서는 **목록 순서**가 등장 순서가 된다. 같은 묶음(group)에 속한
 * 요소들은 한 차례를 공유해 함께 등장한다 — 묶었으면 하나처럼 움직여야 하니까.
 */
export function delaysFor(slide: Slide): Record<string, number> {
  return allDelays(slide).el
}

/** 요소와 묶음 상자의 시작 지연을 한 번에. 둘은 같은 차례 계산을 공유해야 어긋나지 않는다. */
function allDelays(slide: Slide): { el: Record<string, number>; group: Record<string, number> } {
  const o = orderOf(slide)
  const el: Record<string, number> = {}
  const group: Record<string, number> = {}
  const steps = orderSteps(slide)

  if (o.mode === 'manual') {
    slide.elements.forEach((e) => (el[e.id] = e.motion.delayMs))
    for (const gid of Object.keys(steps.group)) {
      group[gid] = groupMotion(slide, gid)?.delayMs ?? 0
    }
    return { el, group }
  }

  slide.elements.forEach((e) => (el[e.id] = (steps.el[e.id] ?? 0) * o.gapMs))
  for (const [gid, step] of Object.entries(steps.group)) group[gid] = step * o.gapMs
  return { el, group }
}

/**
 * 요소별 등장 차례 (0부터). 묶음에 속한 요소들은 한 차례를 공유해 함께 등장한다
 * — 묶음이 '차례로'(inner: sequence)로 설정돼 있으면 안에서도 하나씩 센다.
 *
 * 기본은 **목록 위치**지만, `motion.order` 를 넣은 요소는 그 숫자로 끼어든다.
 * 목록 순서는 겹침 순서이기도 해서 둘을 따로 정할 길이 있어야 한다.
 */
function orderSteps(slide: Slide): { el: Record<string, number>; group: Record<string, number> } {
  const ranked = slide.elements.map((e, i) => ({ e, key: e.motion.order ?? i + 1, i }))
  ranked.sort((a, b) => a.key - b.key || a.i - b.i)

  const el: Record<string, number> = {}
  const group: Record<string, number> = {}
  let step = 0
  for (const { e } of ranked) {
    const gid = e.groupId
    if (!gid) {
      el[e.id] = step++
      continue
    }
    // 묶음이 처음 나온 자리가 곧 묶음 상자의 차례다
    const first = group[gid] === undefined
    if (first) group[gid] = step

    if (slide.groups?.[gid]?.inner === 'sequence') {
      el[e.id] = step++
    } else {
      // 함께 등장 — 한 차례를 나눠 쓰고, 차례는 묶음당 한 번만 넘어간다
      el[e.id] = group[gid]
      if (first) step++
    }
  }
  return { el, group }
}

/** 화면에 보여줄 등장 차례 (1부터). */
export function appearOrderOf(slide: Slide): Record<string, number> {
  const steps = orderSteps(slide)
  const out: Record<string, number> = {}
  for (const [id, n] of Object.entries(steps.el)) out[id] = n + 1
  for (const [gid, n] of Object.entries(steps.group)) out[gid] = n + 1
  return out
}

/** 예전 문서에는 transition 이 없다 — 읽을 때 기본값을 채운다. */
export function transitionOf(slide: Slide): Slide['transition'] {
  return slide.transition ?? { preset: 'fade', durationMs: 500, easing: 'ease-out' }
}

/**
 * 완전히 빈 문서.
 *
 * "새로 시작"은 **아무것도 없는 상태**여야 한다. 기본 구성을 얹어주면 그걸 지우는 일부터
 * 해야 해서, 새로 시작하는 의미가 없다. 빈 슬라이드 한 장만 두어 바로 그릴 수 있게 한다.
 */
export function emptyDeck(): Deck {
  return {
    version: 2,
    name: '새 프리셋',
    author: '',
    canvas: { width: 1920, height: 1080 },
    font: { family: 'Pretendard, "Malgun Gothic", sans-serif' },
    slides: [createSlide('슬라이드 1')]
  }
}

/**
 * 아무것도 안 만들어도 바로 쓸 수 있는 기본 문서.
 *
 * **장 하나에 하나씩** 보여주고, 순위는 1·2·3등을 **각각 별개 요소**로 둔다.
 * 그래야 등수마다 다른 효과·크기·위치를 줄 수 있다.
 */
export function defaultDeck(): Deck {
  const intro = createSlide('인사')
  intro.elements = [
    heading('오늘도 함께해주셔서 감사합니다', 56, { x: 8, y: 38, w: 84, h: 24 })
  ]

  const outro = createSlide('마무리')
  outro.elements = [heading('내일도 만나요', 52, { x: 15, y: 40, w: 70, h: 20 })]

  return {
    version: 2,
    name: '기본 프리셋',
    author: '',
    canvas: { width: 1920, height: 1080 },
    font: { family: 'Pretendard, "Malgun Gothic", sans-serif' },
    // 소리 없는 엔딩크레딧은 허전하다 — 기본으로 얌전한 배경음악을 깔아둔다
    audio: { ...DEFAULT_DECK_AUDIO, bgm: { src: builtinAudioUrl('calm'), volume: 50 } },
    slides: [
      intro,
      rankSlide('오늘의 수다왕', 'chatRank'),
      rankSlide('별풍선 감사합니다', 'balloonRank'),
      rankSlide('서포트 스티커', 'stickerRank'),
      listSlide('오늘의 신규 구독자', 'newSubscribers'),
      listSlide('오늘의 신규 팬클럽', 'newFans'),
      listSlide('열혈팬 승급', 'newTopFans'),
      outro
    ]
  }
}

function heading(text: string, size: number, frame: Partial<Frame>): TextElement {
  const t = createText(text, frame)
  t.style = { ...DEFAULT_TEXT_STYLE, size }
  t.name = '제목'
  t.motion = { ...DEFAULT_MOTION, preset: 'fade', durationMs: 700 }
  return t
}

/**
 * 제목 + 1·2·3등으로 이뤄진 슬라이드 한 장.
 *
 * 등수 줄은 **텍스트 + 데이터 필드**로 만든다. 순위 위젯은 두 번 클릭 편집이
 * 안 되지만, 텍스트라면 사용자가 문구·서식을 자유롭게 바꿀 수 있다.
 */
export function rankSlide(title: string, source: SourceKind, count = 3): Slide {
  const slide = createSlide(title)
  const heading = createText(title, { x: 10, y: 8, w: 80, h: 14 })
  heading.style = { ...DEFAULT_TEXT_STYLE, size: 52 }
  heading.name = '제목'
  heading.motion = { ...DEFAULT_MOTION, preset: 'fade', durationMs: 700 }

  const items = Array.from({ length: count }, (_, idx) => {
    const n = idx + 1
    const big = n === 1
    const t = createText('', { x: 18, y: 30 + idx * 18, w: 64, h: 15 })
    // 부분 서식으로 미리 꾸며둔다 — 그대로 두 번 클릭해서 고칠 수 있다
    t.runs = [
      { text: `${n}등  `, color: big ? '#ffd166' : '#8ab4ff', size: big ? 56 : 38, weight: 800 },
      { text: `{${source}.${n}.name}`, size: big ? 56 : 38 },
      { text: `  {${source}.${n}.value}`, color: '#9aa0b5', size: big ? 32 : 24, weight: 400 }
    ]
    t.text = t.runs.map((r) => r.text).join('')
    t.name = `${n}등`
    t.motion = {
      ...DEFAULT_MOTION,
      preset: big ? 'pop' : 'slide-right',
      durationMs: big ? 620 : 560,
      delayMs: 300 + idx * 220
    }
    return t
  })

  slide.holdMs = 4000
  slide.elements = [heading, ...items]
  return slide
}

/** 제목 + 명단. 명단도 텍스트 필드({...list})라 그대로 편집할 수 있다. */
export function listSlide(title: string, source: SourceKind): Slide {
  const slide = createSlide(title)
  const heading = createText(title, { x: 10, y: 10, w: 80, h: 14 })
  heading.style = { ...DEFAULT_TEXT_STYLE, size: 52 }
  heading.name = '제목'
  heading.motion = { ...DEFAULT_MOTION, preset: 'fade', durationMs: 700 }

  const body = createText(`{${source}.list}`, { x: 12, y: 32, w: 76, h: 52 })
  body.style = { ...DEFAULT_TEXT_STYLE, size: 34, weight: 500, lineHeight: 1.7 }
  body.name = '명단'
  body.motion = { ...DEFAULT_MOTION, preset: 'slide-up', durationMs: 560, delayMs: 350 }

  slide.holdMs = 4000
  slide.elements = [heading, body]
  return slide
}

/**
 * 이 장이 화면에 머무는 시간.
 *
 * 재생기(DeckRenderer)와 상태 표시가 **같은 계산**을 써야 한다. 따로 세면
 * "32초라더니 실제로는 40초" 같은 어긋남이 생긴다.
 */
export interface SlideTiming {
  /** 요소별 등장 시작 */
  delays: Record<string, number>
  /** 요소별 퇴장 시작. 퇴장 효과가 없는 요소는 아예 없다 */
  exitAt: Record<string, number>
  /** 묶음 상자의 등장 시작 · 퇴장 시작 (효과가 걸린 묶음만) */
  groupDelays: Record<string, number>
  groupExitAt: Record<string, number>
  /** 이 장 전체 길이 */
  durationMs: number
}

export function slideTiming(slide: Slide, canvasHeight: number): SlideTiming {
  const { el: delays, group: groupDelays } = allDelays(slide)
  // 효과가 걸린 묶음만 시간 계산에 낀다 — 이름만 붙여둔 묶음은 아무 일도 하지 않는다
  const moving = Object.keys(groupDelays)
    .map((gid) => ({ gid, motion: groupMotion(slide, gid) }))
    .filter((g): g is { gid: string; motion: Motion } => hasMotion(g.motion))

  // 스크롤 장은 요소가 화면 밖으로 흘러 나가므로 퇴장 효과를 쓰지 않는다
  if (slide.kind === 'scroll') {
    const contentPx = canvasHeight * slideHeightRatio(slide)
    return {
      delays,
      exitAt: {},
      groupDelays,
      groupExitAt: {},
      durationMs: ((contentPx + canvasHeight) / Math.max(10, slide.scroll.speed)) * 1000
    }
  }

  const contentEnd = Math.max(
    slide.elements.reduce(
      (m, e) => Math.max(m, (delays[e.id] ?? e.motion.delayMs) + e.motion.durationMs),
      0
    ),
    moving.reduce((m, g) => Math.max(m, groupDelays[g.gid] + g.motion.durationMs), 0)
  )
  const longestExit = Math.max(
    slide.elements.reduce(
      (m, e) => (e.motion.exit ? Math.max(m, exitDurationOf(e.motion)) : m),
      0
    ),
    moving.reduce((m, g) => (g.motion.exit ? Math.max(m, exitDurationOf(g.motion)) : m), 0)
  )
  // 퇴장이 머무는 시간보다 길면 장을 그만큼 늘린다 — 안 그러면 사라지다 말고 잘린다
  let durationMs = contentEnd + Math.max(slide.holdMs, longestExit)

  // 한 번만 터지는 화면 효과(폭죽 등)는 끝까지 보여야 한다. 반복하는 것(눈)은 셀 필요가 없다
  const fx = slide.screen
  if (fx && !screenLoops(fx.effect)) {
    durationMs = Math.max(durationMs, fx.delayMs + fx.durationMs)
  }

  const exitAt: Record<string, number> = {}
  for (const e of slide.elements) {
    if (!e.motion.exit) continue
    // 길이가 달라도 **끝을 맞춘다** — 동시에 사라져야 장 전환이 깔끔하다
    exitAt[e.id] = Math.max(contentEnd, durationMs - exitDurationOf(e.motion))
  }

  const groupExitAt: Record<string, number> = {}
  for (const g of moving) {
    if (!g.motion.exit) continue
    groupExitAt[g.gid] = Math.max(contentEnd, durationMs - exitDurationOf(g.motion))
  }

  return { delays, exitAt, groupDelays, groupExitAt, durationMs }
}

export function slideDurationMs(slide: Slide, canvasHeight: number): number {
  return slideTiming(slide, canvasHeight).durationMs
}

/** 크레딧 전체 길이. 요소가 하나도 안 보이는 장은 재생기가 건너뛰므로 빼고 센다. */
export function deckDurationMs(deck: Deck): number {
  return deck.slides
    .filter((s) => s.elements.some((e) => e.visible))
    .reduce((sum, s) => sum + slideDurationMs(s, deck.canvas.height), 0)
}

/** "1분 12초" 처럼 읽기 좋게. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return m > 0 ? `${m}분 ${sec}초` : `${sec}초`
}

/** 슬라이드 하나가 실제로 차지하는 높이 (캔버스 높이 대비 배수) */
export function slideHeightRatio(slide: Slide): number {
  return slide.kind === 'scroll' ? Math.max(100, slide.scroll.contentHeight) / 100 : 1
}

export interface RenderedLine {
  key: string
  label: string
  value: string | null
}

/** 데이터 요소가 실제로 그릴 줄들. */
export function linesForElement(el: DataElement, data: CreditData): RenderedLine[] {
  const rank = (rows: { userId: string; nickname: string; value: number }[], unit: string) =>
    rows.slice(0, el.limit).map((r) => ({
      key: r.userId,
      label: r.nickname,
      value: el.showValue ? `${r.value.toLocaleString()}${unit}` : null
    }))

  switch (el.source) {
    case 'chatRank':
      return rank(data.chatRank, '회')
    case 'emoticonRank':
      return rank(data.emoticonRank, '개')
    case 'giftRank':
      return rank(data.giftRank, '회')
    case 'balloonRank':
      return rank(data.balloonRank, '개')
    case 'stickerRank':
      return rank(data.stickerRank, '개')
    case 'newFans':
      return rank(data.newFans, '')
    case 'newTopFans':
      return rank(data.newTopFans, '')
    case 'newFollowers':
      return rank(data.newFollowers, '')
    case 'newSupporters':
      return rank(data.newSupporters, '')
    case 'newSubscribers':
      return data.newSubscribers.slice(0, el.limit).map((s) => ({
        key: s.userId,
        label: s.nickname,
        value: s.giftedBy ? `${s.giftedBy} 선물` : null
      }))
    case 'renewedSubscribers':
      return data.renewedSubscribers.slice(0, el.limit).map((s) => ({
        key: s.userId,
        label: s.nickname,
        value: el.showValue ? `${s.months}개월` : null
      }))
    case 'quickviewGifts':
      return data.quickviewGifts.slice(0, el.limit).map((q) => ({
        key: q.userId,
        label: q.nickname,
        value: q.type
      }))
    default:
      return []
  }
}

/** 특정 등수 한 줄. 없으면 null. */
export function lineForRank(el: RankElement, data: CreditData): RenderedLine | null {
  const fake = { ...el, limit: el.rank, showValue: el.showValue } as unknown as DataElement
  const lines = linesForElement(fake, data)
  return lines[el.rank - 1] ?? null
}

/** 데이터가 없어 숨겨야 하는 요소인지 */
export function isHiddenWhenEmpty(el: SlideElement, data: CreditData): boolean {
  if (el.kind === 'data') {
    return el.emptyBehavior === 'hide' && linesForElement(el, data).length === 0
  }
  if (el.kind === 'rank') {
    return el.emptyBehavior === 'hide' && lineForRank(el, data) === null
  }
  return false
}

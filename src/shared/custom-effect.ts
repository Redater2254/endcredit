import { keyframeName, type Effect, type EffectCategory } from './effects'

/**
 * 사용자가 직접 만드는 효과.
 *
 * 프리미어 프로·에프터이펙트와 같은 방식이다 — **속성마다 자기 트랙**을 갖는다.
 * 크기는 세 번 꺾이고 투명도는 두 번만 꺾이는 식으로 서로 따로 논다.
 *
 * 처음에는 "키프레임 하나가 모든 속성을 들고 있는" 방식으로 만들었는데, 크기만 바꾸려 해도
 * 그 시점의 회전·투명도까지 같이 박혀서 손대는 곳마다 엉켰다. 속성별로 쪼개니
 * 스톱워치를 켠 속성만 움직이고 나머지는 아예 관여하지 않는다.
 */

/** 움직일 수 있는 값들 */
export type PropKey =
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotate'
  | 'skewX'
  | 'skewY'
  | 'opacity'
  | 'blur'

export interface PropSpec {
  key: PropKey
  /** 한 줄에 여러 값이 있을 때 각 칸에 붙는 짧은 이름 */
  axis: string
  unit: string
  /** 스톱워치가 꺼져 있을 때의 값 = 아무것도 안 한 상태 */
  base: number
  min: number
  max: number
  step: number
  /** 값 끌기(스크럽) 한 칸이 몇인지 */
  drag: number
}

export const PROPS: PropSpec[] = [
  { key: 'x', axis: 'X', unit: '%', base: 0, min: -400, max: 400, step: 1, drag: 1 },
  { key: 'y', axis: 'Y', unit: '%', base: 0, min: -400, max: 400, step: 1, drag: 1 },
  { key: 'scaleX', axis: 'X', unit: '×', base: 1, min: 0, max: 5, step: 0.05, drag: 0.01 },
  { key: 'scaleY', axis: 'Y', unit: '×', base: 1, min: 0, max: 5, step: 0.05, drag: 0.01 },
  { key: 'rotate', axis: '', unit: '°', base: 0, min: -1080, max: 1080, step: 5, drag: 2 },
  // 기울이기 = 프리미어의 «뒤틀기» 계열. 한쪽으로 밀어 눕히는 변형이다
  { key: 'skewX', axis: 'X', unit: '°', base: 0, min: -80, max: 80, step: 1, drag: 1 },
  { key: 'skewY', axis: 'Y', unit: '°', base: 0, min: -80, max: 80, step: 1, drag: 1 },
  { key: 'opacity', axis: '', unit: '', base: 1, min: 0, max: 1, step: 0.05, drag: 0.01 },
  { key: 'blur', axis: '', unit: 'px', base: 0, min: 0, max: 40, step: 1, drag: 0.3 }
]

/**
 * 화면에 보이는 줄.
 *
 * X·Y 는 **한 줄에 두 칸**으로 묶는다 — 프리미어의 «위치 960.0 540.0» 과 같다.
 * 따로 두면 줄이 두 배로 늘어나고, 늘 함께 만지는 값이라 스톱워치도 두 번 켜야 했다.
 */
export interface PropGroup {
  label: string
  keys: PropKey[]
}

export const PROP_GROUPS: PropGroup[] = [
  { label: '위치', keys: ['x', 'y'] },
  { label: '크기', keys: ['scaleX', 'scaleY'] },
  { label: '회전', keys: ['rotate'] },
  { label: '기울이기', keys: ['skewX', 'skewY'] },
  { label: '불투명도', keys: ['opacity'] },
  { label: '흐림', keys: ['blur'] }
]

export const PROP_BY_KEY = Object.fromEntries(PROPS.map((p) => [p.key, p])) as Record<
  PropKey,
  (typeof PROPS)[number]
>

/** 한 속성의 시간축 위 한 점 */
export interface PropKeyframe {
  /** 효과 전체 길이에서 몇 % 지점인지 (0~100) */
  at: number
  value: number
  /** 이 점에서 **다음 점까지** 가는 속도 곡선. 마지막 점의 것은 쓰이지 않는다 */
  easing: string
}

/** 스톱워치를 켠 속성만 열쇠로 들어온다 */
export type Tracks = Partial<Record<PropKey, PropKeyframe[]>>

/**
 * 시간 전체에 걸리는 손질 — 트랙과 달리 "언제"가 없다.
 * 프리미어의 «시간 포스터화»·«파도 비틀기» 처럼 효과 위에 덧씌우는 것들이다.
 */
export interface EffectFilters {
  /**
   * 시간 포스터화 — 초당 몇 칸으로 끊어 재생할지. 0 이면 매끄럽게.
   * 옛날 필름·저프레임 느낌이 나고, 값이 작을수록 뚝뚝 끊긴다.
   */
  posterize?: number
  /** 파도 비틀기 — 화면을 물결처럼 일그러뜨린다 */
  wave?: { amount: number; speed: number } | null
}

export interface CustomEffect {
  /** `custom:` 으로 시작한다 — 기본 카탈로그 id 와 절대 겹치지 않게 */
  id: string
  name: string
  category: EffectCategory
  durationMs: number
  tracks: Tracks
  filters?: EffectFilters
}

export function filtersOf(fx: CustomEffect): Required<EffectFilters> {
  return { posterize: 0, wave: null, ...(fx.filters ?? {}) }
}

export const CUSTOM_PREFIX = 'custom:'

export function isCustomId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith(CUSTOM_PREFIX)
}

export const DEFAULT_EASING = 'cubic-bezier(.22,1,.36,1)'

let seq = 0
export function newCustomEffect(category: EffectCategory = 'in'): CustomEffect {
  seq += 1
  const rising = category !== 'out'
  return {
    id: `${CUSTOM_PREFIX}${Date.now().toString(36)}${seq.toString(36)}`,
    name: '새 효과',
    category,
    durationMs: 700,
    // 빈 시간축부터 시작하면 뭘 해야 할지 알 수 없다 — 손볼 거리가 있는 상태로 연다
    tracks: rising
      ? {
          opacity: [
            { at: 0, value: 0, easing: DEFAULT_EASING },
            { at: 100, value: 1, easing: DEFAULT_EASING }
          ],
          y: [
            { at: 0, value: 18, easing: DEFAULT_EASING },
            { at: 100, value: 0, easing: DEFAULT_EASING }
          ]
        }
      : {
          opacity: [
            { at: 0, value: 1, easing: DEFAULT_EASING },
            { at: 100, value: 0, easing: DEFAULT_EASING }
          ],
          y: [
            { at: 0, value: 0, easing: DEFAULT_EASING },
            { at: 100, value: -18, easing: DEFAULT_EASING }
          ]
        }
  }
}

// ── 트랙 다루기 ──────────────────────────────────────────────

export function sorted(track: PropKeyframe[]): PropKeyframe[] {
  return [...track].sort((a, b) => a.at - b.at)
}

/**
 * 그 시각의 값.
 *
 * 트랙이 없으면 "아무것도 안 한 상태"(base)를 돌려준다 — 스톱워치가 꺼진 속성은
 * 효과에 전혀 관여하지 않아야 한다.
 */
export function valueAt(fx: CustomEffect, key: PropKey, at: number): number {
  const track = fx.tracks[key]
  if (!track || track.length === 0) return PROP_BY_KEY[key].base

  const ks = sorted(track)
  if (at <= ks[0].at) return ks[0].value
  if (at >= ks[ks.length - 1].at) return ks[ks.length - 1].value

  const i = ks.findIndex((k) => k.at > at) - 1
  const a = ks[i]
  const b = ks[i + 1]
  const span = Math.max(0.0001, b.at - a.at)
  // 구간 안에서의 진행도에 **그 구간의 곡선**을 먹인다. 트랙마다 다를 수 있다
  const p = ease(parseBezier(a.easing), (at - a.at) / span)
  return a.value + (b.value - a.value) * p
}

/** 그 시각에 키프레임이 있는지 (있으면 그 키프레임) */
export function keyframeAt(
  fx: CustomEffect,
  key: PropKey,
  at: number,
  tolerance = 0.5
): PropKeyframe | null {
  const track = fx.tracks[key]
  if (!track) return null
  return track.find((k) => Math.abs(k.at - at) <= tolerance) ?? null
}

/**
 * 그 시각의 값을 정한다. 이미 점이 있으면 고치고, 없으면 새로 찍는다.
 * 프리미어와 같다 — 스톱워치가 켜진 채 값을 건드리면 그 자리에 키프레임이 생긴다.
 */
export function setValueAt(
  fx: CustomEffect,
  key: PropKey,
  at: number,
  value: number
): CustomEffect {
  const track = fx.tracks[key] ?? []
  const found = keyframeAt(fx, key, at)
  const next = found
    ? track.map((k) => (k === found ? { ...k, value } : k))
    : [...track, { at, value, easing: lastEasingBefore(track, at) }]
  return { ...fx, tracks: { ...fx.tracks, [key]: sorted(next) } }
}

/** 새 점은 앞 점의 곡선을 물려받는다 — 매번 기본값으로 되돌아가면 손이 두 번 간다 */
function lastEasingBefore(track: PropKeyframe[], at: number): string {
  const before = sorted(track).filter((k) => k.at < at)
  return before.length > 0 ? before[before.length - 1].easing : DEFAULT_EASING
}

export function patchKeyframe(
  fx: CustomEffect,
  key: PropKey,
  target: PropKeyframe,
  p: Partial<PropKeyframe>
): CustomEffect {
  const track = fx.tracks[key] ?? []
  return { ...fx, tracks: { ...fx.tracks, [key]: sorted(track.map((k) => (k === target ? { ...k, ...p } : k))) } }
}

export function removeKeyframe(fx: CustomEffect, key: PropKey, target: PropKeyframe): CustomEffect {
  const track = (fx.tracks[key] ?? []).filter((k) => k !== target)
  // 점이 하나도 안 남으면 트랙 자체를 끈다 — 점 없는 트랙은 아무 뜻이 없다
  if (track.length === 0) return toggleTrack(fx, key, false)
  return { ...fx, tracks: { ...fx.tracks, [key]: track } }
}

/** 스톱워치. 켜면 지금 값으로 시작·끝 두 점을 만든다. */
export function toggleTrack(fx: CustomEffect, key: PropKey, on: boolean, at = 0): CustomEffect {
  const tracks = { ...fx.tracks }
  if (!on) {
    delete tracks[key]
    return { ...fx, tracks }
  }
  const v = valueAt(fx, key, at)
  tracks[key] = [
    { at: 0, value: v, easing: DEFAULT_EASING },
    { at: 100, value: v, easing: DEFAULT_EASING }
  ]
  return { ...fx, tracks }
}

export function activeProps(fx: CustomEffect): PropKey[] {
  return PROPS.filter((p) => fx.tracks[p.key]?.length).map((p) => p.key)
}

// ── 줄(그룹) 단위로 다루기 ───────────────────────────────────

/** 한 줄이 켜져 있는지 — 안의 값 중 하나라도 트랙이 있으면 켜진 것이다 */
export function groupOn(fx: CustomEffect, g: PropGroup): boolean {
  return g.keys.some((k) => fx.tracks[k]?.length)
}

/** 줄 전체를 켜고 끈다. X 만 켜고 Y 는 꺼진 어정쩡한 상태를 만들지 않는다. */
export function toggleGroup(
  fx: CustomEffect,
  g: PropGroup,
  on: boolean,
  at = 0
): CustomEffect {
  return g.keys.reduce((acc, k) => toggleTrack(acc, k, on, at), fx)
}

/** 이 줄에 찍힌 키프레임 시점들 (X·Y 중 한쪽에만 있어도 한 점으로 본다) */
export function groupTimes(fx: CustomEffect, g: PropGroup): number[] {
  const set = new Set<number>()
  for (const k of g.keys) for (const kf of fx.tracks[k] ?? []) set.add(kf.at)
  return [...set].sort((a, b) => a - b)
}

/**
 * 줄의 한 시점을 지운다 — 그 자리에 있는 X·Y 를 **함께** 없앤다.
 * 한쪽만 남으면 다음에 그 줄을 만질 때 값이 따로 놀아 혼란스럽다.
 */
export function removeGroupAt(fx: CustomEffect, g: PropGroup, at: number): CustomEffect {
  return g.keys.reduce((acc, k) => {
    const found = keyframeAt(acc, k, at)
    return found ? removeKeyframe(acc, k, found) : acc
  }, fx)
}

/** 줄의 한 시점을 옮긴다 — X·Y 를 함께 끈다 */
export function moveGroupAt(fx: CustomEffect, g: PropGroup, from: number, to: number): CustomEffect {
  return g.keys.reduce((acc, k) => {
    const found = keyframeAt(acc, k, from)
    return found ? patchKeyframe(acc, k, found, { at: to }) : acc
  }, fx)
}

/** 줄의 한 구간에 속도 곡선을 건다 — X·Y 가 같은 곡선을 쓴다 */
export function setGroupEasing(
  fx: CustomEffect,
  g: PropGroup,
  at: number,
  easing: string
): CustomEffect {
  return g.keys.reduce((acc, k) => {
    const found = keyframeAt(acc, k, at)
    return found ? patchKeyframe(acc, k, found, { easing }) : acc
  }, fx)
}

/** 그 시점 그 줄에 걸린 곡선 (첫 번째로 찾은 것) */
export function groupEasing(fx: CustomEffect, g: PropGroup, at: number): string {
  for (const k of g.keys) {
    const found = keyframeAt(fx, k, at)
    if (found) return found.easing
  }
  return DEFAULT_EASING
}

// ── CSS 로 굽기 ──────────────────────────────────────────────

function round(n: number, digits = 3): number {
  return Number(n.toFixed(digits))
}

/** 이 정도 차이는 눈에 안 보인다 — 굽는 결과를 줄이는 기준 */
const EPS: Record<PropKey, number> = {
  x: 0.15,
  y: 0.15,
  scaleX: 0.004,
  scaleY: 0.004,
  rotate: 0.25,
  skewX: 0.2,
  skewY: 0.2,
  opacity: 0.006,
  blur: 0.08
}

/** 파도 비틀기 SVG 필터의 id — 효과마다 하나씩 */
export function waveFilterId(fxId: string): string {
  return `${keyframeName(fxId)}-wave`
}

/**
 * 트랙들 → CSS `@keyframes` 본문.
 *
 * **CSS 의 한계 때문에 값을 촘촘히 구워 넣는다.** `@keyframes` 안의
 * `animation-timing-function` 은 그 구간의 **모든 속성에 똑같이** 걸린다. 그런데 여기서는
 * 크기와 투명도가 서로 다른 곡선을 가질 수 있으므로, 곡선을 CSS 에 맡길 수가 없다.
 * 그래서 우리가 직접 촘촘한 지점의 값을 계산해 넣고 구간은 전부 linear 로 잇는다.
 *
 * 촘촘히 넣으면 CSS 가 길어지므로, **직선으로 이어도 티가 안 나는 점은 지운다.**
 * 값이 선형으로 변하는 흔한 경우는 결국 두 점만 남는다.
 */
export function customFrames(fx: CustomEffect): string {
  const keys = activeProps(fx)
  const f = filtersOf(fx)
  const wave = f.wave && f.wave.amount > 0
  if (keys.length === 0 && !wave) return 'from { opacity: 1 } to { opacity: 1 }'

  /**
   * 시간 포스터화가 켜져 있으면 **딱 그 칸 수만큼만** 굽고, 각 칸을 `steps(1, end)` 로
   * 붙잡는다. 그러면 값이 다음 칸까지 그대로 멈춰 있다가 툭 건너뛴다 — 저프레임 필름
   * 느낌의 정체가 이것이다. 매끄러운 곡선을 그린 뒤 끊는 게 아니라, 아예 띄엄띄엄 굽는다.
   */
  const posterized = f.posterize > 0
  const chunks = posterized
    ? Math.max(2, Math.round((f.posterize * fx.durationMs) / 1000))
    : 60

  const times: number[] = []
  for (let i = 0; i <= chunks; i++) times.push((i / chunks) * 100)
  // 매끄러울 때는 실제로 찍은 시점을 반드시 살린다 — 꺾이는 자리가 뭉개지면 안 된다.
  // 포스터화 중에는 일부러 살리지 않는다. 칸 간격이 흐트러지면 끊김이 고르지 않다
  if (!posterized) for (const k of keys) for (const kf of fx.tracks[k]!) times.push(kf.at)

  const uniq = [...new Set(times.map((t) => round(t, 2)))].sort((a, b) => a - b)
  const rows = uniq.map((at) => ({
    at,
    v: Object.fromEntries(keys.map((k) => [k, valueAt(fx, k, at)])) as Record<PropKey, number>
  }))

  const kept = posterized ? rows : simplify(rows, keys)
  const anyBlur = keys.includes('blur')
  const timing = posterized ? 'steps(1, end)' : 'linear'

  return kept
    .map((r) => {
      const g = (k: PropKey): number => r.v[k] ?? PROP_BY_KEY[k].base
      const t = [
        `translate(${round(g('x'))}%, ${round(g('y'))}%)`,
        `scale(${round(g('scaleX'))}, ${round(g('scaleY'))})`,
        `rotate(${round(g('rotate'))}deg)`,
        `skew(${round(g('skewX'))}deg, ${round(g('skewY'))}deg)`
      ].join(' ')
      const parts = [`transform: ${t}`, `opacity: ${round(g('opacity'))}`]

      // 흐림·파도를 안 쓰는 효과에까지 filter 를 넣으면 공짜로 레이어가 하나 더 생긴다
      const filters: string[] = []
      if (anyBlur) filters.push(`blur(${round(g('blur'))}px)`)
      if (wave) filters.push(`url(#${waveFilterId(fx.id)})`)
      if (filters.length) parts.push(`filter: ${filters.join(' ')}`)

      parts.push(`animation-timing-function: ${timing}`)
      return `${r.at}% { ${parts.join('; ')} }`
    })
    .join(' ')
}

/**
 * 파도 비틀기 SVG 필터.
 *
 * CSS 만으로는 화면을 물결처럼 일그러뜨릴 수 없다 — 잡음 무늬(feTurbulence)를 만들어
 * 그 밝기만큼 픽셀을 밀어내는(feDisplacementMap) SVG 필터가 필요하다.
 * 무늬 자체를 SMIL 로 계속 흘려보내야 물결이 **움직인다.** 멈춰 있으면 그냥 찌그러진 그림이다.
 */
export function waveFilterSvg(fx: CustomEffect): string {
  const w = filtersOf(fx).wave
  if (!w || w.amount <= 0) return ''
  const id = waveFilterId(fx.id)
  // 초당 몇 번 출렁일지 → 한 바퀴에 걸리는 시간
  const dur = round(Math.max(0.2, 3 / Math.max(0.1, w.speed)), 2)
  const freq = 0.006 + w.amount * 0.0007

  return `
    <filter id="${id}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="${round(freq, 5)} ${round(freq * 1.6, 5)}"
                    numOctaves="2" seed="7" result="noise">
        <animate attributeName="baseFrequency" dur="${dur}s" repeatCount="indefinite"
                 values="${round(freq, 5)} ${round(freq * 1.6, 5)};${round(freq * 1.9, 5)} ${round(freq, 5)};${round(freq, 5)} ${round(freq * 1.6, 5)}" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="${round(w.amount, 2)}"
                         xChannelSelector="R" yChannelSelector="G" />
    </filter>`
}

/** 앞뒤 점을 직선으로 이었을 때와 거의 같은 점은 버린다. */
function simplify(
  rows: { at: number; v: Record<PropKey, number> }[],
  keys: PropKey[]
): { at: number; v: Record<PropKey, number> }[] {
  if (rows.length <= 2) return rows
  const out = [rows[0]]
  for (let i = 1; i < rows.length - 1; i++) {
    const a = out[out.length - 1]
    const b = rows[i]
    const c = rows[i + 1]
    const span = c.at - a.at
    const p = span === 0 ? 0 : (b.at - a.at) / span
    const needed = keys.some((k) => {
      const guess = a.v[k] + (c.v[k] - a.v[k]) * p
      return Math.abs(guess - b.v[k]) > EPS[k]
    })
    if (needed) out.push(b)
  }
  out.push(rows[rows.length - 1])
  return out
}

/** 카탈로그 항목과 같은 모양으로 — 이 뒤로는 기본 효과와 구별되지 않는다. */
export function toEffect(fx: CustomEffect): Effect {
  const n = activeProps(fx).reduce((sum, k) => sum + (fx.tracks[k]?.length ?? 0), 0)
  return {
    id: fx.id,
    name: fx.name,
    description: `내가 만든 효과 · 키프레임 ${n}개`,
    category: fx.category,
    frames: customFrames(fx),
    defaultDurationMs: fx.durationMs,
    // 완급은 이미 값에 구워져 있다 — 바깥에서 또 주면 두 번 걸린다
    defaultEasing: 'linear',
    suggestStagger: 60
  }
}

export function customKeyframesCss(list: CustomEffect[]): string {
  return list.map((fx) => `@keyframes ${keyframeName(fx.id)} { ${customFrames(fx)} }`).join('\n')
}

/** 파도를 쓰는 효과들의 SVG 필터 정의. 문서에 심어야 `url(#...)` 이 걸린다 */
export function customFiltersSvg(list: CustomEffect[]): string {
  return list.map(waveFilterSvg).filter(Boolean).join('\n')
}

// ── 속도 곡선 ────────────────────────────────────────────────

export type Bezier = [number, number, number, number]

export const EASING_PRESETS: { label: string; value: Bezier }[] = [
  { label: '일정하게', value: [0, 0, 1, 1] },
  { label: '천천히 시작', value: [0.42, 0, 1, 1] },
  { label: '천천히 끝', value: [0.22, 1, 0.36, 1] },
  { label: '양끝 천천히', value: [0.65, 0, 0.35, 1] },
  { label: '튕기며', value: [0.34, 1.56, 0.64, 1] },
  { label: '당겼다 가기', value: [0.6, -0.4, 0.74, 0.05] }
]

export function parseBezier(easing: string): Bezier {
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing)
  if (m) {
    const n = m[1].split(',').map((v) => Number(v.trim()))
    if (n.length === 4 && n.every((v) => Number.isFinite(v))) return n as Bezier
  }
  switch (easing) {
    case 'linear':
      return [0, 0, 1, 1]
    case 'ease-in':
      return [0.42, 0, 1, 1]
    case 'ease-out':
      return [0, 0, 0.58, 1]
    case 'ease-in-out':
      return [0.42, 0, 0.58, 1]
    default:
      return [0.25, 0.1, 0.25, 1]
  }
}

export function bezierCss(b: Bezier): string {
  return `cubic-bezier(${b.map((v) => round(v)).join(',')})`
}

/** 곡선 위의 한 점 — 그래프를 그리기 위한 값 */
export function bezierPoint(b: Bezier, t: number): { x: number; y: number } {
  const [x1, y1, x2, y2] = b
  const u = 1 - t
  return {
    x: 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t,
    y: 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t
  }
}

/**
 * 시간 x 에서의 진행도 y.
 *
 * cubic-bezier 는 t 로 매개화돼 있어 x 를 바로 넣을 수 없다. x 가 되는 t 를 먼저 찾고
 * (이분법 — 반복 30번이면 소수점 아래로 충분히 정확하다) 그 t 의 y 를 돌려준다.
 */
export function ease(b: Bezier, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (bezierPoint(b, mid).x < x) lo = mid
    else hi = mid
  }
  return bezierPoint(b, (lo + hi) / 2).y
}

// ── 예전 모양 읽기 ───────────────────────────────────────────

/**
 * 처음 만들었던 "키프레임 하나가 모든 속성을 들고 있는" 모양을 트랙으로 옮긴다.
 * 그 사이에 만들어 둔 효과가 조용히 사라지면 안 된다.
 */
export function normalize(fx: CustomEffect): CustomEffect {
  const legacy = fx as unknown as { keyframes?: { at: number; easing: string }[] }
  if (fx.tracks || !legacy.keyframes) return fx

  const tracks: Tracks = {}
  for (const p of PROPS) {
    // 예전에는 크기가 하나뿐이었다 — 가로·세로 양쪽으로 편다
    const from = p.key === "scaleX" || p.key === "scaleY" ? "scale" : p.key
    const points = legacy.keyframes.map((k) => ({
      at: k.at,
      value: (k as unknown as Record<string, number>)[from] ?? p.base,
      easing: k.easing
    }))
    // 처음부터 끝까지 기본값 그대로인 속성은 트랙을 만들지 않는다
    if (points.some((pt) => Math.abs(pt.value - p.base) > 1e-6)) tracks[p.key] = points
  }
  return { ...fx, tracks }
}

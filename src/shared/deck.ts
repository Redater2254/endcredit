import type { CreditData } from './aggregate'
import { builtinAudioUrl } from './builtin-audio'
import { DEFAULT_MOTION, exitDurationOf, type Motion, type SourceKind } from './preset'
export { DEFAULT_MOTION }
import { getScreenEffect, type ScreenFx } from './screen-fx'
import type { CustomEffect } from './custom-effect'

export type { CustomEffect }

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

/**
 * 글자에 두르는 선 한 겹.
 *
 * `outside` 면 글자 **바깥쪽**으로만 두른다(획이 글자를 파먹지 않는다),
 * 아니면 윤곽선을 가운데 두고 안팎으로 걸친다.
 */
export interface TextStroke {
  width: number
  color: string
  outside?: boolean
  /** 모서리 모양. round=둥글게(기본) · sharp=각지게 */
  join?: 'round' | 'sharp'
}

/** 글자 그림자 한 겹. 여러 겹을 겹칠 수 있다 (CSS 가 원래 여러 개를 받는다) */
export interface TextShadow {
  color: string
  x: number
  y: number
  blur: number
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
  /**
   * 그림자 색·위치·흐림. 셋 다 없으면 예전 기본 그림자를 그대로 쓴다
   * (예전 문서의 모습이 바뀌면 안 된다).
   */
  shadowColor?: string
  shadowX?: number
  shadowY?: number
  shadowBlur?: number
  stroke: number
  strokeColor: string
  /**
   * 선 여러 겹 (안쪽에서 바깥쪽 순서). 없으면 위의 `stroke`/`strokeColor` 한 겹을 쓴다.
   * 첫 겹은 글자 획으로, 그 뒤는 이미 그려진 모양을 부풀려 두른다.
   */
  strokes?: TextStroke[]
  /** 그림자 여러 겹 (앞에 있는 것이 위에 그려진다). 없으면 위의 shadow* 한 겹 */
  shadows?: TextShadow[]
  /**
   * 칠을 그라데이션으로. `color` 가 시작색, `gradientTo` 가 끝색이다.
   * 글자 모양으로 배경을 오려내는 방식이라(background-clip:text) 획 안이 물든다.
   */
  gradient?: boolean
  gradientTo?: string
  /** 그라데이션 방향(°). 180 = 위에서 아래 */
  gradientAngle?: number
  /**
   * 글자 뒤에 까는 판. 비우면 판 없음.
   *
   * `background` 가 아니라 **안쪽 그림자**로 칠한다 — background 는 그라데이션 칠이
   * 이미 쓰고 있어서(clip:text), 같이 쓰면 판까지 글자 모양으로 오려진다.
   */
  bgColor?: string | null
  bgRadius?: number
  /** 판 여백 (좌우 · 위아래) */
  bgPadX?: number
  bgPadY?: number
  /**
   * 상자를 넘치면 **글자 크기를 줄여** 맞춘다.
   *
   * 닉네임 길이는 제각각이라 순위·기차 칸에서 글자가 삐져나오거나 잘리는 일이 잦다.
   * 예전 문서에는 없으므로 선택 항목이고, 없으면 예전처럼 넘치는 대로 둔다.
   */
  fit?: boolean
}

/** 실제로 두를 선들. 예전 문서(한 겹짜리)도 같은 모양으로 돌려준다. */
export function strokesOf(s: TextStyle): TextStroke[] {
  if (s.strokes) return s.strokes
  return s.stroke > 0 ? [{ width: s.stroke, color: s.strokeColor, outside: true }] : []
}

/** 실제로 깔 그림자들. 예전 문서는 켬/끔 하나뿐이었다. */
export function shadowsOf(s: TextStyle): TextShadow[] {
  if (s.shadows) return s.shadows
  if (!s.shadow) return []
  // 예전 기본 그림자는 두 겹이었다 — 문서를 열었을 때 모습이 바뀌면 안 된다
  if (s.shadowX === undefined && s.shadowY === undefined && s.shadowBlur === undefined) {
    // 색은 16진수로 준다 — 색 고르개(input type=color)가 rgba() 를 못 읽고 검정으로 바꿔버린다
    return [
      { color: '#000000d9', x: 0, y: 2, blur: 8 },
      { color: '#000000e6', x: 0, y: 0, blur: 2 }
    ]
  }
  return [
    {
      color: s.shadowColor ?? '#000000d9',
      x: s.shadowX ?? 0,
      y: s.shadowY ?? 2,
      blur: s.shadowBlur ?? 8
    }
  ]
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
  /** 테두리 여러 겹 (안쪽에서 바깥쪽 순서). 도형·글자와 같은 값을 쓴다 */
  strokes?: TextStroke[]
  /** 그림자 여러 겹. 상자가 아니라 **그림의 실제 모양**을 따라간다 */
  shadows?: TextShadow[]
}

/**
 * 이미지의 테두리·그림자를 CSS 로.
 *
 * 그림자는 `box-shadow` 가 아니라 **`filter: drop-shadow`** 다. box-shadow 는 상자를
 * 따라가므로 배경이 뚫린 PNG(캐릭터 컷아웃)에 쓰면 인물 뒤로 네모난 그림자가 진다.
 * drop-shadow 는 실제로 그려진 모양(알파)을 따라간다 — 포토샵의 그림자와 같다.
 *
 * ⚠ **겹수를 3 으로 막아 둔다.** drop-shadow 를 사슬로 길게 이으면 매 프레임 그 횟수만큼
 * 다시 그려서 렌더러가 뻗는다 — 예전에 글자 테두리를 필터 20개로 만들었다가 앱이 죽었다.
 *
 * 테두리는 도형과 같은 `box-shadow` 고리라 **상자**를 두른다. '꽉 채우기'면 그림에 딱
 * 맞고, '전체 보기'면 상자에 두른 액자가 된다. 필터가 고리까지 함께 그림자 지운다
 * (액자째 그림자가 지는 게 맞다).
 */
export const IMAGE_SHADOW_MAX = 3

export function imagePaint(el: ImageElement): { boxShadow?: string; filter?: string } {
  const rings: string[] = []
  let spread = 0
  for (const s of el.strokes ?? []) {
    spread += Math.max(0, s.width)
    rings.push(`0 0 0 ${spread}px ${s.color}`)
  }

  const drops = (el.shadows ?? [])
    .slice(0, IMAGE_SHADOW_MAX)
    .map((sh) => `drop-shadow(${sh.x}px ${sh.y}px ${Math.max(0, sh.blur)}px ${sh.color})`)

  return {
    boxShadow: rings.length > 0 ? rings.join(', ') : undefined,
    filter: drops.length > 0 ? drops.join(' ') : undefined
  }
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
  /**
   * 열 수를 상자에 맞춰 **자동으로** 늘린다 (신문 단 조판).
   *
   * 켜면 `columns` 를 안 본다. 한 줄씩 쌓다가 상자 끝에 닿으면 다음 열 맨 위에서 이어
   * 쌓는다 — 명단이 몇 명이든 열 수를 손으로 맞출 필요가 없다. 예전 문서에는 없는
   * 값이라 켜지 않으면 예전 그대로 고정 열로 그려진다.
   */
  autoFlow?: boolean
  /** 자동 흐름 방향. down = 위→아래로 채우고 옆 열로 · right = 좌→우로 채우고 아랫줄로 */
  flowDir?: 'down' | 'right'
  /** 넘칠 때 새 열·줄이 생기는 쪽을 뒤집는다 (down 이면 왼쪽으로, right 면 위로) */
  flowBack?: boolean
  gap: number
  /** 열 사이 간격(px). 없으면 줄 간격의 3배 — 예전 문서의 모습이 바뀌면 안 된다 */
  colGap?: number
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
  /** 칠을 그라데이션으로. `fill` 이 시작색, `gradientTo` 가 끝색이다 */
  gradient?: boolean
  gradientTo?: string
  /** 그라데이션 방향(°). 180 = 위에서 아래 */
  gradientAngle?: number
  /**
   * 테두리 여러 겹 (안쪽에서 바깥쪽 순서). 글자의 `strokes` 와 같은 값을 쓴다 —
   * 같은 개념을 두 벌로 만들면 반드시 어긋난다.
   * 도형은 항상 바깥쪽으로 두르므로 `outside`·`join` 은 안 본다.
   */
  strokes?: TextStroke[]
  /** 그림자 여러 겹 (앞에 있는 것이 위에 그려진다) */
  shadows?: TextShadow[]
}

/**
 * 도형의 칠·테두리·그림자를 CSS 로.
 *
 * 테두리는 `box-shadow` 로 **퍼짐(spread)만 준 고리**를 겹쳐 두른다. `border` 는 상자
 * 크기를 바꿔 놓은 자리가 밀리고, `outline` 은 한 겹뿐이라 여러 겹이 안 된다. 고리는
 * 모서리 둥글기를 알아서 따라가므로 타원에도 그대로 맞는다.
 *
 * 목록에서 **앞에 있는 것이 위에** 그려진다. 그래서 안쪽 고리 → 바깥쪽 고리 → 그림자
 * 순으로 쌓고, 그림자는 가장 바깥 고리만큼 퍼뜨려 테두리 전체가 그림자를 지게 한다.
 */
export function shapePaint(el: ShapeElement): { background: string; boxShadow?: string } {
  const background = el.gradient
    ? `linear-gradient(${el.gradientAngle ?? 180}deg, ${el.fill}, ${el.gradientTo ?? '#8ab4ff'})`
    : el.fill

  const layers: string[] = []
  let spread = 0
  for (const s of el.strokes ?? []) {
    spread += Math.max(0, s.width)
    layers.push(`0 0 0 ${spread}px ${s.color}`)
  }
  for (const sh of el.shadows ?? []) {
    layers.push(`${sh.x}px ${sh.y}px ${sh.blur}px ${spread}px ${sh.color}`)
  }

  return { background, boxShadow: layers.length > 0 ? layers.join(', ') : undefined }
}

/**
 * 기차 — 데이터 한 명씩 태운 칸들이 화면을 가로질러 지나간다.
 *
 * 효과가 아니라 **요소**다. 효과 하나로는 이미지를 여러 칸으로 복제하거나 칸마다
 * 다른 데이터를 얹을 수 없어서다. 이음매 없는 가로 마퀴(트랙을 두 벌 이어 -50%
 * 이동)로 굴러, 칸 수·크기·속도가 달라도 픽셀을 재지 않고 CSS 만으로 순환한다.
 * 등장·퇴장·강조 효과는 여느 요소처럼 바깥 상자에 그대로 얹힌다.
 */
export interface TrainElement extends ElementBase {
  kind: 'train'
  /** 칸에 태울 데이터 (수다왕·별풍선 순위 …) */
  source: SourceKind
  /** 칸 갯수 */
  count: number
  /** 칸에 태우는 순서. asc=처음부터(1→N) · desc=마지막부터(N→1) */
  order: 'asc' | 'desc'
  /** 화면 진행 방향. rtl=오른쪽→왼쪽 · ltr=왼쪽→오른쪽 */
  dir: 'ltr' | 'rtl'
  /** 칸 높이 = 프레임 높이의 % */
  carSize: number
  /**
   * 칸의 가로:세로 비율 (1.5 = 3:2).
   * "1등 밤샘코딩러 247회" 처럼 칸에 실리는 글이 길어지면 칸부터 넓혀야 다 들어간다.
   */
  carRatio?: number
  /** 글자 영역이 칸 너비에서 차지하는 비율 (%) */
  textWidth?: number
  /** 글자 영역의 세로 중심 (칸 높이의 %, 50 = 한가운데) */
  textY?: number
  /** 등수 크기 (이름 대비 %) */
  rankScale?: number
  /** 수치 크기 (이름 대비 %) */
  valueScale?: number
  /**
   * 양 끝(첫 칸·마지막 칸) 이미지.
   *
   * 하나만 받는다 — 마지막 칸은 **좌우로 뒤집어** 쓰기 때문이다. 기관차 그림 한 장이면
   * 앞뒤가 다 해결되고, 두 장을 맞춰 그리게 하면 방향까지 신경 써야 해서 번거롭다.
   * 비워두면 끝 칸도 가운데 이미지를 그대로 쓴다 (예전 문서가 그대로 굴러가도록).
   */
  capImage?: string | null
  /** 가운데 칸 이미지들 (칸마다 돌아가며 씀). 없으면 단색 칸 */
  images: string[]
  /** 칸 위에 얹을 장식 이미지들 (칸마다 돌아가며 씀) */
  overlays: string[]
  /** 장식 가로 위치 (칸 너비의 %, 50 = 가운데) */
  overlayX?: number
  /** 장식 세로 위치 (칸 높이의 %, 0 = 칸 윗변. 음수면 칸 위로 뜬다) */
  overlayY?: number
  /** 장식 크기 (칸 높이의 %) */
  overlaySize?: number
  /** 장식에만 걸리는 강조 효과 id. 칸 강조와 따로 논다 */
  overlayEmphasis?: string | null
  /** 장식 강조 주기 */
  overlayEmphasisMs?: number
  /** 장식 강조 세기 (%, 100 = 기본) */
  overlayEmphasisAmp?: number
  /**
   * 화면을 **한 번** 가로지르는 데 걸리는 시간 (작을수록 빠름).
   * 반대편에서 안 보이게 나타나 반대쪽으로 완전히 빠져나갈 때까지다.
   */
  durationMs: number
  /** 칸 하나하나에 걸리는 강조 효과 id. null 이면 없음 */
  carEmphasis?: string | null
  /** 칸 강조 주기 */
  carEmphasisMs: number
  /** 칸 강조 세기 (%, 100 = 기본) */
  carEmphasisAmp?: number
  /**
   * 칸에 등수를 함께 표시한다.
   *
   * 순위 데이터를 태우는데 몇 등인지 안 보이면 그냥 이름 목록이 지나가는 것과 다르지 않다.
   * 등수는 **원래 순위**를 따른다 — '마지막부터' 로 태워도 1등은 1등이다.
   */
  showRank?: boolean
  /** 등수 표기 (예: "{n}등", "#{n}", "{n}") */
  rankFormat?: string
  rankColor?: string
  /** 칸에 늘어놓는 차례. 등수·이름·수치 중 꺼둔 것은 자리째 빠진다 */
  carOrder?: 'rank-name-value' | 'rank-value-name' | 'name-value-rank'
  /**
   * 칸 안 글자 배치.
   *  stack — 윗줄에 등수·이름, **아랫줄에 수치** (기본). 칸이 좁아도 이름이 안 눌린다
   *  row   — 셋을 한 줄에
   */
  carLayout?: 'row' | 'stack'
  /** 이름 옆에 수치 표시 */
  showValue: boolean
  nameStyle: TextStyle
  valueColor: string
}

/**
 * 고급 개체(스마트 오브젝트) 한 자리.
 *
 * 내용은 여기 없다 — 문서 보관함(`deck.smarts`)에 한 벌만 두고 이 요소는 그 id 만 가리킨다.
 * 그래서 복제하면 **연결된 사본**이 되어 한 곳을 고치면 전부 바뀐다 (포토샵과 같다).
 * 여느 요소와 똑같은 frame·rotation·효과를 가지므로 이동·크기·회전·겹침 순서가 전부
 * 기존 길로 따라온다.
 */
export interface SmartElement extends ElementBase {
  kind: 'smart'
  docId: string
}

export type SlideElement =
  | TextElement
  | ImageElement
  | DataElement
  | RankElement
  | ShapeElement
  | TrainElement
  | SmartElement

/** 소리 하나 — 배경음악이든 효과음이든 같은 모양이다. */
export interface AudioClip {
  /** 로컬 서버가 내보내는 주소 (OBS 는 file:// 을 못 읽는다) */
  src: string
  /** 0~100 */
  volume: number
  /**
   * 음 높이 (**반음** 단위, 0 = 원본). +12 면 한 옥타브 위.
   *
   * 반음으로 잡는 이유: 프리미어·오디션의 피치 시프터가 그렇다. "1.5배"는 얼마나
   * 높아지는지 감이 안 오지만 "+5 반음"은 음악 하는 사람이면 바로 안다.
   *
   * 브라우저에 음정만 바꾸는 기능은 없다 — **테이프를 빨리 감는 방식**이라 높이면
   * 소리가 그만큼 짧아진다. 짧은 효과음에는 그게 오히려 자연스럽다.
   * 예전 문서에는 없으므로 선택 항목이다.
   */
  pitch?: number
}

/** 반음 → 재생 배속. 12반음 = 한 옥타브 = 2배 */
export function pitchRate(semitones: number | undefined): number {
  return semitones ? 2 ** (semitones / 12) : 1
}

/**
 * 소리 하나에 크기·음 높이를 먹인다.
 *
 * 소리를 트는 곳이 넷이다(배경음악·장 효과음·등장 효과음·들어보기). 각자 계산하면
 * 반드시 어긋나므로 여기 한 곳만 쓴다. `HTMLAudioElement` 대신 필요한 속성만 받아
 * 메인 프로세스 쪽 타입 검사(DOM 없음)에 걸리지 않게 한다.
 */
export function tuneAudio(
  el: { volume: number; playbackRate: number; preservesPitch?: boolean },
  clip: AudioClip
): void {
  el.volume = Math.max(0, Math.min(1, clip.volume / 100))
  const rate = pitchRate(clip.pitch)
  if (rate === 1) return
  // 배속만 바꾸면 브라우저가 음 높이를 원래대로 붙들어 둔다 — 그 기본값을 풀어야 실제로 높아진다.
  // 접두사 없는 이름은 크로미움 109 부터다. 예전 OBS 의 브라우저 소스는 그보다 낮을 수 있어
  // 옛 이름도 같이 넣는다 (없는 이름에 넣어봐야 아무 일도 일어나지 않는다).
  el.preservesPitch = false
  ;(el as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = false
  el.playbackRate = rate
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

/**
 * 고급 개체의 **내용** — 자기 캔버스를 가진 작은 문서다.
 *
 * 요소(`SmartElement`)는 이 문서를 가리키기만 하므로, 한 내용을 여러 자리에 놓을 수 있고
 * 한 곳을 고치면 전부 바뀐다. 캔버스 크기를 px 로 굳혀 두는 것이 핵심이다 — 글자 크기가
 * px 라, 안쪽을 **이 픽셀 무대 위에 그린 뒤 통째로 축소**해야 늘였을 때 글자도 같이 큰다.
 */
export interface SmartDoc {
  id: string
  name: string
  /** 안쪽 캔버스 크기(px). 만들 때의 선택 영역 픽셀 크기 */
  canvas: { width: number; height: number }
  elements: SlideElement[]
  groups?: Record<string, SlideGroup>
  /** 안쪽의 등장 순서 규칙. 슬라이드와 따로 논다 */
  order?: { mode: 'order' | 'manual'; gapMs: number }
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
  /**
   * 사용자가 만든 효과.
   *
   * 문서에 함께 담기므로 `.ecpreset` 으로 내보내면 효과도 같이 딸려간다 —
   * 받은 사람 화면에서도 똑같이 움직여야 프리셋을 주고받는 의미가 있다.
   */
  effects?: CustomEffect[]
  /**
   * 고급 개체 보관함.
   *
   * 내용을 슬라이드가 아니라 문서에 두는 이유는 **연결된 사본** 때문이다. 요소는 id 만
   * 가리키므로 같은 개체를 여러 장·여러 자리에 놓아도 내용은 한 벌이다.
   */
  smarts?: Record<string, SmartDoc>
  slides: Slide[]
}

/** 예전 문서에는 보관함이 없다. */
export function smartsOf(deck: Deck): Record<string, SmartDoc> {
  return deck.smarts ?? {}
}

/** 예전 문서에는 effects 가 없다. */
export function effectsOf(deck: Deck): CustomEffect[] {
  return deck.effects ?? []
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

const SHAPE_NAME: Record<ShapeElement['shape'], string> = {
  rect: '사각형',
  ellipse: '타원',
  line: '선'
}

/**
 * 도형 하나.
 *
 * 끌어서 그리면 그 크기로 오고, 그냥 누르기만 하면 이 기본 크기로 온다.
 * 선만 납작한 띠로 시작한다 — 선을 40% 높이의 상자로 만들어 놓으면 아무도 선으로 안 본다.
 */
export function createShape(
  shape: ShapeElement['shape'] = 'rect',
  frame?: Partial<Frame>
): ShapeElement {
  const box: Partial<Frame> =
    shape === 'line' ? { x: 20, y: 45, w: 60, h: 1 } : { x: 30, y: 32, w: 40, h: 32 }
  return {
    ...base(SHAPE_NAME[shape], { ...box, ...frame }),
    kind: 'shape',
    shape,
    fill: '#ffffff',
    radius: shape === 'line' ? 2 : 12
  }
}

export function createTrain(
  source: SourceKind = 'chatRank',
  frame?: Partial<Frame>
): TrainElement {
  return {
    ...base('기차', { x: 0, y: 62, w: 100, h: 26, ...frame }),
    kind: 'train',
    source,
    count: 8,
    order: 'desc',
    dir: 'rtl',
    carSize: 80,
    carRatio: 1.5,
    textWidth: 92,
    textY: 50,
    rankScale: 100,
    valueScale: 68,
    capImage: null,
    images: [],
    overlays: [],
    overlayX: 50,
    overlayY: -6,
    overlaySize: 46,
    overlayEmphasis: null,
    overlayEmphasisMs: 900,
    durationMs: 12000,
    carEmphasis: null,
    carEmphasisMs: 900,
    carEmphasisAmp: 100,
    showRank: true,
    rankFormat: '{n}',
    rankColor: '#ffd166',
    carOrder: 'rank-name-value',
    carLayout: 'stack',
    showValue: true,
    nameStyle: { ...DEFAULT_TEXT_STYLE, size: 26, weight: 700 },
    valueColor: '#ffd166'
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
  // 소리만 걸어둔 묶음도 '효과가 걸린' 것으로 본다 — 그래야 덩어리가 등장하는
  // 시각이 계산되고, 그 시각에 소리가 울린다. 상자만 생기고 화면은 그대로다.
  return (
    (m.preset !== 'none' && m.durationMs > 0) ||
    Boolean(m.loop) ||
    Boolean(m.exit) ||
    Boolean(m.sound?.src)
  )
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

/** 바깥 상자 안의 상대 좌표를 다시 캔버스 좌표로 편다 (rebaseFrame 의 역). */
export function unrebaseFrame(f: Frame, box: Frame): Frame {
  return {
    x: box.x + (f.x / 100) * box.w,
    y: box.y + (f.y / 100) * box.h,
    w: (f.w / 100) * box.w,
    h: (f.h / 100) * box.h
  }
}

/** 예전 문서에는 order 가 없다 — 읽을 때 기본값을 채운다. */
export function orderOf(slide: Slide): { mode: 'order' | 'manual'; gapMs: number } {
  return slide.order ?? { mode: 'order', gapMs: 260 }
}

// ── 고급 개체 ───────────────────────────────────────────────

/**
 * 고급 개체의 내용을 **가상 슬라이드**로 감싼다.
 *
 * 이렇게 두면 길이 계산(slideTiming)·화면 그리기(ElementLayer)·요소칸이 슬라이드와
 * 똑같은 길을 쓴다. 두 벌로 나뉘면 반드시 어긋난다.
 */
export function docSlide(doc: SmartDoc): Slide {
  return {
    id: doc.id,
    name: doc.name,
    kind: 'static',
    holdMs: 0,
    scroll: { speed: 90, direction: 'up', contentHeight: 100 },
    background: { transparent: true, color: '#000000' },
    transition: { preset: 'none', durationMs: 0, easing: 'linear' },
    order: doc.order ?? { mode: 'order', gapMs: 260 },
    groups: doc.groups,
    screen: null,
    sound: null,
    elements: doc.elements
  }
}

/** 이 요소들이 쓰는 묶음 정의만 골라낸다 (내용을 옮길 때 이름·묶음 효과가 딸려가도록). */
function pickGroups(
  els: SlideElement[],
  groups: Record<string, SlideGroup>
): Record<string, SlideGroup> {
  const out: Record<string, SlideGroup> = {}
  for (const e of els) {
    if (e.groupId && groups[e.groupId]) out[e.groupId] = structuredClone(groups[e.groupId])
  }
  return out
}

/**
 * 고른 요소들을 고급 개체 하나로 접는다.
 *
 * 상자(boundsOf)의 **픽셀 크기**를 안쪽 캔버스로 삼는다 — 그래야 배율 1 에서 원본과 한 픽셀도
 * 다르지 않다. 자식 좌표는 상자 기준 % 로 옮긴다(rebaseFrame).
 *
 * `delays` 를 주면 그 순간의 등장 지연을 요소에 **구워 넣고** 안쪽 순서 모드를 '각자 지정'으로
 * 둔다. 슬라이드의 '목록 순서대로' 차례는 안으로 들어가면 다시 계산되므로, 굽지 않으면
 * 접는 순간 타이밍이 달라진다.
 */
export function makeSmart(
  els: SlideElement[],
  groups: Record<string, SlideGroup>,
  canvas: { width: number; height: number },
  name: string,
  delays?: Record<string, number>
): { el: SmartElement; doc: SmartDoc } {
  const box = boundsOf(els)
  const doc: SmartDoc = {
    id: newId('sd'),
    name,
    canvas: {
      width: Math.max(1, Math.round((box.w / 100) * canvas.width)),
      height: Math.max(1, Math.round((box.h / 100) * canvas.height))
    },
    elements: els.map((e) => {
      const copy = structuredClone(e)
      return {
        ...copy,
        frame: rebaseFrame(e.frame, box),
        motion: { ...copy.motion, delayMs: delays?.[e.id] ?? copy.motion.delayMs }
      } as SlideElement
    }),
    groups: pickGroups(els, groups),
    order: { mode: 'manual', gapMs: 260 }
  }
  const el: SmartElement = { ...base(name, box), kind: 'smart', docId: doc.id }
  return { el, doc }
}

/** 글자·모서리 크기에 배율을 먹인다 (px 로 잡힌 값들은 frame 만 늘여서는 안 커진다). */
function scaleStyle(s: TextStyle, k: number): TextStyle {
  const px = (v: number | undefined): number | undefined => (v === undefined ? undefined : v * k)
  return {
    ...s,
    size: Math.max(1, Math.round(s.size * k)),
    stroke: s.stroke * k,
    // 그림자·선·판도 px 라 같이 커지고 작아져야 비율이 유지된다
    strokes: s.strokes?.map((v) => ({ ...v, width: v.width * k })),
    shadows: s.shadows?.map((v) => ({ ...v, x: v.x * k, y: v.y * k, blur: v.blur * k })),
    shadowX: px(s.shadowX),
    shadowY: px(s.shadowY),
    shadowBlur: px(s.shadowBlur),
    bgRadius: px(s.bgRadius),
    bgPadX: px(s.bgPadX),
    bgPadY: px(s.bgPadY)
  }
}

function scaleGlyphs(e: SlideElement, k: number): SlideElement {
  if (k === 1) return e
  switch (e.kind) {
    case 'text':
      return {
        ...e,
        style: scaleStyle(e.style, k),
        runs: e.runs?.map((r) => (r.size ? { ...r, size: Math.max(1, Math.round(r.size * k)) } : r))
      }
    case 'data':
      return {
        ...e,
        titleStyle: scaleStyle(e.titleStyle, k),
        itemStyle: scaleStyle(e.itemStyle, k),
        gap: e.gap * k
      }
    case 'rank':
      return { ...e, rankStyle: scaleStyle(e.rankStyle, k), nameStyle: scaleStyle(e.nameStyle, k) }
    case 'train':
      return { ...e, nameStyle: scaleStyle(e.nameStyle, k) }
    case 'image':
    case 'shape':
      // 테두리·그림자도 px 라 같이 커지고 작아져야 비율이 유지된다
      return {
        ...e,
        radius: e.radius * k,
        strokes: e.strokes?.map((v) => ({ ...v, width: v.width * k })),
        shadows: e.shadows?.map((v) => ({ ...v, x: v.x * k, y: v.y * k, blur: v.blur * k }))
      }
    default:
      return e
  }
}

/**
 * 고급 개체를 그 자리에 **풀어놓는다**.
 *
 * 늘여둔 만큼 자식 좌표를 펴고(unrebaseFrame), 글자 크기에도 같은 배율을 먹여
 * 눈에 보이던 모습 그대로 풀리게 한다. 보관함 항목은 지우지 않는다 —
 * 다른 자리가 같은 내용을 쓰고 있을 수 있고, 되돌리기도 안전해야 한다.
 */
export function unpackSmart(
  el: SmartElement,
  doc: SmartDoc,
  canvas: { width: number; height: number }
): { elements: SlideElement[]; groups: Record<string, SlideGroup> } {
  const sx = ((el.frame.w / 100) * canvas.width) / Math.max(1, doc.canvas.width)
  const sy = ((el.frame.h / 100) * canvas.height) / Math.max(1, doc.canvas.height)
  const k = Math.sqrt(Math.max(0.0001, sx * sy))

  const gidMap = new Map<string, string>()
  const elements = doc.elements.map((c) => {
    let gid = c.groupId ?? null
    if (gid) {
      if (!gidMap.has(gid)) gidMap.set(gid, newId('g'))
      gid = gidMap.get(gid)!
    }
    return {
      ...scaleGlyphs(structuredClone(c), k),
      id: newId(),
      groupId: gid,
      frame: unrebaseFrame(c.frame, el.frame)
    } as SlideElement
  })

  const groups: Record<string, SlideGroup> = {}
  for (const [from, to] of gidMap) {
    const g = doc.groups?.[from]
    if (g) groups[to] = structuredClone(g)
  }
  return { elements, groups }
}

// ── 화면 크기 ───────────────────────────────────────────────

/** 자주 쓰는 화면 비율. 가로 방송·세로 쇼츠·정사각 클립. */
export const CANVAS_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '가로 16:9 · 1920×1080', width: 1920, height: 1080 },
  { label: '가로 16:9 · 1280×720', width: 1280, height: 720 },
  { label: '세로 9:16 · 1080×1920', width: 1080, height: 1920 },
  { label: '정사각 1:1 · 1080×1080', width: 1080, height: 1080 },
  { label: '가로 4:3 · 1440×1080', width: 1440, height: 1080 }
]

/**
 * 문서의 화면 크기를 바꾼다.
 *
 * 좌표는 % 라 저절로 따라오지만 **글자 크기는 px** 이라 그냥 두면 비율이 깨진다
 * (1080p 용 44px 를 720p 에 그대로 쓰면 1.5배로 커 보인다). 그래서 글자·여백을
 * **세로 배율**로 함께 조정한다 — 글자 크기는 세로로 재는 값이고, 상자 높이도
 * 캔버스 높이의 % 라 둘의 비가 그대로 유지된다.
 */
export function resizeDeckCanvas(deck: Deck, canvas: { width: number; height: number }): Deck {
  const kx = canvas.width / deck.canvas.width
  const ky = canvas.height / deck.canvas.height
  if (kx === 1 && ky === 1) return deck

  const scaleEls = (els: SlideElement[]): SlideElement[] => els.map((e) => scaleGlyphs(e, ky))

  return {
    ...deck,
    canvas,
    smarts: Object.fromEntries(
      Object.entries(smartsOf(deck)).map(([id, d]) => [
        id,
        {
          ...d,
          // 고급 개체의 안쪽 무대도 캔버스 픽셀이라 같이 늘어나야 배율 1 이 유지된다
          canvas: {
            width: Math.max(1, Math.round(d.canvas.width * kx)),
            height: Math.max(1, Math.round(d.canvas.height * ky))
          },
          elements: scaleEls(d.elements)
        }
      ])
    ),
    slides: deck.slides.map((s) => ({
      ...s,
      // 스크롤 속도는 px/초 — 화면이 커지면 같은 비율로 흘러야 체감이 같다
      scroll: { ...s.scroll, speed: Math.max(10, Math.round(s.scroll.speed * ky)) },
      elements: scaleEls(s.elements)
    }))
  }
}

/** 이 내용을 쓰고 있는 자리 수 (다른 고급 개체 안까지 센다). */
export function smartInstances(deck: Deck, docId: string): number {
  let n = 0
  const count = (els: SlideElement[]): void => {
    for (const e of els) if (e.kind === 'smart' && e.docId === docId) n += 1
  }
  deck.slides.forEach((s) => count(s.elements))
  Object.values(smartsOf(deck)).forEach((d) => count(d.elements))
  return n
}

/**
 * `hostId` 안에 (중첩까지 따져) `targetId` 가 들어 있는지 — 자기 자신을 자기 안에 넣는
 * 순환을 막는다. 한 번 만들어지면 그리는 쪽이 무한히 파고들어 화면이 멈춘다.
 */
export function smartUses(
  hostId: string,
  targetId: string,
  smarts: Record<string, SmartDoc>,
  depth = 0
): boolean {
  if (hostId === targetId) return true
  if (depth > 8) return true
  const d = smarts[hostId]
  if (!d) return false
  return d.elements.some((e) => e.kind === 'smart' && smartUses(e.docId, targetId, smarts, depth + 1))
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

/**
 * 요소가 **자기 안에서** 벌이는 일이 끝나는 시각 (등장 시작을 0 으로 본 상대 시간).
 *
 * 기차가 화면을 다 지나가기 전에, 또는 고급 개체 안의 글자가 다 올라오기 전에 장이
 * 넘어가면 안 된다. 효과 길이(`motion.durationMs`)만 보고 장 길이를 정하면 그런 일이 난다.
 */
function innerEndMs(
  el: SlideElement,
  smarts: Record<string, SmartDoc> | undefined,
  depth = 0
): number {
  if (el.kind === 'train') return el.durationMs
  if (!smarts || el.kind !== 'smart' || depth > 6) return 0
  const doc = smarts[el.docId]
  if (!doc) return 0
  const { el: inner } = allDelays(docSlide(doc))
  return doc.elements.reduce((m, c) => {
    const start = inner[c.id] ?? c.motion.delayMs
    return Math.max(m, start + c.motion.durationMs, start + innerEndMs(c, smarts, depth + 1))
  }, 0)
}

export function slideTiming(
  slide: Slide,
  canvasHeight: number,
  smarts?: Record<string, SmartDoc>
): SlideTiming {
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
    slide.elements.reduce((m, e) => {
      const start = delays[e.id] ?? e.motion.delayMs
      return Math.max(m, start + e.motion.durationMs, start + innerEndMs(e, smarts))
    }, 0),
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

export function slideDurationMs(
  slide: Slide,
  canvasHeight: number,
  smarts?: Record<string, SmartDoc>
): number {
  return slideTiming(slide, canvasHeight, smarts).durationMs
}

/** 크레딧 전체 길이. 요소가 하나도 안 보이는 장은 재생기가 건너뛰므로 빼고 센다. */
export function deckDurationMs(deck: Deck): number {
  return deck.slides
    .filter((s) => s.elements.some((e) => e.visible))
    .reduce((sum, s) => sum + slideDurationMs(s, deck.canvas.height, deck.smarts), 0)
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

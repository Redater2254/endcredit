import type { CreditData } from './aggregate'
// 타입만 가져온다 — deck.ts 가 이 파일의 값을 쓰므로 값을 가져오면 순환이 된다
import type { AudioClip } from './deck'

/**
 * 엔딩크레딧 프리셋 — 저장·공유되는 단위.
 * `.ecpreset` 파일은 이 JSON + 참조된 에셋을 담은 zip 이다 (M6).
 */

export type SourceKind =
  | 'chatRank'
  | 'emoticonRank'
  | 'giftRank'
  | 'balloonRank'
  | 'stickerRank'
  | 'newSubscribers'
  | 'renewedSubscribers'
  | 'quickviewGifts'
  | 'newFans'
  | 'newTopFans'
  | 'newFollowers'
  | 'newSupporters'
  | 'text'
  | 'image'
  | 'spacer'

/** effects.ts 카탈로그의 id. 카탈로그에 추가하면 별도 수정 없이 바로 쓸 수 있다. */
export type MotionPreset = string

export type Easing = string

export interface Motion {
  preset: MotionPreset
  durationMs: number
  delayMs: number
  easing: Easing
  /** 항목별로 시차를 준다 (0이면 동시에 등장) */
  staggerMs: number
  /** 등장 후 계속 반복할 강조 효과 (없으면 null) */
  loop: string | null
  /** 강조 효과 1회 길이 */
  loopDurationMs: number
  /**
   * 강조 효과 세기 (%, 100 = 기본).
   *
   * 효과 키프레임이 `--fx-amp` 를 곱해 쓰도록 적혀 있어서, 이 값 하나로 흔들리는 폭·
   * 커지는 정도가 함께 조절된다. 예전 문서에는 없으므로 선택 항목이다.
   */
  loopAmp?: number
  /**
   * 장이 끝나기 직전에 사라지는 효과 (없으면 null).
   *
   * 등장과 **따로** 두는 이유: 하나의 목록에 섞으면 "왼쪽에서 들어와 오른쪽으로 나간다"를
   * 아예 표현할 수 없다. 예전 문서에는 없으므로 선택 항목이다.
   */
  exit?: string | null
  exitDurationMs?: number
  /**
   * 등장 차례 (1부터). 비워두면 **요소 목록에서의 위치**를 쓴다.
   *
   * 목록 순서는 겹침 순서(z)를 겸하기 때문에, "이미지를 뒤에 깔되 먼저 등장" 같은
   * 조합이 목록만으로는 불가능하다. 그 둘을 떼어내기 위한 값이다.
   */
  order?: number
  /**
   * **등장하는 순간** 울리는 효과음 (없으면 null).
   *
   * 장 전체의 효과음(`slide.sound`)과 다르다. 이건 요소 하나가 나타날 때다 —
   * 1등이 뽀잉 튀어나올 때 '띵', 기차가 들어올 때 '칙칙폭폭' 같은 것.
   * 묶음도 같은 `Motion` 을 쓰므로 **덩어리가 등장할 때 한 번** 울리게도 된다.
   * 등장 지연을 그대로 따라가서 화면과 소리가 어긋나지 않는다.
   */
  sound?: AudioClip | null
}

export interface SectionStyle {
  titleSize: number
  itemSize: number
  color: string
  titleColor: string
  accentColor: string
  align: 'left' | 'center' | 'right'
  columns: 1 | 2 | 3
  gap: number
}

/**
 * 캔버스 위에서의 위치·크기. 전부 캔버스 대비 % 라 해상도가 바뀌어도 그대로 맞는다.
 *
 * 전체 스크롤 모드에서는 세로 위치를 흐름이 정하므로 `y` 는 무시된다.
 * 하나씩 등장 모드에서는 x·y 둘 다 쓰인다.
 */
export interface Layout {
  /** 가로 중심 (0~100) */
  x: number
  /** 세로 중심 (0~100) — 하나씩 등장 모드에서만 */
  y: number
  /** 가로 폭 (5~100) */
  width: number
}

export const DEFAULT_LAYOUT: Layout = { x: 50, y: 50, width: 100 }

export interface Section {
  id: string
  enabled: boolean
  title: string
  source: SourceKind
  /** 순위/명단에서 보여줄 최대 인원 */
  limit: number
  /** 순위 옆 수치(횟수·개수) 표시 */
  showValue: boolean
  /** 자유 텍스트 / 이미지 경로 (source 가 text·image 일 때) */
  content: string
  /** 이미지 최대 높이 (캔버스 높이 대비 %) */
  imageHeight: number
  /** 데이터가 비었을 때 */
  emptyBehavior: 'hide' | 'placeholder'
  placeholder: string
  style: SectionStyle
  motion: Motion
  /** 예전 프리셋에는 없을 수 있다 — 읽을 때 layoutOf() 로 기본값을 채운다 */
  layout?: Layout
}

/** 프리셋이 예전 버전이어도 안전하게 위치를 얻는다. */
export function layoutOf(section: Section): Layout {
  return { ...DEFAULT_LAYOUT, ...(section.layout ?? {}) }
}

export interface Preset {
  version: 1
  name: string
  author: string
  canvas: {
    width: number
    height: number
    background: string
    /** OBS 브라우저 소스는 배경이 투명이어야 방송 화면 위에 얹힌다 */
    transparent: boolean
  }
  /** roll = 영화 엔딩처럼 전체가 흐름 · sequence = 섹션별로 하나씩 등장 */
  mode: 'roll' | 'sequence'
  roll: {
    /** px/초 */
    speed: number
    direction: 'up' | 'down'
    /** 시작 전 대기 */
    startDelayMs: number
    /** 끝난 뒤 유지 */
    endHoldMs: number
  }
  sequence: {
    /** 섹션 하나가 화면에 머무는 시간 */
    holdMs: number
  }
  font: {
    family: string
    weight: number
    /** 글자에 그림자 — 밝은 방송 화면 위에서 가독성 확보 */
    shadow: boolean
  }
  sections: Section[]
}

export const DEFAULT_STYLE: SectionStyle = {
  titleSize: 34,
  itemSize: 26,
  color: '#ffffff',
  titleColor: '#8ab4ff',
  accentColor: '#ffd166',
  align: 'center',
  columns: 1,
  gap: 8
}

/** 새로 만드는 요소의 기본값 — **효과 없음**. 원하는 것만 골라 넣게 한다. */
export const DEFAULT_EXIT_MS = 600

/** 예전 문서에는 퇴장 길이가 없다 — 읽을 때 기본값을 채운다. */
export function exitDurationOf(m: Motion): number {
  return m.exitDurationMs ?? DEFAULT_EXIT_MS
}

export const DEFAULT_MOTION: Motion = {
  preset: 'none',
  durationMs: 600,
  delayMs: 0,
  easing: 'ease-out',
  staggerMs: 60,
  loop: null,
  loopDurationMs: 1400,
  exit: null,
  exitDurationMs: DEFAULT_EXIT_MS
}

let seq = 0
function section(partial: Partial<Section> & { title: string; source: SourceKind }): Section {
  seq += 1
  return {
    id: `s${seq}`,
    enabled: true,
    limit: 10,
    showValue: true,
    content: '',
    imageHeight: 35,
    emptyBehavior: 'hide',
    placeholder: '없음',
    style: { ...DEFAULT_STYLE },
    motion: { ...DEFAULT_MOTION },
    layout: { ...DEFAULT_LAYOUT },
    ...partial
  }
}

/** 기본 프리셋. 사용자가 아무것도 안 만들어도 바로 쓸 수 있어야 한다. */
export function defaultPreset(): Preset {
  seq = 0
  return {
    version: 1,
    name: '기본 프리셋',
    author: '',
    canvas: { width: 1920, height: 1080, background: '#000000', transparent: true },
    mode: 'roll',
    roll: { speed: 90, direction: 'up', startDelayMs: 800, endHoldMs: 2500 },
    sequence: { holdMs: 3500 },
    font: { family: 'Pretendard, "Malgun Gothic", sans-serif', weight: 700, shadow: true },
    sections: [
      section({
        title: '오늘도 함께해주셔서 감사합니다',
        source: 'text',
        content: '',
        style: { ...DEFAULT_STYLE, titleSize: 46, titleColor: '#ffffff' }
      }),
      section({ title: '오늘의 수다왕', source: 'chatRank', limit: 10 }),
      section({ title: '별풍선 감사합니다', source: 'balloonRank', limit: 10 }),
      section({ title: '서포트 스티커', source: 'stickerRank', limit: 5 }),
      section({ title: '오늘의 신규 구독자', source: 'newSubscribers', limit: 20, showValue: false }),
      section({ title: '구독 갱신', source: 'renewedSubscribers', limit: 20, showValue: false }),
      section({ title: '오늘의 신규 팬클럽', source: 'newFans', limit: 20, showValue: false }),
      section({ title: '열혈팬 승급', source: 'newTopFans', limit: 20, showValue: false }),
      section({ title: '오늘의 신규 애청자', source: 'newFollowers', limit: 20, showValue: false }),
      section({
        title: '내일도 만나요',
        source: 'text',
        content: '',
        style: { ...DEFAULT_STYLE, titleSize: 40, titleColor: '#ffffff' }
      })
    ]
  }
}

/** 섹션 하나가 화면에 실제로 그릴 줄들. 데이터 소스별 차이를 여기서 흡수한다. */
export interface RenderedLine {
  key: string
  label: string
  value: string | null
}

export function linesFor(section: Section, data: CreditData): RenderedLine[] {
  const rank = (rows: { userId: string; nickname: string; value: number }[], unit: string) =>
    rows.slice(0, section.limit).map((r) => ({
      key: r.userId,
      label: r.nickname,
      value: section.showValue ? `${r.value.toLocaleString()}${unit}` : null
    }))

  switch (section.source) {
    case 'chatRank':
      return rank(data.chatRank, '회')
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
      return data.newSubscribers.slice(0, section.limit).map((s) => ({
        key: s.userId,
        label: s.nickname,
        value: s.giftedBy ? `${s.giftedBy} 선물` : null
      }))
    case 'renewedSubscribers':
      return data.renewedSubscribers.slice(0, section.limit).map((s) => ({
        key: s.userId,
        label: s.nickname,
        value: section.showValue ? `${s.months}개월` : null
      }))
    case 'quickviewGifts':
      return data.quickviewGifts.slice(0, section.limit).map((q) => ({
        key: q.userId,
        label: q.nickname,
        value: q.type
      }))
    default:
      // v1 은 더 이상 새 소스를 다루지 않는다 (migrate.ts 가 v2 로 옮긴 뒤 폐기)
      return []
  }
}

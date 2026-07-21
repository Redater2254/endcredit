/**
 * 효과 카탈로그.
 *
 * 미스터호스처럼 "목록에서 보고 끌어다 놓는" UX 를 위해, 효과를 데이터로 정의한다.
 * 여기에 항목을 추가하면 라이브러리 패널·미리보기·실제 송출에 자동으로 반영된다.
 * 별도로 손댈 곳이 없어야 효과를 계속 늘릴 수 있다.
 */

export type EffectCategory = 'in' | 'emphasis' | 'out'

export interface Effect {
  /** 프리셋에 저장되는 식별자 */
  id: string
  name: string
  /** 라이브러리에서 느낌을 한 줄로 */
  description: string
  category: EffectCategory
  /** CSS @keyframes 본문 (선택자·이름 제외) */
  frames: string
  defaultDurationMs: number
  /** cubic-bezier 등 */
  defaultEasing: string
  /** 항목마다 시차를 주는 게 어울리는 효과인지 */
  suggestStagger: number
}

export const CATEGORY_LABEL: Record<EffectCategory, string> = {
  in: '등장',
  emphasis: '강조',
  out: '퇴장'
}

/** 튕기는 느낌을 내는 이징들 */
const BACK_OUT = 'cubic-bezier(.34,1.56,.64,1)'
const EASE_OUT = 'cubic-bezier(.22,1,.36,1)'

export const EFFECTS: Effect[] = [
  // ── 등장 ──────────────────────────────────────────
  {
    id: 'none',
    name: '없음',
    description: '효과 없이 바로 표시',
    category: 'in',
    frames: 'from { opacity: 1 } to { opacity: 1 }',
    defaultDurationMs: 0,
    defaultEasing: 'linear',
    suggestStagger: 0
  },
  {
    id: 'fade',
    name: '페이드',
    description: '서서히 나타남',
    category: 'in',
    frames: 'from { opacity: 0 } to { opacity: 1 }',
    defaultDurationMs: 600,
    defaultEasing: 'ease-out',
    suggestStagger: 60
  },
  {
    id: 'pop',
    name: '뽀잉',
    description: '작게 있다가 톡 튀어나옴',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: scale(.3) }
      60%  { opacity: 1; transform: scale(1.12) }
      100% { opacity: 1; transform: scale(1) }`,
    defaultDurationMs: 620,
    defaultEasing: BACK_OUT,
    suggestStagger: 80
  },
  {
    id: 'bounce-drop',
    name: '통통',
    description: '위에서 떨어져 두 번 튐',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: translateY(-140px) }
      55%  { opacity: 1; transform: translateY(0) }
      70%  { transform: translateY(-22px) }
      85%  { transform: translateY(0) }
      93%  { transform: translateY(-7px) }
      100% { transform: translateY(0) }`,
    defaultDurationMs: 900,
    defaultEasing: 'ease-out',
    suggestStagger: 90
  },
  {
    id: 'jelly',
    name: '젤리',
    description: '말랑하게 늘었다 줄었다',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: scale(.6, 1.4) }
      40%  { opacity: 1; transform: scale(1.22, .8) }
      60%  { transform: scale(.92, 1.08) }
      80%  { transform: scale(1.04, .97) }
      100% { transform: scale(1, 1) }`,
    defaultDurationMs: 800,
    defaultEasing: 'ease-out',
    suggestStagger: 70
  },
  {
    id: 'popcorn',
    name: '팝콘',
    description: '살짝 돌면서 튀어오름',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: scale(.2) rotate(-18deg) }
      55%  { opacity: 1; transform: scale(1.15) rotate(6deg) }
      80%  { transform: scale(.97) rotate(-2deg) }
      100% { transform: scale(1) rotate(0) }`,
    defaultDurationMs: 700,
    defaultEasing: BACK_OUT,
    suggestStagger: 85
  },
  {
    id: 'spring',
    name: '스프링',
    description: '아래에서 스프링처럼 솟음',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: translateY(70px) scale(.9) }
      55%  { opacity: 1; transform: translateY(-14px) scale(1.04) }
      78%  { transform: translateY(5px) scale(.99) }
      100% { transform: translateY(0) scale(1) }`,
    defaultDurationMs: 780,
    defaultEasing: 'ease-out',
    suggestStagger: 75
  },
  {
    id: 'slide-right',
    name: '왼쪽에서',
    description: '왼쪽 → 오른쪽으로 들어옴',
    category: 'in',
    frames: 'from { opacity: 0; transform: translateX(-90px) } to { opacity: 1; transform: none }',
    defaultDurationMs: 620,
    defaultEasing: EASE_OUT,
    suggestStagger: 70
  },
  {
    id: 'slide-left',
    name: '오른쪽에서',
    description: '오른쪽 → 왼쪽으로 들어옴',
    category: 'in',
    frames: 'from { opacity: 0; transform: translateX(90px) } to { opacity: 1; transform: none }',
    defaultDurationMs: 620,
    defaultEasing: EASE_OUT,
    suggestStagger: 70
  },
  {
    id: 'slide-up',
    name: '아래에서',
    description: '아래 → 위로 올라옴',
    category: 'in',
    frames: 'from { opacity: 0; transform: translateY(70px) } to { opacity: 1; transform: none }',
    defaultDurationMs: 600,
    defaultEasing: EASE_OUT,
    suggestStagger: 65
  },
  {
    id: 'slide-down',
    name: '위에서',
    description: '위 → 아래로 내려옴',
    category: 'in',
    frames: 'from { opacity: 0; transform: translateY(-70px) } to { opacity: 1; transform: none }',
    defaultDurationMs: 600,
    defaultEasing: EASE_OUT,
    suggestStagger: 65
  },
  {
    id: 'zoom-in',
    name: '확대 등장',
    description: '작은 상태에서 커지며 나타남',
    category: 'in',
    frames: 'from { opacity: 0; transform: scale(.75) } to { opacity: 1; transform: scale(1) }',
    defaultDurationMs: 600,
    defaultEasing: EASE_OUT,
    suggestStagger: 60
  },
  {
    id: 'zoom-out',
    name: '축소 등장',
    description: '크게 있다가 제자리로',
    category: 'in',
    frames: 'from { opacity: 0; transform: scale(1.45) } to { opacity: 1; transform: scale(1) }',
    defaultDurationMs: 620,
    defaultEasing: EASE_OUT,
    suggestStagger: 60
  },
  {
    id: 'blur-in',
    name: '흐림 해제',
    description: '뿌옇다가 또렷해짐',
    category: 'in',
    frames: `
      from { opacity: 0; filter: blur(14px); transform: scale(1.06) }
      to   { opacity: 1; filter: blur(0);    transform: scale(1) }`,
    defaultDurationMs: 750,
    defaultEasing: 'ease-out',
    suggestStagger: 70
  },
  {
    id: 'flip-x',
    name: '가로 플립',
    description: '가로축으로 뒤집히며 등장',
    category: 'in',
    frames: `
      from { opacity: 0; transform: perspective(700px) rotateX(-85deg) }
      to   { opacity: 1; transform: perspective(700px) rotateX(0) }`,
    defaultDurationMs: 700,
    defaultEasing: EASE_OUT,
    suggestStagger: 80
  },
  {
    id: 'flip-y',
    name: '세로 플립',
    description: '세로축으로 돌아가며 등장',
    category: 'in',
    frames: `
      from { opacity: 0; transform: perspective(700px) rotateY(-90deg) }
      to   { opacity: 1; transform: perspective(700px) rotateY(0) }`,
    defaultDurationMs: 700,
    defaultEasing: EASE_OUT,
    suggestStagger: 80
  },
  {
    id: 'rotate-in',
    name: '회전 등장',
    description: '빙글 돌면서 나타남',
    category: 'in',
    frames: `
      from { opacity: 0; transform: rotate(-200deg) scale(.5) }
      to   { opacity: 1; transform: rotate(0) scale(1) }`,
    defaultDurationMs: 800,
    defaultEasing: EASE_OUT,
    suggestStagger: 85
  },
  {
    id: 'swing-in',
    name: '흔들 등장',
    description: '매달린 것처럼 흔들리며 멈춤',
    category: 'in',
    frames: `
      0%   { opacity: 0; transform: rotate(-14deg) translateY(-40px) }
      50%  { opacity: 1; transform: rotate(9deg) }
      70%  { transform: rotate(-5deg) }
      85%  { transform: rotate(2deg) }
      100% { transform: rotate(0) }`,
    defaultDurationMs: 900,
    defaultEasing: 'ease-out',
    suggestStagger: 90
  },
  {
    id: 'stretch-in',
    name: '쭉 늘어남',
    description: '옆으로 늘어나며 펼쳐짐',
    category: 'in',
    frames: `
      from { opacity: 0; transform: scaleX(0) }
      60%  { opacity: 1; transform: scaleX(1.08) }
      to   { opacity: 1; transform: scaleX(1) }`,
    defaultDurationMs: 650,
    defaultEasing: BACK_OUT,
    suggestStagger: 55
  },

  // ── 강조 ──────────────────────────────────────────
  {
    id: 'pulse',
    name: '두근',
    description: '심장처럼 크기가 뛰다',
    category: 'emphasis',
    frames: `
      0%,100% { transform: scale(1) }
      50%     { transform: scale(1.08) }`,
    defaultDurationMs: 900,
    defaultEasing: 'ease-in-out',
    suggestStagger: 0
  },
  {
    id: 'shake',
    name: '흔들림',
    description: '좌우로 빠르게 떨림',
    category: 'emphasis',
    frames: `
      0%,100% { transform: translateX(0) }
      20%     { transform: translateX(-9px) }
      40%     { transform: translateX(8px) }
      60%     { transform: translateX(-5px) }
      80%     { transform: translateX(3px) }`,
    defaultDurationMs: 600,
    defaultEasing: 'ease-in-out',
    suggestStagger: 0
  },
  {
    id: 'glow',
    name: '네온',
    description: '빛이 번지듯 반짝임',
    category: 'emphasis',
    frames: `
      0%,100% { text-shadow: 0 2px 8px rgba(0,0,0,.85) }
      50%     { text-shadow: 0 0 18px currentColor, 0 0 34px currentColor, 0 2px 8px rgba(0,0,0,.85) }`,
    defaultDurationMs: 1400,
    defaultEasing: 'ease-in-out',
    suggestStagger: 120
  },
  {
    id: 'float',
    name: '둥실',
    description: '위아래로 천천히 떠다님',
    category: 'emphasis',
    frames: `
      0%,100% { transform: translateY(0) }
      50%     { transform: translateY(-12px) }`,
    defaultDurationMs: 2400,
    defaultEasing: 'ease-in-out',
    suggestStagger: 150
  },

  // ── 퇴장 ──────────────────────────────────────────
  {
    id: 'fade-out',
    name: '페이드 아웃',
    description: '서서히 사라짐',
    category: 'out',
    frames: 'from { opacity: 1 } to { opacity: 0 }',
    defaultDurationMs: 600,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'shrink-out',
    name: '쪼그라듦',
    description: '작아지며 사라짐',
    category: 'out',
    frames: 'from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(.5) }',
    defaultDurationMs: 550,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'fly-out-left',
    name: '왼쪽으로 퇴장',
    description: '왼쪽으로 날아가며 사라짐',
    category: 'out',
    frames: 'from { opacity: 1; transform: none } to { opacity: 0; transform: translateX(-120px) }',
    defaultDurationMs: 600,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'fly-out-right',
    name: '오른쪽으로 퇴장',
    description: '오른쪽으로 날아가며 사라짐',
    category: 'out',
    frames: 'from { opacity: 1; transform: none } to { opacity: 0; transform: translateX(120px) }',
    defaultDurationMs: 600,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'fly-out-up',
    name: '위로 퇴장',
    description: '위로 빠져나가며 사라짐',
    category: 'out',
    frames: 'from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(-90px) }',
    defaultDurationMs: 560,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'fly-out-down',
    name: '아래로 퇴장',
    description: '아래로 빠져나가며 사라짐',
    category: 'out',
    frames: 'from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(90px) }',
    defaultDurationMs: 560,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'zoom-out-big',
    name: '확 커지며 사라짐',
    description: '앞으로 다가오듯 커지면서 사라짐',
    category: 'out',
    frames:
      'from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(1.6) }',
    defaultDurationMs: 520,
    defaultEasing: 'ease-in',
    suggestStagger: 40
  },
  {
    id: 'blur-out',
    name: '흐려짐',
    description: '초점이 풀리며 사라짐',
    category: 'out',
    frames:
      'from { opacity: 1; filter: blur(0) } to { opacity: 0; filter: blur(14px) }',
    defaultDurationMs: 650,
    defaultEasing: 'ease-in',
    suggestStagger: 50
  },
  {
    id: 'spin-out',
    name: '돌며 사라짐',
    description: '빙글 돌면서 작아짐',
    category: 'out',
    frames:
      'from { opacity: 1; transform: rotate(0) scale(1) } ' +
      'to { opacity: 0; transform: rotate(200deg) scale(.3) }',
    defaultDurationMs: 700,
    defaultEasing: 'ease-in',
    suggestStagger: 60
  },
  {
    id: 'flip-out-y',
    name: '세로축으로 접힘',
    description: '카드가 돌아 뒷면으로 넘어가듯',
    category: 'out',
    frames:
      'from { opacity: 1; transform: perspective(700px) rotateY(0) } ' +
      'to { opacity: 0; transform: perspective(700px) rotateY(90deg) }',
    defaultDurationMs: 620,
    defaultEasing: 'ease-in',
    suggestStagger: 60
  },
  {
    id: 'drop-out',
    name: '떨어짐',
    description: '중력에 끌리듯 아래로 툭',
    category: 'out',
    frames:
      'from { opacity: 1; transform: none } ' +
      '30% { opacity: 1; transform: translateY(-14px) } ' +
      'to { opacity: 0; transform: translateY(180px) rotate(9deg) }',
    defaultDurationMs: 780,
    defaultEasing: 'cubic-bezier(.55,.06,.68,.19)',
    suggestStagger: 70
  }
]

const BY_ID = new Map(EFFECTS.map((e) => [e.id, e]))

export function getEffect(id: string): Effect {
  return BY_ID.get(id) ?? BY_ID.get('fade')!
}

export function effectsByCategory(category: EffectCategory): Effect[] {
  return EFFECTS.filter((e) => e.category === category)
}

/** CSS 애니메이션 이름. 카탈로그 id 하나로 미리보기·송출이 같은 정의를 쓴다. */
export function keyframeName(id: string): string {
  return `ec-${id}`
}

/** 카탈로그 전체를 <style> 에 넣을 CSS 로 만든다. */
export function buildKeyframesCss(): string {
  return EFFECTS.map((e) => `@keyframes ${keyframeName(e.id)} { ${e.frames} }`).join('\n')
}

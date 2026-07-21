import { useMemo } from 'react'

/**
 * 화면 전체에 덮이는 효과 — 폭죽·눈·반짝이 같은 것들.
 *
 * ## 요소 효과와 무엇이 다른가
 * 요소 효과는 "이 글자가 어떻게 나타나는가"이고, 이건 **장 전체의 분위기**다.
 * 어느 요소에도 매이지 않으므로 슬라이드에 붙이고, 요소 위를 덮는다.
 *
 * ## 왜 canvas 가 아니라 DOM + CSS 인가
 * CSS 애니메이션은 브라우저가 GPU 로 돌려서, 입자가 100개여도 프레임을 안 흘린다.
 * requestAnimationFrame 루프를 직접 돌리면 OBS 브라우저 소스가 백그라운드로 판단할 때
 * 느려지거나 멈출 수 있고, 정리(cleanup)를 놓치면 계속 돈다.
 * DOM 은 사라지면 애니메이션도 같이 사라진다.
 *
 * ## 무작위인데 매번 같은 이유
 * 씨앗(seed)을 고정한 난수를 쓴다. 편집 화면에서 본 모양과 방송에 나가는 모양이
 * 달라지면 미리보기의 의미가 없다.
 */

export interface ScreenEffect {
  id: string
  name: string
  description: string
  /** 기본 입자 수 (세기 100 기준) */
  count: number
  /** 계속 반복할지 — 눈·반짝이는 반복, 폭죽은 한 번 */
  loop: boolean
  defaultDurationMs: number
}

export const SCREEN_EFFECTS: ScreenEffect[] = [
  {
    id: 'confetti',
    name: '색종이',
    description: '위에서 색종이가 쏟아져 내림',
    count: 90,
    loop: false,
    defaultDurationMs: 3200
  },
  {
    id: 'cannon',
    name: '색종이 대포',
    description: '양쪽 아래에서 대각선으로 발사',
    count: 80,
    loop: false,
    defaultDurationMs: 2600
  },
  {
    id: 'fireworks',
    name: '불꽃놀이',
    description: '여러 곳에서 팡팡 터짐',
    count: 96,
    loop: true,
    defaultDurationMs: 2400
  },
  {
    id: 'sparkle',
    name: '반짝이',
    description: '화면 곳곳에서 작은 별이 반짝임',
    count: 46,
    loop: true,
    defaultDurationMs: 2000
  },
  {
    id: 'snow',
    name: '눈',
    description: '눈송이가 흔들리며 천천히 내림',
    count: 70,
    loop: true,
    defaultDurationMs: 9000
  },
  {
    id: 'petals',
    name: '꽃잎',
    description: '분홍 꽃잎이 흩날림',
    count: 42,
    loop: true,
    defaultDurationMs: 7000
  },
  {
    id: 'hearts',
    name: '하트',
    description: '하트가 아래에서 떠오름',
    count: 30,
    loop: true,
    defaultDurationMs: 4600
  },
  {
    id: 'bubbles',
    name: '비눗방울',
    description: '방울이 둥실 떠오름',
    count: 34,
    loop: true,
    defaultDurationMs: 6000
  },
  {
    id: 'rays',
    name: '빛줄기',
    description: '빛이 사선으로 한 번 쓸고 지나감',
    count: 3,
    loop: true,
    defaultDurationMs: 2600
  },
  {
    id: 'flash',
    name: '번쩍',
    description: '화면이 한 번 하얗게 터짐',
    count: 1,
    loop: false,
    defaultDurationMs: 700
  },
  {
    id: 'vignette',
    name: '가장자리 어둡게',
    description: '테두리를 눌러 가운데 글자를 도드라지게',
    count: 1,
    loop: false,
    defaultDurationMs: 900
  }
]

export function getScreenEffect(id: string): ScreenEffect | null {
  return SCREEN_EFFECTS.find((e) => e.id === id) ?? null
}

/** 화면 효과 설정. 슬라이드에 하나 붙는다. */
export interface ScreenFx {
  effect: string
  /** 입자 양 (10~200 %) */
  intensity: number
  durationMs: number
  delayMs: number
}

export const DEFAULT_SCREEN_FX: ScreenFx = {
  effect: 'confetti',
  intensity: 100,
  durationMs: 3200,
  delayMs: 0
}

// ── 난수 ────────────────────────────────────────────────────

/** 씨앗이 같으면 항상 같은 순서. 미리보기와 송출이 같아야 하므로 필요하다. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 0x100000000
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const CONFETTI_COLORS = ['#ff5f6d', '#ffd166', '#3ecf8e', '#4f7cff', '#c58cff', '#ff9d6c', '#ffffff']
const FIREWORK_COLORS = ['#ffd166', '#ff6b8a', '#7ee8fa', '#b6ff7a', '#ffffff', '#ffa14a']
const PETAL_COLORS = ['#ffc2d8', '#ffd7e6', '#ff9fc0', '#ffe3ec']

/** 인라인 스타일에 CSS 변수를 넣기 위한 타입 (React 는 -- 로 시작하는 키를 그대로 통과시킨다) */
type Vars = React.CSSProperties & Record<string, string | number>

// ── 그리기 ──────────────────────────────────────────────────

export function ScreenFxLayer({
  fx,
  seed,
  canvasW,
  canvasH
}: {
  fx: ScreenFx
  /** 같은 장이면 같은 모양이 나오게 하는 씨앗 (보통 슬라이드 id) */
  seed: string
  canvasW: number
  canvasH: number
}): React.JSX.Element {
  const spec = getScreenEffect(fx.effect)

  const parts = useMemo(() => {
    if (!spec) return []
    const rnd = seeded(hash(`${seed}:${fx.effect}`))
    const n = Math.max(1, Math.round((spec.count * fx.intensity) / 100))
    const dur = fx.durationMs
    const out: React.JSX.Element[] = []

    for (let i = 0; i < n; i++) {
      out.push(makeParticle(fx.effect, i, n, rnd, dur, canvasW, canvasH, spec.loop))
    }
    return out
    // 원시값만 의존성에 둔다 — 객체를 넣으면 데이터가 바뀔 때마다 입자가 다시 흩어진다
  }, [spec, seed, fx.effect, fx.intensity, fx.durationMs, canvasW, canvasH])

  if (!spec) return <></>

  return (
    <div
      className="fx-layer"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // 편집 중에 클릭이 막히면 요소를 못 고른다
        pointerEvents: 'none',
        animationDelay: `${fx.delayMs}ms`
      }}
    >
      {parts}
    </div>
  )
}

function makeParticle(
  effect: string,
  i: number,
  total: number,
  rnd: () => number,
  dur: number,
  canvasW: number,
  canvasH: number,
  loop: boolean
): React.JSX.Element {
  const rep = loop ? 'infinite' : '1'
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]

  switch (effect) {
    case 'confetti': {
      const w = 8 + rnd() * 12
      const h = w * (0.45 + rnd() * 0.5)
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: `-${6 + rnd() * 12}%`,
        width: w,
        height: h,
        background: pick(CONFETTI_COLORS),
        borderRadius: rnd() < 0.25 ? '50%' : 2,
        '--dx': `${(rnd() - 0.5) * canvasW * 0.35}px`,
        '--fall': `${canvasH * 1.25}px`,
        '--spin': `${(rnd() < 0.5 ? -1 : 1) * (360 + rnd() * 1080)}deg`,
        animation: `fx-fall ${dur * (0.7 + rnd() * 0.6)}ms linear ${rnd() * dur * 0.55}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'cannon': {
      // 왼쪽 아래·오른쪽 아래에서 번갈아 쏜다
      const left = i % 2 === 0
      const w = 7 + rnd() * 11
      // 화면을 가로질러 반대편까지 날아가면 대포가 아니라 유성이 된다 — 절반 이내로
      const reach = 0.22 + rnd() * 0.3
      const style: Vars = {
        position: 'absolute',
        left: left ? '2%' : '98%',
        top: '97%',
        width: w,
        height: w * (0.45 + rnd() * 0.5),
        background: pick(CONFETTI_COLORS),
        borderRadius: rnd() < 0.25 ? '50%' : 2,
        '--dx': `${(left ? 1 : -1) * canvasW * reach}px`,
        '--dy': `${-canvasH * (0.42 + rnd() * 0.45)}px`,
        // 시작 위치가 이미 바닥이라, 이만큼 더 떨어지면 화면 밖으로 확실히 빠진다
        '--fall': `${canvasH * (0.2 + rnd() * 0.25)}px`,
        '--spin': `${(rnd() < 0.5 ? -1 : 1) * (540 + rnd() * 900)}deg`,
        // 이징은 keyframe 안에서 구간별로 준다 — 여기서 걸면 낙하까지 감속돼 버린다
        animation: `fx-cannon ${dur * (0.85 + rnd() * 0.35)}ms linear ${rnd() * 240}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'fireworks': {
      // 한 다발이 12개 — 같은 중심에서 방사형으로 퍼진다
      const perBurst = 12
      const burst = Math.floor(i / perBurst)
      const k = i % perBurst
      const bRnd = seeded(hash(`b${burst}`))
      const cx = 12 + bRnd() * 76
      const cy = 14 + bRnd() * 46
      const color = pick(FIREWORK_COLORS)
      const angle = (k / perBurst) * Math.PI * 2 + bRnd() * 0.6
      const reach = canvasH * (0.13 + bRnd() * 0.12)
      const size = 5 + rnd() * 5
      const style: Vars = {
        position: 'absolute',
        left: `${cx}%`,
        top: `${cy}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 ${size * 2.4}px ${color}`,
        '--dx': `${Math.cos(angle) * reach}px`,
        '--dy': `${Math.sin(angle) * reach}px`,
        animation: `fx-burst ${dur * 0.75}ms cubic-bezier(.15,.75,.3,1) ${
          burst * (dur * 0.34) + rnd() * 90
        }ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'sparkle': {
      const size = 6 + rnd() * 16
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: `${rnd() * 100}%`,
        width: size,
        height: size,
        // 네 갈래 별 모양
        background: '#fff',
        clipPath:
          'polygon(50% 0%, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0% 50%, 40% 40%)',
        filter: `drop-shadow(0 0 ${size * 0.6}px rgba(255,240,190,.9))`,
        animation: `fx-twinkle ${dur * (0.6 + rnd() * 0.8)}ms ease-in-out ${
          rnd() * dur
        }ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'snow': {
      const size = 4 + rnd() * 9
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: `-${4 + rnd() * 10}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'rgba(255,255,255,.92)',
        filter: 'blur(.3px)',
        '--dx': `${(rnd() - 0.5) * canvasW * 0.14}px`,
        '--fall': `${canvasH * 1.2}px`,
        animation: `fx-drift ${dur * (0.7 + rnd() * 0.7)}ms linear ${
          rnd() * dur
        }ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'petals': {
      const w = 12 + rnd() * 16
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: `-${4 + rnd() * 12}%`,
        width: w,
        height: w * 0.62,
        background: pick(PETAL_COLORS),
        // 한쪽만 둥근 꽃잎 모양
        borderRadius: '60% 20% 60% 20%',
        '--dx': `${(rnd() - 0.5) * canvasW * 0.4}px`,
        '--fall': `${canvasH * 1.22}px`,
        '--spin': `${(rnd() < 0.5 ? -1 : 1) * (200 + rnd() * 500)}deg`,
        animation: `fx-fall ${dur * (0.75 + rnd() * 0.6)}ms linear ${rnd() * dur}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'hearts': {
      const size = 16 + rnd() * 22
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: '104%',
        width: size,
        height: size,
        background: pick(['#ff6b8a', '#ff9db4', '#ff4f74', '#ffc2d8']),
        // 하트는 회전한 사각형 + 두 원 대신 clip-path 하나로
        clipPath:
          'path("M12 21s-7.5-4.7-9.6-9.2C.6 8.3 2.6 4 6.6 4c2 0 3.7 1.1 4.6 2.6h1.6C13.7 5.1 15.4 4 17.4 4c4 0 6 4.3 4.2 7.8C19.5 16.3 12 21 12 21z")',
        transform: 'scale(1)',
        '--dx': `${(rnd() - 0.5) * canvasW * 0.18}px`,
        '--fall': `${canvasH * 1.15}px`,
        animation: `fx-rise ${dur * (0.8 + rnd() * 0.6)}ms ease-in ${rnd() * dur}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'bubbles': {
      const size = 14 + rnd() * 46
      const style: Vars = {
        position: 'absolute',
        left: `${rnd() * 100}%`,
        top: '104%',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1.5px solid rgba(255,255,255,.55)',
        background:
          'radial-gradient(circle at 32% 30%, rgba(255,255,255,.55), rgba(255,255,255,.06) 55%)',
        '--dx': `${(rnd() - 0.5) * canvasW * 0.2}px`,
        '--fall': `${canvasH * 1.15}px`,
        animation: `fx-rise ${dur * (0.75 + rnd() * 0.7)}ms linear ${rnd() * dur}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'rays': {
      const style: Vars = {
        position: 'absolute',
        top: '-30%',
        left: 0,
        width: `${8 + i * 5}%`,
        height: '160%',
        background:
          'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.28), rgba(255,255,255,0))',
        animation: `fx-sweep ${dur}ms ease-in-out ${i * (dur * 0.16)}ms ${rep} both`
      }
      return <span key={i} style={style} />
    }

    case 'flash': {
      const style: Vars = {
        position: 'absolute',
        inset: 0,
        background: '#fff',
        animation: `fx-flash ${dur}ms ease-out both`
      }
      return <span key={i} style={style} />
    }

    case 'vignette': {
      const style: Vars = {
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(0,0,0,.62) 100%)',
        animation: `fx-fade-in ${dur}ms ease-out both`
      }
      return <span key={i} style={style} />
    }

    default:
      return <span key={i} />
  }
}

/** 화면 효과가 쓰는 keyframes. MOTION_KEYFRAMES 와 함께 <style> 로 넣는다. */
export const SCREEN_FX_CSS = `
/* 떨어지는 것은 조금씩 빨라져야 한다. 완전한 등속은 종이가 아니라 엘리베이터처럼 보인다. */
@keyframes fx-fall {
  0% {
    transform: translate3d(0,0,0) rotate(0deg);
    opacity: 0;
    animation-timing-function: cubic-bezier(.42,0,.85,.7);
  }
  6%   { opacity: 1 }
  90%  { opacity: 1 }
  100% { transform: translate3d(var(--dx,0), var(--fall,1200px), 0) rotate(var(--spin,720deg)); opacity: 0 }
}
/*
 * 대포는 구간마다 이징이 달라야 한다.
 *
 *   발사 → 꼭대기 : 빠르게 나갔다가 느려진다 (ease-out)
 *   꼭대기 → 낙하 : 점점 빨라진다 (ease-in) — 중력이니까
 *
 * 전체에 하나의 ease-out 을 걸면 **떨어지면서 느려져서**, 무언가에 붙잡히는 것처럼 보인다.
 * 가로 이동은 꼭대기에서 이미 대부분 끝난다 (공기 저항으로 옆으로 가는 힘이 먼저 죽는다).
 */
@keyframes fx-cannon {
  0% {
    transform: translate3d(0,0,0) rotate(0deg);
    opacity: 0;
    animation-timing-function: cubic-bezier(.1,.62,.3,1);
  }
  6%  { opacity: 1 }
  42% {
    transform: translate3d(calc(var(--dx) * .86), var(--dy), 0) rotate(calc(var(--spin) * .5));
    opacity: 1;
    animation-timing-function: cubic-bezier(.55,0,.85,.5);
  }
  88%  { opacity: 1 }
  100% { transform: translate3d(var(--dx), var(--fall), 0) rotate(var(--spin)); opacity: 0 }
}
@keyframes fx-burst {
  0%   { transform: translate3d(0,0,0) scale(.2); opacity: 0 }
  12%  { transform: translate3d(0,0,0) scale(1); opacity: 1 }
  100% { transform: translate3d(var(--dx), var(--dy), 0) scale(.25); opacity: 0 }
}
@keyframes fx-twinkle {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0 }
  45%      { transform: scale(1) rotate(45deg); opacity: 1 }
  70%      { transform: scale(.8) rotate(70deg); opacity: .7 }
}
@keyframes fx-drift {
  0%   { transform: translate3d(0,0,0); opacity: 0 }
  8%   { opacity: .95 }
  50%  { transform: translate3d(var(--dx,0), calc(var(--fall,1200px) * .5), 0) }
  92%  { opacity: .8 }
  100% { transform: translate3d(calc(var(--dx,0) * -1), var(--fall,1200px), 0); opacity: 0 }
}
@keyframes fx-rise {
  0%   { transform: translate3d(0,0,0) scale(.7); opacity: 0 }
  14%  { opacity: .95 }
  85%  { opacity: .8 }
  100% { transform: translate3d(var(--dx,0), calc(var(--fall,1200px) * -1), 0) scale(1.05); opacity: 0 }
}
@keyframes fx-sweep {
  0%   { transform: translateX(-140%) skewX(-16deg); opacity: 0 }
  20%  { opacity: 1 }
  80%  { opacity: 1 }
  100% { transform: translateX(260%) skewX(-16deg); opacity: 0 }
}
@keyframes fx-flash {
  0%   { opacity: 0 }
  10%  { opacity: .9 }
  100% { opacity: 0 }
}
@keyframes fx-fade-in {
  from { opacity: 0 }
  to   { opacity: 1 }
}
`

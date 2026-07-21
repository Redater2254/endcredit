/**
 * 기본 제공 소리를 **수식으로 만들어낸다.**
 *
 * 무료 효과음 사이트 대부분은 "상업적 이용은 무료지만 재배포는 금지"다. 이 앱은 프리셋을
 * 남에게 주는 것이 핵심 기능이라, 남의 음원을 기본값으로 넣는 순간 그 기능이 위법이 된다.
 * 직접 합성하면 라이선스가 아예 없으므로 앱에 넣어도 프리셋에 담아도 자유롭다.
 *
 * 만든 WAV 는 한 번 만들고 메모리에 들고 있는다 — 로컬 서버가 내보내므로 그걸로 충분하다.
 */

const RATE = 32000

/** 소리를 겹쳐 담는 도화지. */
class Canvas {
  readonly data: Float32Array

  constructor(seconds: number) {
    this.data = new Float32Array(Math.ceil(seconds * RATE))
  }

  /** 음높이가 고정된 소리 */
  mix(at: number, dur: number, voice: (t: number) => number): void {
    const start = Math.round(at * RATE)
    const len = Math.round(dur * RATE)
    for (let i = 0; i < len; i++) {
      const j = start + i
      if (j >= 0 && j < this.data.length) this.data[j] += voice(i / RATE)
    }
  }

  /**
   * 음높이가 변하는 소리.
   *
   * `sin(2π f(t) t)` 로 쓰면 f 가 바뀔 때마다 위상이 튀어 지직거린다.
   * 위상을 **적분**해야 매끄럽게 미끄러진다.
   */
  sweep(
    at: number,
    dur: number,
    freqAt: (t: number) => number,
    envAt: (t: number) => number
  ): void {
    const start = Math.round(at * RATE)
    const len = Math.round(dur * RATE)
    let phase = 0
    for (let i = 0; i < len; i++) {
      const t = i / RATE
      phase += (2 * Math.PI * freqAt(t)) / RATE
      const j = start + i
      if (j >= 0 && j < this.data.length) this.data[j] += Math.sin(phase) * envAt(t)
    }
  }

  /** 잡음. 한 극점 저역 통과를 걸어 "쉬——" 대신 "스윽" 에 가깝게 만든다. */
  noise(at: number, dur: number, envAt: (t: number) => number, cutoffAt: (t: number) => number): void {
    const start = Math.round(at * RATE)
    const len = Math.round(dur * RATE)
    const rnd = lcg(0x5eed)
    let last = 0
    for (let i = 0; i < len; i++) {
      const t = i / RATE
      // 차단 주파수를 계수로 (간단한 1차 저역 통과)
      const k = Math.min(1, (2 * Math.PI * cutoffAt(t)) / RATE)
      last += k * (rnd() * 2 - 1 - last)
      const j = start + i
      if (j >= 0 && j < this.data.length) this.data[j] += last * envAt(t)
    }
  }

  /** 최대 진폭을 맞춘다. 소리마다 크기가 들쭉날쭉하면 음량 조절이 무의미해진다. */
  normalize(peak: number): void {
    let max = 0
    for (const v of this.data) max = Math.max(max, Math.abs(v))
    if (max < 1e-6) return
    const g = peak / max
    for (let i = 0; i < this.data.length; i++) this.data[i] *= g
  }

  /**
   * 끝을 짧게 닫는다. 잘린 자리에서 '딱' 하는 잡음이 나는 걸 막는다.
   *
   * 시작은 건드리지 않는다 — 타격음은 **첫 순간이 가장 큰데** 거기를 줄이면
   * 북이 북 같지 않게 된다. 시작의 클릭은 각 목소리의 짧은 attack 이 이미 막고 있다.
   */
  fadeOut(ms = 20): void {
    const n = Math.round((ms / 1000) * RATE)
    for (let i = 0; i < n && i < this.data.length; i++) {
      this.data[this.data.length - 1 - i] *= i / n
    }
  }

  /** 반복 재생용. 이음매가 매끄럽도록 앞뒤를 함께 여닫는다. */
  fadeLoopSeam(ms = 30): void {
    const n = Math.round((ms / 1000) * RATE)
    for (let i = 0; i < n && i < this.data.length; i++) {
      const g = i / n
      this.data[i] *= g
      this.data[this.data.length - 1 - i] *= g
    }
  }
}

/** 재현 가능한 난수 — 앱을 다시 켜도 같은 소리가 나야 캐시가 의미 있다. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** MIDI 번호 → 주파수. A4(69) = 440Hz */
function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ── 목소리 ──────────────────────────────────────────────────

/**
 * 피아노 비슷한 소리.
 * 배음을 몇 개 쌓되 **높은 배음일수록 빨리 죽인다** — 그래야 때린 뒤 부드럽게 남는다.
 */
function pluck(freq: number, dur: number, gain: number): (t: number) => number {
  return (t) => {
    if (t > dur) return 0
    let v = 0
    for (let k = 1; k <= 6; k++) {
      v += (Math.sin(2 * Math.PI * freq * k * t) / Math.pow(k, 1.7)) * Math.exp(-t * (2.0 + k * 1.2))
    }
    return v * gain * Math.min(1, t / 0.006)
  }
}

/** 부드러운 패드. 살짝 어긋난 두 사인의 맥놀이로 두께를 만든다. */
function pad(freq: number, dur: number, gain: number): (t: number) => number {
  return (t) => {
    if (t > dur) return 0
    const swell = Math.min(1, t / (dur * 0.4)) * Math.min(1, (dur - t) / (dur * 0.45))
    const a = Math.sin(2 * Math.PI * freq * t)
    const b = Math.sin(2 * Math.PI * freq * 1.005 * t)
    const c = Math.sin(2 * Math.PI * freq * 2 * t) * 0.16
    return (a + b + c) * 0.32 * swell * gain
  }
}

/** 낮게 깔리는 베이스. 배음을 거의 안 넣어야 다른 소리를 안 가린다. */
function bass(freq: number, dur: number, gain: number): (t: number) => number {
  return (t) => {
    if (t > dur) return 0
    const env = Math.exp(-t * 1.6) * Math.min(1, t / 0.01)
    return (Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2) * env * gain
  }
}

// ── 효과음 ──────────────────────────────────────────────────

function pop(): Canvas {
  const c = new Canvas(0.4)
  // 낮은 데서 빠르게 튀어오르는 음 — "뽀잉"
  c.sweep(
    0,
    0.38,
    (t) => 300 + 950 * (1 - Math.exp(-t * 26)),
    (t) => Math.exp(-t * 8.5) * Math.min(1, t / 0.004)
  )
  // 살짝 위의 배음을 겹쳐 통통함을 준다
  c.sweep(
    0.01,
    0.25,
    (t) => 900 + 1400 * (1 - Math.exp(-t * 30)),
    (t) => Math.exp(-t * 15) * 0.22
  )
  return c
}

function whoosh(): Canvas {
  const c = new Canvas(0.6)
  // 잡음의 차단 주파수를 올렸다 내리면 옆으로 지나가는 느낌이 난다
  c.noise(
    0,
    0.55,
    (t) => Math.sin(Math.PI * Math.min(1, t / 0.5)) * 0.8,
    (t) => 500 + 5200 * Math.sin(Math.PI * Math.min(1, t / 0.5))
  )
  return c
}

function ding(): Canvas {
  const c = new Canvas(1.7)
  // 종은 배음이 정수배가 아니다 — 이 비율이 '금속'처럼 들리게 하는 핵심이다
  const partials = [1, 2.76, 5.4, 8.93]
  const decay = [2.0, 3.4, 5.2, 7.5]
  const gain = [1, 0.42, 0.2, 0.09]
  const base = hz(88) // E6
  partials.forEach((p, i) => {
    c.mix(0, 1.65, (t) => Math.sin(2 * Math.PI * base * p * t) * Math.exp(-t * decay[i]) * gain[i] * 0.4)
  })
  return c
}

function sparkle(): Canvas {
  const c = new Canvas(1.1)
  // 짧고 높은 소리를 촘촘하게 흩뿌린다 — 위로 올라가며 잦아든다
  const notes = [96, 100, 103, 108, 105, 110, 112]
  notes.forEach((n, i) => {
    const at = i * 0.075 + (i % 2) * 0.02
    c.mix(at, 0.5, (t) => Math.sin(2 * Math.PI * hz(n) * t) * Math.exp(-t * 13) * 0.3 * (1 - i * 0.09))
  })
  return c
}

function thump(): Canvas {
  const c = new Canvas(0.7)
  // 빠르게 떨어지는 저음 = 북. 앞머리에 짧은 잡음을 붙여 때린 느낌을 만든다
  c.sweep(
    0,
    0.6,
    (t) => 46 + 120 * Math.exp(-t * 30),
    (t) => Math.exp(-t * 6) * Math.min(1, t / 0.002) * 0.9
  )
  c.noise(0, 0.05, (t) => Math.exp(-t * 90) * 0.35, () => 2600)
  return c
}

function rise(): Canvas {
  const c = new Canvas(1.5)
  // 1등 발표 직전의 긴장 — 음과 잡음이 함께 차올랐다가 끝에서 툭 끊긴다
  c.sweep(
    0,
    1.35,
    (t) => 180 * Math.pow(2, t * 2.4),
    (t) => Math.min(1, t / 0.15) * Math.pow(t / 1.35, 1.6) * 0.5
  )
  c.noise(
    0,
    1.35,
    (t) => Math.pow(t / 1.35, 2.2) * 0.35,
    (t) => 600 + 6000 * (t / 1.35)
  )
  // 끝맺음 한 방
  c.mix(1.34, 0.15, (t) => Math.sin(2 * Math.PI * hz(84) * t) * Math.exp(-t * 22) * 0.5)
  return c
}

// ── 배경음악 ────────────────────────────────────────────────

/** 코드 하나 = MIDI 번호 묶음. 낮은 쪽이 근음이다. */
type Chord = number[]

/** 따뜻한 밤 — 피아노 아르페지오 + 패드. */
function warm(): Canvas {
  const beat = 60 / 76
  const bar = beat * 4
  const chords: Chord[] = [
    [48, 52, 55, 59], // Cmaj7
    [45, 48, 52, 55], // Am7
    [41, 45, 48, 52], // Fmaj7
    [43, 47, 50, 55], // G
    [48, 52, 55, 59], // Cmaj7
    [45, 48, 52, 55], // Am7
    [50, 53, 57, 60], // Dm7
    [43, 47, 50, 53] // G7
  ]
  const c = new Canvas(chords.length * bar)
  // 위아래로 오가는 아르페지오 — 한 방향으로만 가면 기계 같다
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3]

  chords.forEach((ch, b) => {
    const at = b * bar
    pattern.forEach((idx, i) => {
      c.mix(at + i * (beat / 2), 1.4, pluck(hz(ch[idx] + 12), 1.4, 0.16))
    })
    for (const n of ch.slice(1)) c.mix(at, bar, pad(hz(n), bar, 0.09))
    c.mix(at, bar * 0.9, bass(hz(ch[0] - 12), bar, 0.2))
    c.mix(at + beat * 2, bar * 0.5, bass(hz(ch[0] - 12), bar * 0.5, 0.11))
  })

  return c
}

/** 잔잔하게 — 패드만. 말소리를 안 가리도록 높은 음을 거의 안 쓴다. */
function calm(): Canvas {
  const bar = 4
  const chords: Chord[] = [
    [48, 52, 55, 59], // Cmaj7
    [52, 55, 59, 62], // Em7
    [41, 45, 48, 52], // Fmaj7
    [45, 48, 52, 55], // Am7
    [50, 53, 57, 60], // Dm7
    [43, 47, 50, 54] // G
  ]
  const c = new Canvas(chords.length * bar)

  chords.forEach((ch, b) => {
    const at = b * bar
    // 코드가 겹치도록 조금 길게 잡는다 — 딱 끊기면 마디가 세어진다
    for (const n of ch) c.mix(at, bar * 1.35, pad(hz(n), bar * 1.35, 0.13))
    c.mix(at, bar, bass(hz(ch[0] - 12), bar, 0.16))
    // 아주 옅은 위쪽 반짝임
    c.mix(at + bar * 0.5, bar, pad(hz(ch[1] + 24), bar, 0.022))
  })

  return c
}

/** 조용한 피아노 — 띄엄띄엄. 여백이 많아야 크레딧 글자가 읽힌다. */
function quiet(): Canvas {
  const beat = 60 / 68
  const bar = beat * 4
  const chords: Chord[] = [
    [45, 52, 57, 60], // Am
    [41, 48, 53, 57], // F
    [48, 55, 59, 64], // C
    [43, 50, 55, 59], // G
    [45, 52, 57, 60], // Am
    [41, 48, 52, 57], // Fmaj7
    [43, 50, 54, 59] // G
  ]
  const c = new Canvas(chords.length * bar)
  // 마디마다 다르게 — 같은 자리에만 치면 금방 질린다
  const spots = [
    [0, 1.5, 2.5],
    [0, 2],
    [0, 1, 2.5, 3],
    [0, 2.5]
  ]

  chords.forEach((ch, b) => {
    const at = b * bar
    const when = spots[b % spots.length]
    when.forEach((w, i) => {
      const note = ch[(i + b) % ch.length] + 12
      c.mix(at + w * beat, 2.2, pluck(hz(note), 2.2, 0.19))
    })
    c.mix(at, bar, bass(hz(ch[0] - 12), bar, 0.22))
    for (const n of ch.slice(1, 3)) c.mix(at, bar * 1.2, pad(hz(n), bar * 1.2, 0.055))
  })

  return c
}

// ── WAV ─────────────────────────────────────────────────────

function wav(samples: Float32Array): Buffer {
  const n = samples.length
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16) // fmt 크기
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // 모노
  buf.writeUInt32LE(RATE, 24)
  buf.writeUInt32LE(RATE * 2, 28) // 초당 바이트
  buf.writeUInt16LE(2, 32) // 블록 정렬
  buf.writeUInt16LE(16, 34) // 비트 수
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2)
  }
  return buf
}

/**
 * 효과음은 또렷하게, 배경음악은 얌전하게 — 목표 음량이 다르다.
 * `loop` 인 것만 이음매를 다듬는다 (효과음은 한 번 울리고 끝이라 필요 없다).
 */
const RECIPES: Record<string, { make: () => Canvas; peak: number; loop?: boolean }> = {
  pop: { make: pop, peak: 0.86 },
  whoosh: { make: whoosh, peak: 0.7 },
  ding: { make: ding, peak: 0.82 },
  sparkle: { make: sparkle, peak: 0.78 },
  thump: { make: thump, peak: 0.9 },
  rise: { make: rise, peak: 0.8 },
  warm: { make: warm, peak: 0.62, loop: true },
  calm: { make: calm, peak: 0.55, loop: true },
  quiet: { make: quiet, peak: 0.6, loop: true }
}

const cache = new Map<string, Buffer>()

/** 기본 제공 소리를 WAV 로. 없는 id 면 null. */
export function renderBuiltinAudio(id: string): Buffer | null {
  const hit = cache.get(id)
  if (hit) return hit

  const recipe = RECIPES[id]
  if (!recipe) return null

  const c = recipe.make()
  c.normalize(recipe.peak)
  if (recipe.loop) c.fadeLoopSeam()
  else c.fadeOut()
  const buf = wav(c.data)
  cache.set(id, buf)
  return buf
}

export function builtinAudioIds(): string[] {
  return Object.keys(RECIPES)
}

import { SERVER_PORT } from './constants'

/**
 * 기본으로 딸려오는 소리 목록.
 *
 * ## 왜 직접 합성하는가
 * 남의 음원을 넣으면 프리셋을 공유하는 순간 저작권 문제가 된다. 이 앱의 핵심이 "프리셋을
 * 남에게 준다"인 이상 그건 곧 못 쓰는 기능이 된다. 그래서 **소리를 수식으로 만들어** 쓴다 —
 * 라이선스가 없고, 파일을 따로 배포할 필요도 없고, 프리셋에 담을 필요조차 없다.
 *
 * 주소가 `builtin-audio/<id>.wav` 라 어느 컴퓨터의 endcredit 이든 같은 소리가 난다.
 * 그래서 `.ecpreset` 을 만들 때 이 소리들은 담지 않는다 (담아봐야 중복이다).
 */

export interface BuiltinAudio {
  id: string
  name: string
  hint: string
}

/** 장이 나타날 때 한 번 울리는 짧은 소리들. */
export const BUILTIN_SOUNDS: BuiltinAudio[] = [
  { id: 'pop', name: '뽀잉', hint: '통통 튀는 등장' },
  { id: 'whoosh', name: '스윽', hint: '옆으로 지나가는 바람' },
  { id: 'ding', name: '띵', hint: '맑은 종소리 — 발표·순위' },
  { id: 'sparkle', name: '반짝', hint: '작은 별이 흩어지는 소리' },
  { id: 'thump', name: '둥', hint: '묵직한 북 — 강조' },
  { id: 'rise', name: '차오름', hint: '1등 발표 직전 긴장감' }
]

/** 크레딧이 흐르는 내내 깔리는 배경음악. 전부 이어 붙여도 티 안 나게 만들었다. */
export const BUILTIN_BGM: BuiltinAudio[] = [
  { id: 'warm', name: '따뜻한 밤', hint: '피아노 아르페지오 · 25초 반복' },
  { id: 'calm', name: '잔잔하게', hint: '느린 패드만 · 24초 반복' },
  { id: 'quiet', name: '조용한 피아노', hint: '띄엄띄엄 치는 피아노 · 25초 반복' }
]

export const BUILTIN_AUDIO: BuiltinAudio[] = [...BUILTIN_SOUNDS, ...BUILTIN_BGM]

const PATH = '/builtin-audio/'

export function builtinAudioUrl(id: string): string {
  return `http://localhost:${SERVER_PORT}${PATH}${id}.wav`
}

/** 이 주소가 기본 제공 소리인지 — 내보내기에서 담지 않으려면 구분해야 한다. */
export function builtinIdFromUrl(src: string): string | null {
  const m = new RegExp(`${PATH}([\\w-]+)\\.wav`).exec(src)
  return m && BUILTIN_AUDIO.some((a) => a.id === m[1]) ? m[1] : null
}

export function builtinNameOf(src: string): string | null {
  const id = builtinIdFromUrl(src)
  return id ? (BUILTIN_AUDIO.find((a) => a.id === id)?.name ?? null) : null
}

import { nativeImage, type NativeImage } from 'electron'
import { ICON_PNG } from './icon-data'

/**
 * 앱·트레이 아이콘.
 *
 * 그림은 `npm run icons` 가 `brand/` 의 원본에서 구워 `icon-data.ts` 에 **코드로 넣어둔다.**
 * 파일 경로로 읽으면 개발 중엔 되다가 패키징 후 경로가 달라져 아이콘이 사라진다.
 *
 * 작은 크기(16·24·32)는 글자 없이 심볼만 들어 있다 — 그 크기에서 글자는 얼룩일 뿐이다.
 */

const AVAILABLE = Object.keys(ICON_PNG)
  .map(Number)
  .sort((a, b) => a - b)

/** 요청한 크기 이상 중 가장 작은 것. 늘리는 것보다 줄이는 쪽이 훨씬 깨끗하다. */
function bestFor(size: number): number {
  return AVAILABLE.find((n) => n >= size) ?? AVAILABLE[AVAILABLE.length - 1]
}

export function appIcon(size = 32): NativeImage {
  const pick = bestFor(size)
  const img = nativeImage.createFromBuffer(Buffer.from(ICON_PNG[pick], 'base64'))
  return pick === size ? img : img.resize({ width: size, height: size, quality: 'best' })
}

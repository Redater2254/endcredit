import { existsSync, readFileSync } from 'node:fs'
import { writeFileAtomic } from './safe-write'
import { dirname, join } from 'node:path'
import { app } from 'electron'

/**
 * 앱 자체의 아주 작은 설정. 문서(프리셋)와는 별개다.
 *
 * "트레이 안내를 봤는지" 같은 것은 프리셋에 담기면 안 된다 — 남에게 프리셋을 주면
 * 그 사람 설정까지 덮어쓰게 된다.
 */
export interface Settings {
  /** 창을 닫으면 트레이로 내려간다는 안내를 이미 보여줬는지 */
  trayHintShown?: boolean
  /**
   * 파일 창을 마지막으로 열었던 폴더. **종류별로 따로** 기억한다.
   * 하나로 합치면 소리를 넣은 뒤 이미지를 고르려는데 음악 폴더가 열린다.
   */
  lastDirs?: Record<string, string>
  /**
   * 앱 UI 크기. `'auto'`(기본)면 창이 놓인 화면 크기에 맞춰 앱이 정한다.
   * 프리셋이 아니라 **이 컴퓨터의 화면 설정**이므로 여기에 둔다 — 남에게 프리셋을
   * 주면서 내 모니터 배율까지 딸려 보내면 안 된다.
   */
  uiScale?: 'auto' | number
}

/** 파일 창의 시작 위치. 없거나 지워진 폴더면 `undefined` — OS 기본(다운로드)으로 열린다. */
export function lastDir(kind: string): string | undefined {
  const dir = getSettings().lastDirs?.[kind]
  return dir && existsSync(dir) ? dir : undefined
}

/** 고른 파일이 있던 폴더를 기억한다. 다음에 그 종류의 파일 창은 여기서 시작한다. */
export function rememberDir(kind: string, filePath: string): void {
  const dir = dirname(filePath)
  if (!dir) return
  patchSettings({ lastDirs: { ...getSettings().lastDirs, [kind]: dir } })
}

function path(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  try {
    cache = existsSync(path()) ? (JSON.parse(readFileSync(path(), 'utf8')) as Settings) : {}
  } catch {
    cache = {}
  }
  return cache
}

export function patchSettings(p: Partial<Settings>): void {
  cache = { ...getSettings(), ...p }
  try {
    writeFileAtomic(path(), JSON.stringify(cache, null, 2))
  } catch (err) {
    // 설정 하나 때문에 앱이 죽을 이유는 없다
    console.warn('[settings] 저장 실패:', err)
  }
}

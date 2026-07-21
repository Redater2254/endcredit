import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
    writeFileSync(path(), JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    // 설정 하나 때문에 앱이 죽을 이유는 없다
    console.warn('[settings] 저장 실패:', err)
  }
}

import { existsSync, readFileSync, renameSync } from 'node:fs'
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
   * 앱이 켜지면 수집도 자동으로 시작할지.
   *
   * **이 컴퓨터의 습관**이지 문서의 일부가 아니다 — 프리셋을 남에게 주면서 그 사람
   * 컴퓨터까지 채팅을 모으게 만들면 안 된다.
   */
  autoCollect?: boolean
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
  const p = path()
  if (!existsSync(p)) {
    cache = {}
    return cache
  }
  try {
    /*
     * **BOM 을 떼고 읽는다.** 사람이 메모장이나 PowerShell 로 이 파일을 한 번 고치면
     * 앞에 `﻿` 가 붙고, 그러면 `JSON.parse` 가 그 자리에서 터진다.
     * 내용은 멀쩡한데 설정이 통째로 초기화되는 셈이라 원인을 찾을 수가 없다.
     */
    cache = JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')) as Settings
  } catch (err) {
    /*
     * 못 읽은 파일을 그 자리에 두면 **다음 저장이 원본을 덮어써 영영 사라진다.**
     * 옆으로 치워두면 나중에 손으로 되살릴 수 있다. (프리셋 쪽과 같은 규칙)
     */
    const kept = `${p}.broken-${Date.now()}`
    try {
      renameSync(p, kept)
      console.warn(`[settings] 설정을 읽지 못해 ${kept} 로 옮기고 기본값으로 시작합니다:`, err)
    } catch (mvErr) {
      console.error('[settings] 손상된 설정을 옮기지도 못했습니다 — 저장이 덮어쓸 수 있습니다:', mvErr)
    }
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

import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { getCollectorStatus } from './collector'
import { isPlaying } from './overlay'
import type { UpdateState } from '@shared/types'

/**
 * 자동 업데이트 — GitHub 릴리스에서 새 버전을 받아 **앱을 끌 때** 설치한다.
 *
 * ## 왜 스스로 받지 않는가
 * `autoDownload` 를 켜두면 앱을 켜자마자 수십 MB 를 몰래 받는다. 이 앱은 **방송 중에
 * 켜져 있는 것이 정상**이라, 업로드 대역폭이 빠듯한 순간에 말없이 받아가면 곤란하다.
 * 그래서 확인만 자동으로 하고, 받는 것은 사용자가 누를 때만 한다.
 *
 * ## 왜 스스로 재시작하지 않는가
 * 재시작하면 **수집 세션이 그 자리에서 끊긴다.** 방송 마지막에 틀 크레딧을 위해 하루치
 * 채팅을 모으고 있는데 그게 날아가면 이 앱의 존재 이유가 사라진다. 그래서
 * `quitAndInstall()` 은 어디서도 부르지 않는다 — 사용자가 앱을 끄는 그 순간에만 설치된다.
 *
 * ## 확인조차 미루는 때
 * 수집기가 돌고 있거나 크레딧이 송출 중이면 확인도 하지 않는다. 그때 할 일은 방송이지
 * 업데이트가 아니고, 알림 하나가 사고를 부를 이유가 없다.
 */

const { autoUpdater } = electronUpdater

let state: UpdateState = { kind: 'idle' }
let notify: ((s: UpdateState) => void) | null = null

function set(next: UpdateState): void {
  state = next
  notify?.(next)
}

export function getUpdateState(): UpdateState {
  return state
}

export function onUpdateState(fn: (s: UpdateState) => void): void {
  notify = fn
}

/** 방송에 방해가 되는 순간인지 — 수집 중이거나 송출 중 */
function busyBroadcasting(): boolean {
  const s = getCollectorStatus().state
  return isPlaying() || s === 'live' || s === 'connecting' || s === 'reconnecting'
}

export function registerUpdater(): void {
  // 받는 것도 설치도 우리가 시점을 정한다
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => set({ kind: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ kind: 'current' }))
  autoUpdater.on('update-available', (info) =>
    set({
      kind: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null
    })
  )
  autoUpdater.on('download-progress', (p) => {
    const v = state.kind === 'available' || state.kind === 'downloading' ? state.version : ''
    set({ kind: 'downloading', version: v, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ kind: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => set({ kind: 'error', message: String(err?.message ?? err) }))
}

/**
 * 새 버전이 있는지 본다.
 *
 * `manual` 은 사용자가 직접 누른 것 — 이때는 방송 중이어도 확인해 준다.
 * 물어본 사람에게 아무 대답도 안 하는 것이 더 나쁘다.
 */
export async function checkForUpdate(manual = false): Promise<UpdateState> {
  if (!app.isPackaged) {
    // 개발 중에는 설치본이 아니라 확인할 것이 없다 (electron-updater 도 여기서 실패한다)
    set({ kind: 'idle' })
    return state
  }
  if (!manual && busyBroadcasting()) return state

  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ kind: 'error', message: String((err as Error)?.message ?? err) })
  }
  return state
}

/** 사용자가 '받기' 를 눌렀을 때만 부른다. */
export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    set({ kind: 'error', message: String((err as Error)?.message ?? err) })
  }
}

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
 * 채팅을 모으고 있는데 그게 날아가면 이 앱의 존재 이유가 사라진다. 그래서 우리가 먼저
 * 앱을 끄는 일은 없다 — 설치는 **사용자가 앱을 끄는 그 순간**에만 일어난다.
 *
 * ## 설치가 끝나면 다시 켠다
 * 다만 설치가 끝난 뒤에는 앱이 **스스로 다시 올라온다.** 안 그러면 사용자는 업데이트를
 * 받으려고 앱을 껐다가, 시작 메뉴에서 다시 찾아 켜야 한다 — 그 한 걸음에서 그냥
 * 안 켜고 마는 사람이 생긴다. 어차피 끄는 김에 설치하는 것이므로 세션이 끊길 일도 없다.
 *
 * 이걸 위해 `autoInstallOnAppQuit` 을 **끄고 직접 설치한다.** electron-updater 의 기본
 * 종료 훅은 `install(true, false)` 라 설치기에 `--force-run` 을 안 붙여서, 조용히 설치만
 * 되고 앱은 꺼진 채로 남는다. 우리는 `install(true, true)` 로 `/S --force-run` 을 준다.
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
  // 기본 종료 훅은 재시작을 안 시킨다 — 끄고 우리가 직접 건다 (아래 app.once('quit'))
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  /*
   * 앱이 정말로 끝나는 순간에 설치한다.
   *
   * `exitCode !== 0` 이면 건너뛴다 — 비정상 종료 중에 설치기를 띄우면, 앱이 왜 죽었는지
   * 모르는 채로 설치까지 겹쳐 상태가 더 헝클어진다. (electron-updater 기본 훅과 같은 판단)
   */
  app.once('quit', (_e, exitCode) => {
    if (exitCode !== 0 || state.kind !== 'ready') return
    /*
     * isSilent → 설치기에 `/S` (설치 창이 안 뜬다)
     * isForceRunAfter → `--force-run` (설치가 끝나면 설치기가 앱을 켠다) ← 이게 핵심
     *
     * 이름은 '끄고 설치'지만 이미 끄는 중이라 그냥 설치다. 뒤에 붙는 `app.quit()` 은
     * 이미 종료 중인 앱에는 아무 일도 하지 않는다.
     */
    autoUpdater.quitAndInstall(true, true)
  })

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

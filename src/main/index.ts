import { join } from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell, Tray } from 'electron'
import { appIcon } from './app-icon'
import { getSettings, patchSettings } from './settings'
import { SERVER_PORT } from './config'
import { startServer, stopServer } from './server'
import {
  getAuthState,
  login,
  logout,
  onAuthStateChange,
  restoreSession,
  retrySession
} from './auth'
import {
  getCollectorStatus,
  onCollectorChange,
  onCollectorEvent,
  registerCollectorIpc,
  startCollecting,
  stopCollecting
} from './collector'
import { currentSessionDir, currentStats } from './session'
import { listAssets, pickAudio, pickImage, storeAssetBytes } from './assets'
import { openEffectWindow, registerEffectWindowIpc, type EffectResult } from './effect-window'
import {
  backupCurrentDeck,
  deleteDeckFile,
  exportPreset,
  importPreset,
  listDecks,
  loadDeckFile,
  presetsDir,
  saveDeckAs
} from './preset-store'
import { creditSnapshot, pushCredit, replaySession, resetCredit } from './credit'
import {
  checkForUpdate,
  downloadUpdate,
  getUpdateState,
  onUpdateState,
  registerUpdater
} from './updater'
import {
  finishOverlay,
  getOverlayState,
  getDeck,
  isPlaying,
  newDeck,
  notifyDataChanged,
  onOverlayChanged,
  overlayClientCount,
  playOverlay,
  restartOverlay,
  setDeck,
  resetDeck,
  setSampleMode,
  stopOverlay,
  togglePlay
} from './overlay'
import type { AuthState, ServerStatus } from '@shared/types'
import type { CreditData } from '@shared/aggregate'
import type { Deck } from '@shared/deck'

/**
 * 전역 단축키.
 *
 * 크레딧을 트는 순간은 방송 마지막 — 게임이 전체화면인 채로 눌러야 한다.
 * 앱 창을 찾아 클릭하게 하면 이 도구의 쓸모가 절반으로 준다.
 */
const HOTKEYS: { accelerator: string; label: string; run: () => void }[] = [
  { accelerator: 'CommandOrControl+Alt+E', label: '재생 / 정지', run: togglePlay },
  { accelerator: 'CommandOrControl+Alt+R', label: '처음부터 다시', run: restartOverlay }
]
let hotkeyState: { accelerator: string; label: string; registered: boolean }[] = []

/**
 * 두 번째 실행은 허용하지 않는다.
 *
 * 트레이에 내려가 있으면 사용자는 앱이 꺼진 줄 알고 아이콘을 다시 누른다. 그때 두 번째
 * 프로세스가 뜨면 포트 7396(고정)을 못 잡고 죽는다 — 대신 **원래 창을 띄워준다.**
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** 트레이 메뉴의 '완전히 종료'로 나가는 중인지. 그냥 닫기와 구분해야 한다. */
let quitting = false
let serverStatus: ServerStatus = {
  port: SERVER_PORT,
  listening: false,
  overlayUrl: `http://localhost:${SERVER_PORT}/overlay`,
  error: null
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#14151a',
    icon: appIcon(64),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // 편집 화면이 넓어야 쓸 만하다 — 처음부터 최대화해서 띄운다
  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    if (!process.argv.includes('--hidden')) mainWindow?.show()
  })

  /**
   * 닫기 = 트레이로 내려가기.
   *
   * 전역 단축키와 OBS 오버레이는 앱이 살아 있어야 동작한다. 방송 중에 편집 창이
   * 화면을 차지할 이유는 없으므로, 닫기는 **끄기가 아니라 치우기**로 다룬다.
   */
  mainWindow.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    mainWindow?.hide()
    hintOnce()
  })

  // 앱 창 안에서 외부 링크가 열리지 않게 한다
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  /**
   * 파일을 엉뚱한 데 떨어뜨려도 창이 날아가지 않게 한다.
   *
   * 캔버스 밖에 그림을 놓으면 크로미움이 그 파일로 **이동해 버린다** — 편집 화면이
   * 사라지고 사진 한 장만 남아, 사용자 눈엔 앱이 죽은 것과 같다. 되돌릴 길도 없다.
   * 끌어다 놓기를 넣은 이상 반드시 막아야 한다.
   */
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (url !== mainWindow?.webContents.getURL()) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow()
  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

/** 창이 사라진 게 고장이 아니라는 걸 처음 한 번은 알려줘야 한다. */
function hintOnce(): void {
  if (getSettings().trayHintShown) return
  patchSettings({ trayHintShown: true })
  tray?.displayBalloon({
    icon: appIcon(64),
    title: 'endcredit 은 계속 켜져 있습니다',
    content:
      '작업 표시줄 오른쪽 아이콘에 있습니다.\n' +
      'Ctrl+Alt+E 로 어디서든 크레딧을 틀 수 있고, OBS 오버레이도 그대로 나갑니다.\n' +
      '완전히 끄려면 아이콘을 오른쪽 클릭 → 완전히 종료.'
  })
}

function buildTrayMenu(): void {
  if (!tray) return
  const playing = isPlaying()
  const keys = hotkeyState
    .filter((h) => h.registered)
    .map((h) => `${h.accelerator.replace('CommandOrControl', 'Ctrl')} · ${h.label}`)

  tray.setToolTip(playing ? 'endcredit · 크레딧 재생 중' : 'endcredit · 대기 중')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '창 열기', click: showWindow },
      { type: 'separator' },
      { label: playing ? '■ 크레딧 정지' : '▶ 크레딧 재생', click: () => togglePlay() },
      { label: '↻ 처음부터', click: () => restartOverlay() },
      { type: 'separator' },
      ...(keys.length > 0
        ? keys.map((k) => ({ label: k, enabled: false }))
        : [{ label: '전역 단축키 사용 불가', enabled: false }]),
      { type: 'separator' },
      {
        label: '윈도우 시작 시 자동 실행',
        type: 'checkbox' as const,
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          // 로그인하자마자 트레이에 들어가 있게 — 창을 띄우면 성가시다
          app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] })
          buildTrayMenu()
        }
      },
      { type: 'separator' },
      {
        label: '완전히 종료',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  tray = new Tray(appIcon(16))
  // 왼쪽 클릭으로 바로 열리는 편이 자연스럽다 (오른쪽 클릭은 메뉴)
  tray.on('click', showWindow)
  buildTrayMenu()
}

function push(state: AuthState): void {
  mainWindow?.webContents.send('auth:changed', state)
}

/**
 * 집계 결과 전송은 묶어서 보낸다.
 * 채팅이 몰리는 순간 이벤트마다 전체 랭킹을 재계산해 IPC 로 밀면 렌더러가 버티지 못한다.
 */
function pushOverlay(): void {
  mainWindow?.webContents.send('overlay:changed', {
    ...getOverlayState(),
    clients: overlayClientCount()
  })
  // 트레이 메뉴의 재생/정지 글자도 같은 상태를 봐야 한다
  buildTrayMenu()
}

let creditTimer: NodeJS.Timeout | null = null
function scheduleCreditPush(): void {
  if (creditTimer) return
  creditTimer = setTimeout(() => {
    creditTimer = null
    mainWindow?.webContents.send('credit:changed', creditSnapshot())
    notifyDataChanged()
  }, 500)
}

app.whenReady().then(async () => {
  /*
   * 기본 메뉴(File · Edit · View · Window)를 없앤다.
   *
   * autoHideMenuBar 는 **감추기만** 할 뿐이라, Alt 가 섞인 단축키를 누르는 순간
   * 메뉴줄이 튀어나와 화면이 밀린다. 이 앱에는 쓸 메뉴가 없으므로 아예 지운다.
   * (윈도우에서 입력칸의 복사·붙여넣기는 메뉴 없이도 Chromium 이 직접 처리한다)
   */
  Menu.setApplicationMenu(null)

  onAuthStateChange(push)
  // 재생 상태를 바꾸는 길이 여럿(IPC·단축키·리모컨)이라, 한 곳에서 창에 알린다
  onOverlayChanged(pushOverlay)

  registerUpdater()
  onUpdateState((s) => mainWindow?.webContents.send('update:state', s))
  ipcMain.handle('update:get', () => getUpdateState())
  ipcMain.handle('update:check', () => checkForUpdate(true))
  ipcMain.handle('update:download', () => downloadUpdate())

  ipcMain.handle('auth:get', (): AuthState => getAuthState())
  ipcMain.handle('auth:login', () => login())
  ipcMain.handle('auth:logout', () => logout())
  ipcMain.handle('auth:retry', () => retrySession())
  ipcMain.handle('server:status', (): ServerStatus => serverStatus)

  registerCollectorIpc()
  onCollectorChange((status, stats) => {
    mainWindow?.webContents.send('collector:status', status, stats)
  })
  onCollectorEvent((event) => {
    pushCredit(event)
    mainWindow?.webContents.send('collector:tap', event)
    scheduleCreditPush()
  })

  ipcMain.handle('collector:get', () => ({
    status: getCollectorStatus(),
    stats: currentStats()
  }))
  ipcMain.handle('collector:start', () => {
    resetCredit()
    startCollecting()
  })
  ipcMain.handle('credit:get', (): CreditData => creditSnapshot())
  ipcMain.handle('credit:replay', (_e, sessionId: string) => replaySession(sessionId))

  ipcMain.handle('overlay:state', () => ({
    ...getOverlayState(),
    clients: overlayClientCount()
  }))
  // only 를 주면 그 장 하나만 내보낸다 (안 주면 전체)
  ipcMain.handle('overlay:play', (_e, only?: number | null) => {
    playOverlay(typeof only === 'number' ? only : null)
    pushOverlay()
  })
  ipcMain.handle('overlay:stop', () => {
    stopOverlay()
    pushOverlay()
  })
  ipcMain.handle('overlay:restart', () => {
    restartOverlay()
    pushOverlay()
  })
  ipcMain.handle('overlay:finished', (_e, gen: number) => {
    if (finishOverlay(gen)) pushOverlay()
  })
  ipcMain.handle('overlay:sample', (_e, on: boolean) => {
    setSampleMode(on)
    pushOverlay()
  })
  // 효과 편집기는 **별도 창**이다 — 키보드를 본 화면과 나눠 쓰지 않기 위해서다
  registerEffectWindowIpc()
  ipcMain.handle(
    'fx:open',
    (_e, effect: unknown, fresh: boolean): Promise<EffectResult> =>
      openEffectWindow(mainWindow, effect, fresh)
  )
  ipcMain.handle('assets:pick-image', () => pickImage())
  ipcMain.handle('assets:pick-audio', () => pickAudio())
  ipcMain.handle('assets:list', () => listAssets())
  // 레이어 병합으로 만든 PNG(data URL)를 에셋으로 저장한다
  ipcMain.handle('assets:save-image', (_e, dataUrl: string) => {
    const b64 = String(dataUrl).replace(/^data:image\/\w+;base64,/, '')
    return storeAssetBytes('merged.png', Buffer.from(b64, 'base64'))
  })
  /**
   * 탐색기에서 끌어다 놓은 파일을 담는다.
   *
   * 경로가 아니라 **내용**을 받는다. Electron 32 부터 렌더러에서 `File.path` 가 사라져
   * 경로를 알 수 없고, 어차피 에셋 폴더로 복사할 것이므로 바이트만 있으면 충분하다.
   * 같은 내용이 이미 있으면 `storeAssetBytes` 가 그걸 재사용한다.
   */
  ipcMain.handle('assets:import-bytes', (_e, name: string, bytes: ArrayBuffer) =>
    storeAssetBytes(String(name || 'dropped'), Buffer.from(bytes))
  )
  ipcMain.handle('app:info', () => ({
    remoteUrl: `http://localhost:${SERVER_PORT}/remote`,
    overlayUrl: `http://localhost:${SERVER_PORT}/overlay`,
    hotkeys: hotkeyState
  }))
  ipcMain.handle('app:open-url', (_e, url: string) => {
    // 앱 창 안에서 열리면 돌아올 길이 없다 — 기본 브라우저로 보낸다
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
    return undefined
  })
  ipcMain.handle('presets:export', () => exportPreset(getDeck()))
  ipcMain.handle('presets:import', async () => {
    const r = await importPreset()
    if (r) {
      setDeck(r.deck)
      pushOverlay()
    }
    return r
  })
  ipcMain.handle('overlay:deck:get', (): Deck => getDeck())
  ipcMain.handle('presets:list', () => listDecks())
  ipcMain.handle('presets:save-as', (_e, name: string) => saveDeckAs(getDeck(), name))
  ipcMain.handle('presets:load', (_e, file: string): Deck => {
    const d = loadDeckFile(file)
    setDeck(d)
    pushOverlay()
    return d
  })
  ipcMain.handle('presets:remove', (_e, file: string) => deleteDeckFile(file))
  ipcMain.handle('presets:open-folder', () => shell.openPath(presetsDir()))
  ipcMain.handle('overlay:deck:reset', (): { deck: Deck; backup: string | null } => {
    const backup = backupCurrentDeck()
    const deck = resetDeck()
    pushOverlay()
    return { deck, backup }
  })
  ipcMain.handle('overlay:deck:new', (): { deck: Deck; backup: string | null } => {
    // 되돌릴 수 없어 보이는 동작이므로 지금 문서를 반드시 남긴다
    const backup = backupCurrentDeck()
    const deck = newDeck()
    pushOverlay()
    return { deck, backup }
  })
  ipcMain.handle('overlay:deck:set', (_e, next: Deck) => {
    setDeck(next)
    pushOverlay()
  })
  ipcMain.handle('collector:stop', () => stopCollecting())
  ipcMain.handle('collector:open-folder', () => {
    const dir = currentSessionDir()
    if (dir) shell.openPath(dir)
  })

  try {
    await startServer()
    serverStatus = { ...serverStatus, listening: true, error: null }
  } catch (err) {
    serverStatus = {
      ...serverStatus,
      listening: false,
      error: err instanceof Error ? err.message : String(err)
    }
    console.error('[server]', serverStatus.error)
  }

  // 자동 실행으로 켜졌으면 창 없이 트레이에서 시작한다
  createWindow()
  if (process.argv.includes('--hidden')) {
    mainWindow?.once('ready-to-show', () => mainWindow?.hide())
  }

  hotkeyState = HOTKEYS.map((h) => {
    // 다른 프로그램이 이미 쓰고 있으면 등록에 실패한다 — 조용히 넘기지 않고 UI 에 알린다
    let registered = false
    try {
      registered = globalShortcut.register(h.accelerator, h.run)
    } catch {
      registered = false
    }
    return { accelerator: h.accelerator, label: h.label, registered }
  })
  const failed = hotkeyState.filter((h) => !h.registered)
  if (failed.length > 0) {
    console.warn('[hotkey] 등록 실패:', failed.map((h) => h.accelerator).join(', '))
  }

  createTray()

  await restoreSession()
  push(getAuthState())

  /*
   * 새 버전 확인은 **켠 직후를 피해서** 한 번만 한다.
   * 시작할 때는 서버·인증·창을 세우느라 바쁘고, 업데이트는 몇 초 늦어도 아무 문제가 없다.
   * (방송 중이면 updater 가 알아서 건너뛴다)
   */
  setTimeout(() => void checkForUpdate(), 8_000)

  app.on('second-instance', showWindow)
  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopServer()
  tray?.destroy()
  tray = null
})

/**
 * 창을 다 닫아도 **끄지 않는다.**
 * 이 앱의 값어치는 방송 중에 살아 있는 데 있다 — 단축키·오버레이·수집기가 전부 그렇다.
 * 종료는 트레이 메뉴에서만 한다.
 */
app.on('window-all-closed', () => {
  /* 트레이에 남는다 */
})

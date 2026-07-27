import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { appIcon } from './app-icon'
import { watchUiScale } from './ui-scale'

/**
 * 효과 편집기 창.
 *
 * 편집 화면 위에 덮는 상자로 두면 키보드를 본 화면과 나눠 쓰게 되어 계속 부딪힌다 —
 * `Ctrl+Z` 는 효과가 아니라 문서를 되돌리고, `Space` 는 캔버스 손도구가 먼저 가로챈다.
 * 창을 따로 띄우면 키가 통째로 그 창 것이 되어 그런 다툼이 사라지고,
 * 크레딧을 보면서 효과를 다듬을 수도 있다.
 */

export type EffectResult =
  | { action: 'save'; effect: unknown }
  | { action: 'delete'; effect: unknown }
  | { action: 'cancel' }

let win: BrowserWindow | null = null
/** 창이 답을 줄 때까지 기다리는 쪽 */
let pending: ((r: EffectResult) => void) | null = null
let payload: { effect: unknown; fresh: boolean } | null = null

function settle(r: EffectResult): void {
  const resolve = pending
  pending = null
  resolve?.(r)
}

export function openEffectWindow(
  parent: BrowserWindow | null,
  effect: unknown,
  fresh: boolean
): Promise<EffectResult> {
  // 이미 열려 있으면 그 창을 새 효과로 갈아끼운다 — 편집기가 여러 개 뜨면
  // 어느 것이 저장될지 알 수 없다
  settle({ action: 'cancel' })
  payload = { effect, fresh }

  return new Promise<EffectResult>((resolve) => {
    pending = resolve

    if (win && !win.isDestroyed()) {
      win.webContents.send('fx:load', payload)
      win.focus()
      return
    }

    win = new BrowserWindow({
      width: 1180,
      height: 720,
      minWidth: 900,
      minHeight: 560,
      show: false,
      // 본 창에 묶되 **막지는 않는다**. 크레딧을 보면서 효과를 다듬을 수 있어야 한다
      parent: parent ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      backgroundColor: '#14151a',
      icon: appIcon(64),
      title: '효과 만들기',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true
      }
    })

    // 본 창과 UI 크기가 따로 놀면 창을 오갈 때마다 글자 크기가 바뀌어 눈이 피로하다
    watchUiScale(win)

    win.on('ready-to-show', () => win?.show())
    // 창을 그냥 닫으면 취소한 것으로 본다 — 기다리는 쪽이 영영 안 풀리면 안 된다
    win.on('closed', () => {
      win = null
      settle({ action: 'cancel' })
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/fx.html`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/fx.html'))
    }
  })
}

export function registerEffectWindowIpc(): void {
  // 창이 다 그려진 뒤 스스로 요청한다 — send 를 먼저 쏘면 아직 듣는 이가 없다
  ipcMain.on('fx:ready', (e) => {
    if (payload) e.sender.send('fx:load', payload)
  })

  ipcMain.on('fx:done', (_e, r: EffectResult) => {
    settle(r)
    if (win && !win.isDestroyed()) {
      // 닫기 전에 답을 먼저 넘겨야 'closed' 가 취소로 덮어쓰지 않는다
      win.close()
    }
  })
}

export function closeEffectWindow(): void {
  if (win && !win.isDestroyed()) win.close()
}

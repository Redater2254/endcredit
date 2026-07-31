import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { SERVER_PORT, loadCredentials } from './config'
import { getAccessToken } from './auth'
import {
  appendEvent,
  currentStats,
  markGapEnd,
  markGapStart,
  startSession,
  stopSession
} from './session'
import type { CollectorStatus, RawEvent, SessionStats } from '@shared/events'

/**
 * 방송 내내 살아있어야 하는 숨김 렌더러를 관리한다.
 *
 * 이 창이 죽으면 그날 집계가 통째로 날아간다. 그래서
 *   · backgroundThrottling: false  (백그라운드 타이머 스로틀링 차단)
 *   · 연결 끊김 시 지수 백오프 재연결
 *   · 재연결 사이 공백을 세션 통계에 명시적으로 기록
 * 세 가지를 모두 건다.
 */

const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 60_000
/** 방송 시작을 기다릴 때의 고정 폴링 간격. 지수 백오프를 쓰면 방송을 켜도 최대 1분을 기다리게 된다. */
const WAIT_BROADCAST_MS = 8_000
/**
 * 방송이 **끝났다고 볼** 때까지 기다리는 시간.
 *
 * 수집기를 켜 둔 채로 두면(자동 수집) 방송이 끝나도 세션이 계속 열려 있어서, 다음 방송
 * 채팅이 같은 세션에 이어 붙는다 — 크레딧에 어제 사람이 섞여 나온다. 그래서 방송이
 * 한참 없으면 세션을 닫는다.
 *
 * 짧게 잡으면 안 된다. SOOP 이 잠깐 흔들리거나 방송이 끊겼다 바로 재개되는 것까지
 * "끝났다" 로 보면 **그날 크레딧이 두 동강 난다.** 20분이면 그건 진짜 다른 방송이다.
 * (닫힌 세션의 원본 기록은 남아 있어 `크레딧 › 지난 방송 불러오기` 로 되살릴 수 있다)
 */
const BROADCAST_END_MS = 20 * 60_000

let win: BrowserWindow | null = null
let status: CollectorStatus = { state: 'idle' }
let listener: ((s: CollectorStatus, stats: SessionStats | null) => void) | null = null
let eventListener: ((e: RawEvent) => void) | null = null
let attempt = 0
let retryTimer: NodeJS.Timeout | null = null
/** 방송 대기를 시작한 시각. 재시도마다 초기화되면 안 되므로 따로 들고 있는다. */
let waitingSince: number | null = null
/** 사용자가 명시적으로 멈춘 것인지 — 자동 재연결 여부를 가른다. */
let stoppedByUser = false
/**
 * 지금 세션이 **열려 있는지**. `stopSession()` 뒤에도 통계는 화면에 남겨두므로
 * (방금 끝난 방송의 숫자를 보여줘야 한다) `currentStats()` 로는 구분할 수 없다.
 */
let sessionOpen = false
/** 이 세션에서 한 번이라도 채팅에 붙었는지 — "방송이 끝났다" 와 "아직 안 켰다" 를 가른다. */
let everLive = false
/**
 * 방송이 끝난 것으로 보고 닫은 세션 id. 새 방송이 시작될 때까지 **계속 들고 있는다** —
 * 한 번만 알리고 지우면 8초 뒤 화면에서 사라져 아무도 못 본다.
 */
let closedSessionId: string | undefined
/** 방송이 끝나 세션을 닫고 새 방송으로 새 세션을 열었을 때. 집계를 비우는 쪽이 듣는다. */
let newSessionListener: (() => void) | null = null

/** 새 방송이 시작돼 세션을 새로 열었다. 이전 방송의 집계는 여기서 비워야 한다. */
export function onNewSession(fn: () => void): void {
  newSessionListener = fn
}

export function onCollectorChange(
  fn: (s: CollectorStatus, stats: SessionStats | null) => void
): void {
  listener = fn
}

export function onCollectorEvent(fn: (e: RawEvent) => void): void {
  eventListener = fn
}

export function getCollectorStatus(): CollectorStatus {
  return status
}

function setStatus(next: CollectorStatus): void {
  status = next
  listener?.(next, currentStats())
}

function destroyWindow(): void {
  if (!win) return
  if (!win.isDestroyed()) {
    win.webContents.send('collector:stop')
    win.destroy()
  }
  win = null
}

function spawnWindow(): void {
  destroyWindow()

  win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/collector.js'),
      contextIsolation: true,
      sandbox: false,
      // 숨김/백그라운드 창의 타이머를 OS 가 늦추지 못하게 한다. 장시간 수집의 핵심 설정.
      backgroundThrottling: false
    }
  })

  // 숨김 창의 콘솔은 아무도 못 본다. CSP 위반·네트워크 거부 같은 결정적 단서가
  // 전부 여기로만 찍히므로 메인 로그로 끌어올린다.
  win.webContents.on(
    'console-message',
    (...args: unknown[]) => {
      // Electron 36+ 는 단일 details 객체, 그 이전은 (event, level, message, line, sourceId)
      const first = args[0] as Record<string, unknown> | undefined
      const detail =
        first && typeof first === 'object' && 'message' in first
          ? { level: String(first.level ?? 'log'), message: String(first.message) }
          : { level: String(args[1] ?? 'log'), message: String(args[2] ?? '') }
      if (detail.message) console.log(`[collector:console:${detail.level}] ${detail.message}`)
    }
  )

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    console.error(`[collector] 페이지 로드 실패 (${code} ${desc}): ${url}`)
    // 로그만 찍으면 여기서 **영구 정지한다** — 서버가 아직 안 떴을 때 실제로 일어난다.
    // -3(ABORTED)은 우리가 창을 닫아 취소된 것이므로 재시도하지 않는다.
    if (!isMainFrame || code === -3) return
    scheduleRetry(`load-failed ${code} ${desc}`)
  })

  win.loadURL(`http://127.0.0.1:${SERVER_PORT}/collector`)
}

/**
 * "진행중인 방송이 없습니다.(143)" — 인증은 통과했고 방송만 안 켜진 정상 상태다.
 * 실패가 아니라 대기이므로 별도 상태로 다루고, 짧은 고정 간격으로 재시도한다.
 * 덕분에 "수집기 먼저 켜두고 방송 시작" 이라는 자연스러운 순서가 그냥 동작한다.
 */
function isWaitingForBroadcast(reason: string): boolean {
  return /invalid-chat-info|진행중인 방송이 없습니다|\(143\)/.test(reason)
}

/**
 * 방송이 한참 없으면 세션을 닫는다.
 *
 * 닫아도 **수집기는 계속 기다린다** — 방송이 다시 켜지면 `collector:ready` 가 새 세션을
 * 연다. 통계(`currentStats`)는 일부러 남겨둔다. 방송이 끝난 직후 "오늘 몇 명이었지" 를
 * 보는 게 이 앱을 쓰는 마지막 순간이기 때문이다.
 *
 * @returns 닫아둔 세션 id (아직 안 닫았으면 undefined)
 */
function closeIfEnded(): string | undefined {
  if (!sessionOpen || !everLive || waitingSince === null) return closedSessionId
  if (Date.now() - waitingSince < BROADCAST_END_MS) return closedSessionId

  closedSessionId = currentStats()?.sessionId
  stopSession()
  sessionOpen = false
  everLive = false
  console.log(`[collector] 방송이 끝난 것으로 보고 세션을 닫습니다 (${closedSessionId ?? '?'})`)
  return closedSessionId
}

function scheduleRetry(reason: string): void {
  if (stoppedByUser) return

  const waiting = isWaitingForBroadcast(reason)

  if (waiting) {
    // 아직 한 번도 붙은 적이 없으므로 "수집 공백" 이 아니다 — gap 으로 기록하지 않는다
    if (waitingSince === null) waitingSince = Date.now()
    setStatus({ state: 'waiting-broadcast', since: waitingSince, closedSessionId: closeIfEnded() })
  } else {
    attempt += 1
    markGapStart()
    setStatus({
      state: 'reconnecting',
      attempt,
      nextRetryMs: Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)
    })
    console.warn(`[collector] 재연결 예약 (${attempt}회차): ${reason}`)
  }

  const delay = waiting
    ? WAIT_BROADCAST_MS
    : Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)

  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => {
    if (stoppedByUser) return
    if (!waiting) setStatus({ state: 'connecting' })
    spawnWindow()
  }, delay)
}

export function startCollecting(): SessionStats {
  stoppedByUser = false
  attempt = 0
  waitingSince = null
  everLive = false
  closedSessionId = undefined

  const stats = startSession()
  sessionOpen = true
  setStatus({ state: 'connecting' })
  spawnWindow()
  return stats
}

export function stopCollecting(): void {
  stoppedByUser = true
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null

  const id = currentStats()?.sessionId ?? null
  destroyWindow()
  stopSession()
  sessionOpen = false
  everLive = false
  closedSessionId = undefined
  setStatus({ state: 'stopped', sessionId: id })
}

export function registerCollectorIpc(): void {
  ipcMain.handle('collector:request-start', async () => {
    const creds = loadCredentials()
    if (!creds) throw new Error('자격증명이 없습니다.')
    return {
      accessToken: await getAccessToken(),
      clientId: creds.clientId,
      clientSecret: creds.clientSecret
    }
  })

  ipcMain.on('collector:ready', () => {
    attempt = 0
    waitingSince = null
    /*
     * 방송이 끝난 것으로 보고 세션을 닫아둔 상태라면 **여기가 새 방송의 시작**이다.
     * 새 세션을 열고, 이전 방송의 집계를 비우게 알린다.
     */
    if (!sessionOpen) {
      startSession()
      sessionOpen = true
      closedSessionId = undefined
      newSessionListener?.()
      console.log('[collector] 새 방송이 시작돼 세션을 새로 엽니다')
    }
    everLive = true
    markGapEnd()
    const stats = currentStats()
    if (stats) setStatus({ state: 'live', sessionId: stats.sessionId, since: Date.now() })
  })

  ipcMain.on('collector:event', (_e, action: string, payload: unknown) => {
    const event: RawEvent = { t: Date.now(), action, payload }
    const stats = appendEvent(event)
    eventListener?.(event)
    if (stats) listener?.(status, stats)
  })

  ipcMain.on('collector:closed', (_e, info: unknown) => {
    scheduleRetry(`채팅 연결 종료: ${JSON.stringify(info)}`)
  })

  ipcMain.on('collector:failed', (_e, code: string, message: string) => {
    // 인증/권한 실패는 재시도해도 똑같이 실패한다 — 무한 루프를 막고 사용자에게 알린다
    const fatal = /token|auth|permission|forbidden|SDK-LOAD/i.test(`${code} ${message}`)
    if (fatal) {
      stoppedByUser = true
      destroyWindow()
      setStatus({ state: 'error', message: `[${code}] ${message}` })
    } else {
      scheduleRetry(`[${code}] ${message}`)
    }
  })

  ipcMain.on('collector:log', (_e, level: string, message: string, detail: unknown) => {
    console.log(`[collector:${level}] ${message}`, detail ?? '')
  })
}

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { RawEvent, SessionStats } from '@shared/events'

/**
 * 방송 1회 = 세션 1개.
 *
 * 원본 이벤트를 append-only NDJSON 으로 먼저 떨구고, 집계는 그 위에서 한다.
 * 앱이 죽어도 로그가 남아 재집계가 되고, 집계 로직을 고쳐도 과거 방송분에 다시 적용할 수 있다.
 */

let stream: WriteStream | null = null
let stats: SessionStats | null = null
let gapStart: number | null = null

function sessionDir(id: string): string {
  return join(app.getPath('userData'), 'sessions', id)
}

/** 파일명에 쓸 수 있는 정렬 가능한 ID: 20260721-193045 */
function makeSessionId(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  )
}

export function startSession(): SessionStats {
  stopSession()

  const startedAt = Date.now()
  const sessionId = makeSessionId(new Date(startedAt))
  const dir = sessionDir(sessionId)
  mkdirSync(dir, { recursive: true })

  stream = createWriteStream(join(dir, 'events.ndjson'), { flags: 'a' })
  stats = { sessionId, startedAt, counts: {}, total: 0, gaps: [] }
  gapStart = null

  return stats
}

export function appendEvent(event: RawEvent): SessionStats | null {
  if (!stream || !stats) return null

  stream.write(JSON.stringify(event) + '\n')
  stats.counts[event.action] = (stats.counts[event.action] ?? 0) + 1
  stats.total += 1
  return stats
}

/** 연결이 끊긴 순간을 기록한다. 이 구간의 이벤트는 영구히 유실된 것이므로 감춰선 안 된다. */
export function markGapStart(): void {
  if (stats && gapStart === null) gapStart = Date.now()
}

export function markGapEnd(): void {
  if (stats && gapStart !== null) {
    stats.gaps.push({ from: gapStart, to: Date.now() })
    gapStart = null
  }
}

export function stopSession(): void {
  markGapEnd()
  stream?.end()
  stream = null
}

export function currentStats(): SessionStats | null {
  return stats
}

export function currentSessionDir(): string | null {
  return stats ? sessionDir(stats.sessionId) : null
}

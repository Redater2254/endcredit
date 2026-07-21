import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_AGGREGATE_OPTIONS,
  createAggregator,
  type AggregateOptions,
  type Aggregator,
  type CreditData
} from '@shared/aggregate'
import type { RawEvent } from '@shared/events'

/**
 * 라이브 집계기.
 * 수집기가 뱉는 이벤트를 그대로 흘려넣고, UI 는 스냅샷만 가져간다.
 * 저장된 세션을 재생해 같은 결과를 만들 수도 있다 (replaySession).
 */

let options: AggregateOptions = { ...DEFAULT_AGGREGATE_OPTIONS }
let agg: Aggregator = createAggregator(options)

export function resetCredit(): void {
  agg = createAggregator(options)
}

export function pushCredit(event: RawEvent): void {
  agg.push(event)
}

export function creditSnapshot(): CreditData {
  return agg.snapshot()
}

export function getAggregateOptions(): AggregateOptions {
  return options
}

/** 옵션을 바꾸면 지금까지의 집계를 다시 계산해야 하므로, 현재 세션 로그를 재생한다. */
export async function setAggregateOptions(
  next: AggregateOptions,
  sessionId: string | null
): Promise<CreditData> {
  options = next
  agg = createAggregator(options)
  if (sessionId) await replayInto(agg, sessionId)
  return agg.snapshot()
}

function sessionFile(sessionId: string): string {
  return join(app.getPath('userData'), 'sessions', sessionId, 'events.ndjson')
}

async function replayInto(target: Aggregator, sessionId: string): Promise<void> {
  const rl = createInterface({
    input: createReadStream(sessionFile(sessionId)),
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (!line) continue
    try {
      target.push(JSON.parse(line) as RawEvent)
    } catch {
      // 마지막 줄이 잘렸을 수 있다 (앱이 강제 종료된 경우). 한 줄 버리고 계속한다.
    }
  }
}

/** 저장된 세션을 그대로 재생해 집계 결과를 만든다. 라이브 상태는 건드리지 않는다. */
export async function replaySession(sessionId: string): Promise<CreditData> {
  const replay = createAggregator(options)
  await replayInto(replay, sessionId)
  return replay.snapshot()
}

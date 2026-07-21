import { useEffect, useState } from 'react'
import type { CollectorStatus } from '@shared/events'
import type { CreditData } from '@shared/aggregate'

/**
 * 편집 화면에서도 보이는 수집 상태.
 *
 * 방송 중에 에디터 탭에 있으면 데이터가 쌓이고 있는지 알 길이 없었다.
 * 크레딧을 다 만들어놓고 "수집을 안 켰네"를 방송 끝에 알게 되는 게 최악이라 여기 둔다.
 */

const LABEL: Record<CollectorStatus['state'], string> = {
  idle: '수집 꺼짐',
  connecting: '연결 중',
  live: '수집 중',
  'waiting-broadcast': '방송 대기',
  reconnecting: '재연결 중',
  stopped: '수집 멈춤',
  error: '수집 오류'
}

/** 상태 점 색을 정하는 등급. 켜짐/기다림/문제 셋이면 충분하다. */
function toneOf(state: CollectorStatus['state']): string {
  if (state === 'live') return 'on'
  if (state === 'connecting' || state === 'waiting-broadcast' || state === 'reconnecting') {
    return 'wait'
  }
  if (state === 'error') return 'bad'
  return ''
}

export function CollectorChip({ totals }: { totals: CreditData['totals'] }): React.JSX.Element {
  const [status, setStatus] = useState<CollectorStatus>({ state: 'idle' })

  useEffect(() => {
    window.endcredit.collector.get().then((s) => setStatus(s.status))
    return window.endcredit.collector.onStatus((s) => setStatus(s))
  }, [])

  const tone = toneOf(status.state)
  // 집계 수치는 오버레이 상태를 타고 계속 들어오므로 별도 구독 없이 그대로 쓴다
  const detail =
    totals.messages > 0
      ? `채팅 ${totals.messages.toLocaleString()} · ${totals.uniqueChatters.toLocaleString()}명`
      : status.state === 'live'
        ? '아직 채팅 없음'
        : null

  return (
    <span
      className={`col-chip ${tone}`}
      title={
        status.state === 'error'
          ? status.message
          : '방송 탭에서 수집을 켜면 실제 순위가 채워집니다'
      }
    >
      <i className="col-dot" />
      {LABEL[status.state]}
      {detail && <em>{detail}</em>}
    </span>
  )
}

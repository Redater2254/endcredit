import { useEffect, useState } from 'react'
import { RELEASES_URL } from '@shared/constants'
import type { UpdateState } from '@shared/types'

/**
 * 새 버전 알림.
 *
 * 앱을 켤 때 한 번 확인하고, 새 버전이 있으면 여기에 뜬다. **받는 것은 눌러야 시작하고**,
 * 설치는 앱을 끌 때 조용히 이뤄진다 — 방송 중에 말없이 받아가거나 재시작하면 안 되기 때문.
 *
 * 아무 일도 없을 때(최신·확인 안 함)는 **아무것도 그리지 않는다.** 늘 자리를 차지하면
 * 도구 막대만 좁아진다.
 */
export function UpdateChip(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })
  /** '최신입니다' 는 직접 눌러 확인했을 때만 잠깐 보여준다 */
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    void window.endcredit.update.get().then(setState)
    return window.endcredit.update.onChange(setState)
  }, [])

  async function check(): Promise<void> {
    setAsked(true)
    await window.endcredit.update.check()
  }

  /**
   * 지금 설치. 방송 중이면 **한 번 물어본다** — 모르고 누르면 하루치 수집이 끊긴다.
   */
  async function install(): Promise<void> {
    const r = await window.endcredit.update.install()
    if (!r.busy) return
    const ok = window.confirm(
      '지금 수집 중이거나 크레딧을 송출하는 중입니다.\n' +
        '설치하면 앱이 껐다 켜지면서 모으던 채팅 기록이 그 자리에서 끊깁니다.\n\n' +
        '그래도 지금 설치할까요?'
    )
    if (ok) await window.endcredit.update.install(true)
  }

  if (state.kind === 'available') {
    return (
      <span className="upd" title={state.notes ?? undefined}>
        <b>{state.version}</b> 새 버전
        <button className="primary" onClick={() => void window.endcredit.update.download()}>
          받기
        </button>
      </span>
    )
  }

  if (state.kind === 'downloading') {
    return (
      <span className="upd busy">
        받는 중 {state.percent}%
        <i className="upd-bar">
          <i style={{ width: `${state.percent}%` }} />
        </i>
      </span>
    )
  }

  if (state.kind === 'ready') {
    return (
      <span
        className="upd done"
        title={
          '누르면 앱이 껐다 켜지면서 설치됩니다.\n' +
          '방송 중이라면 나중에 눌러도 됩니다 — 트레이의 ‘완전히 종료’ 로 끌 때도 설치됩니다.\n' +
          '(창의 X 는 트레이로 내려가는 것이라 설치되지 않습니다)'
        }
      >
        <b>{state.version}</b> 준비됨
        <button className="primary" onClick={() => void install()}>
          지금 설치
        </button>
      </span>
    )
  }

  if (state.kind === 'error' && asked) {
    // 자동 확인이 실패한 것까지 띄우면 시끄럽다 — 직접 눌러본 사람에게만 알린다
    return (
      <span className="upd bad" title={state.message}>
        확인 실패
        <button onClick={() => window.endcredit.app.openUrl(RELEASES_URL)}>직접 받기</button>
      </span>
    )
  }

  if (state.kind === 'checking') return <span className="upd busy">확인 중…</span>

  if (state.kind === 'current' && asked) return <span className="upd">최신 버전입니다</span>

  // 평소에는 자리를 차지하지 않는다. 확인은 도움말 옆 점 하나로만 열어둔다
  return (
    <button className="upd-check" title="새 버전 확인" onClick={() => void check()}>
      ⟳
    </button>
  )
}

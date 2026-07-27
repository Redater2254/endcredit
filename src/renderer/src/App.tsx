import { useCallback, useEffect, useRef, useState } from 'react'
import type { AuthState, ServerStatus } from '@shared/types'
import type { CollectorStatus, RawEvent, SessionStats } from '@shared/events'
import type { CreditData, RankedUser } from '@shared/aggregate'
import { DeckRenderer } from '@shared/DeckRenderer'
import type { OverlayInfo } from '@shared/overlay'
import { Editor } from './Editor'
import markUrl from './assets/mark.png'
import { VERSION_LABEL } from '@shared/constants'
import { UpdateChip } from './UpdateChip'

type Tab = 'broadcast' | 'editor'
type Theme = 'dark' | 'light'

/**
 * 밝은 · 어두운 테마 전환.
 *
 * 값은 `<html data-theme>` 에만 얹는다 — styles.css 가 그 한 글자를 보고 색을 통째로
 * 갈아끼우므로, 화면을 그리는 컴포넌트들은 테마를 전혀 몰라도 된다.
 * 저장은 localStorage 다: 창 크기·칸 너비 같은 다른 화면 설정과 같은 자리에 둔다.
 * (프리셋에 담기면 남에게 프리셋을 줄 때 그 사람 테마까지 바꿔버린다.)
 */
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('ui:theme') as Theme) || 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('ui:theme', theme)
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  // Ctrl+Shift+L — 에디터의 다른 단축키와 겹치지 않는 조합이다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  return [theme, toggle]
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }): React.JSX.Element {
  const dark = theme === 'dark'
  return (
    <button
      className="theme-btn"
      onClick={onToggle}
      title={dark ? '밝은 테마로 (Ctrl+Shift+L)' : '어두운 테마로 (Ctrl+Shift+L)'}
    >
      {dark ? (
        // 지금 어두우니 "해"를 보여준다 — 누르면 밝아진다는 뜻
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
          <circle cx="10" cy="10" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2" />
            <path d="M4.1 4.1l1.6 1.6M14.3 14.3l1.6 1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6" />
          </g>
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
          <path
            d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

/** 고를 수 있는 UI 크기. `main/ui-scale.ts` 의 `UI_SCALE_STEPS` 와 같아야 한다. */
const SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5]

/**
 * UI 크기 고르기.
 *
 * 화면 배율을 낮추면(4K 를 100% 로) 이 앱의 껍데기는 고정 px 이라 물리적으로
 * 깨알같이 작아지고, 좁은 노트북에서는 반대로 껍데기가 자리를 다 먹는다.
 * 포토샵의 `인터페이스 → UI 크기 조정` 과 같은 자리다.
 */
function ScaleButton(): React.JSX.Element {
  const [state, setState] = useState<{ setting: 'auto' | number; applied: number } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.endcredit.ui.getScale().then(setState)
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const pick = (v: 'auto' | number): void => {
    window.endcredit.ui.setScale(v).then(setState)
    setOpen(false)
  }

  const label = state ? `${Math.round(state.applied * 100)}%` : '…'

  return (
    <div className="scale-btn-wrap" onPointerDown={(e) => e.stopPropagation()}>
      <button className="theme-btn scale-btn" onClick={() => setOpen((o) => !o)} title="UI 크기">
        {label}
      </button>
      {open && state && (
        <ul className="scale-menu">
          <li className={state.setting === 'auto' ? 'on' : ''} onClick={() => pick('auto')}>
            자동 <em>화면에 맞춤</em>
          </li>
          {SCALE_STEPS.map((v) => (
            <li key={v} className={state.setting === v ? 'on' : ''} onClick={() => pick(v)}>
              {Math.round(v * 100)}%
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('broadcast')
  const [theme, toggleTheme] = useTheme()
  const [auth, setAuth] = useState<AuthState>({ status: 'logged-out' })
  const [server, setServer] = useState<ServerStatus | null>(null)
  const [overlay, setOverlay] = useState<OverlayInfo | null>(null)

  useEffect(() => {
    window.endcredit.auth.get().then(setAuth)
    window.endcredit.server.status().then(setServer)
    return window.endcredit.auth.onChange(setAuth)
  }, [])

  // 오버레이 상태는 두 탭이 함께 쓰므로 여기서 한 번만 구독한다
  useEffect(() => {
    window.endcredit.overlay.state().then(setOverlay)
    const off = window.endcredit.overlay.onChange(setOverlay)
    const offCredit = window.endcredit.credit.onChange((data) =>
      setOverlay((prev) => (prev && !prev.sample ? { ...prev, data } : prev))
    )
    /*
     * OBS 접속 개수는 알림이 없으므로 가볍게 폴링한다.
     *
     * **여기서 덱을 갈아끼우면 안 된다.** IPC 로 온 값은 매번 새 객체라, 재생 중이면
     * 그때마다 장 넘김 타이머가 처음부터 다시 시작한다 — 이 문서는 모든 장이 3초를
     * 넘으므로 **첫 장에서 영영 못 나갔다.** 필요한 건 숫자 하나뿐이다.
     * 재생 상태가 어긋난 경우(알림을 놓쳤을 때)에만 통째로 받아들인다.
     */
    const timer = setInterval(
      () =>
        window.endcredit.overlay.state().then((s) =>
          setOverlay((prev) => {
            if (!prev) return s
            if (
              prev.playing !== s.playing ||
              prev.generation !== s.generation ||
              prev.sample !== s.sample
            ) {
              return s
            }
            return prev.clients === s.clients ? prev : { ...prev, clients: s.clients }
          })
        ),
      3000
    )
    return () => {
      off()
      offCredit()
      clearInterval(timer)
    }
  }, [])

  return (
    /**
     * 껍데기는 **탭과 무관하게 똑같다.**
     * 예전에는 방송 탭만 가운데 860px 로 좁혀서, 탭을 옮길 때마다 머리말이 통째로
     * 움직였다 — 방금 누른 버튼이 다른 자리로 도망가는 셈이라 손이 계속 헛돈다.
     */
    <div className="app">
      <header className="brand">
        <img className="brand-mark" src={markUrl} alt="" />
        <h1>endcredit</h1>
        <span className="ver">{VERSION_LABEL}</span>
        {/* 버전 바로 옆이 제자리다. 머리말은 두 탭이 함께 쓰므로 방송 탭에서도 보인다 */}
        <UpdateChip />
        <div className="spacer" />
        <nav className="tabs">
          <button
            className={tab === 'broadcast' ? 'active' : ''}
            onClick={() => setTab('broadcast')}
          >
            방송
          </button>
          <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>
            크레딧 에디터
          </button>
        </nav>
        <ScaleButton />
        <ThemeButton theme={theme} onToggle={toggleTheme} />
      </header>

      {tab === 'editor' ? (
        <Editor info={overlay} />
      ) : (
        <div className="bc">
          {/* 서버가 죽으면 아래가 전부 무의미하므로 폭을 다 써서 맨 위에 */}
          <ServerCard server={server} />
          <AuthCard auth={auth} />
          <CollectorCard loggedIn={auth.status === 'logged-in'} />
          <OverlayCard info={overlay} />
          <CreditCard />
        </div>
      )}
    </div>
  )
}

/** 화면에 유지할 최근 이벤트 개수. 방송 내내 쌓으면 렌더러가 메모리를 먹는다. */
const TAIL_LIMIT = 150

function CollectorCard({ loggedIn }: { loggedIn: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<CollectorStatus>({ state: 'idle' })
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [tail, setTail] = useState<RawEvent[]>([])
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    window.endcredit.collector.get().then((s) => {
      setStatus(s.status)
      setStats(s.stats)
    })
    const offStatus = window.endcredit.collector.onStatus((s, st) => {
      setStatus(s)
      setStats(st)
    })
    const offEvent = window.endcredit.collector.onEvent((e) => {
      if (pausedRef.current) return
      setTail((prev) => [e, ...prev].slice(0, TAIL_LIMIT))
    })
    return () => {
      offStatus()
      offEvent()
    }
  }, [])

  const start = useCallback(() => {
    setTail([])
    window.endcredit.collector.start()
  }, [])

  const running =
    status.state === 'connecting' ||
    status.state === 'live' ||
    status.state === 'reconnecting' ||
    status.state === 'waiting-broadcast'

  return (
    <div className="card bc-coll">
      <h2>방송 수집기</h2>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <StatusDot status={status} />
        <span>{statusLabel(status)}</span>
        <div className="spacer" />
        {running ? (
          <button onClick={() => window.endcredit.collector.stop()}>수집 중지</button>
        ) : (
          <button className="primary" disabled={!loggedIn} onClick={start}>
            수집 시작
          </button>
        )}
      </div>

      {!loggedIn && <p className="mono">먼저 SOOP 계정으로 로그인하세요.</p>}

      {status.state === 'error' && <div className="err-box">{status.message}</div>}

      {stats && (
        <>
          <div className="row">
            <span className="mono">
              세션 {stats.sessionId} · 이벤트 {stats.total.toLocaleString()}건
              {stats.gaps.length > 0 && ` · ⚠ 수집 공백 ${stats.gaps.length}회`}
            </span>
            <div className="spacer" />
            <button onClick={() => window.endcredit.collector.openFolder()}>로그 폴더</button>
          </div>

          {Object.keys(stats.counts).length > 0 && (
            <div className="chips">
              {Object.entries(stats.counts)
                .sort((a, b) => b[1] - a[1])
                .map(([action, n]) => (
                  <span key={action} className="chip">
                    {action}
                    <b>{n.toLocaleString()}</b>
                  </span>
                ))}
            </div>
          )}
        </>
      )}

      {(running || tail.length > 0) && (
        <>
          <div className="row" style={{ marginTop: '1.1rem' }}>
            <span className="mono">실시간 이벤트 (최근 {TAIL_LIMIT}건)</span>
            <div className="spacer" />
            <button onClick={() => setPaused((p) => !p)}>{paused ? '재개' : '일시정지'}</button>
          </div>
          <div className="tail">
            {tail.length === 0 ? (
              <div className="tail-empty">아직 수신된 이벤트가 없습니다…</div>
            ) : (
              tail.map((e, i) => <EventRow key={`${e.t}-${i}`} event={e} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

const OVERLAY_URL = 'http://localhost:7396/overlay'

function OverlayCard({ info }: { info: OverlayInfo | null }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    navigator.clipboard.writeText(OVERLAY_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!info) return <></>

  return (
    <div className="card bc-obs">
      <h2>OBS 송출</h2>

      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <span className={`dot ${info.clients > 0 ? 'ok' : 'idle'}`} />
        <span className="mono">{OVERLAY_URL}</span>
        <button onClick={copy}>{copied ? '복사됨' : 'URL 복사'}</button>
        <div className="spacer" />
        <span className="mono">
          {info.clients > 0 ? `브라우저 소스 ${info.clients}개 연결됨` : '연결된 소스 없음'}
        </span>
      </div>

      {info.clients === 0 && (
        <p className="mono bc-guide" style={{ lineHeight: 1.7, marginTop: 0 }}>
          OBS → 소스 <b>+</b> → <b>브라우저</b> → URL 에 위 주소, 너비 1920 / 높이 1080.
          <br />
          &quot;소스가 보이지 않을 때 종료&quot; 는 <b>체크 해제</b>하세요 (방송 내내 연결을 유지해야 합니다).
        </p>
      )}

      <div className="row" style={{ marginTop: '0.9rem' }}>
        {info.playing ? (
          <button onClick={() => window.endcredit.overlay.stop()}>정지</button>
        ) : (
          <button className="primary" onClick={() => window.endcredit.overlay.play()}>
            ▶ 크레딧 재생
          </button>
        )}
        <button onClick={() => window.endcredit.overlay.restart()}>처음부터</button>
        <label className={`toggle ${info.sample ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={info.sample}
            onChange={(e) => window.endcredit.overlay.setSample(e.target.checked)}
          />
          샘플 데이터
        </label>
        <div className="spacer" />
        <span className="mono">{info.playing ? '재생 중' : '정지됨'}</span>
      </div>

      {info.sample && (
        <p className="warn-box">
          지금 미리보기와 OBS 화면에 나오는 이름은 <b>전부 가짜 샘플</b>입니다. 디자인 확인용이며,
          실제 방송에 내보내기 전에 반드시 꺼주세요.
        </p>
      )}

      {/* 오버레이와 완전히 같은 컴포넌트를 축소해 보여준다.
          미리보기와 실제 송출이 다르면 커스텀 툴의 의미가 없다. */}
      <Preview info={info} />
    </div>
  )
}

/**
 * 캔버스 해상도(기본 1920×1080)를 카드 폭에 맞게 축소해 보여준다.
 * 오버레이와 **완전히 같은 컴포넌트**를 그대로 쓴다 — 미리보기와 송출이 다르면
 * 이 프로그램의 존재 이유가 사라진다.
 */
function Preview({ info }: { info: OverlayInfo }): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)

  const { width, height } = info.deck.canvas

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / width)
    })
    ro.observe(box)
    return () => ro.disconnect()
  }, [width])

  return (
    <div className="preview" ref={boxRef} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="preview-inner" style={{ width, height, transform: `scale(${scale})` }}>
        {/* 에디터에서는 재생 안 해도 디자인이 보여야 하므로 park.
            OBS 는 기본값(hide)이라 정지 중엔 아무것도 그리지 않는다. */}
        <DeckRenderer
          deck={info.deck}
          data={info.data}
          playing={info.playing}
          generation={info.generation}
        />
      </div>
      <span className="preview-tag">
        미리보기 · OBS 와 동일한 렌더러{!info.playing && ' · 정지 중 (OBS 에는 표시되지 않음)'}
      </span>
    </div>
  )
}

function CreditCard(): React.JSX.Element {
  const [data, setData] = useState<CreditData | null>(null)

  useEffect(() => {
    window.endcredit.credit.get().then(setData)
    return window.endcredit.credit.onChange(setData)
  }, [])

  if (!data) return <></>

  const empty =
    data.totals.messages === 0 && data.totals.balloons === 0 && data.newSubscribers.length === 0

  return (
    <div className="card bc-credit">
      <h2>엔딩크레딧 데이터 (실시간 집계)</h2>

      {empty ? (
        <p className="mono">
          아직 집계할 내용이 없습니다. 스트리머 본인 채팅은 순위에서 제외됩니다.
        </p>
      ) : (
        <>
          <div className="chips" style={{ marginTop: 0, marginBottom: '1rem' }}>
            <span className="chip">
              채팅<b>{data.totals.messages.toLocaleString()}</b>
            </span>
            <span className="chip">
              참여자<b>{data.totals.uniqueChatters.toLocaleString()}</b>
            </span>
            <span className="chip">
              별풍선<b>{data.totals.balloons.toLocaleString()}</b>
            </span>
            <span className="chip">
              스티커<b>{data.totals.stickers.toLocaleString()}</b>
            </span>
          </div>

          <div className="grid2">
            <RankList title="채팅 TOP" unit="회" rows={data.chatRank} />
            <RankList title="별풍선 TOP" unit="개" rows={data.balloonRank} />
            <NameList
              title="오늘의 신규 구독자"
              names={data.newSubscribers.map(
                (s) => s.nickname + (s.giftedBy ? ` (${s.giftedBy} 선물)` : '')
              )}
            />
            <NameList
              title="구독 갱신"
              names={data.renewedSubscribers.map((s) => `${s.nickname} · ${s.months}개월`)}
            />
            <NameList title="오늘의 신규 팬클럽" names={data.newFans.map((u) => u.nickname)} />
            <NameList title="오늘의 열혈 승급" names={data.newTopFans.map((u) => u.nickname)} />
            <NameList title="오늘의 신규 애청자" names={data.newFollowers.map((u) => u.nickname)} />
            <NameList
              title="플러스 구독 선물"
              names={data.quickviewGifts.map((q) => `${q.nickname}${q.type ? ` · ${q.type}` : ''}`)}
            />
          </div>
        </>
      )}
    </div>
  )
}

function RankList({
  title,
  unit,
  rows
}: {
  title: string
  unit: string
  rows: RankedUser[]
}): React.JSX.Element {
  return (
    <div className="sub">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="sub-empty">없음</p>
      ) : (
        <ol className="rank">
          {rows.slice(0, 10).map((r) => (
            <li key={r.userId}>
              <span className="rank-name">{r.nickname}</span>
              <span className="rank-val">
                {r.value.toLocaleString()}
                {unit}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function NameList({ title, names }: { title: string; names: string[] }): React.JSX.Element {
  return (
    <div className="sub">
      <h3>{title}</h3>
      {names.length === 0 ? (
        <p className="sub-empty">없음</p>
      ) : (
        <ul className="names">
          {names.slice(0, 12).map((n, i) => (
            <li key={`${n}-${i}`}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EventRow({ event }: { event: RawEvent }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const time = new Date(event.t).toLocaleTimeString('ko-KR', { hour12: false })

  return (
    <div className={`ev ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
      <span className="ev-t">{time}</span>
      <span className="ev-a">{event.action}</span>
      <span className="ev-s">{open ? '' : summarize(event.payload)}</span>
      {open && <pre className="ev-json">{JSON.stringify(event.payload, null, 2)}</pre>}
    </div>
  )
}

/** 페이로드 스키마가 action 마다 달라서, 흔한 키 몇 개만 뽑아 한 줄로 보여준다. */
function summarize(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? '')
  const p = payload as Record<string, unknown>
  const parts: string[] = []
  if (typeof p.userNickname === 'string') parts.push(p.userNickname)
  if (typeof p.message === 'string') parts.push(p.message)
  if (typeof p.count === 'number') parts.push(`×${p.count}`)
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(payload).slice(0, 120)
}

function StatusDot({ status }: { status: CollectorStatus }): React.JSX.Element {
  const cls =
    status.state === 'live'
      ? 'ok'
      : status.state === 'connecting' ||
          status.state === 'reconnecting' ||
          status.state === 'waiting-broadcast'
        ? 'warn'
        : status.state === 'error'
          ? 'err'
          : 'idle'
  return <span className={`dot ${cls}`} />
}

function statusLabel(status: CollectorStatus): string {
  switch (status.state) {
    case 'idle':
      return '대기 중'
    case 'connecting':
      return '채팅 서버 접속 중…'
    case 'live':
      return '수집 중 — 방송 내내 이 앱을 켜두세요'
    case 'waiting-broadcast':
      return '인증 완료 · 방송 시작을 기다리는 중 (켜면 자동 연결)'
    case 'reconnecting':
      return `연결 끊김 · ${Math.round(status.nextRetryMs / 1000)}초 후 재시도 (${status.attempt}회차)`
    case 'stopped':
      return `수집 종료${status.sessionId ? ` · 세션 ${status.sessionId}` : ''}`
    case 'error':
      return '수집 실패'
  }
}

/**
 * 서버는 **문제가 있을 때만** 보여준다.
 *
 * 잘 도는 서버 상태는 사용자가 할 일이 없는 정보다. OBS 주소는 에디터의 '🔗 연결'
 * 에서 복사할 수 있으므로 여기 또 둘 이유도 없다. 반대로 시작에 실패하면 아무것도
 * 동작하지 않으므로 그때는 크게 보여야 한다.
 */
function ServerCard({ server }: { server: ServerStatus | null }): React.JSX.Element | null {
  if (!server || server.listening) return null

  return (
    <div className="card bc-wide">
      <h2>로컬 서버</h2>
      <div className="row" style={{ marginBottom: '0.8rem' }}>
        <span className="dot err" />
        <span>서버를 시작하지 못했습니다 — 크레딧 송출과 로그인이 동작하지 않습니다</span>
      </div>
      <div className="err-box">{server.error}</div>
    </div>
  )
}

function AuthCard({ auth }: { auth: AuthState }): React.JSX.Element {
  const busy = auth.status === 'logging-in'

  return (
    <div className="card bc-acct">
      <h2>SOOP 계정</h2>

      {auth.status === 'unconfigured' && (
        <>
          <div className="row" style={{ marginBottom: '0.8rem' }}>
            <span className="dot err" />
            <span>API 자격증명을 읽지 못했습니다</span>
          </div>
          <div className="err-box">{auth.reason}</div>
        </>
      )}

      {(auth.status === 'logged-out' || auth.status === 'logging-in') && (
        <>
          <div className="row" style={{ marginBottom: '1rem' }}>
            <span className={`dot ${busy ? 'warn' : 'idle'}`} />
            <span>{busy ? '브라우저에서 로그인을 진행하세요…' : '로그인되어 있지 않습니다'}</span>
          </div>
          <button className="primary" disabled={busy} onClick={() => window.endcredit.auth.login()}>
            {busy ? '대기 중…' : 'SOOP 계정으로 로그인'}
          </button>
          {busy && (
            <p className="mono" style={{ marginTop: '0.9rem', lineHeight: 1.6 }}>
              기본 브라우저에 SOOP 로그인 창이 열립니다.
              <br />
              로그인·동의를 마치면 이 앱으로 자동으로 돌아옵니다.
            </p>
          )}
        </>
      )}

      {auth.status === 'error' && (
        <>
          <div className="row" style={{ marginBottom: '0.8rem' }}>
            <span className="dot err" />
            <span>로그인 실패</span>
          </div>
          <div className="err-box" style={{ marginBottom: '1rem' }}>
            {auth.message}
          </div>
          <div className="row">
            {auth.recoverable && (
              <button className="primary" onClick={() => window.endcredit.auth.retry()}>
                저장된 로그인으로 재시도
              </button>
            )}
            <button
              className={auth.recoverable ? '' : 'primary'}
              onClick={() => window.endcredit.auth.login()}
            >
              처음부터 다시 로그인
            </button>
          </div>
        </>
      )}

      {auth.status === 'logged-in' && (
        <>
          <div className="profile">
            {auth.station.profileImage ? (
              <img src={normalizeUrl(auth.station.profileImage)} alt="" />
            ) : (
              <img src="" alt="" />
            )}
            <div className="meta">
              <strong>{auth.station.userNickname || '(닉네임 없음)'}</strong>
              <span>
                {auth.station.userId ? `@${auth.station.userId}` : ''}
                {auth.station.stationName ? ` · ${auth.station.stationName}` : ''}
              </span>
              {auth.station.favoriteCount !== null && (
                <span>
                  애청자 {auth.station.favoriteCount.toLocaleString()}명
                  {auth.station.latelyBroadDate && ` · 최근 방송 ${auth.station.latelyBroadDate}`}
                </span>
              )}
            </div>
            <div className="spacer" />
            <button onClick={() => window.endcredit.auth.logout()}>로그아웃</button>
          </div>

          <div className="row" style={{ marginTop: '1.1rem' }}>
            <span className="dot ok" />
            <span className="mono">
              access_token 만료 {new Date(auth.expiresAt).toLocaleString('ko-KR')} · 자동 갱신됨
            </span>
          </div>

        </>
      )}
    </div>
  )
}

/** SOOP 이미지 URL 이 `//` 로 시작하는 경우가 있어 보정한다. */
function normalizeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

import { useEffect, useState } from 'react'
import { useOutsideClose } from './useOutsideClose'

/**
 * OBS 에 붙이는 주소와 전역 단축키를 한자리에 모은 메뉴.
 *
 * 크레딧을 트는 순간은 방송 마지막이라, 그때 앱 창을 찾는 것 자체가 사고 위험이다.
 * 리모컨 주소와 단축키는 **미리 걸어둬야** 의미가 있으므로 편집 화면에서 바로 보이게 둔다.
 */

interface AppInfo {
  remoteUrl: string
  overlayUrl: string
  hotkeys: { accelerator: string; label: string; registered: boolean }[]
}

/** 사람이 읽는 표기로. Electron 은 'CommandOrControl' 을 쓴다. */
function prettyKey(accel: string): string {
  return accel.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')
}

function CopyRow({ label, url, hint }: { label: string; url: string; hint: string }): React.JSX.Element {
  const [done, setDone] = useState(false)

  return (
    <li className="cn-row">
      <div className="cn-head">
        <b>{label}</b>
        <button
          className={done ? 'ok' : ''}
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setDone(true)
            setTimeout(() => setDone(false), 1400)
          }}
        >
          {done ? '복사됨' : '주소 복사'}
        </button>
      </div>
      <code>{url}</code>
      <em>{hint}</em>
    </li>
  )
}

export function ConnectMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const rootRef = useOutsideClose<HTMLSpanElement>(open, () => setOpen(false))

  useEffect(() => {
    if (open && !info) window.endcredit.app.info().then(setInfo)
  }, [open, info])

  return (
    <span className="cn" ref={rootRef}>
      <button onClick={() => setOpen((o) => !o)} title="OBS 연결 주소와 전역 단축키">
        🔗 연결 ▾
      </button>

      {open && (
        <div className="ps-menu cn-menu">
          {!info ? (
            <p className="cn-loading">불러오는 중…</p>
          ) : (
            <ul>
              <CopyRow
                label="오버레이 (화면)"
                url={info.overlayUrl}
                hint="OBS › 소스 추가 › 브라우저 · 1920×1080 · 소리를 쓸 거면 “OBS를 통해 오디오 제어”를 켜세요"
              />
              <CopyRow
                label="리모컨 (재생 버튼)"
                url={info.remoteUrl}
                hint="OBS › 도구 › 사용자 정의 브라우저 독 · OBS 안에 재생 버튼이 생깁니다"
              />

              <li className="cn-keys">
                <b>전역 단축키</b>
                <p>어느 창에 있든 눌립니다 — 게임 전체화면에서도 됩니다.</p>
                {info.hotkeys.map((h) => (
                  <span key={h.accelerator} className={h.registered ? 'key' : 'key bad'}>
                    <kbd>{prettyKey(h.accelerator)}</kbd>
                    {h.label}
                    {!h.registered && <em>다른 프로그램이 쓰는 중</em>}
                  </span>
                ))}
              </li>
            </ul>
          )}
        </div>
      )}
    </span>
  )
}

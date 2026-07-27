import { useEffect, useState } from 'react'
import { useOutsideClose } from './useOutsideClose'
import type { Deck } from '@shared/deck'

/**
 * 문서 메뉴 — 저장 / 불러오기 / 초기화.
 *
 * 편집 내용은 자동으로 계속 저장되지만(current), 그건 "지금 쓰는 것" 하나뿐이다.
 * 여러 벌을 이름 붙여 남겨두고 갈아끼울 수 있어야 프리셋이라 부를 수 있다.
 *
 * 내보내기(.ecpreset)는 **이미지·소리를 함께** 담는다. JSON 만 주면 받은 사람 화면에서
 * 에셋이 전부 깨지므로, 그건 공유라고 부를 수 없다.
 */
export function DeckMenu({
  onSaveAs,
  onNew,
  onReset,
  onAsk,
  onLoaded
}: {
  /** 이름 붙여 저장. 창은 에디터가 띄운다 (window.prompt 는 Electron 에서 안 된다) */
  onSaveAs: () => Promise<boolean>
  /** 빈 문서로 새로 시작. 저장 여부 확인도 에디터가 맡는다 */
  onNew: () => Promise<void>
  /** 기본 구성(수다왕·별풍선 … 8장)으로 되돌리기 */
  onReset: () => Promise<void>
  /** 되돌릴 수 없는 동작을 묻는다. 고른 버튼의 인덱스를 돌려준다 */
  onAsk: (spec: {
    title: string
    message: string
    detail?: string
    buttons: string[]
    dangerIndex?: number
    cancelIndex: number
  }) => Promise<number>
  onLoaded: (d: Deck) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<{ file: string; name: string }[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const rootRef = useOutsideClose<HTMLSpanElement>(open, () => setOpen(false))

  useEffect(() => {
    if (open) window.endcredit.presets.list().then(setList)
  }, [open])

  function flash(msg: string): void {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function exportFile(): Promise<void> {
    try {
      const r = await window.endcredit.presets.exportFile()
      if (!r) return
      setOpen(false)
      flash(
        r.missing.length > 0
          ? `내보냄 (에셋 ${r.assets}개 · 원본이 없는 파일 ${r.missing.length}개는 빠졌습니다)`
          : `내보냄 · 에셋 ${r.assets}개 포함`
      )
    } catch (err) {
      alert(`내보내기 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function importFile(): Promise<void> {
    try {
      const r = await window.endcredit.presets.importFile()
      if (!r) return
      onLoaded(r.deck)
      setList(await window.endcredit.presets.list())
      setOpen(false)
      flash(`'${r.name}' 가져옴 · 에셋 ${r.assets}개`)
    } catch (err) {
      alert(`가져오기 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function saveAs(): Promise<void> {
    if (!(await onSaveAs())) return
    setList(await window.endcredit.presets.list())
    flash('저장됨')
  }

  return (
    <span className="dm" ref={rootRef}>
      <button onClick={() => void saveAs()}>저장</button>
      <button onClick={() => setOpen((o) => !o)}>불러오기 ▾</button>

      {toast && <span className="dm-toast">{toast}</span>}

      {open && (
        <>
          <ul className="ps-menu dm-menu">
            {list.length === 0 && <li className="dm-none">저장된 프리셋이 없습니다</li>}
            {list.map((p) => (
              <li key={p.file}>
                <span
                  className="dm-name"
                  onClick={async () => {
                    try {
                      const d = await window.endcredit.presets.load(p.file)
                      onLoaded(d)
                      setOpen(false)
                      flash(`'${p.name}' 불러옴`)
                    } catch (err) {
                      // 못 읽는 파일이면 이유를 보여준다. 아무 일도 안 일어나는 게 제일 나쁘다
                      alert(
                        `'${p.name}' 을 불러오지 못했습니다: ` +
                          `${err instanceof Error ? err.message : String(err)}`
                      )
                    }
                  }}
                >
                  {p.name}
                </span>
                <button
                  className="dm-del"
                  title="삭제"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const answer = await onAsk({
                      title: '프리셋 삭제',
                      message: `'${p.name}' 을 삭제할까요?`,
                      detail: '삭제한 프리셋은 되돌릴 수 없습니다.',
                      buttons: ['삭제', '취소'],
                      dangerIndex: 0,
                      cancelIndex: 1
                    })
                    if (answer !== 0) return
                    await window.endcredit.presets.remove(p.file)
                    setList(await window.endcredit.presets.list())
                  }}
                >
                  🗑
                </button>
              </li>
            ))}

            <li className="dm-sep" />
            <li>
              <span className="dm-name" onClick={() => void exportFile()}>
                내보내기 (.ecpreset) — 이미지·소리 포함
              </span>
            </li>
            <li>
              <span className="dm-name" onClick={() => void importFile()}>
                가져오기 (.ecpreset)
              </span>
            </li>

            <li className="dm-sep" />
            <li>
              <span
                className="dm-name"
                onClick={async () => {
                  setOpen(false)
                  await onNew()
                }}
              >
                새로 시작 (빈 문서)
              </span>
            </li>
            <li>
              <span
                className="dm-name"
                onClick={async () => {
                  setOpen(false)
                  await onReset()
                }}
              >
                기본 구성으로 되돌리기
              </span>
            </li>
            <li>
              <span className="dm-name" onClick={() => window.endcredit.presets.openFolder()}>
                저장 폴더 열기
              </span>
            </li>
          </ul>
        </>
      )}
    </span>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 앱 안에서 쓰는 물어보기 창.
 *
 * ## 왜 직접 만드나
 * `window.prompt()` 는 **Electron 이 지원하지 않는다** — 부르면 그냥 오류가 난다.
 * `confirm()` 은 되지만 버튼이 "확인/취소" 로 고정이라 "저장하고 나가기" 같은 선택지를
 * 만들 수 없고, 밝은 시스템 창이 어두운 화면 위에 튀어나온다.
 *
 * 약속(Promise)으로 답을 돌려주므로 부르는 쪽은 그냥 `await` 하면 된다.
 */

interface ConfirmSpec {
  kind: 'confirm'
  title: string
  message: string
  detail?: string
  /** 왼쪽부터 순서대로. 답은 이 배열의 인덱스 */
  buttons: string[]
  /** 되돌릴 수 없는 버튼 (빨갛게) */
  dangerIndex?: number
  /** Esc 로 닫았을 때의 답 */
  cancelIndex: number
}

interface PromptSpec {
  kind: 'prompt'
  title: string
  label: string
  value: string
  placeholder?: string
  okLabel?: string
}

type Spec = ConfirmSpec | PromptSpec

export interface Dialogs {
  /** 고른 버튼의 인덱스를 돌려준다 */
  confirm: (spec: Omit<ConfirmSpec, 'kind'>) => Promise<number>
  /** 입력한 글. 취소하면 null */
  prompt: (spec: Omit<PromptSpec, 'kind'>) => Promise<string | null>
  /** 화면 어딘가에 그대로 그려 넣으면 된다 */
  node: React.ReactNode
}

export function useDialog(): Dialogs {
  const [spec, setSpec] = useState<Spec | null>(null)
  // 답을 기다리는 쪽. 창이 닫힐 때 정확히 한 번만 부른다.
  const resolver = useRef<((v: never) => void) | null>(null)

  const open = useCallback(<T,>(next: Spec): Promise<T> => {
    return new Promise<T>((resolve) => {
      resolver.current = resolve as (v: never) => void
      setSpec(next)
    })
  }, [])

  const close = useCallback((value: unknown) => {
    const done = resolver.current
    resolver.current = null
    setSpec(null)
    done?.(value as never)
  }, [])

  const confirm = useCallback(
    (s: Omit<ConfirmSpec, 'kind'>) => open<number>({ ...s, kind: 'confirm' }),
    [open]
  )
  const prompt = useCallback(
    (s: Omit<PromptSpec, 'kind'>) => open<string | null>({ ...s, kind: 'prompt' }),
    [open]
  )

  return {
    confirm,
    prompt,
    node: spec ? <DialogView spec={spec} onClose={close} /> : null
  }
}

function DialogView({
  spec,
  onClose
}: {
  spec: Spec
  onClose: (value: unknown) => void
}): React.JSX.Element {
  const [text, setText] = useState(spec.kind === 'prompt' ? spec.value : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelValue = spec.kind === 'prompt' ? null : spec.cancelIndex

  useEffect(() => {
    // 열리자마자 바로 칠 수 있어야 한다 — 이름을 짓는 창에서 클릭을 한 번 더 시키지 않는다
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose(cancelValue)
      }
    }
    // 캡처 단계에서 잡는다 — 에디터의 Esc(선택 해제)가 먼저 먹으면 안 된다
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, cancelValue])

  return (
    <div className="dlg-back" onPointerDown={() => onClose(cancelValue)}>
      <div
        className="dlg"
        role="dialog"
        aria-modal
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3>{spec.title}</h3>

        {spec.kind === 'confirm' ? (
          <>
            <p className="dlg-msg">{spec.message}</p>
            {spec.detail && <p className="dlg-detail">{spec.detail}</p>}
            <div className="dlg-buttons">
              {spec.buttons.map((label, i) => (
                <button
                  key={label}
                  className={
                    i === spec.dangerIndex ? 'danger' : i === 0 ? 'primary' : ''
                  }
                  onClick={() => onClose(i)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onClose(text.trim() ? text.trim() : null)
            }}
          >
            <label className="dlg-field">
              <span>{spec.label}</span>
              <input
                ref={inputRef}
                className="input"
                value={text}
                placeholder={spec.placeholder}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div className="dlg-buttons">
              <button type="submit" className="primary" disabled={!text.trim()}>
                {spec.okLabel ?? '저장'}
              </button>
              <button type="button" onClick={() => onClose(null)}>
                취소
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

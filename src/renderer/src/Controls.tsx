import { useEffect, useRef, useState } from 'react'
import { useOutsideClose } from './useOutsideClose'

/** 에디터에서 반복해서 쓰는 작은 입력 부품들. */

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): React.JSX.Element {
  return (
    <input
      type="text"
      className="input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}): React.JSX.Element {
  return (
    <span className="num">
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  )
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
}): React.JSX.Element {
  return (
    <span className="slider">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <em>
        {value}
        {suffix}
      </em>
    </span>
  )
}

/**
 * 드롭다운.
 *
 * 브라우저 기본 `<select>` 는 펼쳐지는 목록을 OS 가 그려서 밝은 배경·기본 스크롤바가
 * 그대로 튀어나온다. 어두운 화면에 눈이 아프므로 직접 그린다.
 */
export function Select<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const rootRef = useOutsideClose<HTMLSpanElement>(open, () => setOpen(false))
  const current = options.find((o) => o.value === value)

  // 열린 목록에서 선택된 항목이 보이도록 스크롤을 맞춘다
  useEffect(() => {
    if (!open) return
    boxRef.current?.querySelector('.sel-opt.on')?.scrollIntoView({ block: 'nearest' })
  }, [open])

  return (
    <span className="dd" ref={rootRef}>
      <button className={`dd-btn ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}>
        <span>{current?.label ?? value}</span>
        <em>▾</em>
      </button>

      {open && (
        <>
          <div className="dd-list" ref={boxRef}>
            {options.map((o) => (
              <button
                key={o.value}
                className={`sel-opt ${o.value === value ? 'on' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}

export function ColorInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <span className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <input
        type="text"
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </span>
  )
}

export function CheckBox({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function SegButtons<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}): React.JSX.Element {
  return (
    <span className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_LABEL, type EffectCategory } from '@shared/effects'
import {
  activeProps,
  bezierCss,
  bezierPoint,
  customFrames,
  DEFAULT_EASING,
  EASING_PRESETS,
  filtersOf,
  groupEasing,
  groupOn,
  groupTimes,
  moveGroupAt,
  parseBezier,
  PROP_BY_KEY,
  PROP_GROUPS,
  removeGroupAt,
  setGroupEasing,
  setValueAt,
  toggleGroup,
  valueAt,
  waveFilterSvg,
  type Bezier,
  type CustomEffect,
  type PropGroup,
  type PropKey
} from '@shared/custom-effect'
import { CheckBox, Select, Slider, TextInput } from './Controls'
import { isTyping } from './keys'

/**
 * 효과 편집기 — 프리미어 프로의 «효과 컨트롤» 방식.
 *
 * 왼쪽에 **값 목록**, 오른쪽에 값마다 하나씩 **자기 트랙**. 스톱워치(⏱)를 켠 값만
 * 움직이고, 재생 헤드를 옮긴 뒤 숫자를 바꾸면 그 자리에 키프레임이 찍힌다.
 *
 * X·Y 는 프리미어처럼 **한 줄에 두 칸**으로 묶었다. 늘 함께 만지는 값이라 따로 두면
 * 줄이 두 배로 늘고 스톱워치도 두 번 켜야 했다.
 */

const PREVIEW_NAME = 'ec-fx-draft'

function clamp(n: number, lo: number, hi: number): number {
  // 끌다 보면 소수점이 지저분하게 쌓인다 — 값 자체를 다듬어 둔다
  return Number(Math.max(lo, Math.min(hi, n)).toFixed(3))
}

export function EffectEditor({
  effect,
  onChange,
  onSave,
  onCancel,
  onDelete,
  standalone = false,
  history,
  onUndo,
  onRedo
}: {
  effect: CustomEffect
  onChange: (fx: CustomEffect) => void
  onSave: () => void
  onCancel: () => void
  /** 이미 저장된 효과를 고치는 중일 때만 */
  onDelete?: () => void
  /** 전용 창으로 떠 있는지. 그러면 덮개를 깔지 않고 창을 꽉 채운다 */
  standalone?: boolean
  history?: { past: number; future: number }
  onUndo?: () => void
  onRedo?: () => void
}): React.JSX.Element {
  /**
   * 지금 보고 있는 시각(ms). **미리보기와 재생 헤드가 이 값 하나를 함께 쓴다.**
   *
   * CSS 애니메이션을 그냥 틀면 화면은 움직이는데 헤드는 가만히 있고, 반대로 헤드를 끌어도
   * 화면은 꿈쩍하지 않는다. 둘을 한 숫자에 묶으면 재생하면 헤드가 따라가고,
   * 헤드를 끌면 그 순간 모습이 보인다 — 프리미어의 원래 동작이 이것이다.
   */
  const [timeMs, setTimeMs] = useState(0)
  const timeRef = useRef(0)
  const [playing, setPlaying] = useState(true)
  const [sel, setSel] = useState<{ label: string; at: number } | null>(null)
  const live = activeProps(effect)
  const filters = filtersOf(effect)
  const usable = live.length > 0 || Boolean(filters.wave)

  const dur = Math.max(1, effect.durationMs)
  const head = Math.max(0, Math.min(100, (timeMs / dur) * 100))
  const atEnd = timeMs >= dur - 1

  const seek = (ms: number): void => {
    const v = Math.max(0, Math.min(dur, ms))
    timeRef.current = v
    setTimeMs(v)
  }
  /** 헤드를 %로 옮긴다. 손으로 옮기는 동안에는 재생을 멈춘다 */
  const seekPct = (pct: number): void => {
    setPlaying(false)
    seek((pct / 100) * dur)
  }
  const restart = (): void => {
    seek(0)
    setPlaying(true)
  }

  const css = useMemo(() => `@keyframes ${PREVIEW_NAME} { ${customFrames(effect)} }`, [effect])
  // 필터 id 는 효과 id 에서 나온다 — 미리보기도 **같은 id** 를 써야 keyframes 의
  // url(#...) 이 실제 필터를 찾는다. 다른 id 로 만들면 참조가 끊겨 화면이 사라진다
  const svg = useMemo(() => waveFilterSvg(effect), [effect])
  const anim = `${PREVIEW_NAME} ${dur}ms linear both`

  /**
   * 화면을 `timeMs` 시점으로 맞춘다.
   *
   * CSS 애니메이션이라도 만들어진 애니메이션 객체를 잡아 **멈춰 세우고 시각을 직접 넣을 수**
   * 있다. 시간을 브라우저가 흘려보내게 두면 우리가 세는 시간과 조금씩 벌어져,
   * 재생이 끝날 무렵 헤드와 화면이 눈에 띄게 어긋난다.
   */
  const targetRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const a = targetRef.current?.getAnimations()[0]
    if (!a) return
    a.pause()
    a.currentTime = timeMs
  }, [timeMs, css, anim])

  /** 재생 — 흘러간 진짜 시간만큼 더한다 (프레임 수로 세면 느린 기기에서 느려진다) */
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const step = (now: number): void => {
      const next = timeRef.current + (now - last)
      last = now
      if (next >= dur) {
        seek(dur)
        setPlaying(false)
        return
      }
      seek(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, dur])

  /**
   * 값이 바뀌면 자동으로 다시 재생.
   *
   * 단, **헤드를 일부러 중간에 세워둔 경우엔 건드리지 않는다.** 40% 지점을 보며 숫자를
   * 다듬는 중에 매번 처음으로 튀면 손이 계속 헛돈다. 끝까지 본 뒤(또는 재생 중)에만 다시 튼다.
   */
  const parked = !playing && !atEnd && timeMs > 0
  useEffect(() => {
    if (parked) return
    const t = setTimeout(restart, 160)
    return () => clearTimeout(t)
  }, [css])

  /**
   * 스페이스 = 재생 / 멈춤. 끝까지 갔으면 처음부터 다시 튼다.
   * 글자를 치는 중에는 가로채면 안 된다 — 이름에 띄어쓰기를 못 넣게 된다.
   */
  const toggle = (): void => {
    if (playing) return setPlaying(false)
    if (atEnd) return restart()
    setPlaying(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target)) return
      if (e.code === 'Space') {
        /*
         * 반드시 막아야 한다. 슬라이더나 단추를 마우스로 만지면 초점이 거기 남는데,
         * 막지 않으면 브라우저가 **그 컨트롤을 한 번 더 누른다.**
         * (길이 슬라이더를 건드린 뒤 스페이스를 누르면 길이 쪽이 눌리던 이유)
         */
        e.preventDefault()
        toggle()
      } else if (e.key === 'Home') {
        e.preventDefault()
        seek(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setPlaying(false)
        seek(dur)
      } else if (e.key === 'Escape' && !standalone) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const selGroup = sel ? PROP_GROUPS.find((g) => g.label === sel.label) : null

  return (
    <div className={standalone ? "fxe-solo" : "fxe-back"} onPointerDown={standalone ? undefined : onCancel}>
      <div className="fxe" onPointerDown={(e) => e.stopPropagation()}>
        <header className="fxe-head">
          <b>효과 만들기</b>
          <TextInput value={effect.name} onChange={(name) => onChange({ ...effect, name })} />
          <Select
            value={effect.category}
            onChange={(category) => onChange({ ...effect, category: category as EffectCategory })}
            options={(['in', 'emphasis', 'out'] as EffectCategory[]).map((c) => ({
              value: c,
              label: CATEGORY_LABEL[c]
            }))}
          />
          {history && (
            <span className="fxe-undo">
              <button disabled={history.past === 0} onClick={onUndo} title="되돌리기 (Ctrl+Z)">
                ↶
              </button>
              <button disabled={history.future === 0} onClick={onRedo} title="다시 실행 (Ctrl+Shift+Z)">
                ↷
              </button>
            </span>
          )}
          <div className="spacer" />
          {onDelete && (
            <button className="fxe-del" onClick={onDelete}>
              삭제
            </button>
          )}
          <button onClick={onCancel}>취소</button>
          <button className="primary" onClick={onSave} disabled={!usable}>
            저장
          </button>
        </header>

        <div className="fxe-body">
          <section className="fxe-stage">
            <style>{css}</style>
            {svg && (
              <svg
                aria-hidden
                width="0"
                height="0"
                style={{ position: 'absolute' }}
                dangerouslySetInnerHTML={{ __html: `<defs>${svg}</defs>` }}
              />
            )}
            <div className="fxe-screen">
              {/*
                애니메이션은 CSS 로 걸되 **시간은 우리가 쥔다** (아래 useLayoutEffect).
                스스로 흐르게 두면 화면과 재생 헤드가 각자 놀아 조금씩 어긋난다.
              */}
              <div ref={targetRef} className="fxe-target" style={{ animation: anim }}>
                가나다 ABC
              </div>
            </div>

            {/* 재생 조작 — 한 줄에 몰아넣으면 글자가 세로로 쪼개진다. 두 줄로 나눈다 */}
            <div className="fxe-stage-ops">
              <button onClick={restart} title="Home">
                ↻ 처음부터
              </button>
              <button className={playing ? 'primary' : ''} onClick={toggle} title="Space">
                {playing ? '❚❚ 멈춤' : atEnd ? '↻ 다시 재생' : '▶ 재생'}
              </button>
              <span className="fxe-time mono">
                {(timeMs / 1000).toFixed(2)} / {(dur / 1000).toFixed(2)}s
              </span>
            </div>
            <label className="fxe-dur">
              <span>길이</span>
              <Slider
                min={100}
                max={3000}
                step={50}
                value={effect.durationMs}
                onChange={(durationMs) => onChange({ ...effect, durationMs })}
                suffix="ms"
              />
            </label>

            <FilterFields effect={effect} onChange={onChange} />

            <p className={`ps-note ${usable ? '' : 'fxe-warn'}`}>
              {usable ? (
                <>
                  <b>Space</b> 재생·멈춤 · 파란 숫자를 <b>좌우·상하로 끌면</b> 값이 바뀝니다
                </>
              ) : (
                <>
                  오른쪽에서 움직일 값의 <b>⏱</b> 를 켜세요. 하나도 없으면 아무 일도 일어나지 않습니다.
                </>
              )}
            </p>
          </section>

          <section className="fxe-side">
            <TrackTable
              effect={effect}
              head={head}
              playing={playing}
              sel={sel}
              onHead={seekPct}
              onSel={setSel}
              onChange={onChange}
            />

            {selGroup && sel ? (
              <SegmentPanel
                effect={effect}
                group={selGroup}
                at={sel.at}
                onChange={onChange}
                onRemove={() => {
                  onChange(removeGroupAt(effect, selGroup, sel.at))
                  setSel(null)
                }}
              />
            ) : (
              <p className="ps-note">
                트랙의 마름모(◆)를 누르면 그 지점의 속도 곡선을 고칠 수 있습니다.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/**
 * 시간 전체에 걸리는 손질.
 * 트랙과 달리 "언제"가 없어서 키프레임을 찍을 수 없다 — 켜면 효과 내내 걸린다.
 */
function FilterFields({
  effect,
  onChange
}: {
  effect: CustomEffect
  onChange: (fx: CustomEffect) => void
}): React.JSX.Element {
  const f = filtersOf(effect)
  const set = (p: Partial<typeof f>): void => onChange({ ...effect, filters: { ...f, ...p } })

  return (
    <div className="fxe-filters">
      <div className="fxe-filt">
        <CheckBox
          checked={f.posterize > 0}
          onChange={(on) => set({ posterize: on ? 12 : 0 })}
          label="시간 포스터화"
        />
        {f.posterize > 0 && (
          <Slider
            min={2}
            max={30}
            value={f.posterize}
            onChange={(posterize) => set({ posterize })}
            suffix="칸/초"
          />
        )}
      </div>
      <div className="fxe-filt">
        <CheckBox
          checked={Boolean(f.wave)}
          onChange={(on) => set({ wave: on ? { amount: 8, speed: 1 } : null })}
          label="파도 비틀기"
        />
        {f.wave && (
          <>
            <Slider
              min={1}
              max={40}
              value={f.wave.amount}
              onChange={(amount) => set({ wave: { ...f.wave!, amount } })}
              suffix="세기"
            />
            <Slider
              min={0.2}
              max={5}
              step={0.1}
              value={f.wave.speed}
              onChange={(speed) => set({ wave: { ...f.wave!, speed } })}
              suffix="빠르기"
            />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 프리미어의 파란 숫자.
 *
 * **끌면 바뀌고, 누르면 고쳐 쓴다.** 그냥 `<input type=number>` 로 두면
 * 음수를 치려고 `-` 만 입력한 순간 값이 NaN 이 되어 되돌아가버린다 —
 * 편집 중에는 글자 그대로 들고 있다가 다 치고 나서 숫자로 바꾼다.
 */
function ScrubNumber({
  value,
  spec,
  disabled,
  onChange
}: {
  value: number
  spec: (typeof PROP_BY_KEY)[PropKey]
  disabled: boolean
  onChange: (v: number) => void
}): React.JSX.Element {
  const [typing, setTyping] = useState<string | null>(null)
  const moved = useRef(false)

  if (typing !== null) {
    return (
      <input
        className="input fxe-num-edit"
        autoFocus
        value={typing}
        onChange={(e) => setTyping(e.target.value)}
        onBlur={() => {
          const n = Number(typing)
          if (Number.isFinite(n)) onChange(clamp(n, spec.min, spec.max))
          setTyping(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setTyping(null)
        }}
      />
    )
  }

  return (
    <span
      className={`fxe-num ${disabled ? 'off' : ''}`}
      title={disabled ? '' : '끌어서 바꾸기 · 눌러서 입력'}
      onPointerDown={(ev) => {
        if (disabled) return
        ev.preventDefault()
        moved.current = false
        const x0 = ev.clientX
        const y0 = ev.clientY
        let last = 0
        const move = (e: PointerEvent): void => {
          // 오른쪽 또는 위로 끌면 커진다. 둘 다 받아야 손이 가는 대로 움직인다
          const raw = (e.clientX - x0 + (y0 - e.clientY)) / 3
          const steps = Math.round(raw)
          if (steps !== last) {
            moved.current = true
            onChange(clamp(value + steps * spec.drag, spec.min, spec.max))
            last = steps
          }
        }
        const up = (): void => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          // 끌지 않고 딸깍했으면 고쳐 쓰기로 넘어간다
          if (!moved.current) setTyping(String(Number(value.toFixed(3))))
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    >
      {Number(value.toFixed(spec.drag < 0.1 ? 2 : 1))}
      {spec.unit && <i>{spec.unit}</i>}
    </span>
  )
}

/** 값 목록 + 트랙. 왼쪽 이름·숫자와 오른쪽 트랙이 같은 줄에 있어야 짝이 보인다. */
function TrackTable({
  effect,
  head,
  playing,
  sel,
  onHead,
  onSel,
  onChange
}: {
  effect: CustomEffect
  head: number
  /** 재생 중에는 헤드가 스스로 움직인다 — 그때는 부드럽게 흐르는 게 맞다 */
  playing: boolean
  sel: { label: string; at: number } | null
  onHead: (at: number) => void
  onSel: (s: { label: string; at: number } | null) => void
  onChange: (fx: CustomEffect) => void
}): React.JSX.Element {
  const laneRef = useRef<HTMLDivElement>(null)

  function pctFrom(clientX: number): number {
    const box = laneRef.current!.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100)))
  }

  function scrubHead(ev: React.PointerEvent): void {
    ev.preventDefault()
    onHead(pctFrom(ev.clientX))
    const move = (e: PointerEvent): void => onHead(pctFrom(e.clientX))
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** 키프레임 끌기 — 이웃을 지나치면 시간이 거꾸로 흐른다 */
  function dragKf(g: PropGroup, at: number, ev: React.PointerEvent): void {
    ev.stopPropagation()
    ev.preventDefault()
    onSel({ label: g.label, at })
    onHead(at)

    const times = groupTimes(effect, g)
    const i = times.indexOf(at)
    const lo = i > 0 ? times[i - 1] + 1 : 0
    const hi = i < times.length - 1 ? times[i + 1] - 1 : 100

    let from = at
    const move = (e: PointerEvent): void => {
      const to = Math.max(lo, Math.min(hi, pctFrom(e.clientX)))
      if (to === from) return
      onChange(moveGroupAt(effect, g, from, to))
      onHead(to)
      onSel({ label: g.label, at: to })
      from = to
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="fxe-tracks">
      <div className="fxe-thead">
        <span>값</span>
        {/*
          안쪽 칸을 한 겹 두고 0~100% 를 **그 안**에 매긴다.
          바깥 끝에 바로 붙이면 0% 와 100% 의 눈금 글자와 마름모가 반씩 잘려 나간다.
        */}
        <div className="fxe-ruler" onPointerDown={scrubHead}>
          <div className="fxe-track">
            {[0, 25, 50, 75, 100].map((t) => (
              <i key={t} style={{ left: `${t}%` }}>
                {t}%
              </i>
            ))}
            <span
              className={`fxe-head-line ${playing ? 'run' : ''}`}
              style={{ left: `${head}%` }}
            />
          </div>
        </div>
      </div>

      {PROP_GROUPS.map((g, gi) => {
        const on = groupOn(effect, g)
        const times = on ? groupTimes(effect, g) : []
        const atHead = times.some((t) => Math.abs(t - head) < 0.6)

        return (
          <div key={g.label} className={`fxe-row ${on ? '' : 'off'}`}>
            <span className="fxe-rowhead">
              <button
                className={`fxe-watch ${on ? 'on' : ''}`}
                title={on ? '움직임 끄기 (키프레임이 사라집니다)' : '이 값을 움직이게 하기'}
                onClick={() => onChange(toggleGroup(effect, g, !on, head))}
              >
                ⏱
              </button>
              <em className="fxe-label">{g.label}</em>
              <span className="fxe-nums">
                {g.keys.map((k) => {
                  const spec = PROP_BY_KEY[k]
                  return (
                    <span key={k} className="fxe-numcell">
                      {spec.axis && <i className="fxe-axis-tag">{spec.axis}</i>}
                      <ScrubNumber
                        value={valueAt(effect, k, head)}
                        spec={spec}
                        disabled={!on}
                        onChange={(n) => {
                          // 스톱워치가 켜진 채 값을 바꾸면 그 자리에 점이 생긴다
                          onChange(setValueAt(effect, k, head, n))
                          onSel({ label: g.label, at: head })
                        }}
                      />
                    </span>
                  )
                })}
              </span>
            </span>

            <div
              className="fxe-lane"
              onPointerDown={scrubHead}
            >
            <div className="fxe-track" ref={gi === 0 ? laneRef : undefined}>
              {times.map((t) => (
                <button
                  key={t}
                  className={`fxe-kf ${sel?.label === g.label && Math.abs(sel.at - t) < 0.6 ? 'on' : ''}`}
                  style={{ left: `${t}%` }}
                  title={`${Math.round(t)}%`}
                  onPointerDown={(ev) => dragKf(g, t, ev)}
                />
              ))}
              {on && !atHead && (
                <button
                  className="fxe-add"
                  style={{ left: `${head}%` }}
                  title="여기에 키프레임 찍기"
                  onPointerDown={(ev) => {
                    ev.stopPropagation()
                    ev.preventDefault()
                    // 지금 값 그대로 찍는다 — 찍는 순간 움직임이 달라지면 안 된다
                    let next = effect
                    for (const k of g.keys) next = setValueAt(next, k, head, valueAt(effect, k, head))
                    onChange(next)
                    onSel({ label: g.label, at: head })
                  }}
                >
                  +
                </button>
              )}
              <span className={`fxe-lane-head ${playing ? "run" : ""}`} style={{ left: `${head}%` }} />
            </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 고른 지점 — 거기서 다음 지점까지의 속도 곡선 */
function SegmentPanel({
  effect,
  group,
  at,
  onChange,
  onRemove
}: {
  effect: CustomEffect
  group: PropGroup
  at: number
  onChange: (fx: CustomEffect) => void
  onRemove: () => void
}): React.JSX.Element {
  const times = groupTimes(effect, group)
  const i = times.findIndex((t) => Math.abs(t - at) < 0.6)
  const next = times[i + 1]

  return (
    <div className="fxe-kfpanel">
      <div className="fxe-kfhead">
        <b>
          {group.label} · {Math.round(at)}%
        </b>
        <div className="spacer" />
        <button onClick={onRemove}>이 키프레임 지우기</button>
      </div>

      {next !== undefined ? (
        <CurveEditor
          label={`${Math.round(at)}% → ${Math.round(next)}%`}
          value={parseBezier(groupEasing(effect, group, at))}
          onChange={(b) => onChange(setGroupEasing(effect, group, at, bezierCss(b)))}
          onReset={() => onChange(setGroupEasing(effect, group, at, DEFAULT_EASING))}
        />
      ) : (
        <p className="ps-note">
          이 줄의 마지막 점입니다. 갈 곳이 없으므로 속도 곡선은 쓰이지 않습니다.
        </p>
      )}
    </div>
  )
}

/**
 * 속도 곡선 편집기.
 *
 * 가로가 시간, 세로가 진행도다. 곡선이 가파른 곳에서 빨리 움직인다.
 * 손잡이를 상자 밖으로 끌면 되돌아왔다 가는(튕기는) 움직임이 된다 — 일부러 막지 않았다.
 */
function CurveEditor({
  label,
  value,
  onChange,
  onReset
}: {
  label: string
  value: Bezier
  onChange: (b: Bezier) => void
  onReset: () => void
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null)
  const S = 132
  const PAD = 26

  const px = (x: number): number => PAD + x * S
  const py = (y: number): number => PAD + (1 - y) * S

  const path = useMemo(() => {
    const pts = Array.from({ length: 41 }, (_, i) => bezierPoint(value, i / 40))
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.x)} ${py(p.y)}`).join(' ')
  }, [value])

  function drag(which: 0 | 1, ev: React.PointerEvent): void {
    ev.preventDefault()
    const box = ref.current!.getBoundingClientRect()
    // SVG 는 viewBox 로 늘어나 있다 — 화면 px 을 곡선 좌표로 되돌리려면 배율을 나눠야 한다
    const scale = box.width / (S + PAD * 2)
    const move = (e: PointerEvent): void => {
      const x = (e.clientX - box.left) / scale
      const y = (e.clientY - box.top) / scale
      const next = [...value] as Bezier
      // x 가 0~1 밖으로 나가면 곡선이 스스로를 되짚어 CSS 가 거부한다
      next[which * 2] = Math.max(0, Math.min(1, (x - PAD) / S))
      next[which * 2 + 1] = Math.max(-1.2, Math.min(2.2, 1 - (y - PAD) / S))
      onChange(next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="fxe-curve">
      <div className="fxe-curve-head">
        <span>{label} 속도</span>
        <Select
          value=""
          onChange={(v) => {
            if (v === '__reset') return onReset()
            const p = EASING_PRESETS.find((e) => e.label === v)
            if (p) onChange(p.value)
          }}
          options={[
            { value: '', label: '고르기…' },
            ...EASING_PRESETS.map((p) => ({ value: p.label, label: p.label })),
            { value: '__reset', label: '기본으로' }
          ]}
        />
      </div>
      <svg ref={ref} viewBox={`0 0 ${S + PAD * 2} ${S + PAD * 2}`} className="fxe-svg">
        <rect x={PAD} y={PAD} width={S} height={S} className="fxe-plot" />
        {[0.25, 0.5, 0.75].map((g) => (
          <g key={g}>
            <line x1={px(g)} y1={PAD} x2={px(g)} y2={PAD + S} className="fxe-grid-line" />
            <line x1={PAD} y1={py(g)} x2={PAD + S} y2={py(g)} className="fxe-grid-line" />
          </g>
        ))}
        <line x1={px(0)} y1={py(0)} x2={px(value[0])} y2={py(value[1])} className="fxe-arm" />
        <line x1={px(1)} y1={py(1)} x2={px(value[2])} y2={py(value[3])} className="fxe-arm" />
        <path d={path} className="fxe-path" />
        <circle cx={px(0)} cy={py(0)} r="3" className="fxe-anchor" />
        <circle cx={px(1)} cy={py(1)} r="3" className="fxe-anchor" />
        <circle
          cx={px(value[0])}
          cy={py(value[1])}
          r="7"
          className="fxe-handle"
          onPointerDown={(e) => drag(0, e)}
        />
        <circle
          cx={px(value[2])}
          cy={py(value[3])}
          r="7"
          className="fxe-handle"
          onPointerDown={(e) => drag(1, e)}
        />
      </svg>
      <code className="fxe-code">{bezierCss(value)}</code>
    </div>
  )
}

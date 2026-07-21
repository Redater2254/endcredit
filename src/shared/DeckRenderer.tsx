import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CreditData } from './aggregate'
import { buildKeyframesCss, getEffect, keyframeName } from './effects'
import { interpolate, interpolateRuns } from './fields'
import {
  audioOf,
  isHiddenWhenEmpty,
  lineForRank,
  linesForElement,
  delaysFor,
  slideDurationMs,
  slideTiming,
  slideHeightRatio,
  transitionOf,
  type DataElement,
  type Deck,
  type RankElement,
  type Motion,
  type Slide,
  type SlideElement,
  type TextStyle
} from './deck'
import { exitDurationOf } from './preset'
import { ScreenFxLayer, SCREEN_FX_CSS } from './screen-fx'

/**
 * 슬라이드 렌더링 코어.
 *
 * **앱 캔버스·썸네일·OBS 송출이 이 파일 하나를 공유한다.**
 * 편집 화면과 실제 송출이 다르면 커스텀 툴의 존재 의의가 없어지므로,
 * 데이터가 어디서 왔는지(IPC냐 SSE냐)는 이 컴포넌트가 알지 못하게 한다.
 */

export const MOTION_KEYFRAMES = buildKeyframesCss() + SCREEN_FX_CSS

export interface DeckRendererProps {
  deck: Deck
  data: CreditData
  playing: boolean
  /** 재생 세대. 값이 바뀌면 처음부터 다시 시작한다. */
  generation: number
  /**
   * `null` 이면 재생 순서대로 진행한다 (OBS·전체 재생).
   * 인덱스를 주면 **그 슬라이드만** 보여주고 다음 장으로 넘어가지 않는다.
   * 이때도 `playing` 이 참이면 효과는 재생된다 — 한 장만 미리 보기 위한 조합이다.
   */
  slideIndex?: number | null
  /** 편집 중 스크롤 슬라이드에서 보고 있는 세로 위치 (캔버스 px) */
  editOffset?: number
  /**
   * 이 요소는 그리지 않는다.
   * 글자를 그 자리에서 고칠 때, 밑에 원본이 남아 있으면 두 겹으로 겹쳐 보인다.
   */
  hideElementId?: string | null
  /**
   * 소리를 낼지.
   *
   * 썸네일까지 소리를 내면 목록만 봐도 시끄럽고, 앱과 OBS 가 **동시에** 울면
   * 스트리머 귀에 두 번 들린다. 그래서 켜는 쪽이 명시적으로 정한다.
   */
  audio?: boolean
  onFinished?: () => void
}

export function DeckRenderer({
  deck,
  data,
  playing,
  generation,
  slideIndex = null,
  editOffset = 0,
  hideElementId = null,
  audio = false,
  onFinished
}: DeckRendererProps): React.JSX.Element {
  /**
   * 재생 중에는 데이터를 고정한다.
   * 그러지 않으면 크레딧이 올라가는 도중 시청자가 채팅 한 줄만 쳐도 집계가 갱신되고,
   * 애니메이션이 처음부터 다시 시작한다.
   */
  const frozen = useRef<CreditData>(data)
  if (!playing) frozen.current = data
  const shown = playing ? frozen.current : data

  const slides = useMemo(
    () => deck.slides.filter((s) => s.elements.some((e) => e.visible)),
    [deck.slides]
  )

  const [index, setIndex] = useState(0)
  const finishRef = useRef(onFinished)
  finishRef.current = onFinished

  useEffect(() => {
    if (slideIndex === null) setIndex(0)
  }, [generation, playing, slideIndex])

  // 인덱스가 지정되면 자동 진행하지 않는다 (한 장 미리보기)
  const auto = slideIndex === null && playing
  /** 편집 화면(캔버스·썸네일)인지. OBS 송출은 인덱스를 지정하지 않는다. */
  const editing = slideIndex !== null
  const current = slideIndex !== null ? deck.slides[slideIndex] : slides[index]

  useEffect(() => {
    if (!auto || !current) return
    if (current.kind === 'scroll') return // 스크롤 슬라이드는 스크롤이 끝날 때 넘어간다

    // 길이 계산은 deck.ts 한 곳에만 둔다 — 상태 표시와 실제 재생이 어긋나면 안 된다
    const timer = setTimeout(() => {
      if (index + 1 < slides.length) setIndex(index + 1)
      else finishRef.current?.()
    }, slideDurationMs(current, deck.canvas.height))

    return () => clearTimeout(timer)
  }, [auto, index, current, slides.length, deck.canvas.height])

  const advance = (): void => {
    if (index + 1 < slides.length) setIndex(index + 1)
    else finishRef.current?.()
  }

  /**
   * 재생 중이 아니면 **아무것도 그리지 않는다.**
   *
   * OBS 오버레이(slideIndex === null)가 정지 상태에서도 첫 장을 띄우면,
   * 크레딧을 틀지도 않았는데 방송 화면에 글자가 박혀 있게 된다.
   * 편집 캔버스·썸네일은 인덱스를 지정하므로 이 규칙에 걸리지 않는다.
   */
  if (!current || (slideIndex === null && !playing)) return <div />

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: current.background.transparent ? 'transparent' : current.background.color,
        fontFamily: deck.font.family
      }}
    >
      {audio && (
        <AudioLayer deck={deck} slide={current} playing={playing} generation={generation} />
      )}
      <SlideView
        key={`${generation}-${current.id}`}
        slide={current}
        data={shown}
        canvasWidth={deck.canvas.width}
        canvasHeight={deck.canvas.height}
        playing={playing}
        editing={editing}
        editOffset={editOffset}
        hideElementId={hideElementId}
        onScrollEnd={auto ? advance : undefined}
      />
    </div>
  )
}

function SlideView({
  slide,
  data,
  canvasWidth,
  canvasHeight,
  playing,
  editing,
  editOffset,
  hideElementId,
  onScrollEnd
}: {
  slide: Slide
  data: CreditData
  canvasWidth: number
  canvasHeight: number
  playing: boolean
  /** 편집 화면이면 빈 데이터라도 요소를 숨기지 않는다 — 안 보이면 편집할 수 없다 */
  editing: boolean
  editOffset: number
  hideElementId: string | null
  onScrollEnd?: () => void
}): React.JSX.Element {
  const innerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef(onScrollEnd)
  endRef.current = onScrollEnd

  const ratio = slideHeightRatio(slide)
  const contentPx = canvasHeight * ratio

  // 스크롤 슬라이드의 흐름
  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    if (slide.kind !== 'scroll' || !playing) {
      inner.style.transform = `translateY(${-editOffset}px)`
      return
    }

    const distance = contentPx + canvasHeight
    const duration = (distance / Math.max(10, slide.scroll.speed)) * 1000
    const up = slide.scroll.direction === 'up'

    const anim = inner.animate(
      [
        { transform: `translateY(${up ? canvasHeight : -contentPx}px)` },
        { transform: `translateY(${up ? -contentPx : canvasHeight}px)` }
      ],
      { duration, easing: 'linear', fill: 'both' }
    )
    anim.onfinish = (): void => endRef.current?.()
    return () => anim.cancel()
    // 원시값만 의존성에 둔다 — 객체를 넣으면 데이터 갱신마다 재시작한다
  }, [
    slide.kind,
    slide.scroll.speed,
    slide.scroll.direction,
    contentPx,
    canvasHeight,
    playing,
    editOffset
  ])

  // 스크롤 슬라이드는 요소가 화면에 들어올 때 효과를 재생한다
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (slide.kind !== 'scroll' || !playing) return
    const viewport = viewportRef.current
    if (!viewport) return

    const io = new IntersectionObserver(
      (entries) => {
        const arrived = entries
          .filter((e) => e.isIntersecting)
          .map((e) => (e.target as HTMLElement).dataset.elementId)
          .filter((id): id is string => Boolean(id))
        if (arrived.length === 0) return
        setRevealed((prev) => {
          const next = new Set(prev)
          arrived.forEach((id) => next.add(id))
          return next
        })
      },
      { root: viewport, threshold: 0.15 }
    )
    viewport.querySelectorAll('[data-element-id]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [slide.kind, slide.elements.length, playing])

  const visible = slide.elements.filter(
    (e) => e.visible && e.id !== hideElementId && (editing || !isHiddenWhenEmpty(e, data))
  )
  // 목록 순서가 곧 등장 순서다 (묶음은 한 차례를 공유) · 퇴장은 장 끝에 맞춘다
  const { delays, exitAt } = slideTiming(slide, canvasHeight)

  const tr = transitionOf(slide)
  const transitionStyle: React.CSSProperties =
    playing && tr.preset !== 'none' && tr.durationMs > 0
      ? { animation: `${keyframeName(tr.preset)} ${tr.durationMs}ms ${tr.easing} both` }
      : {}

  return (
    <div ref={viewportRef} style={{ position: 'absolute', inset: 0, ...transitionStyle }}>
      <div
        ref={innerRef}
        data-slide-inner=""
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: contentPx }}
      >
        {visible.map((el, i) => {
          const reveal: Reveal = !playing
            ? 'off'
            : slide.kind === 'scroll'
              ? revealed.has(el.id)
                ? 'go'
                : 'pending'
              : 'go'
          return (
            <ElementView
              key={el.id}
              el={el}
              data={data}
              reveal={reveal}
              index={i}
              slideRatio={ratio}
              delayMs={delays[el.id] ?? el.motion.delayMs}
              exitAtMs={exitAt[el.id]}
              editing={editing}
            />
          )
        })}
      </div>

      {/* 요소 위에 덮는다 — 폭죽이 글자 뒤로 가면 밋밋하다 */}
      {playing && slide.screen && (
        <ScreenFxLayer
          fx={slide.screen}
          seed={slide.id}
          canvasW={canvasWidth}
          canvasH={canvasHeight}
        />
      )}
    </div>
  )
}

type Reveal = 'off' | 'pending' | 'go'

function ElementView({
  el,
  data,
  reveal,
  index,
  slideRatio,
  delayMs,
  exitAtMs,
  editing
}: {
  el: SlideElement
  data: CreditData
  reveal: Reveal
  index: number
  /** 스크롤 슬라이드에서 % 좌표를 내용 높이 기준으로 환산하기 위한 배수 */
  slideRatio: number
  /** 슬라이드 순서에서 계산된 시작 지연 */
  delayMs: number
  /** 퇴장 효과가 시작되는 시각. 없으면 퇴장하지 않는다 */
  exitAtMs?: number
  editing: boolean
}): React.JSX.Element {
  const hasEntrance = el.motion.preset !== 'none' && el.motion.durationMs > 0

  return (
    <div
      data-element-id={el.id}
      style={{
        position: 'absolute',
        left: `${el.frame.x}%`,
        // y 는 캔버스 높이 기준이므로, 내용이 길어진 만큼 나눠준다
        top: `${el.frame.y / slideRatio}%`,
        width: `${el.frame.w}%`,
        height: `${el.frame.h / slideRatio}%`,
        opacity: el.opacity / 100,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        ...(reveal === 'pending' && hasEntrance ? { opacity: 0 } : {}),
        ...(reveal === 'go' ? animationStyle({ ...el.motion, delayMs }, 0, exitAtMs) : {})
      }}
    >
      <ElementBody el={el} data={data} reveal={reveal} baseIndex={index} editing={editing} />
    </div>
  )
}

function ElementBody({
  el,
  data,
  reveal,
  baseIndex,
  editing
}: {
  el: SlideElement
  data: CreditData
  reveal: Reveal
  baseIndex: number
  editing: boolean
}): React.JSX.Element {
  switch (el.kind) {
    case 'text':
      return (
        <div style={{ ...textBox(el.style), height: '100%' }}>
          {/* textBox 는 세로 정렬을 위해 flex column 이다.
              span 을 직접 자식으로 두면 flex 아이템이 되어 **세로로 쌓인다** —
              블록 하나로 감싸 그 안에서 평범하게 이어 흐르게 한다. */}
          <div>
            {el.runs && el.runs.length > 0 ? (
              /* 치환은 조각을 이어붙인 전체 글에서 한다 — 조각별로 하면
                 서식 경계에 걸친 {필드} 가 영영 값으로 바뀌지 않는다.
                 편집 중엔 값 없는 필드를 지우지 않고 {토큰} 그대로 보여준다. */
              interpolateRuns(el.runs, data, editing).map((r, i) => (
                <span
                  key={i}
                  style={{
                    color: r.color,
                    fontSize: r.size,
                    fontWeight: r.weight,
                    fontStyle: r.italic ? 'italic' : undefined
                  }}
                >
                  {r.text}
                </span>
              ))
            ) : (
              interpolate(el.text, data, editing)
            )}
          </div>
        </div>
      )

    case 'image':
      return el.src ? (
        <img
          src={el.src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: el.fit,
            borderRadius: el.radius,
            display: 'block'
          }}
        />
      ) : (
        <div />
      )

    case 'shape':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: el.fill,
            borderRadius: el.shape === 'ellipse' ? '50%' : el.radius
          }}
        />
      )

    case 'rank':
      return <RankBody el={el} data={data} />

    case 'data':
      return <DataBody el={el} data={data} reveal={reveal} baseIndex={baseIndex} editing={editing} />
  }
}

/** 등수 하나 — "1등  밤샘코딩러  247회" */
function RankBody({ el, data }: { el: RankElement; data: CreditData }): React.JSX.Element {
  const line = lineForRank(el, data)
  const name = line?.label ?? el.placeholder
  const value = line?.value ?? null

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '0.5em',
        justifyContent:
          el.nameStyle.align === 'center'
            ? 'center'
            : el.nameStyle.align === 'right'
              ? 'flex-end'
              : 'flex-start'
      }}
    >
      {el.showRank && (
        <span style={{ ...textBox(el.rankStyle), flex: 'none' }}>
          {el.rankFormat.replace('{n}', String(el.rank))}
        </span>
      )}
      <span
        style={{
          ...textBox(el.nameStyle),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0
        }}
      >
        {name}
      </span>
      {el.showValue && value && (
        <span
          style={{
            ...textBox(el.nameStyle),
            color: el.valueColor,
            fontSize: el.nameStyle.size * 0.62,
            flex: 'none'
          }}
        >
          {value}
        </span>
      )}
    </div>
  )
}

function DataBody({
  el,
  data,
  reveal,
  editing
}: {
  el: DataElement
  data: CreditData
  reveal: Reveal
  baseIndex: number
  editing: boolean
}): React.JSX.Element {
  const lines = linesForElement(el, data)
  const empty = lines.length === 0

  // 시차를 주려면 각 줄마다 애니메이션을 걸어야 한다 (지연만 줘서는 아무 일도 안 일어난다)
  const lineAnim = (i: number): React.CSSProperties =>
    reveal === 'go' && el.motion.staggerMs > 0 ? animationStyle(el.motion, i + 1) : {}

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent:
          el.titleStyle.vAlign === 'middle'
            ? 'center'
            : el.titleStyle.vAlign === 'bottom'
              ? 'flex-end'
              : 'flex-start'
      }}
    >
      {el.title && <div style={{ ...textBox(el.titleStyle), marginBottom: el.gap * 2 }}>{el.title}</div>}

      {empty && (el.emptyBehavior === 'placeholder' || editing) && (
        <div style={{ ...textBox(el.itemStyle), opacity: 0.55 }}>{el.placeholder}</div>
      )}

      {lines.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${el.columns}, minmax(0, 1fr))`,
            // 세로 우선이면 행 개수를 미리 정해줘야 한 열씩 채워진다
            ...(el.columnFlow !== 'row' && el.columns > 1
              ? {
                  gridAutoFlow: 'column' as const,
                  gridTemplateRows: `repeat(${Math.ceil(lines.length / el.columns)}, auto)`
                }
              : {}),
            gap: `${el.gap}px ${el.gap * 3}px`
          }}
        >
          {lines.map((l, i) => (
            <div
              key={l.key}
              style={{
                ...textBox(el.itemStyle),
                display: 'flex',
                // textBox 가 세로 쌓기(column)를 넣으므로 반드시 되돌린다.
                // 그러지 않으면 수치가 있는 항목만 이름 아래로 값이 내려가 줄이 어긋난다.
                flexDirection: 'row',
                gap: '0.6em',
                alignItems: 'baseline',
                justifyContent:
                  el.itemStyle.align === 'center'
                    ? 'center'
                    : el.itemStyle.align === 'right'
                      ? 'flex-end'
                      : 'flex-start',
                ...lineAnim(i)
              }}
            >
              <span>{l.label}</span>
              {l.value && (
                <span style={{ color: el.valueColor, fontSize: '0.82em' }}>{l.value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function textBox(s: TextStyle): React.CSSProperties {
  return {
    // 비워두면 상위(문서 글꼴)를 그대로 물려받는다
    fontFamily: s.fontFamily || undefined,
    fontSize: s.size,
    color: s.color,
    fontWeight: s.weight,
    fontStyle: s.italic ? 'italic' : 'normal',
    textAlign: s.align,
    lineHeight: s.lineHeight,
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      s.vAlign === 'middle' ? 'center' : s.vAlign === 'bottom' ? 'flex-end' : 'flex-start',
    textShadow: s.shadow ? '0 2px 8px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)' : 'none',
    WebkitTextStroke: s.stroke > 0 ? `${s.stroke}px ${s.strokeColor}` : undefined,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  }
}

/**
 * 효과 카탈로그 → CSS animation.
 *
 * 등장·강조·퇴장 셋을 **한 요소에 동시에** 걸 수 있다. 같은 속성을 건드릴 때는
 * 목록에서 뒤에 온 것이 이기므로 순서가 곧 우선순위다: 등장 → 강조 → 퇴장.
 */
export function animationStyle(
  motion: Motion,
  index = 0,
  exitAtMs?: number
): React.CSSProperties {
  const parts: string[] = []
  const delay = motion.delayMs + index * motion.staggerMs

  if (motion.preset && motion.preset !== 'none' && motion.durationMs > 0) {
    const e = getEffect(motion.preset)
    parts.push(`${keyframeName(e.id)} ${motion.durationMs}ms ${motion.easing} ${delay}ms both`)
  }
  if (motion.loop) {
    const e = getEffect(motion.loop)
    const start = delay + (motion.durationMs || 0)
    parts.push(
      `${keyframeName(e.id)} ${motion.loopDurationMs}ms ${e.defaultEasing} ${start}ms infinite`
    )
  }
  if (motion.exit && exitAtMs !== undefined) {
    const e = getEffect(motion.exit)
    // forwards 여야 한다 — both 로 두면 시작 전부터 첫 프레임이 걸려 **등장을 덮어쓴다**
    parts.push(
      `${keyframeName(e.id)} ${exitDurationOf(motion)}ms ${e.defaultEasing} ${exitAtMs}ms forwards`
    )
  }
  return parts.length > 0 ? { animation: parts.join(', ') } : {}
}


// ── 소리 ────────────────────────────────────────────────────

/** 목표 음량까지 서서히 올린다. 뚝 켜지면 방송에서 놀란다. */
function ramp(el: HTMLAudioElement, to: number, ms: number): () => void {
  if (ms <= 0) {
    el.volume = to
    return () => {}
  }
  const from = el.volume
  const started = performance.now()
  let raf = 0
  const step = (): void => {
    const t = Math.min(1, (performance.now() - started) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t))
    if (t < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/** 서서히 줄이고 멈춘다. 요소가 사라진 뒤에도 끝까지 진행해야 하므로 스스로 정리한다. */
function fadeOutAndStop(el: HTMLAudioElement, ms: number): void {
  const cancel = ramp(el, 0, ms)
  window.setTimeout(() => {
    cancel()
    el.pause()
    el.src = ''
  }, ms + 60)
}

/**
 * 배경음악과 장 효과음.
 *
 * OBS 브라우저 소스는 자동 재생이 허용돼 있고(`--autoplay-policy` 를 OBS 가 풀어둔다),
 * 앱에서는 사용자가 재생 버튼을 눌러서 들어오므로 둘 다 막히지 않는다.
 * 그래도 실패는 조용히 넘긴다 — 소리 때문에 크레딧이 안 나가면 본말전도다.
 */
function AudioLayer({
  deck,
  slide,
  playing,
  generation
}: {
  deck: Deck
  slide: Slide
  playing: boolean
  generation: number
}): React.JSX.Element {
  const a = audioOf(deck)
  const bgmSrc = a.bgm?.src ?? ''
  const bgmVol = a.bgm?.volume ?? 70
  const soundSrc = slide.sound?.src ?? ''
  const soundVol = slide.sound?.volume ?? 100

  useEffect(() => {
    if (!playing || !bgmSrc) return
    const el = new Audio(bgmSrc)
    el.loop = a.loop
    el.volume = 0
    void el.play().catch(() => {
      /* 자동 재생이 막힌 환경 — 화면은 그대로 나가야 한다 */
    })
    const cancel = ramp(el, Math.max(0, Math.min(1, bgmVol / 100)), a.fadeInMs)
    return () => {
      cancel()
      fadeOutAndStop(el, a.fadeOutMs)
    }
  }, [playing, generation, bgmSrc, bgmVol, a.loop, a.fadeInMs, a.fadeOutMs])

  useEffect(() => {
    if (!playing || !soundSrc) return
    const el = new Audio(soundSrc)
    el.volume = Math.max(0, Math.min(1, soundVol / 100))
    void el.play().catch(() => {})
    return () => {
      el.pause()
      el.src = ''
    }
  }, [playing, generation, slide.id, soundSrc, soundVol])

  return <></>
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CreditData } from './aggregate'
import { buildKeyframesCss, getEffect, keyframeName } from './effects'
import { interpolate, interpolateRuns } from './fields'
import {
  audioOf,
  backgroundOf,
  boundsOf,
  docSlide,
  groupMotion,
  hasMotion,
  imagePaint,
  isHiddenWhenEmpty,
  lineForRank,
  linesForElement,
  rebaseFrame,
  slideDurationMs,
  slideTiming,
  slideHeightRatio,
  shadowsOf,
  shapePaint,
  smartsOf,
  strokesOf,
  transitionOf,
  tuneAudio,
  type AudioClip,
  type DataElement,
  type Deck,
  type RankElement,
  type RenderedLine,
  type Motion,
  type Slide,
  type SlideElement,
  type SlideTiming,
  type SmartDoc,
  type SmartElement,
  type TextElement,
  type TextStroke,
  type TextStyle,
  type TrainElement
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

/**
 * 기차가 화면을 **한 번** 가로지른다.
 *
 * 안 보이는 곳에서 나타나 반대편으로 완전히 빠져나가려면 `상자 너비 + 기차 길이` 만큼
 * 움직여야 하는데, CSS 의 `translateX(%)` 는 **자기 너비** 기준이라 한 요소로는 둘을
 * 더할 수 없다. 그래서 층을 나눈다 — 바깥(상자 너비만큼) + 안쪽(기차 길이만큼).
 * 픽셀을 재지 않으므로 칸 수·크기가 어떻든 늘 같은 자리에서 들어오고 나간다.
 */
const TRAIN_CSS = `
@keyframes train-lane {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes train-cars {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
`

export const MOTION_KEYFRAMES = buildKeyframesCss() + SCREEN_FX_CSS + TRAIN_CSS

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
  /**
   * **이 장 하나만** 재생한다 (null 이면 전체).
   *
   * `slideIndex` 와 다르다. `slideIndex` 는 세워 놓고 보는 것이고, 이쪽은 **평소처럼
   * 재생**하되 목록이 한 장뿐인 것이다 — 그 장이 끝나면 크레딧도 끝난다.
   */
  onlySlide?: number | null
  /** 편집 중 스크롤 슬라이드에서 보고 있는 세로 위치 (캔버스 px) */
  editOffset?: number
  /**
   * 이 요소는 그리지 않는다.
   * 글자를 그 자리에서 고칠 때, 밑에 원본이 남아 있으면 두 겹으로 겹쳐 보인다.
   */
  hideElementId?: string | null
  /**
   * 이 시점(장 시작 기준 ms)의 **정지 화면**을 보여준다. null 이면 평소대로 흐른다.
   *
   * 타임라인을 끌어 아무 데나 찍어 보기 위한 것. 효과마다 지연을 되계산하는 대신
   * 실제로 만들어진 애니메이션들의 재생 위치를 직접 그 시각으로 옮기고 멈춘다 —
   * 그래야 기차·화면 효과·줄 시차처럼 여러 갈래로 붙은 것들이 한꺼번에 정확히 맞는다.
   */
  seekMs?: number | null
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
  onlySlide = null,
  editOffset = 0,
  hideElementId = null,
  seekMs = null,
  audio = false,
  onFinished
}: DeckRendererProps): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)

  /**
   * 찍은 시점으로 모든 애니메이션을 옮기고 멈춘다.
   *
   * 의존성을 두지 않고 매번 돌린다 — 다시 그릴 때마다 애니메이션이 새로 생길 수 있고,
   * 그것들도 같은 시각에 맞춰야 화면이 어긋나지 않는다.
   */
  useLayoutEffect(() => {
    if (seekMs == null) return
    const el = stageRef.current
    if (!el) return
    for (const a of el.getAnimations({ subtree: true })) {
      try {
        a.currentTime = seekMs
        a.pause()
      } catch {
        /* 아직 준비 안 된 애니메이션은 다음 그리기에서 다시 맞춘다 */
      }
    }
  })
  /**
   * 재생 중에는 데이터를 고정한다.
   * 그러지 않으면 크레딧이 올라가는 도중 시청자가 채팅 한 줄만 쳐도 집계가 갱신되고,
   * 애니메이션이 처음부터 다시 시작한다.
   */
  const frozen = useRef<CreditData>(data)
  if (!playing) frozen.current = data
  const shown = playing ? frozen.current : data

  /**
   * 실제로 재생할 장들.
   *
   * `onlySlide` 가 있으면 그 한 장만 튼다 — 재생 자체는 여느 때와 똑같이 돌아가고
   * (효과·소리·타이밍·끝났다는 보고까지), 목록만 한 장짜리가 된다. 그래서 40장짜리
   * 크레딧에서 12번째 장 하나를 OBS 로 확인하려고 앞의 11장을 기다릴 필요가 없다.
   * 보이는 요소가 하나도 없는 장은 평소처럼 건너뛰지만, 콕 집어 고른 장은 안 거른다
   * — 고른 장이 조용히 안 나오면 고장으로 보인다.
   */
  const slides = useMemo(() => {
    if (onlySlide != null) {
      const one = deck.slides[onlySlide]
      return one ? [one] : []
    }
    return deck.slides.filter((s) => s.elements.some((e) => e.visible))
  }, [deck.slides, onlySlide])

  const [index, setIndex] = useState(0)
  const finishRef = useRef(onFinished)
  finishRef.current = onFinished

  /**
   * 지금 장이 **시작한 시각**. 남은 시간을 매번 여기서 다시 재기 때문에, 재생 도중
   * 몇 번을 다시 그리든 진행이 되감기지 않는다.
   *
   * 예전에는 `setTimeout` 을 장 길이만큼 **새로** 걸었고, 의존성에 슬라이드 객체가
   * 들어 있었다. 오버레이는 상태를 SSE 로 받아 `JSON.parse` 하므로 **상태가 한 번 올
   * 때마다 새 객체**가 되고, 그때마다 타이머가 0부터 다시 시작했다. 채팅이 흐르면
   * 0.5초마다 상태가 오니 **어떤 장도 끝나지 않는다** — 4.4초짜리 장이 29초를 버틴
   * 실제 사고가 있었다(2026-07-27 방송).
   */
  const startedRef = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    if (slideIndex === null) setIndex(0)
    startedRef.current = null
  }, [generation, playing, slideIndex])

  // 인덱스가 지정되면 자동 진행하지 않는다 (한 장 미리보기)
  const auto = slideIndex === null && playing
  /** 편집 화면(캔버스·썸네일)인지. OBS 송출은 인덱스를 지정하지 않는다. */
  const editing = slideIndex !== null
  const current = slideIndex !== null ? deck.slides[slideIndex] : slides[index]

  /*
   * 길이 계산은 deck.ts 한 곳에만 둔다 — 상태 표시와 실제 재생이 어긋나면 안 된다.
   * 보관함(smarts)을 빼먹으면 기차가 다 지나가기 전에 다음 장으로 넘어간다.
   */
  const durationMs = useMemo(
    () => (current ? slideDurationMs(current, deck.canvas.height, deck.smarts) : 0),
    [current, deck.canvas.height, deck.smarts]
  )

  // 아래 타이머 의존성에는 **원시값만** 둔다. 객체를 넣으면 위 주석의 사고가 그대로 재발한다.
  const currentId = current?.id ?? null
  const isScroll = current?.kind === 'scroll'

  useEffect(() => {
    if (!auto || !currentId || isScroll) return // 스크롤 장은 스크롤이 끝날 때 넘어간다

    // 장 id 까지 넣는다 — 재생 도중 목록이 바뀌면 같은 번호가 **다른 장**을 가리키게 되고,
    // 그때 새 장이 이전 장의 시작 시각을 물려받아 곧바로 넘어가 버린다.
    const key = `${generation}:${index}:${currentId}`
    const started = startedRef.current?.key === key ? startedRef.current : { key, at: Date.now() }
    startedRef.current = started

    const timer = setTimeout(
      () => {
        if (index + 1 < slides.length) setIndex(index + 1)
        else finishRef.current?.()
      },
      Math.max(0, started.at + durationMs - Date.now())
    )

    return () => clearTimeout(timer)
  }, [auto, generation, index, currentId, isScroll, durationMs, slides.length])

  /**
   * 그릴 장이 하나도 없으면 **끝난 것으로 알린다.**
   *
   * 안 그러면 '재생 중'에서 영영 못 벗어난다 — 화면엔 아무것도 없는데 앱은 정지 버튼만
   * 띄우고 있게 된다. 고른 장이 재생 도중 지워졌거나, 보이는 요소가 있는 장이 하나도
   * 없을 때 실제로 일어난다.
   */
  useEffect(() => {
    if (slideIndex === null && playing && slides.length === 0) finishRef.current?.()
  }, [slideIndex, playing, slides.length])

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

  const bg = backgroundOf(current)

  return (
    <div
      ref={stageRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: bg.transparent ? 'transparent' : bg.color,
        fontFamily: deck.font.family
      }}
    >
      {/* 배경 이미지는 장 전환·스크롤과 무관하게 바닥에 깔린다.
          스크롤 장에서 배경까지 같이 흐르면 멀미가 난다. */}
      {bg.image && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${bg.image}")`,
            backgroundSize: bg.imageFit === 'stretch' ? '100% 100%' : bg.imageFit,
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: bg.imageOpacity / 100,
            ...(bg.imageBlur > 0
              ? {
                  filter: `blur(${bg.imageBlur}px)`,
                  // 흐리게 하면 가장자리가 투명해진다 — 살짝 키워 테두리를 덮는다
                  transform: `scale(${1 + bg.imageBlur / 100})`
                }
              : {})
          }}
        />
      )}
      {audio && (
        <AudioLayer deck={deck} slide={current} playing={playing} generation={generation} />
      )}
      {/* 시점 보기를 끄면 통째로 새로 그린다 — 멈춰 세워 둔 애니메이션이 얼어붙은 채 남지 않게 */}
      <SlideView
        key={`${generation}-${current.id}-${seekMs == null ? 'live' : 'seek'}`}
        slide={current}
        data={shown}
        sound={audio}
        smarts={smartsOf(deck)}
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
  smarts,
  canvasWidth,
  canvasHeight,
  playing,
  editing,
  editOffset,
  hideElementId,
  sound,
  onScrollEnd
}: {
  slide: Slide
  data: CreditData
  /** 고급 개체 보관함 — 요소가 가리키는 내용을 찾아 그린다 */
  smarts: Record<string, SmartDoc>
  canvasWidth: number
  canvasHeight: number
  playing: boolean
  /** 편집 화면이면 빈 데이터라도 요소를 숨기지 않는다 — 안 보이면 편집할 수 없다 */
  editing: boolean
  editOffset: number
  hideElementId: string | null
  /** 요소 등장 효과음을 낼지. 썸네일이나 OBS 가 소리를 맡은 화면에서는 꺼야 두 번 안 들린다 */
  sound: boolean
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

  const visible = useMemo(
    () =>
      slide.elements.filter(
        (e) => e.visible && e.id !== hideElementId && (editing || !isHiddenWhenEmpty(e, data))
      ),
    [slide.elements, hideElementId, editing, data]
  )
  // 목록 순서가 곧 등장 순서다 (묶음은 한 차례를 공유) · 퇴장은 장 끝에 맞춘다.
  // 요소와 고급 개체 안쪽까지 훑는 계산이라 문서가 바뀔 때만 다시 센다
  const timing = useMemo(
    () => slideTiming(slide, canvasHeight, smarts),
    [slide, canvasHeight, smarts]
  )

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
        <ElementLayer
          slide={slide}
          elements={visible}
          data={data}
          timing={timing}
          ratio={ratio}
          revealOf={(lead) =>
            !playing ? 'off' : slide.kind === 'scroll' ? (revealed.has(lead.id) ? 'go' : 'pending') : 'go'
          }
          editing={editing}
          smarts={smarts}
          sound={sound}
          canvasW={canvasWidth}
          canvasH={canvasHeight}
        />
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

/**
 * 요소·묶음이 **등장하는 순간** 울리는 효과음.
 *
 * 등장 지연만큼 기다렸다 튼다 — 화면에 나타나는 시각과 소리가 어긋나면 둘 다 어설퍼진다.
 * 스크롤 크레딧은 지연이 아니라 **화면에 들어온 순간**이 등장이라, `reveal` 이 'go' 로
 * 바뀐 때부터 센다. 한 번 울리고 끝이다.
 *
 * 정지·장 넘김·다시 재생하면 정리에서 끊는다. `SlideView` 가 세대(generation)마다
 * 통째로 다시 마운트되므로 '처음부터'를 눌러도 다시 울린다.
 */
function AppearSound({
  clip,
  delayMs,
  on
}: {
  clip: AudioClip
  delayMs: number
  on: boolean
}): null {
  const { src, volume, pitch } = clip
  useEffect(() => {
    if (!on || !src) return
    let el: HTMLAudioElement | null = null
    const timer = setTimeout(() => {
      el = new Audio(src)
      tuneAudio(el, { src, volume, pitch })
      // 소리가 막힌 환경이라도 화면은 그대로 나가야 한다
      void el.play().catch(() => {})
    }, Math.max(0, delayMs))

    return () => {
      clearTimeout(timer)
      if (el) {
        el.pause()
        el.src = ''
      }
    }
  }, [on, src, volume, pitch, delayMs])

  return null
}

/**
 * 상자를 넘치면 **글자를 줄여** 맞춘다 (파워포인트 '도형에 맞게 텍스트 크기 조정').
 *
 * 배율만 돌려주고, 실제로 줄이는 건 부르는 쪽이 `size` 에 곱해서 한다 — `transform` 으로
 * 줄이면 줄바꿈이 그대로라 아래가 텅 비고, 글자 크기를 진짜로 줄여야 다시 줄바꿈된다.
 * 넘칠 때마다 조금씩 줄이며 몇 프레임 안에 수렴한다. 그리기 전(useLayoutEffect)에
 * 끝나므로 큰 글자가 한 번 번쩍이지 않는다.
 */
function useFitScale(
  on: boolean,
  resetKey: string
): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)

  // 내용이나 상자가 바뀌면 원래 크기에서 다시 잰다 — 한 번 줄면 영영 안 커지면 안 된다
  useLayoutEffect(() => setK(1), [on, resetKey])

  useLayoutEffect(() => {
    const el = ref.current
    if (!on || !el || k <= 0.16) return
    const w = el.clientWidth
    const h = el.clientHeight
    if (w <= 0 || h <= 0) return
    const over = Math.max(el.scrollWidth / w, el.scrollHeight / h)
    if (over <= 1.002) return
    setK((prev) => Math.max(0.15, (prev / over) * 0.98))
  })

  return [ref, k]
}

/** 글자 크기에 배율을 먹인 사본. 1 이면 원본 그대로 (쓸데없이 새 객체를 만들지 않는다) */
function sized(s: TextStyle, k: number): TextStyle {
  return k === 1 ? s : { ...s, size: Math.max(1, s.size * k) }
}

/**
 * 요소 한 층을 그린다 — **슬라이드도 고급 개체 안쪽도 이 하나를 쓴다.**
 *
 * 효과가 걸린 묶음만 **상자 하나로 감싼다**. 상자가 있어야 덩어리 전체를 하나로
 * 움직일 수 있지만, 감싸는 순간 그 안의 요소들이 겹침 순서에서 붙어버린다.
 * 그래서 효과가 없는 묶음(= 이름만 붙인 폴더)은 예전처럼 납작하게 그린다.
 */
function ElementLayer({
  slide,
  elements,
  data,
  timing,
  ratio,
  revealOf,
  editing,
  smarts,
  sound,
  canvasW,
  canvasH,
  depth = 0
}: {
  /** 이 층의 묶음 정의를 담은 (가상) 슬라이드 */
  slide: Slide
  /** 실제로 그릴 요소 (숨김·빈 데이터는 이미 걸러진 것) */
  elements: SlideElement[]
  data: CreditData
  timing: SlideTiming
  ratio: number
  revealOf: (lead: SlideElement) => Reveal
  editing: boolean
  smarts: Record<string, SmartDoc>
  /** 요소 등장 효과음을 낼지 */
  sound: boolean
  /** 이 층이 놓인 판의 픽셀 크기 — 고급 개체가 자기 배율을 계산하는 데 쓴다 */
  canvasW: number
  canvasH: number
  depth?: number
}): React.JSX.Element {
  const { delays, exitAt, groupDelays, groupExitAt } = timing

  const rows: (
    | { kind: 'el'; el: SlideElement }
    | { kind: 'group'; gid: string; motion: Motion; members: SlideElement[] }
  )[] = []
  const boxed = new Set<string>()
  for (const e of elements) {
    const gid = e.groupId
    const gm = gid ? groupMotion(slide, gid) : null
    if (!gid || !hasMotion(gm)) {
      rows.push({ kind: 'el', el: e })
      continue
    }
    if (boxed.has(gid)) continue
    boxed.add(gid)
    rows.push({
      kind: 'group',
      gid,
      motion: gm as Motion,
      members: elements.filter((m) => m.groupId === gid)
    })
  }

  return (
    <>
      {rows.map((row, i) => {
        const reveal = revealOf(row.kind === 'el' ? row.el : row.members[0])

        if (row.kind === 'el') {
          return (
            <ElementView
              key={row.el.id}
              el={row.el}
              data={data}
              reveal={reveal}
              index={i}
              slideRatio={ratio}
              delayMs={delays[row.el.id] ?? row.el.motion.delayMs}
              exitAtMs={exitAt[row.el.id]}
              editing={editing}
              smarts={smarts}
              sound={sound}
              canvasW={canvasW}
              canvasH={canvasH}
              depth={depth}
            />
          )
        }

        const box = boundsOf(row.members)
        const gm = row.motion
        return (
          <div
            key={row.gid}
            data-group-id={row.gid}
            style={{
              position: 'absolute',
              left: `${box.x}%`,
              top: `${box.y / ratio}%`,
              width: `${box.w}%`,
              height: `${box.h / ratio}%`,
              transformOrigin: 'center center',
              ...(reveal === 'pending' && gm.preset !== 'none' ? { opacity: 0 } : {}),
              ...(reveal === 'go'
                ? animationStyle(
                    { ...gm, delayMs: groupDelays[row.gid] ?? gm.delayMs },
                    0,
                    groupExitAt[row.gid]
                  )
                : {})
            }}
          >
            {/* 덩어리가 등장할 때 한 번 — 안의 요소마다 울리면 총소리가 된다 */}
            {gm.sound?.src && (
              <AppearSound
                clip={gm.sound}
                delayMs={groupDelays[row.gid] ?? gm.delayMs}
                on={sound && reveal === 'go'}
              />
            )}
            {row.members.map((el, j) => (
              <ElementView
                key={el.id}
                // 상자 안에서는 좌표가 상자 기준으로 다시 잡힌다
                el={{ ...el, frame: rebaseFrame(el.frame, box) } as SlideElement}
                data={data}
                reveal={reveal}
                index={j}
                slideRatio={1}
                delayMs={delays[el.id] ?? el.motion.delayMs}
                exitAtMs={exitAt[el.id]}
                editing={editing}
                smarts={smarts}
                sound={sound}
                // 상자 안의 % 는 상자 기준이다 — 판의 픽셀 크기도 상자 크기로 줄여 넘긴다
                canvasW={(box.w / 100) * canvasW}
                canvasH={(box.h / 100) * canvasH}
                depth={depth}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}

function ElementView({
  el,
  data,
  reveal,
  index,
  slideRatio,
  delayMs,
  exitAtMs,
  editing,
  smarts,
  sound,
  canvasW,
  canvasH,
  depth
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
  smarts: Record<string, SmartDoc>
  /** 등장 효과음을 낼지 */
  sound: boolean
  canvasW: number
  canvasH: number
  depth: number
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
      {el.motion.sound?.src && (
        <AppearSound clip={el.motion.sound} delayMs={delayMs} on={sound && reveal === 'go'} />
      )}
      <ElementBody
        el={el}
        data={data}
        reveal={reveal}
        baseIndex={index}
        delayMs={delayMs}
        editing={editing}
        smarts={smarts}
        sound={sound}
        canvasW={canvasW}
        canvasH={canvasH}
        depth={depth}
      />
    </div>
  )
}

function ElementBody({
  el,
  data,
  reveal,
  baseIndex,
  delayMs,
  editing,
  smarts,
  sound,
  canvasW,
  canvasH,
  depth
}: {
  el: SlideElement
  data: CreditData
  reveal: Reveal
  baseIndex: number
  delayMs: number
  editing: boolean
  smarts: Record<string, SmartDoc>
  /** 고급 개체 안쪽까지 등장 효과음을 낼지 */
  sound: boolean
  canvasW: number
  canvasH: number
  depth: number
}): React.JSX.Element {
  switch (el.kind) {
    case 'text':
      return <TextBody el={el} data={data} editing={editing} />

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
            display: 'block',
            ...imagePaint(el)
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
            borderRadius: el.shape === 'ellipse' ? '50%' : el.radius,
            ...shapePaint(el)
          }}
        />
      )

    case 'rank':
      return <RankBody el={el} data={data} />

    case 'data':
      return <DataBody el={el} data={data} reveal={reveal} baseIndex={baseIndex} editing={editing} />

    case 'train':
      return <TrainBody el={el} data={data} reveal={reveal} delayMs={delayMs} editing={editing} />

    case 'smart':
      return (
        <SmartBody
          el={el}
          data={data}
          reveal={reveal}
          editing={editing}
          smarts={smarts}
          sound={sound}
          canvasW={canvasW}
          canvasH={canvasH}
          depth={depth}
        />
      )
  }
}

/**
 * 고급 개체 — 보관함의 내용을 **자기 픽셀 무대 위에 그린 뒤 통째로 축소**한다.
 *
 * 요소 frame 만 줄이면 글자 크기가 px 라 그대로 남아 배치가 깨진다. 안쪽을 언제나
 * `doc.canvas` 픽셀 그대로 그리고 `scale()` 로 맞추면 글자·간격·테두리가 함께 줄고 는다
 * — 포토샵 고급 개체와 같은 감각이다.
 *
 * 넘치는 부분은 자르지 않는다. `doc.canvas` 는 배율의 **기준**일 뿐 가리개가 아니어서,
 * 크게 부풀었다 돌아오는 효과(뽀잉 등)가 접기 전과 똑같이 보여야 한다.
 */
function SmartBody({
  el,
  data,
  reveal,
  editing,
  smarts,
  sound,
  canvasW,
  canvasH,
  depth
}: {
  el: SmartElement
  data: CreditData
  reveal: Reveal
  editing: boolean
  smarts: Record<string, SmartDoc>
  /** 안쪽 요소의 등장 효과음을 낼지 */
  sound: boolean
  canvasW: number
  canvasH: number
  depth: number
}): React.JSX.Element {
  const doc = smarts[el.docId]
  // 내용이 없거나(문서가 깨졌거나) 너무 깊이 겹쳤으면 조용히 비운다 — 송출은 계속돼야 한다
  if (!doc || depth > 8) return <div />

  const stageW = Math.max(1, doc.canvas.width)
  const stageH = Math.max(1, doc.canvas.height)
  // 상자가 원본 무대보다 몇 배인지 (캔버스 단위로 잰다 — 화면 배율과 무관해야 한다)
  const sx = Math.max(0.0001, ((el.frame.w / 100) * canvasW) / stageW)
  const sy = Math.max(0.0001, ((el.frame.h / 100) * canvasH) / stageH)

  const inner = useMemo(() => docSlide(doc), [doc])
  const timing = useMemo(() => slideTiming(inner, stageH, smarts), [inner, stageH, smarts])
  const visible = useMemo(
    () => doc.elements.filter((e) => e.visible && (editing || !isHiddenWhenEmpty(e, data))),
    [doc.elements, editing, data]
  )

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        // 무대 크기는 **상자 대비 %** 로 잡는다. px 로 박아두면 오버레이를 캔버스보다
        // 작게 띄웠을 때 안쪽만 원본 크기로 남아 상자 밖으로 삐져나온다.
        width: `${100 / sx}%`,
        height: `${100 / sy}%`,
        transform: `scale(${sx}, ${sy})`,
        transformOrigin: '0 0'
      }}
    >
      <ElementLayer
        slide={inner}
        elements={visible}
        data={data}
        timing={timing}
        ratio={1}
        revealOf={() => reveal}
        editing={editing}
        smarts={smarts}
        sound={sound}
        canvasW={stageW}
        canvasH={stageH}
        depth={depth + 1}
      />
    </div>
  )
}

/**
 * 기차 — 데이터를 한 명씩 태운 칸들이 가로로 지나간다.
 *
 * 칸은 언제나 `count` 개를 그린다. 데이터가 모자라도 빈 칸(이미지)으로 채워
 * 기차 꼴이 무너지지 않게 한다. 등장/퇴장 효과는 바깥 상자(ElementView)에 이미
 * 얹혀 있으므로 여기서는 **안에서 굴러가는 것**만 책임진다.
 */
function TrainBody({
  el,
  data,
  reveal,
  delayMs,
  editing
}: {
  el: TrainElement
  data: CreditData
  reveal: Reveal
  /** 이 요소가 등장하는 시각 — 기차도 그때 출발한다 */
  delayMs: number
  editing: boolean
}): React.JSX.Element {
  // 데이터 해석은 순위 요소와 똑같은 길을 쓴다 — 가짜 DataElement 로 줄을 받아온다
  const fake = { source: el.source, limit: el.count, showValue: el.showValue } as unknown as DataElement
  // 등수는 **태우는 차례와 별개**다 — 마지막부터 태워도 1등은 1등이라 먼저 붙여둔다
  const ranked = linesForElement(fake, data).map((l, i) => ({ ...l, rank: i + 1 }))
  const lines = el.order === 'desc' ? [...ranked].reverse() : ranked

  const n = Math.max(1, Math.min(100, el.count))
  const cars: (Car | null)[] = Array.from({ length: n }, (_, i) => lines[i] ?? null)

  /**
   * 칸마다 쓸 그림.
   *
   * 첫 칸과 마지막 칸은 **같은 끝 이미지**를 쓰고 마지막만 좌우로 뒤집는다 — 기관차 그림
   * 한 장으로 앞뒤가 해결된다. 가운데는 나머지 이미지를 차례로 돌린다.
   * 끝 이미지를 안 넣었으면 예전처럼 전부 가운데 이미지로 돈다.
   */
  const cap = el.capImage || null
  const carImage = (i: number): { src: string | null; flip: boolean } => {
    const last = i === n - 1
    if (cap && (i === 0 || last)) return { src: cap, flip: last && n > 1 }
    if (el.images.length === 0) return { src: null, flip: false }
    // 끝 칸이 따로 있으면 가운데는 그만큼 당겨 세어야 첫 가운데 칸이 첫 이미지가 된다
    const k = cap ? i - 1 : i
    return { src: el.images[((k % el.images.length) + el.images.length) % el.images.length], flip: false }
  }

  const emp = el.carEmphasis ? getEffect(el.carEmphasis) : null
  const carAnim = emp
    ? `${keyframeName(emp.id)} ${Math.max(120, el.carEmphasisMs)}ms ${emp.defaultEasing} infinite`
    : undefined
  // 장식은 칸과 **따로** 흔들 수 있다 — 칸은 얌전한데 머리 위 장식만 통통 튀는 식
  const ovEmp = el.overlayEmphasis ? getEffect(el.overlayEmphasis) : null
  const ovAnim = ovEmp
    ? `${keyframeName(ovEmp.id)} ${Math.max(120, el.overlayEmphasisMs ?? 900)}ms ${ovEmp.defaultEasing} infinite`
    : undefined

  const nameCss: React.CSSProperties = {
    fontFamily: el.nameStyle.fontFamily || undefined,
    fontSize: el.nameStyle.size,
    color: el.nameStyle.color,
    fontWeight: el.nameStyle.weight,
    fontStyle: el.nameStyle.italic ? 'italic' : 'normal',
    textShadow: el.nameStyle.shadow ? '0 2px 8px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9)' : 'none',
    WebkitTextStroke:
      el.nameStyle.stroke > 0 ? `${el.nameStyle.stroke}px ${el.nameStyle.strokeColor}` : undefined
  }

  // 오버레이(OBS)는 styles.css 를 불러오지 않는다 — 여느 요소처럼 **인라인 스타일**로 그린다
  const one = (line: Car | null, i: number, key: string): React.JSX.Element => {
    const { src: img, flip } = carImage(i)
    const ov = el.overlays.length ? el.overlays[i % el.overlays.length] : null
    return (
      <div
        key={key}
        style={{
          position: 'relative',
          flex: 'none',
          height: `${el.carSize}%`,
          aspectRatio: `${Math.max(0.2, el.carRatio ?? 1.5)} / 1`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: carAnim,
          ...(carAnim ? ({ '--fx-amp': (el.carEmphasisAmp ?? 100) / 100 } as React.CSSProperties) : {})
        }}
      >
        {img ? (
          <img
            src={img}
            alt=""
            style={{
              height: '100%',
              width: '100%',
              objectFit: 'contain',
              display: 'block',
              // 그림만 뒤집는다 — 칸 전체를 뒤집으면 이름 글자까지 거울이 된다
              transform: flip ? 'scaleX(-1)' : undefined
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(255,255,255,.12)',
              border: '2px solid rgba(255,255,255,.55)',
              borderRadius: 8
            }}
          />
        )}
        {ov && (
          /* 자리잡기(가운데 맞춤)와 흔들기를 **층으로 나눈다** — 한 요소에 겹치면
             강조 애니메이션이 translateX(-50%) 를 덮어써 장식이 옆으로 밀린다 */
          <span
            style={{
              position: 'absolute',
              left: `${el.overlayX ?? 50}%`,
              top: `${el.overlayY ?? -6}%`,
              // 가로는 지정한 지점이 **장식의 한가운데**가 되게, 세로는 그 지점이 윗변
              transform: 'translateX(-50%)',
              height: `${el.overlaySize ?? 46}%`,
              display: 'block',
              pointerEvents: 'none'
            }}
          >
            <img
              src={ov}
              alt=""
              style={{
                height: '100%',
                width: 'auto',
                objectFit: 'contain',
                display: 'block',
                animation: ovAnim,
                ...(ovAnim
                  ? ({ '--fx-amp': (el.overlayEmphasisAmp ?? 100) / 100 } as React.CSSProperties)
                  : {})
              }}
            />
          </span>
        )}
        {(line?.label || editing) && (
          <CarName el={el} line={line} nameCss={nameCss} />
        )}
      </div>
    )
  }

  const pass = Math.max(1000, el.durationMs)
  /**
   * 재생 중일 때만 굴러간다. 편집 화면에서 한 번 지나가고 사라져 버리면 빈 상자만 남아
   * 자리를 잡을 수가 없으므로, 멈춰 있을 때는 제자리에 세워 둔다.
   */
  const run = reveal === 'go'
  // ltr(왼→오)이면 같은 키프레임을 거꾸로 재생한다 — 왼쪽 밖에서 들어와 오른쪽 밖으로
  const back = el.dir === 'ltr' ? 'reverse' : 'normal'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        /*
         * **좌우만** 자른다.
         *
         * 화면 밖에서 들어와 반대편 밖으로 빠지려면 상자 좌우에서 가려져야 하지만,
         * `overflow: hidden` 은 위아래까지 함께 잘라 칸 위로 뜬 장식이나 칸보다 큰
         * 기관차 그림이 싹둑 잘린다. clip-path 는 축마다 따로 정할 수 있어,
         * 위아래로는 넉넉히 넘겨 두고 좌우만 상자 가장자리에서 자른다.
         */
        clipPath: 'inset(-2000px 0px)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          ...(run
            ? {
                animation: `train-lane ${pass}ms linear ${delayMs}ms both`,
                animationDirection: back
              }
            : {})
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: '100%',
            gap: 12,
            flex: 'none',
            willChange: 'transform',
            ...(run
              ? {
                  animation: `train-cars ${pass}ms linear ${delayMs}ms both`,
                  animationDirection: back
                }
              : {})
          }}
        >
          {cars.map((l, i) => one(l, i, `c${i}`))}
        </div>
      </div>
    </div>
  )
}

function TextBody({
  el,
  data,
  editing
}: {
  el: TextElement
  data: CreditData
  editing: boolean
}): React.JSX.Element {
  /* 치환은 조각을 이어붙인 전체 글에서 한다 — 조각별로 하면 서식 경계에 걸친 {필드} 가
     영영 값으로 바뀌지 않는다. 편집 중엔 값 없는 필드를 {토큰} 그대로 보여준다. */
  const runs = el.runs && el.runs.length > 0 ? interpolateRuns(el.runs, data, editing) : null
  const plain = runs ? null : interpolate(el.text, data, editing)
  const fit = Boolean(el.style.fit)
  const [ref, k] = useFitScale(
    fit,
    `${el.frame.w}x${el.frame.h}|${el.style.size}|${runs ? runs.map((r) => r.text).join('') : plain}`
  )

  return (
    <div
      ref={ref}
      style={{
        /* 판은 상자 전체가 아니라 **글자에만** 붙어야 제목 띠처럼 보이고, 칠은 그 판보다
           위에 얹혀야 한다 — 바깥은 배치·그림자·외곽선만 맡고 판과 칠은 안쪽 층에서 그린다 */
        ...textBox(sized(el.style, k), { plate: false, fill: false, effects: false }),
        height: '100%',
        overflow: fit ? 'hidden' : undefined
      }}
    >
      {/* textBox 는 세로 정렬을 위해 flex column 이다. span 을 직접 자식으로 두면
          flex 아이템이 되어 **세로로 쌓인다** — 블록 하나로 감싸 이어 흐르게 한다. */}
      <div
        style={
          el.style.bgColor
            ? {
                ...plateStyle(sized(el.style, k)),
                display: 'inline-block',
                alignSelf:
                  el.style.align === 'center'
                    ? 'center'
                    : el.style.align === 'right'
                      ? 'flex-end'
                      : 'flex-start'
              }
            : undefined
        }
      >
        {/* 칠(그라데이션)은 판 **위**에 그려야 한다 — 같은 층에 두면 판이 글자를 덮는다.
            부분 서식이 걸린 조각은 자기 색이 있으므로 그쪽이 이긴다 */}
        <span
          style={{
            ...fillOf(sized(el.style, k)),
            // 선·그림자는 **글자만** 감싸야 한다 — 판까지 따라 두르면 안 된다
            ...effectStyle(sized(el.style, k))
          }}
        >
          {runs
            ? runs.map((r, i) => (
                <span
                  key={i}
                  style={{
                    color: r.color,
                    fontSize: r.size ? Math.max(1, r.size * k) : undefined,
                    fontWeight: r.weight,
                    fontStyle: r.italic ? 'italic' : undefined
                  }}
                >
                  {r.text}
                </span>
              ))
            : plain}
        </span>
      </div>
    </div>
  )
}

/** 칸 하나에 태우는 것 — 등수는 태우는 차례와 별개로 원래 순위를 들고 다닌다. */
type Car = { label: string; value: string | null; rank: number }

/**
 * 기차 칸에 얹히는 글 — 등수 · 이름 · 수치.
 *
 * 순위 데이터를 태우는데 몇 등인지 안 보이면 그냥 이름이 지나가는 것과 다르지 않아서,
 * 등수도 함께 띄운다. 늘어놓는 차례는 골라 쓸 수 있다.
 * 칸은 폭이 정해져 있어 긴 닉네임이 삐져나온다 — 자동 맞춤을 켜면 칸 안에 맞춘다.
 */
function CarName({
  el,
  line,
  nameCss
}: {
  el: TrainElement
  line: Car | null
  nameCss: React.CSSProperties
}): React.JSX.Element {
  const fit = Boolean(el.nameStyle.fit)
  const [ref, k] = useFitScale(
    fit,
    `${el.carSize}|${el.carRatio}|${el.textWidth}|${el.nameStyle.size}|${el.rankScale}|${el.valueScale}|${el.carOrder}|${el.carLayout}|${line?.rank}|${line?.label}|${line?.value}`
  )

  const rank =
    el.showRank !== false && line ? (
      <span
        key="r"
        style={{
          color: el.rankColor ?? '#ffd166',
          fontSize: `${(el.rankScale ?? 100) / 100}em`,
          fontWeight: 800,
          flex: 'none'
        }}
      >
        {(el.rankFormat ?? '{n}').replace('{n}', String(line.rank))}
      </span>
    ) : null
  const name = (
    <span key="n" style={{ flex: 'none' }}>
      {line?.label ?? ''}
    </span>
  )
  const value =
    el.showValue && line?.value ? (
      <span
        key="v"
        style={{ color: el.valueColor, fontSize: `${(el.valueScale ?? 68) / 100}em`, flex: 'none' }}
      >
        {line.value}
      </span>
    ) : null

  // 수치를 아랫줄에 두면 칸이 좁아도 이름이 눌리지 않는다 (기본)
  const stack = (el.carLayout ?? 'stack') === 'stack'
  const head = el.carOrder === 'name-value-rank' ? [name, rank] : [rank, name]
  const row = (children: React.ReactNode, key: string): React.JSX.Element => (
    <span
      key={key}
      style={{ display: 'flex', flexDirection: 'row', gap: '.35em', alignItems: 'baseline' }}
    >
      {children}
    </span>
  )

  const body = stack
    ? [row(head.filter(Boolean), 'top'), value ? row(value, 'bot') : null]
    : el.carOrder === 'rank-value-name'
      ? [rank, value, name]
      : el.carOrder === 'name-value-rank'
        ? [name, value, rank]
        : [rank, name, value]

  return (
    <div
      ref={ref}
      style={{
        ...nameCss,
        fontSize: Math.max(1, el.nameStyle.size * k),
        position: 'absolute',
        // 글자 영역을 칸보다 좁히거나 위아래로 옮길 수 있다 — 칸 그림에 글자 자리가
        // 따로 그려져 있는 경우가 많다 (기관차 창문·현수막 등)
        left: `${(100 - (el.textWidth ?? 92)) / 2}%`,
        width: `${el.textWidth ?? 92}%`,
        top: `${(el.textY ?? 50) - 50}%`,
        height: '100%',
        display: 'flex',
        flexDirection: stack ? 'column' : 'row',
        gap: stack ? '.08em' : '.35em',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        overflow: fit ? 'hidden' : undefined
      }}
    >
      {body.filter(Boolean)}
    </div>
  )
}

/** 등수 하나 — "1등  밤샘코딩러  247회" */
function RankBody({ el, data }: { el: RankElement; data: CreditData }): React.JSX.Element {
  const line = lineForRank(el, data)
  const name = line?.label ?? el.placeholder
  const value = line?.value ?? null
  // 이름이 길면 잘라내는 대신 줄여서 다 보이게 한다 — 닉네임이 잘리면 누군지 알 수 없다
  const fit = Boolean(el.nameStyle.fit)
  const [ref, k] = useFitScale(fit, `${el.frame.w}x${el.frame.h}|${el.nameStyle.size}|${name}|${value}`)
  const nameStyle = sized(el.nameStyle, k)

  return (
    <div
      ref={ref}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '0.5em',
        overflow: 'hidden',
        justifyContent:
          el.nameStyle.align === 'center'
            ? 'center'
            : el.nameStyle.align === 'right'
              ? 'flex-end'
              : 'flex-start'
      }}
    >
      {el.showRank && (
        <span style={{ ...textBox(sized(el.rankStyle, k)), flex: 'none' }}>
          {el.rankFormat.replace('{n}', String(el.rank))}
        </span>
      )}
      <span
        style={{
          ...textBox(nameStyle),
          // 자동 맞춤일 땐 **자르지도 줄이지도 않는다** — 넘치게 둬야 바깥에서 얼마나
          // 넘쳤는지 잴 수 있고, 그 값으로 글자를 줄인다. 자르면 넘침이 안 보여 못 잰다.
          overflow: fit ? 'visible' : 'hidden',
          textOverflow: fit ? undefined : 'ellipsis',
          flex: fit ? 'none' : undefined,
          whiteSpace: 'nowrap',
          minWidth: 0
        }}
      >
        {name}
      </span>
      {el.showValue && value && (
        <span
          style={{
            ...textBox(nameStyle),
            color: el.valueColor,
            fontSize: nameStyle.size * 0.62,
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

  // 목록 전체를 한 배율로 줄인다 — 줄마다 크기가 다르면 명단이 들쭉날쭉해 보인다
  const fit = Boolean(el.itemStyle.fit)
  const [ref, k] = useFitScale(
    fit,
    `${el.frame.w}x${el.frame.h}|${el.itemStyle.size}|${el.columns}|${lines.map((l) => l.label).join('·')}`
  )
  const itemStyle = sized(el.itemStyle, k)
  const gap = el.gap * k
  const colGap = (el.colGap ?? el.gap * 3) * k

  const item = (l: RenderedLine, i: number): React.JSX.Element => (
    <div
      key={l.key}
      style={{
        ...textBox(itemStyle),
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
      {l.value && <span style={{ color: el.valueColor, fontSize: '0.82em' }}>{l.value}</span>}
    </div>
  )

  return (
    <div
      ref={ref}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: fit ? 'hidden' : undefined,
        justifyContent:
          el.titleStyle.vAlign === 'middle'
            ? 'center'
            : el.titleStyle.vAlign === 'bottom'
              ? 'flex-end'
              : 'flex-start'
      }}
    >
      {el.title && (
        <div style={{ ...textBox(sized(el.titleStyle, k)), marginBottom: gap * 2 }}>{el.title}</div>
      )}

      {empty && (el.emptyBehavior === 'placeholder' || editing) && (
        <div style={{ ...textBox(itemStyle), opacity: 0.55 }}>{el.placeholder}</div>
      )}

      {/*
        자동 흐름 — 신문 단 조판. 한 줄씩 쌓다가 상자 끝에 닿으면 다음 열 맨 위로 넘어간다.

        `flex-flow: column wrap` 은 **높이가 정해져 있어야** 어디서 넘길지 안다.
        그래서 `flex: 1` 로 남은 높이를 통째로 받고 `minHeight: 0` 으로 눌리지 않게 한다.
        `wrap-reverse` 를 쓰면 새 열이 반대쪽(왼쪽 / 위쪽)에 생긴다 — 방향 뒤집기를 위해
        `direction: rtl` 을 쓰면 글자까지 뒤집히므로 이 쪽이 맞다.
      */}
      {lines.length > 0 && el.autoFlow && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexFlow: `${el.flowDir === 'right' ? 'row' : 'column'} ${
              el.flowBack ? 'wrap-reverse' : 'wrap'
            }`,
            alignContent: el.flowBack ? 'flex-end' : 'flex-start',
            rowGap: gap,
            columnGap: colGap
          }}
        >
          {lines.map(item)}
        </div>
      )}

      {lines.length > 0 && !el.autoFlow && (
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
            rowGap: gap,
            columnGap: colGap
          }}
        >
          {lines.map(item)}
        </div>
      )}
    </div>
  )
}

/**
 * 글자 뒤에 까는 판.
 *
 * `background` 대신 **안쪽 그림자**로 칠한다 — 그라데이션 칠이 `background` 를
 * 글자 모양으로 오려 쓰고 있어서(clip:text), 판까지 같이 오려지면 안 된다.
 * 안쪽 그림자는 배경 위·내용 아래에 칠해지므로 글자는 그대로 위에 얹힌다.
 */
function plateStyle(s: TextStyle): React.CSSProperties {
  if (!s.bgColor) return {}
  return {
    boxShadow: `inset 0 0 0 9999px ${s.bgColor}`,
    borderRadius: s.bgRadius ?? 6,
    padding: `${s.bgPadY ?? 4}px ${s.bgPadX ?? 10}px`
  }
}

/** 그림자는 여러 겹을 쉼표로 잇는다 — CSS 가 원래 목록을 받는다 */
function shadowCss(s: TextStyle): string {
  const list = shadowsOf(s)
  if (list.length === 0) return 'none'
  return list.map((v) => `${v.x}px ${v.y}px ${v.blur}px ${v.color}`).join(', ')
}

/**
 * 부풀릴 방향들.
 *
 * 원 둘레로 밀면 모서리가 **둥글게**, 정사각형 꼭짓점으로 밀면 **각지게** 퍼진다.
 * (대각선을 √2배로 밀어야 네모가 되고, 1/√2 로 줄이면 원이 된다)
 */
function spreadDirs(join: TextStroke['join']): [number, number][] {
  if (join === 'sharp') {
    return [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ]
  }
  // 여덟 방향이면 곡선도 충분히 매끄럽다. 더 늘리면 그리는 값만 비싸진다
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI * 2) / 8
    return [Math.cos(a), Math.sin(a)] as [number, number]
  })
}

/**
 * 선 겹들을 **그림자 목록 한 벌**로 만든다.
 *
 * `filter: drop-shadow` 를 이어 붙이면 함수마다 화면을 통째로 다시 그린다 — 스무 개쯤
 * 되면 프레임이 멈춘다. `text-shadow` 는 아무리 많이 적어도 **한 번에** 그려지므로,
 * 글자를 사방으로 복제해 두르는 이 방식이 같은 그림을 훨씬 싸게 만든다.
 *
 * 목록에서 앞에 적은 것이 위에 그려지므로, 안쪽 겹부터 차례로 쌓으면 된다.
 */
function strokeRing(strokes: TextStroke[], from = 0): string[] {
  const out: string[] = []
  let r = from
  // 겹 수를 막아둔다 — 겹마다 글자를 여덟 벌씩 더 그리므로 끝없이 쌓으면 화면이 버벅인다
  for (const st of strokes.slice(0, 3)) {
    r += st.width
    for (const [dx, dy] of spreadDirs(st.join)) {
      out.push(`${(dx * r).toFixed(2)}px ${(dy * r).toFixed(2)}px 0 ${st.color}`)
    }
  }
  return out
}

/** 첫 겹을 진짜 획(`-webkit-text-stroke`)으로 그리는 경우 — '가운데' 는 획으로만 낼 수 있다 */
function usesRealStroke(strokes: TextStroke[]): boolean {
  const f = strokes[0]
  return Boolean(f) && f.outside === false && f.join !== 'sharp'
}

/**
 * 선과 그림자.
 *
 * 선은 그림자 목록으로 한 번에 두르고(strokeRing), **그림자만** 필터로 준다.
 * 그림자를 `text-shadow` 로 주면 획을 뺀 **글자 속 모양**에서만 생겨 선이 두꺼울수록
 * 그림자가 선 안쪽에서 새어 나온다. `filter` 는 이미 그려진 결과(선까지 포함)를 놓고
 * 계산하므로 선 바깥으로 제대로 드리운다. 개수가 한둘이라 값도 싸다.
 */
function effectStyle(s: TextStyle): React.CSSProperties {
  const strokes = strokesOf(s)
  const shadows = shadowsOf(s)
  const real = usesRealStroke(strokes)
  const ring = strokeRing(real ? strokes.slice(1) : strokes, real ? strokes[0].width / 2 : 0)

  return {
    textShadow: ring.length > 0 ? ring.join(', ') : shadows.length > 0 ? shadowCss(s) : 'none',
    filter:
      ring.length > 0 && shadows.length > 0
        ? shadows.map((v) => `drop-shadow(${v.x}px ${v.y}px ${v.blur}px ${v.color})`).join(' ')
        : undefined
  }
}

/**
 * 칠 — 단색이거나 그라데이션.
 *
 * 그라데이션은 배경을 글자 모양으로 오려 쓰는데, **같은 요소에 판까지 있으면** 판이
 * 그 배경 위에 칠해져 글자가 통째로 사라진다. 그럴 땐 단색으로 물러난다.
 * (텍스트 요소는 판과 글자를 층으로 나눠 두 가지를 함께 쓴다)
 */
function fillOf(s: TextStyle, plateHere = false): React.CSSProperties {
  if (!s.gradient || plateHere) return { color: s.color }
  return {
    backgroundImage: `linear-gradient(${s.gradientAngle ?? 180}deg, ${s.color}, ${s.gradientTo ?? '#ffffff'})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  }
}

function textBox(
  s: TextStyle,
  opts?: { plate?: boolean; fill?: boolean; effects?: boolean }
): React.CSSProperties {
  const plateHere = opts?.plate !== false && Boolean(s.bgColor)
  const strokes = strokesOf(s)
  const real = usesRealStroke(strokes)
  return {
    // 비워두면 상위(문서 글꼴)를 그대로 물려받는다
    fontFamily: s.fontFamily || undefined,
    fontSize: s.size,
    ...(opts?.fill === false ? { color: s.color } : fillOf(s, plateHere)),
    fontWeight: s.weight,
    fontStyle: s.italic ? 'italic' : 'normal',
    textAlign: s.align,
    lineHeight: s.lineHeight,
    display: 'flex',
    flexDirection: 'column',
    justifyContent:
      s.vAlign === 'middle' ? 'center' : s.vAlign === 'bottom' ? 'flex-end' : 'flex-start',
    // '가운데' 선만 진짜 획으로 그린다 — 윤곽선에 걸치는 모양은 획으로만 낼 수 있다
    WebkitTextStroke: real ? `${strokes[0].width}px ${strokes[0].color}` : undefined,
    /*
     * 판이 같은 층에 있으면 부풀리기·그림자가 판 네모까지 따라 그린다 — 그때만
     * 예전 방식(text-shadow)으로 물러난다.
     */
    ...(opts?.effects === false
      ? {}
      : plateHere
        ? { textShadow: shadowCss(s) }
        : effectStyle(s)),
    ...(opts?.plate === false ? {} : plateStyle(s)),
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
  if (parts.length === 0) return {}

  // 강조 세기 — 키프레임이 이 값을 곱해 쓴다 (흔들리는 폭·커지는 정도가 함께 바뀐다)
  const amp = motion.loop ? (motion.loopAmp ?? 100) / 100 : null
  return {
    animation: parts.join(', '),
    ...(amp !== null ? ({ '--fx-amp': amp } as React.CSSProperties) : {})
  }
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
  const soundPitch = slide.sound?.pitch ?? 0

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
    tuneAudio(el, { src: soundSrc, volume: soundVol, pitch: soundPitch })
    void el.play().catch(() => {})
    return () => {
      el.pause()
      el.src = ''
    }
  }, [playing, generation, slide.id, soundSrc, soundVol, soundPitch])

  return <></>
}

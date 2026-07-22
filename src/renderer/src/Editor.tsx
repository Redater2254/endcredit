import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DeckRenderer } from '@shared/DeckRenderer'
import {
  createData,
  createImage,
  createRank,
  createShape,
  createSlide,
  createText,
  deckDurationMs,
  DEFAULT_MOTION,
  effectsOf,
  formatDuration,
  groupMotion,
  newId,
  rankSlide,
  slideDurationMs,
  slideHeightRatio,
  type AudioClip,
  type Deck,
  type DeckAudio,
  type Frame,
  type Motion,
  type Slide,
  type SlideElement,
  type SlideGroup
} from '@shared/deck'
import { getEffect } from '@shared/effects'
import { getScreenEffect, type ScreenFx } from '@shared/screen-fx'
import type { OverlayInfo } from '@shared/overlay'
import { EffectLibrary, SCREEN_FX_DRAG_TYPE } from './EffectLibrary'
import { EffectEditor } from './EffectEditor'
import { newCustomEffect, normalize, type CustomEffect } from '@shared/custom-effect'
import { CustomEffectStyles } from '@shared/useCustomEffects'
import { FieldPanel, FIELD_DRAG_TYPE } from './FieldPanel'
import { SlidePanel } from './SlidePanel'
import { Inspector } from './Inspector'
import { SelectionBox } from './SelectionBox'
import { MultiSelectionBox, boundingBox } from './MultiSelectionBox'
import { useCanvasNav } from './useCanvasNav'
import type { Guide } from './snap'
import { Splitter, useSplit } from './Splitter'
import { DeckMenu } from './DeckMenu'
import { HelpModal } from './HelpModal'
import { TemplateGallery } from './TemplateGallery'
import { RichTextEditor } from './RichTextEditor'
import { AudioPanel } from './AudioPanel'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { ConnectMenu } from './ConnectMenu'
import { CollectorChip } from './CollectorChip'
import { useDialog } from './Dialog'

/**
 * 파워포인트식 편집 화면.
 *
 *   좌: 슬라이드 썸네일 · 중: 캔버스 · 우: 요소 목록 + 속성 · 하: 효과 라이브러리
 */

/** 요소에서 사람이 읽을 이름을 뽑는다. 슬라이드 이름으로 쓴다. */
function elementTitle(el: SlideElement): string {
  if (el.kind === 'data') return el.title || el.name
  if (el.kind === 'text') return el.text.slice(0, 20)
  if (el.kind === 'rank') return `${el.rank}등`
  if (el.kind === 'image') return '이미지'
  return el.name
}

/** 등수로 쪼갤 수 있는 데이터 소스 */
const RANK_SOURCES = new Set([
  'chatRank',
  'emoticonRank',
  'giftRank',
  'balloonRank',
  'stickerRank',
  'newFans',
  'newTopFans',
  'newFollowers',
  'newSupporters'
])

type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom' | 'hdist' | 'vdist'

const ALIGN_BUTTONS: { mode: AlignMode; icon: string; label: string }[] = [
  { mode: 'left', icon: '⇤', label: '왼쪽 맞춤' },
  { mode: 'hcenter', icon: '⇹', label: '가로 가운데' },
  { mode: 'right', icon: '⇥', label: '오른쪽 맞춤' },
  { mode: 'top', icon: '⤒', label: '위 맞춤' },
  { mode: 'vmiddle', icon: '⇳', label: '세로 가운데' },
  { mode: 'bottom', icon: '⤓', label: '아래 맞춤' },
  { mode: 'hdist', icon: '⋯', label: '가로 균등 분배 (3개 이상)' },
  { mode: 'vdist', icon: '⋮', label: '세로 균등 분배 (3개 이상)' }
]

const MIN_SCALE = 0.05
const MAX_SCALE = 4

export function Editor({ info }: { info: OverlayInfo | null }): React.JSX.Element {
  const [deck, setDeckState] = useState<Deck | null>(null)
  const [slideIdx, setSlideIdx] = useState(0)
  /** 다중 선택. 그룹으로 묶으려면 여러 개를 잡을 수 있어야 한다. */
  const [selected, setSelected] = useState<string[]>([])
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [fitScale, setFitScale] = useState(0.4)
  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * 되돌리기 기록.
   *
   * 슬라이더를 끄는 동안에는 값이 수십 번 바뀌는데, 그걸 전부 기록하면
   * Ctrl+Z 를 스무 번 눌러야 한 동작이 취소된다. 그래서 **짧은 시간 안의 연속 변경은
   * 한 단계로 합친다** (포토샵이 드래그 한 번을 히스토리 한 줄로 남기는 것과 같다).
   */
  const past = useRef<Deck[]>([])
  const future = useRef<Deck[]>([])
  const lastPush = useRef(0)
  const deckRef = useRef<Deck | null>(null)
  const [histLen, setHistLen] = useState({ past: 0, future: 0 })
  const [savedAt, setSavedAt] = useState<number | null>(null)
  /**
   * 이름 붙여 저장한 뒤로 손댄 것이 있는지.
   *
   * 편집 내용 자체는 계속 자동 저장되지만 그건 "지금 쓰는 것" 한 벌뿐이다.
   * 새로 시작하면 그 한 벌이 덮어써지므로, **이름을 붙여둔 적이 없으면** 물어봐야 한다.
   */
  const [dirty, setDirty] = useState(false)
  const dlg = useDialog()

  const [leftW, setLeftW] = useSplit('left', 210, 120, 560)
  const [rightW, setRightW] = useSplit('right', 320, 220, 680)
  const [libH, setLibH] = useSplit('lib', 250, 84, 620)

  /** 이 장만 재생해보는 미리보기 */
  /** 아래 서랍: 효과 / 데이터 */
  const [dock, setDock] = useState<'effects' | 'fields' | 'audio'>('effects')
  /**
   * 효과 편집기에서 만지는 중인 사본. `fresh` 면 아직 문서에 없는 새 효과다.
   * 문서에 바로 쓰지 않는 이유는 saveEffect 주석 참고.
   */
  const [fxDraft, setFxDraft] = useState<{ fx: CustomEffect; fresh: boolean } | null>(null)
  /**
   * 만든 효과가 바뀌었음을 아래 목록들에 알리는 표식.
   *
   * 효과는 카탈로그(모듈 변수)에 등록되므로 리액트가 바뀐 걸 알아채지 못한다 —
   * 이 문자열을 의존성에 끼워야 라이브러리와 속성 패널 목록이 다시 그려진다.
   */
  const [previewGen, setPreviewGen] = useState(0)
  const [previewing, setPreviewing] = useState(false)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 앱 안에서만 쓰는 오려두기 보관함. 슬라이드를 넘나들며 붙여넣을 수 있다. */
  /** 요소만 담으면 다른 장에 붙일 때 묶음 이름·효과가 사라진다 — 정의를 같이 들고 다닌다 */
  const clipboard = useRef<{ elements: SlideElement[]; groups: Record<string, SlideGroup> }>({
    elements: [],
    groups: {}
  })
  /** 스냅이 붙은 기준선 — 끌고 있는 동안만 보인다 */
  const [guides, setGuides] = useState<Guide[]>([])
  /** 캔버스에서 바로 고치는 중인 텍스트 요소 */
  const [editingText, setEditingText] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  /** 자유 변형(Ctrl+T). 포토샵처럼 **모드로 들어가야** 크기 손잡이가 나온다 */
  const [transforming, setTransforming] = useState(false)
  const [gallery, setGallery] = useState(false)
  /** 오른쪽 클릭 메뉴 */
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  /** 빈 곳을 끌어 범위로 잡기 (캔버스 % 좌표) */
  const [marquee, setMarquee] = useState<Frame | null>(null)

  useEffect(() => {
    window.endcredit.overlay.getDeck().then((d) => {
      deckRef.current = d
      setDeckState(d)
    })
  }, [])

  const COALESCE_MS = 450
  const MAX_HISTORY = 100

  /** 되돌리기 기록 없이 문서를 갈아끼운다 (되돌리기·불러오기 자신이 쓴다). */
  const applyDeck = useCallback((next: Deck) => {
    deckRef.current = next
    setDeckState(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      window.endcredit.overlay.setDeck(next)
      setSavedAt(Date.now())
    }, 150)
  }, [])

  /** 화면은 즉시, 저장은 묶어서 — 끌 때마다 IPC 를 때리면 캔버스가 버벅인다. */
  const update = useCallback(
    (next: Deck) => {
      setDirty(true)
      const prev = deckRef.current
      if (prev) {
        const now = Date.now()
        // 연속된 미세 변경(드래그·슬라이더)은 한 단계로 합친다
        if (now - lastPush.current > COALESCE_MS || past.current.length === 0) {
          past.current.push(prev)
          if (past.current.length > MAX_HISTORY) past.current.shift()
        }
        lastPush.current = now
        future.current = []
        setHistLen({ past: past.current.length, future: 0 })
      }
      applyDeck(next)
    },
    [applyDeck]
  )

  /**
   * 지금 바로 저장한다.
   * 평소에는 150ms 묶음 저장이 돌지만, Ctrl+S 를 누른 사람은 **눌렀을 때 저장되기를**
   * 기대하므로 대기 중인 저장을 취소하고 즉시 쓴다.
   */
  const saveNow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!deckRef.current) return
    await window.endcredit.overlay.setDeck(deckRef.current)
    setSavedAt(Date.now())
  }, [])

  /**
   * 이름 붙여 저장 — 여러 벌을 남겨두는 용도.
   * 저장했으면 true. (취소하면 false — 부르는 쪽이 이어서 할지 정해야 한다)
   */
  const saveAs = useCallback(async (): Promise<boolean> => {
    const name = await dlg.prompt({
      title: '이름 붙여 저장',
      label: '프리셋 이름',
      value: deckRef.current?.name || '내 프리셋',
      placeholder: '예: 게임방송용 크레딧'
    })
    if (!name) return false
    await saveNow()
    await window.endcredit.presets.saveAs(name)
    setSavedAt(Date.now())
    setDirty(false)
    return true
  }, [saveNow, dlg])

  /**
   * 지금 문서를 다른 것으로 갈아끼운다.
   *
   *   empty   — 완전히 빈 문서 (새로 시작)
   *   default — 기본 구성 (수다왕·별풍선 … 8장이 미리 깔린 것)
   *
   * 자동 백업이 남긴 하지만 사용자는 그걸 모른다. 되돌릴 수 없다고 느끼는 동작이므로
   * **저장할 기회를 먼저 준다.**
   */
  const replaceDoc = useCallback(
    async (mode: 'empty' | 'default') => {
      const isNew = mode === 'empty'
      if (dirty) {
        const verb = isNew ? '새로 시작' : '되돌리기'
        const answer = await dlg.confirm({
          title: isNew ? '새로 시작할까요?' : '기본 구성으로 되돌릴까요?',
          message: '지금 문서를 이름 붙여 저장한 적이 없습니다.',
          detail:
            (isNew
              ? '새로 시작하면 슬라이드가 전부 사라지고 빈 화면 한 장만 남습니다.'
              : '지금 구성이 지워지고 기본 슬라이드로 바뀝니다.') +
            '\n(만약을 위해 자동 백업은 저장 폴더에 남습니다)',
          buttons: [`저장하고 ${verb}`, `저장 안 하고 ${verb}`, '취소'],
          dangerIndex: 1,
          cancelIndex: 2
        })
        if (answer === 2) return
        if (answer === 0 && !(await saveAs())) return
      }

      const r = isNew
        ? await window.endcredit.overlay.newDeck()
        : await window.endcredit.overlay.resetDeck()
      past.current = []
      future.current = []
      setHistLen({ past: 0, future: 0 })
      applyDeck(r.deck)
      setSlideIdx(0)
      setSelected([])
      setDirty(false)
    },
    [dirty, dlg, saveAs, applyDeck]
  )

  const startNew = useCallback(() => replaceDoc('empty'), [replaceDoc])
  const resetToDefault = useCallback(() => replaceDoc('default'), [replaceDoc])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev || !deckRef.current) return
    future.current.push(deckRef.current)
    lastPush.current = 0
    setHistLen({ past: past.current.length, future: future.current.length })
    applyDeck(prev)
    setSelected([])
  }, [applyDeck])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next || !deckRef.current) return
    past.current.push(deckRef.current)
    lastPush.current = 0
    setHistLen({ past: past.current.length, future: future.current.length })
    applyDeck(next)
    setSelected([])
  }, [applyDeck])

  const cw = deck?.canvas.width ?? 1920
  const ch = deck?.canvas.height ?? 1080
  const slide = deck?.slides[slideIdx] ?? null
  // 만든 효과의 id·이름·분류만 모은 표식 — 키프레임까지 넣으면 손잡이를 끌 때마다 바뀐다
  const customStamp = (deck?.effects ?? []).map((f) => `${f.id}:${f.name}:${f.category}`).join('|')
  const ratio = slide ? slideHeightRatio(slide) : 1

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    const measure = (): void => {
      const pad = 56
      setFitScale(
        Math.max(
          MIN_SCALE,
          Math.min((area.clientWidth - pad) / cw, (area.clientHeight - pad) / (ch * ratio), 1.5)
        )
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(area)
    return () => ro.disconnect()
  }, [cw, ch, ratio])

  const scale = zoom === 'fit' ? fitScale : zoom
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  /**
   * 확대·축소는 **가리키고 있는 곳을 붙잡은 채** 일어나야 한다.
   *
   * 배율만 바꾸면 캔버스가 왼쪽 위에서부터 커지므로, 커서 밑에 있던 지점이 계속
   * 화면 밖으로 밀려난다 — 확대할수록 보고 싶던 자리에서 멀어지는 셈이다.
   * 배율을 바꾸기 전에 "커서가 캔버스의 어느 지점을 가리키는지"를 기억해 두고,
   * 다시 그린 뒤 그 지점이 같은 화면 좌표에 오도록 스크롤을 민다.
   */
  const zoomAnchor = useRef<{ clientX: number; clientY: number; u: number; v: number } | null>(null)

  const zoomByFactor = useCallback((factor: number, at?: { x: number; y: number }) => {
    const before = scaleRef.current
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, before * factor))
    if (next === before) return

    const el = canvasRef.current
    const area = areaRef.current
    if (el && area) {
      // 기준점이 없으면(막대의 ＋/− 버튼) 보이는 영역 한가운데를 잡는다
      const box = area.getBoundingClientRect()
      const px = at?.x ?? box.left + box.width / 2
      const py = at?.y ?? box.top + box.height / 2
      const c = el.getBoundingClientRect()
      zoomAnchor.current = {
        clientX: px,
        clientY: py,
        u: (px - c.left) / before,
        v: (py - c.top) / before
      }
    }
    setZoom(next)
  }, [])

  // 다시 그린 **직후에** 스크롤을 보정한다 (그리기 전에는 새 위치를 알 수 없다)
  useLayoutEffect(() => {
    const a = zoomAnchor.current
    zoomAnchor.current = null
    const el = canvasRef.current
    const area = areaRef.current
    if (!a || !el || !area) return

    const c = el.getBoundingClientRect()
    area.scrollLeft += c.left + a.u * scale - a.clientX
    area.scrollTop += c.top + a.v * scale - a.clientY
  }, [scale])

  /** 조기 return 뒤에 정의되는 동작들을 키 핸들러에서 쓰기 위한 통로 */
  const actionsRef = useRef<{
    del: () => void
    dup: () => void
    dupInPlace: () => void
    copy: () => void
    cut: () => void
    paste: () => void
    clear: () => void
    group: () => void
    ungroup: () => void
    selectAll: () => void
    undo: () => void
    redo: () => void
    transform: () => void
    save: () => void
    saveAs: () => void
    help: () => void
    nudge: (key: string, big: boolean) => void
    newDeck: () => void
  } | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const a = document.activeElement
      if (
        a instanceof HTMLInputElement ||
        a instanceof HTMLTextAreaElement ||
        a instanceof HTMLSelectElement ||
        (a as HTMLElement | null)?.isContentEditable
      ) {
        return
      }
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (e.key === 'F1') {
        e.preventDefault()
        actionsRef.current?.help()
        return
      }
      if (ctrl && k === 's') {
        e.preventDefault()
        if (e.shiftKey) actionsRef.current?.saveAs()
        else actionsRef.current?.save()
        return
      }
      if (ctrl && k === 'n') {
        e.preventDefault()
        actionsRef.current?.newDeck()
        return
      }
      if (ctrl && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) actionsRef.current?.redo()
        else actionsRef.current?.undo()
        return
      }
      if (ctrl && k === 'y') {
        e.preventDefault()
        actionsRef.current?.redo()
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        actionsRef.current?.del()
      } else if (ctrl && k === 'd') {
        e.preventDefault()
        actionsRef.current?.dup()
      } else if (ctrl && k === 'j') {
        // 제자리 복제 — 위치를 그대로 두고 겹쳐 만든다
        e.preventDefault()
        actionsRef.current?.dupInPlace()
      } else if (ctrl && k === 'c') {
        e.preventDefault()
        actionsRef.current?.copy()
      } else if (ctrl && k === 'x') {
        e.preventDefault()
        actionsRef.current?.cut()
      } else if (ctrl && k === 'v') {
        e.preventDefault()
        actionsRef.current?.paste()
      } else if (ctrl && k === 't') {
        e.preventDefault()
        actionsRef.current?.transform()
      } else if (ctrl && k === 'g') {
        e.preventDefault()
        // Ctrl+G 로 묶고, 묶인 상태에서 다시 누르면 풀린다
        actionsRef.current?.group()
      } else if (ctrl && k === 'a') {
        e.preventDefault()
        actionsRef.current?.selectAll()
      } else if (e.key.startsWith('Arrow')) {
        // 선택이 있으면 미세 이동, 없으면 슬라이드 넘기기 — 파워포인트와 같은 감각
        e.preventDefault()
        actionsRef.current?.nudge(e.key, e.shiftKey)
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        // 변형 중이면 변형만 끝낸다. 선택은 유지 — 바로 다시 손보고 싶을 때가 많다
        actionsRef.current?.clear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const nav = useCanvasNav({
    onPan: (dx, dy) => {
      const area = areaRef.current
      if (!area) return
      area.scrollLeft -= dx
      area.scrollTop -= dy
    },
    onZoomBy: zoomByFactor
  })

  if (!deck || !slide || !info) return <p className="mono">불러오는 중…</p>

  const selectedEls = slide.elements.filter((e) => selected.includes(e.id))
  const single = selectedEls.length === 1 ? selectedEls[0] : null

  function patchSlide(i: number, p: Partial<Slide>): void {
    update({ ...deck!, slides: deck!.slides.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  }

  function patchElements(ids: string[], p: Partial<SlideElement>): void {
    patchSlide(slideIdx, {
      elements: slide!.elements.map((e) =>
        ids.includes(e.id) ? ({ ...e, ...p } as SlideElement) : e
      )
    })
  }

  function patchFrames(frames: Record<string, Frame>): void {
    patchSlide(slideIdx, {
      elements: slide!.elements.map((e) => (frames[e.id] ? { ...e, frame: frames[e.id] } : e))
    })
  }

  /**
   * 요소 선택.
   * 그룹에 속한 요소를 고르면 **그룹 전체**가 잡힌다 (Alt 를 누르면 그 하나만).
   */
  function selectElement(id: string, opts: { additive?: boolean; alone?: boolean } = {}): void {
    const el = slide!.elements.find((e) => e.id === id)
    if (!el) return

    const ids =
      el.groupId && !opts.alone
        ? slide!.elements.filter((e) => e.groupId === el.groupId).map((e) => e.id)
        : [id]

    setSelected((prev) => {
      if (!opts.additive) return ids
      const has = ids.every((i) => prev.includes(i))
      return has ? prev.filter((i) => !ids.includes(i)) : [...new Set([...prev, ...ids])]
    })
  }

  /** 새 요소는 선택한 것 바로 다음에 넣는다 (선택이 없으면 맨 끝). */
  function addElement(el: SlideElement): void {
    const list = [...slide!.elements]
    const last = selected[selected.length - 1]
    const at = last ? list.findIndex((e) => e.id === last) + 1 : list.length
    list.splice(at, 0, el)
    patchSlide(slideIdx, { elements: list })
    setSelected([el.id])
    // 텍스트는 만들자마자 칠 수 있어야 한다 — 속성 패널까지 가서 고치게 하면 번거롭다
    if (el.kind === 'text') setEditingText(el.id)
  }

  /** 효과는 **선택한 모든 요소**에 걸린다. 그룹을 잡으면 그룹 전체가 함께 움직인다. */
  function applyEffect(ids: string[], effectId: string): void {
    const e = getEffect(effectId)
    patchSlide(slideIdx, {
      elements: slide!.elements.map((el) => {
        if (!ids.includes(el.id)) return el
        if (e.category === 'emphasis') {
          return { ...el, motion: { ...el.motion, loop: e.id, loopDurationMs: e.defaultDurationMs } }
        }
        // 퇴장 효과는 등장 자리를 덮지 않는다 — 둘을 함께 쓸 수 있어야 한다
        if (e.category === 'out') {
          return { ...el, motion: { ...el.motion, exit: e.id, exitDurationMs: e.defaultDurationMs } }
        }
        return {
          ...el,
          motion: {
            ...el.motion,
            preset: e.id,
            durationMs: e.defaultDurationMs,
            easing: e.defaultEasing,
            staggerMs: e.suggestStagger
          }
        }
      })
    })
    setSelected(ids)
  }

  /** 화면 효과는 요소가 아니라 **장 전체**에 걸린다. */
  function applyScreenFx(index: number, effectId: string): void {
    const e = getScreenEffect(effectId)
    if (!e) return
    const cur = deck!.slides[index].screen
    patchSlide(index, {
      screen: {
        effect: e.id,
        // 세기는 쓰던 값을 지킨다 — 효과만 바꿔보는 경우가 많다
        intensity: cur?.intensity ?? 100,
        durationMs: e.defaultDurationMs,
        delayMs: cur?.delayMs ?? 0
      }
    })
    setSlideIdx(index)
  }

  /**
   * 선택한 요소 정렬.
   *
   * 하나만 잡았으면 **캔버스 기준**, 여럿이면 **선택 영역 기준**으로 맞춘다.
   * 파워포인트와 같은 규칙이라 따로 설명하지 않아도 예상대로 동작한다.
   */
  function align(mode: AlignMode): void {
    if (selectedEls.length === 0) return
    const box =
      selectedEls.length > 1 ? boundingBox(selectedEls) : { x: 0, y: 0, w: 100, h: 100 }

    const frames: Record<string, Frame> = {}

    if (mode === 'hdist' || mode === 'vdist') {
      if (selectedEls.length < 3) return
      const horiz = mode === 'hdist'
      const sorted = [...selectedEls].sort((a, b) =>
        horiz ? a.frame.x - b.frame.x : a.frame.y - b.frame.y
      )
      // 양 끝은 고정하고 사이 간격을 고르게 나눈다
      const total = horiz ? box.w : box.h
      const used = sorted.reduce((sum, e) => sum + (horiz ? e.frame.w : e.frame.h), 0)
      const gap = (total - used) / (sorted.length - 1)

      let pos = horiz ? box.x : box.y
      for (const e of sorted) {
        frames[e.id] = horiz ? { ...e.frame, x: pos } : { ...e.frame, y: pos }
        pos += (horiz ? e.frame.w : e.frame.h) + gap
      }
    } else {
      for (const e of selectedEls) {
        const f = e.frame
        switch (mode) {
          case 'left':
            frames[e.id] = { ...f, x: box.x }
            break
          case 'hcenter':
            frames[e.id] = { ...f, x: box.x + (box.w - f.w) / 2 }
            break
          case 'right':
            frames[e.id] = { ...f, x: box.x + box.w - f.w }
            break
          case 'top':
            frames[e.id] = { ...f, y: box.y }
            break
          case 'vmiddle':
            frames[e.id] = { ...f, y: box.y + (box.h - f.h) / 2 }
            break
          case 'bottom':
            frames[e.id] = { ...f, y: box.y + box.h - f.h }
            break
        }
      }
    }

    patchFrames(frames)
  }

  function groupSelected(): void {
    if (selected.length < 2) return
    const gid = newId('g')
    const count = new Set(slide!.elements.map((e) => e.groupId).filter(Boolean)).size + 1

    patchSlide(slideIdx, {
      elements: slide!.elements.map((e) =>
        selected.includes(e.id) ? ({ ...e, groupId: gid } as SlideElement) : e
      ),
      groups: { ...(slide!.groups ?? {}), [gid]: { name: `그룹 ${count}` } }
    })
  }

  /** 묶음 설정 한 조각만 갈아끼운다. 이름을 고칠 때 효과가 날아가면 안 된다. */
  function patchGroup(gid: string, p: Partial<SlideGroup>): void {
    const cur = slide!.groups?.[gid] ?? { name: '' }
    patchSlide(slideIdx, { groups: { ...(slide!.groups ?? {}), [gid]: { ...cur, ...p } } })
  }

  function renameGroup(gid: string, name: string): void {
    patchGroup(gid, { name })
  }

  /**
   * 효과를 **묶음 자체**에 건다.
   *
   * 요소에 거는 것과 같은 규칙(등장·강조·퇴장이 서로를 덮지 않는다)을 쓰되,
   * 대상이 덩어리를 감싼 상자다 — 안의 요소 효과는 그대로 남는다.
   */
  function applyGroupEffect(gid: string, effectId: string): void {
    const e = getEffect(effectId)
    const m = groupMotion(slide!, gid) ?? { ...DEFAULT_MOTION }

    if (e.category === 'emphasis') {
      patchGroup(gid, { motion: { ...m, loop: e.id, loopDurationMs: e.defaultDurationMs } })
    } else if (e.category === 'out') {
      patchGroup(gid, { motion: { ...m, exit: e.id, exitDurationMs: e.defaultDurationMs } })
    } else {
      patchGroup(gid, {
        motion: {
          ...m,
          preset: e.id,
          durationMs: e.defaultDurationMs,
          easing: e.defaultEasing
        }
      })
    }
  }

  /** 이미 한 묶음이면 풀고, 아니면 묶는다. Ctrl+G 하나로 왕복한다. */
  function toggleGroup(): void {
    const ids = new Set(selectedEls.map((e) => e.groupId).filter(Boolean))
    const isOneGroup = selectedEls.length > 0 && ids.size === 1 && !ids.has(undefined as never)
    if (isOneGroup && selectedEls.every((e) => e.groupId)) ungroupSelected()
    else groupSelected()
  }

  function ungroupSelected(): void {
    if (selected.length === 0) return
    patchElements(selected, { groupId: null } as Partial<SlideElement>)
  }

  function deleteSelected(): void {
    if (selected.length === 0) return
    patchSlide(slideIdx, { elements: slide!.elements.filter((e) => !selected.includes(e.id)) })
    setSelected([])
    setTransforming(false)
  }

  /**
   * 요소를 새 id 로 복제한다.
   * 그룹은 **새 그룹 id 로 다시 묶어** 원본과 섞이지 않게 한다.
   */
  function cloneElements(
    src: SlideElement[],
    offset: number,
    srcGroups: Record<string, SlideGroup> = slide!.groups ?? {}
  ): { elements: SlideElement[]; groups: Record<string, SlideGroup> } {
    const gidMap = new Map<string, string>()
    const elements = src.map((e) => {
      let gid = e.groupId ?? null
      if (gid) {
        if (!gidMap.has(gid)) gidMap.set(gid, newId('g'))
        gid = gidMap.get(gid)!
      }
      return {
        ...structuredClone(e),
        id: newId(),
        groupId: gid,
        frame: { ...e.frame, x: e.frame.x + offset, y: e.frame.y + offset }
      }
    })

    // 이름·묶음 효과도 함께 복제한다 — 안 그러면 복사본만 이름 없는 맨 묶음이 된다
    const groups: Record<string, SlideGroup> = {}
    for (const [from, to] of gidMap) {
      const g = srcGroups[from]
      if (g) groups[to] = structuredClone(g)
    }
    return { elements, groups }
  }

  /**
   * `ids` 를 주면 그것을, 안 주면 지금 선택을 복제한다.
   *
   * setSelected 는 즉시 반영되지 않으므로, 목록의 복제 버튼처럼 "방금 누른 것"을
   * 복제해야 할 때는 반드시 id 를 넘겨야 한다. (안 그러면 직전 선택이 복제된다)
   */
  function duplicateSelected(offset = 3, ids: string[] = selected): void {
    if (ids.length === 0) return
    const copies = cloneElements(
      slide!.elements.filter((e) => ids.includes(e.id)),
      offset
    )
    patchSlide(slideIdx, {
      elements: [...slide!.elements, ...copies.elements],
      groups: { ...(slide!.groups ?? {}), ...copies.groups }
    })
    setSelected(copies.elements.map((c) => c.id))
  }

  /**
   * 화살표 키로 미세 이동.
   *
   * 캔버스 px 단위로 움직인다 — 확대 배율이 얼마든 "1px 옮겼다"가 같은 뜻이어야 한다.
   * Shift 를 누르면 10px 씩 (포토샵·파워포인트와 같다).
   */
  function nudgeSelection(key: string, big: boolean): void {
    if (selected.length === 0) {
      // 잡은 게 없으면 장을 넘긴다
      if (key === 'ArrowUp' || key === 'ArrowLeft') setSlideIdx((i) => Math.max(0, i - 1))
      if (key === 'ArrowDown' || key === 'ArrowRight')
        setSlideIdx((i) => Math.min(deck!.slides.length - 1, i + 1))
      return
    }
    const px = big ? 10 : 1
    const dx = key === 'ArrowLeft' ? -px : key === 'ArrowRight' ? px : 0
    const dy = key === 'ArrowUp' ? -px : key === 'ArrowDown' ? px : 0
    if (dx === 0 && dy === 0) return

    const frames: Record<string, Frame> = {}
    for (const e of selectedEls) {
      if (e.locked) continue
      frames[e.id] = { ...e.frame, x: e.frame.x + (dx / cw) * 100, y: e.frame.y + (dy / ch) * 100 }
    }
    if (Object.keys(frames).length > 0) patchFrames(frames)
  }

  /**
   * 겹침 순서 바꾸기.
   *
   * 목록의 **아래쪽일수록 앞(위)에 그려진다** — 나중에 그린 것이 위로 오기 때문이다.
   * 등장 순서와는 별개다 (그건 속성의 '등장 차례'에서 따로 정한다).
   */
  function reorderZ(mode: 'front' | 'forward' | 'backward' | 'back'): void {
    if (selected.length === 0) return
    const list = [...slide!.elements]
    const on = (e: SlideElement): boolean => selected.includes(e.id)

    if (mode === 'front' || mode === 'back') {
      const picked = list.filter(on)
      const rest = list.filter((e) => !on(e))
      patchSlide(slideIdx, {
        elements: mode === 'front' ? [...rest, ...picked] : [...picked, ...rest]
      })
      return
    }
    if (mode === 'forward') {
      // 뒤에서부터 밀어야 여러 개를 잡았을 때 서로 자리를 뺏지 않는다
      for (let i = list.length - 2; i >= 0; i--) {
        if (on(list[i]) && !on(list[i + 1])) [list[i], list[i + 1]] = [list[i + 1], list[i]]
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        if (on(list[i]) && !on(list[i - 1])) [list[i], list[i - 1]] = [list[i - 1], list[i]]
      }
    }
    patchSlide(slideIdx, { elements: list })
  }

  function copySelected(): void {
    if (selected.length === 0) return
    const elements = slide!.elements
      .filter((e) => selected.includes(e.id))
      .map((e) => structuredClone(e))
    const groups: Record<string, SlideGroup> = {}
    for (const e of elements) {
      const g = e.groupId ? slide!.groups?.[e.groupId] : null
      if (g && e.groupId) groups[e.groupId] = structuredClone(g)
    }
    clipboard.current = { elements, groups }
  }

  function cutSelected(): void {
    copySelected()
    deleteSelected()
  }

  /**
   * 붙여넣기.
   * **같은 슬라이드면 살짝 어긋나게**(가려지지 않게), 다른 슬라이드면 원래 자리 그대로.
   */
  function pasteClipboard(): void {
    const { elements, groups } = clipboard.current
    if (elements.length === 0) return
    const here = new Set(slide!.elements.map((e) => e.id))
    const sameSlide = elements.some((e) => here.has(e.id))
    const copies = cloneElements(elements, sameSlide ? 3 : 0, groups)
    patchSlide(slideIdx, {
      elements: [...slide!.elements, ...copies.elements],
      groups: { ...(slide!.groups ?? {}), ...copies.groups }
    })
    setSelected(copies.elements.map((c) => c.id))
  }

  /** 순위 목록 하나를 1·2·3등 개별 요소로 나눈다. */
  function splitRanks(id: string, count: number): void {
    const src = slide!.elements.find((e) => e.id === id)
    if (!src || src.kind !== 'data') return

    const items = Array.from({ length: count }, (_, i) => {
      const el = createRank(src.source, i + 1, {
        x: src.frame.x,
        y: src.frame.y + (i * src.frame.h) / count,
        w: src.frame.w,
        h: src.frame.h / count
      })
      el.showValue = src.showValue
      el.motion = { ...src.motion, delayMs: src.motion.delayMs + i * 200 }
      return el
    })

    const list = [...slide!.elements]
    const at = list.findIndex((e) => e.id === id)
    list.splice(at, 1, ...items)
    patchSlide(slideIdx, { elements: list })
    setSelected(items.map((i) => i.id))
  }

  /** 슬라이드 하나에 몰려 있는 요소들을 한 요소당 한 장으로 편다. */
  function splitSlideIntoSlides(index: number): void {
    const src = deck!.slides[index]
    if (src.elements.length <= 1) return

    const made: Slide[] = src.elements.map((el, i) => {
      const title = elementTitle(el) || `${src.name} ${i + 1}`

      if (el.kind === 'data' && RANK_SOURCES.has(el.source)) {
        const s = rankSlide(title, el.source, Math.max(1, Math.min(5, el.limit)))
        s.background = { ...src.background }
        s.elements = s.elements.map((e) =>
          e.kind === 'rank' ? { ...e, showValue: el.showValue } : e
        )
        return s
      }

      const s = createSlide(title)
      s.background = { ...src.background }
      s.holdMs = 3500
      s.elements = [{ ...el, id: newId(), frame: { ...el.frame, y: 30 } }]
      return s
    })

    const list = [...deck!.slides]
    list.splice(index, 1, ...made)
    update({ ...deck!, slides: list })
    setSlideIdx(index)
    setSelected([])
  }

  /** 지금 보고 있는 장의 효과를 한 번 재생한다. */
  function previewSlide(): void {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    setPreviewGen((g) => g + 1)
    setPreviewing(true)

    // 길이 계산은 한 곳(deck.ts)만 쓴다 — 미리보기가 짧으면 퇴장 효과를 못 본다
    const dur = slideDurationMs(slide!, ch)
    previewTimer.current = setTimeout(() => setPreviewing(false), dur + 400)
  }

  actionsRef.current = {
    del: deleteSelected,
    dup: () => duplicateSelected(3),
    dupInPlace: () => duplicateSelected(0),
    copy: copySelected,
    cut: cutSelected,
    paste: pasteClipboard,
    clear: () => {
      if (transforming) setTransforming(false)
      else setSelected([])
    },
    group: toggleGroup,
    ungroup: ungroupSelected,
    selectAll: () => setSelected(slide!.elements.map((e) => e.id)),
    undo,
    redo,
    transform: () => setTransforming((t) => (selected.length > 0 ? !t : false)),
    save: () => void saveNow(),
    saveAs: () => void saveAs(),
    newDeck: () => void startNew(),
    help: () => setHelp((h) => !h),
    nudge: nudgeSelection
  }

  /** 오른쪽 클릭 메뉴 항목. 선택 상태에 따라 달라진다. */
  function menuItems(): MenuItem[] {
    if (selected.length === 0) {
      return [
        {
          label: '붙여넣기',
          hint: 'Ctrl+V',
          disabled: clipboard.current.elements.length === 0,
          onClick: pasteClipboard
        },
        {
          label: '모두 선택',
          hint: 'Ctrl+A',
          onClick: () => setSelected(slide!.elements.map((e) => e.id))
        },
        { sep: true, label: '' },
        { label: '텍스트 추가', onClick: () => addElement(createText()) },
        { label: '이 장 재생', onClick: previewSlide }
      ]
    }
    const grouped = selectedEls.some((e) => e.groupId)
    return [
      ...(single && single.kind === 'text'
        ? [{ label: '글자 편집', hint: '두 번 클릭', onClick: () => setEditingText(single.id) }]
        : []),
      {
        label: transforming ? '자유 변형 끝내기' : '자유 변형',
        hint: 'Ctrl+T',
        onClick: () => setTransforming((t) => !t)
      },
      { sep: true, label: '' },
      { label: '잘라내기', hint: 'Ctrl+X', onClick: cutSelected },
      { label: '복사', hint: 'Ctrl+C', onClick: copySelected },
      {
        label: '붙여넣기',
        hint: 'Ctrl+V',
        disabled: clipboard.current.elements.length === 0,
        onClick: pasteClipboard
      },
      { label: '제자리 복제', hint: 'Ctrl+J', onClick: () => duplicateSelected(0) },
      { sep: true, label: '' },
      { label: '맨 앞으로', onClick: () => reorderZ('front') },
      { label: '앞으로', onClick: () => reorderZ('forward') },
      { label: '뒤로', onClick: () => reorderZ('backward') },
      { label: '맨 뒤로', onClick: () => reorderZ('back') },
      { sep: true, label: '' },
      {
        label: grouped ? '묶음 해제' : '묶기',
        hint: 'Ctrl+G',
        disabled: !grouped && selected.length < 2,
        onClick: toggleGroup
      },
      { label: '삭제', hint: 'Delete', danger: true, onClick: deleteSelected }
    ]
  }

  function openMenu(e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items: menuItems() })
  }

  /**
   * 빈 곳을 끌어 여러 개 잡기.
   *
   * Shift+클릭을 반복하는 것보다 빠르고, 어느 편집기에나 있는 동작이라
   * 없으면 "왜 안 되지" 하고 한 번 헤매게 된다. Shift 로 끌면 기존 선택에 더한다.
   */
  function startMarquee(e: React.PointerEvent<HTMLDivElement>): void {
    const box = e.currentTarget.getBoundingClientRect()
    const additive = e.shiftKey
    const toPct = (cx: number, cy: number): { x: number; y: number } => ({
      x: ((cx - box.left) / (cw * scale)) * 100,
      y: ((cy - box.top) / (ch * scale)) * 100
    })
    const from = toPct(e.clientX, e.clientY)
    const before = additive ? selected : []
    const pool = slide!.elements
    if (!additive) setSelected([])

    let moved = false
    const move = (ev: PointerEvent): void => {
      const to = toPct(ev.clientX, ev.clientY)
      const rect: Frame = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x),
        h: Math.abs(to.y - from.y)
      }
      // 살짝 떨린 클릭까지 범위 선택으로 보면 그냥 클릭이 안 된다
      if (rect.w > 0.4 || rect.h > 0.4) moved = true
      if (!moved) return

      setMarquee(rect)
      const hit = pool
        .filter((el) => el.visible && !el.locked && overlaps(el.frame, rect))
        .map((el) => el.id)
      setSelected([...new Set([...before, ...hit])])
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setMarquee(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** 선택한 텍스트 끝에 데이터 필드를 꽂는다. 텍스트가 아니면 새 텍스트를 만든다. */
  function insertField(token: string): void {
    if (single && single.kind === 'text') {
      const sep = single.text && !single.text.endsWith(' ') ? ' ' : ''
      patchElements([single.id], {
        text: `${single.text}${sep}{${token}}`
      } as Partial<SlideElement>)
      return
    }
    addTextField(token)
  }

  function addTextField(token: string, frame?: Partial<Frame>): void {
    const t = createText(`{${token}}`, { x: 20, y: 42, w: 60, h: 16, ...frame })
    addElement(t)
  }

  async function pickImage(id: string): Promise<void> {
    const asset = await window.endcredit.assets.pickImage()
    if (asset) patchElements([id], { src: asset.url } as Partial<SlideElement>)
  }

  /**
   * 효과 편집기를 **전용 창**으로 띄우고 결과를 기다린다.
   *
   * 덮개 상자로 두던 때는 키보드를 이 화면과 나눠 쓰게 되어 계속 부딪혔다 —
   * `Ctrl+Z` 는 효과가 아니라 문서를 되돌렸고, `Space` 는 캔버스 손도구가 먼저 가로챘다.
   * 창을 따로 띄우면 키가 통째로 그 창 것이 되고, 크레딧을 보면서 다듬을 수도 있다.
   */
  async function editEffect(fx: CustomEffect, fresh: boolean): Promise<void> {
    const r = await window.endcredit.fx.open(fx, fresh)
    if (r.action === 'save') saveEffect(r.effect)
    else if (r.action === 'delete') deleteEffect(r.effect.id)
  }

  /**
   * 만든 효과를 문서에 넣는다.
   *
   * 편집 중에는 창이 사본을 들고 있다가 저장할 때 한 번에 넘어온다 — 손잡이를 끄는 동안
   * 매번 문서를 고치면 되돌리기 기록이 수백 줄로 불어나고, 취소가 뜻을 잃는다.
   */
  function saveEffect(fx: CustomEffect): void {
    const list = effectsOf(deck!)
    const at = list.findIndex((f) => f.id === fx.id)
    const next = at >= 0 ? list.map((f) => (f.id === fx.id ? fx : f)) : [...list, fx]
    update({ ...deck!, effects: next })
    setFxDraft(null)
  }

  /**
   * 효과를 지운다. 쓰고 있던 요소는 **효과 없음**으로 되돌린다 —
   * 없는 id 를 남겨두면 재생할 때 조용히 페이드로 바뀌어, 왜 달라졌는지 알 수 없다.
   */
  function deleteEffect(id: string): void {
    const clean = (m: Motion): Motion => ({
      ...m,
      preset: m.preset === id ? 'none' : m.preset,
      loop: m.loop === id ? null : m.loop,
      exit: m.exit === id ? null : m.exit
    })
    update({
      ...deck!,
      effects: effectsOf(deck!).filter((f) => f.id !== id),
      slides: deck!.slides.map((s) => ({
        ...s,
        elements: s.elements.map((e) => ({ ...e, motion: clean(e.motion) })),
        groups: s.groups
          ? Object.fromEntries(
              Object.entries(s.groups).map(([gid, g]) => [
                gid,
                g.motion ? { ...g, motion: clean(g.motion) } : g
              ])
            )
          : s.groups,
        transition:
          s.transition?.preset === id ? { ...s.transition, preset: 'fade' } : s.transition
      }))
    })
    setFxDraft(null)
  }

  async function pickBackground(): Promise<void> {
    const asset = await window.endcredit.assets.pickImage()
    if (asset) patchSlide(slideIdx, { background: { ...slide!.background, image: asset.url } })
  }

  /** 배경을 모든 장에 똑같이. 장마다 파일을 고르게 하면 열 장짜리 크레딧이 고역이다. */
  function applyBackgroundToAll(): void {
    const bg = { ...slide!.background }
    update({ ...deck!, slides: deck!.slides.map((s) => ({ ...s, background: { ...bg } })) })
  }

  async function addImage(): Promise<void> {
    const asset = await window.endcredit.assets.pickImage()
    addElement(createImage(asset?.url ?? ''))
  }

  const busy = info.playing || previewing

  return (
    <div className="pp">
      <div className="ps-optionbar">
        <span className="ps-doc">
          {deck.name}
          {dirty && <i className="doc-dirty" title="이름 붙여 저장하지 않은 변경 사항" />}
        </span>
        <button onClick={() => void startNew()} title="빈 문서로 시작 (Ctrl+N)">
          새로 시작
        </button>
        <button onClick={() => setGallery(true)} title="템플릿에서 시작">
          템플릿
        </button>
        <DeckMenu
          onSaveAs={saveAs}
          onNew={startNew}
          onReset={resetToDefault}
          onAsk={dlg.confirm}
          onLoaded={(d) => {
            past.current = []
            future.current = []
            setHistLen({ past: 0, future: 0 })
            applyDeck(d)
            setSlideIdx(0)
            setSelected([])
            // 방금 불러온 그대로이므로 저장할 것이 없다
            setDirty(false)
          }}
        />

        <span className="undo-bar">
          <button disabled={histLen.past === 0} onClick={undo} title="되돌리기 (Ctrl+Z)">
            ↶
          </button>
          <button disabled={histLen.future === 0} onClick={redo} title="다시 실행 (Ctrl+Shift+Z)">
            ↷
          </button>
        </span>

        <SaveBadge savedAt={savedAt} onSave={() => void saveNow()} />
        <ConnectMenu />

        <div className="spacer" />
        <CollectorChip totals={info.data.totals} />
        {info.playing ? (
          <button onClick={() => window.endcredit.overlay.stop()}>■ 정지</button>
        ) : (
          <button className="primary" onClick={() => window.endcredit.overlay.play()}>
            ▶ 전체 재생
          </button>
        )}
        <button onClick={() => window.endcredit.overlay.restart()}>↻ 처음부터</button>
        <label className={`toggle ${info.sample ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={info.sample}
            onChange={(e) => window.endcredit.overlay.setSample(e.target.checked)}
          />
          샘플 데이터
        </label>
        <span className={`obs-chip ${info.clients > 0 ? 'on' : ''}`}>
          {info.clients > 0 ? `OBS ${info.clients}개` : 'OBS 없음'}
        </span>
      </div>

      <div
        className="pp-body"
        style={{ gridTemplateColumns: `${leftW}px 7px minmax(0, 1fr) 7px ${rightW}px` }}
      >
        <SlidePanel
          deck={deck}
          data={info.data}
          activeIndex={slideIdx}
          onSelect={(i) => {
            setSlideIdx(i)
            setSelected([])
          }}
          onAdd={(kind) => {
            const s = createSlide(
              kind === 'scroll' ? '스크롤' : `슬라이드 ${deck.slides.length + 1}`,
              kind
            )
            const list = [...deck.slides]
            list.splice(slideIdx + 1, 0, s)
            update({ ...deck, slides: list })
            setSlideIdx(slideIdx + 1)
            setSelected([])
          }}
          onDuplicate={(i) => {
            const copy: Slide = {
              ...structuredClone(deck.slides[i]),
              id: newId('s'),
              name: `${deck.slides[i].name} 복사본`
            }
            copy.elements = copy.elements.map((e) => ({ ...e, id: newId() }))
            const list = [...deck.slides]
            list.splice(i + 1, 0, copy)
            update({ ...deck, slides: list })
            setSlideIdx(i + 1)
          }}
          onDelete={(i) => {
            if (deck.slides.length <= 1) return
            const list = deck.slides.filter((_, k) => k !== i)
            update({ ...deck, slides: list })
            setSlideIdx(Math.max(0, Math.min(i, list.length - 1)))
            setSelected([])
          }}
          onReorder={(from, to) => {
            const list = [...deck.slides]
            const [m] = list.splice(from, 1)
            list.splice(to, 0, m)
            update({ ...deck, slides: list })
            setSlideIdx(to)
          }}
          onDropTransition={(i, effectId) => {
            const e = getEffect(effectId)
            patchSlide(i, {
              transition: { preset: e.id, durationMs: e.defaultDurationMs, easing: e.defaultEasing }
            })
            setSlideIdx(i)
          }}
          onDropScreenFx={applyScreenFx}
        />

        <Splitter axis="x" value={leftW} onChange={setLeftW} />

        <div className="pp-stage">
          <div className="pp-tools">
            <button onClick={() => addElement(createText())}>
              <b>T</b>
              <span className="lbl">텍스트</span>
            </button>
            <button onClick={addImage}>
              <b>🖼</b>
              <span className="lbl">이미지</span>
            </button>
            <button onClick={() => addElement(createData())}>
              <b>#</b>
              <span className="lbl">순위 목록</span>
            </button>
            <button onClick={() => addElement(createRank('chatRank', 1))}>
              <b>①</b>
              <span className="lbl">등수 하나</span>
            </button>
            <button onClick={() => addElement(createShape())}>
              <b>▬</b>
              <span className="lbl">도형</span>
            </button>

            <span className="pp-div" />

            <span className="align-bar">
              {ALIGN_BUTTONS.map((a) => (
                <button
                  key={a.mode}
                  disabled={
                    selectedEls.length === 0 ||
                    ((a.mode === 'hdist' || a.mode === 'vdist') && selectedEls.length < 3)
                  }
                  title={`${a.label}${
                    selectedEls.length > 1 ? ' (선택 영역 기준)' : ' (캔버스 기준)'
                  }`}
                  onClick={() => align(a.mode)}
                >
                  {a.icon}
                </button>
              ))}
            </span>

            <span className="pp-div" />

            <button
              disabled={selected.length < 2 && !selectedEls.some((e) => e.groupId)}
              className={selectedEls.some((e) => e.groupId) ? 'active' : ''}
              onClick={toggleGroup}
              title="묶기 / 묶음 해제 (Ctrl+G)"
            >
              <b>▣</b>
              <span className="lbl">
                {selectedEls.some((e) => e.groupId) ? '묶음 해제' : '묶기'}
              </span>
            </button>
            <button
              className={transforming ? 'active' : ''}
              disabled={selected.length === 0}
              onClick={() => setTransforming((t) => !t)}
              title="자유 변형 — 크기·위치 손잡이 (Ctrl+T)"
            >
              <b>⤡</b>
              <span className="lbl">자유 변형</span>
            </button>
            <button className="primary" onClick={previewSlide} title="이 장의 효과를 재생해 봅니다">
              <b>▶</b>
              <span className="lbl">이 장 재생</span>
            </button>
            <button
              disabled={selected.length === 0}
              onClick={deleteSelected}
              title="선택 삭제 (Delete)"
            >
              <b>🗑</b>
              <span className="lbl">삭제</span>
            </button>

            <div className="spacer" />
            <button className="help-btn" onClick={() => setHelp(true)} title="도움말 (F1)">
              ?<span className="lbl"> 도움말</span>
            </button>
            <span className="mono pp-hint">
Ctrl+T 자유 변형 · 두 번 클릭 글자 편집 · 화살표 미세 이동 · 빈 곳 끌어 범위 선택 · 오른쪽 클릭 메뉴
            </span>
          </div>

          <div className="ps-area" ref={areaRef} onWheel={nav.handlers.onWheel}>
            <div
              ref={canvasRef}
              className={`ps-canvas nav-${nav.mode}`}
              style={{ width: cw * scale, height: ch * ratio * scale }}
              onDragOver={(e) => {
                const t = e.dataTransfer.types
                if (t.includes(FIELD_DRAG_TYPE) || t.includes(SCREEN_FX_DRAG_TYPE)) {
                  e.preventDefault()
                }
              }}
              onDrop={(e) => {
                // 화면 효과는 장 전체에 걸린다 — 캔버스 아무 데나 놓으면 된다
                const fx = e.dataTransfer.getData(SCREEN_FX_DRAG_TYPE)
                if (fx) {
                  e.preventDefault()
                  return applyScreenFx(slideIdx, fx)
                }
                const token = e.dataTransfer.getData(FIELD_DRAG_TYPE)
                if (!token) return
                e.preventDefault()
                // 놓은 자리에 만든다 — 끌어다 놓은 위치가 곧 배치다
                const r = e.currentTarget.getBoundingClientRect()
                const x = ((e.clientX - r.left) / (cw * scale)) * 100
                const y = ((e.clientY - r.top) / (ch * scale)) * 100
                addTextField(token, {
                  x: Math.max(0, Math.min(70, x - 15)),
                  y: Math.max(0, Math.min(92, y - 4)),
                  w: 30,
                  h: 8
                })
              }}
              onContextMenu={openMenu}
              onPointerDown={(e) => {
                nav.handlers.onPointerDown(e)
                if (nav.mode !== 'none' || e.button !== 0) return
                if (e.target === e.currentTarget) startMarquee(e)
              }}
            >
              <div
                className="ps-canvas-inner"
                style={{ width: cw, height: ch * ratio, transform: `scale(${scale})` }}
              >
                {/* 전체 재생 중이면 실제 재생을 따라가고, 아니면 이 장만 보여준다 */}
                <DeckRenderer
                  deck={deck}
                  data={info.data}
                  playing={busy}
                  generation={info.playing ? info.generation : previewGen}
                  slideIndex={info.playing ? null : slideIdx}
                  hideElementId={editingText}
                  /* OBS 가 붙어 있으면 소리는 그쪽에 맡긴다 — 둘 다 울리면 두 번 들린다 */
                  audio={previewing || (info.playing && info.clients === 0)}
                  onFinished={() => window.endcredit.overlay.finished(info.generation)}
                />
              </div>

              {!busy &&
                slide.elements.map((el) =>
                  el.visible && !el.locked ? (
                    <span
                      key={el.id}
                      className={`pp-hit ${selected.includes(el.id) ? 'on' : ''}`}
                      style={{
                        left: (el.frame.x / 100) * cw * scale,
                        top: (el.frame.y / 100) * ch * scale,
                        width: (el.frame.w / 100) * cw * scale,
                        height: (el.frame.h / 100) * ch * scale,
                        // 요소가 돌아가 있으면 클릭판도 같이 돈다
                        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined
                      }}
                      onPointerDown={(e) => {
                        if (nav.mode !== 'none' || e.button !== 0) return
                        e.stopPropagation()
                        selectElement(el.id, { additive: e.shiftKey, alone: e.altKey })
                      }}
                      onContextMenu={(e) => {
                        // 안 잡힌 것을 오른쪽 클릭하면 먼저 잡고 연다 — 메뉴가 엉뚱한 데 걸리지 않게
                        if (!selected.includes(el.id)) selectElement(el.id)
                        openMenu(e)
                      }}
                      onDoubleClick={(e) => {
                        if (el.kind !== 'text') return
                        e.stopPropagation()
                        setEditingText(el.id)
                      }}
                    />
                  ) : null
                )}

              {marquee && (
                <span
                  className="marquee"
                  style={{
                    left: (marquee.x / 100) * cw * scale,
                    top: (marquee.y / 100) * ch * scale,
                    width: (marquee.w / 100) * cw * scale,
                    height: (marquee.h / 100) * ch * scale
                  }}
                />
              )}

              {guides.map((g, i) => (
                <span
                  key={`${g.axis}-${g.at}-${i}`}
                  className={`snap-guide ${g.axis}`}
                  style={
                    g.axis === 'x'
                      ? { left: (g.at / 100) * cw * scale }
                      : { top: (g.at / 100) * ch * scale }
                  }
                />
              ))}

              {editingText &&
                (() => {
                  const t = slide.elements.find((e) => e.id === editingText)
                  if (!t || t.kind !== 'text') return null
                  return (
                    <div
                      className="rt-wrap"
                      style={{
                        left: (t.frame.x / 100) * cw * scale,
                        top: (t.frame.y / 100) * ch * scale,
                        width: (t.frame.w / 100) * cw * scale,
                        height: (t.frame.h / 100) * ch * scale
                      }}
                    >
                      <RichTextEditor
                        key={t.id}
                        el={t}
                        fontFamily={t.style.fontFamily || deck.font.family}
                        scale={scale}
                        onChange={(patch) =>
                          patchElements([t.id], patch as Partial<SlideElement>)
                        }
                        onDone={() => setEditingText(null)}
                      />
                    </div>
                  )
                })()}

              {!busy && !editingText && nav.mode === 'none' && single && (
                <SelectionBox
                  element={single}
                  transform={transforming}
                  others={slide.elements.filter((e) => e.id !== single.id && e.visible)}
                  canvasW={cw}
                  canvasH={ch}
                  scale={scale}
                  onChange={(frame: Frame) => patchElements([single.id], { frame })}
                  onRotate={(rotation) => patchElements([single.id], { rotation })}
                  onCommit={() => window.endcredit.overlay.setDeck(deck)}
                  onGuides={setGuides}
                  onDoubleClick={() => single.kind === 'text' && setEditingText(single.id)}
                />
              )}

              {!busy && !editingText && nav.mode === 'none' && selectedEls.length > 1 && (
                <MultiSelectionBox
                  elements={selectedEls}
                  transform={transforming}
                  others={slide.elements.filter((e) => !selected.includes(e.id) && e.visible)}
                  canvasW={cw}
                  canvasH={ch}
                  scale={scale}
                  onChange={patchFrames}
                  onCommit={() => window.endcredit.overlay.setDeck(deck)}
                  onGuides={setGuides}
                />
              )}
            </div>
          </div>

          <div className="ps-statusbar">
            <button onClick={() => zoomByFactor(1 / 1.25)}>−</button>
            <span className="ps-zoom">{Math.round(scale * 100)}%</span>
            <button onClick={() => zoomByFactor(1.25)}>＋</button>
            <button className={zoom === 'fit' ? 'active' : ''} onClick={() => setZoom('fit')}>
              화면맞춤
            </button>
            <button onClick={() => setZoom(1)}>100%</button>
            <div className="spacer" />
            <span className="mono">
              {slide.name} · {cw}×{Math.round(ch * ratio)}
              {selected.length > 0 && ` · ${selected.length}개 선택`}
              {nav.mode === 'hand' ? ' · 손도구' : nav.mode === 'zoom' ? ' · 돋보기' : ''}
            </span>
            {/* 아웃트로 음악 안에 끝나야 하는 경우가 많다 — 총 길이가 보여야 맞출 수 있다 */}
            <span className="len-chip" title="이 장 길이 · 크레딧 전체 길이">
              이 장 {formatDuration(slideDurationMs(slide, ch))} · 전체{' '}
              <b>{formatDuration(deckDurationMs(deck))}</b>
            </span>
          </div>
        </div>

        <Splitter axis="x" value={rightW} onChange={setRightW} invert />

        <Inspector
          slide={slide}
          selectedIds={selected}
          onSelect={selectElement}
          onPatch={(p) => patchElements(selected, p)}
          onPatchSlide={(p) => patchSlide(slideIdx, p)}
          onToggle={(id, on) => patchElements([id], { visible: on })}
          onDelete={(id) => {
            patchSlide(slideIdx, { elements: slide.elements.filter((e) => e.id !== id) })
            setSelected((prev) => prev.filter((i) => i !== id))
          }}
          onDuplicate={(id) => duplicateSelected(3, [id])}
          onReorder={(from, to) => {
            const list = [...slide.elements]
            const [m] = list.splice(from, 1)
            list.splice(to, 0, m)
            patchSlide(slideIdx, { elements: list })
          }}
          onDropEffect={(id, effectId) => applyEffect([id], effectId)}
          onPickImage={() => single && pickImage(single.id)}
          onSplitRanks={splitRanks}
          onSplitSlide={() => splitSlideIntoSlides(slideIdx)}
          canSplitSlide={slide.elements.length > 1}
          onGroup={toggleGroup}
          onUngroup={ungroupSelected}
          onRenameGroup={renameGroup}
          onPatchGroup={patchGroup}
          onDropGroupEffect={applyGroupEffect}
          onPickBackground={pickBackground}
          onApplyBackgroundToAll={applyBackgroundToAll}
          onScreenFx={(fx: ScreenFx | null) => patchSlide(slideIdx, { screen: fx })}
          data={info.data}
        />
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}

      {dlg.node}

      {/* 만든 효과의 키프레임 — 캔버스·썸네일·라이브러리 타일이 다 같은 정의를 쓴다 */}
      <CustomEffectStyles deck={deck} />

      {help && <HelpModal onClose={() => setHelp(false)} />}

      {gallery && (
        <TemplateGallery
          onClose={() => setGallery(false)}
          onPick={(d) => {
            // update() 로 넣어야 되돌리기 기록에 남는다 — 실수로 골라도 Ctrl+Z 로 복구된다
            update(d)
            setSlideIdx(0)
            setSelected([])
            setGallery(false)
          }}
        />
      )}

      <Splitter axis="y" value={libH} onChange={setLibH} invert />

      <div className="dock-wrap" style={{ height: libH, flex: 'none', minHeight: 0 }}>
        <div className="dock-tabs">
          <button
            className={dock === 'effects' ? 'active' : ''}
            onClick={() => setDock('effects')}
          >
            효과
          </button>
          <button className={dock === 'fields' ? 'active' : ''} onClick={() => setDock('fields')}>
            데이터 필드
          </button>
          <button className={dock === 'audio' ? 'active' : ''} onClick={() => setDock('audio')}>
            소리
          </button>
        </div>

        {dock === 'audio' ? (
          <AudioPanel
            deck={deck}
            slide={slide}
            slideName={slide.name || `슬라이드 ${slideIdx + 1}`}
            onDeckAudio={(audio: DeckAudio) => update({ ...deck, audio })}
            onSlideSound={(sound: AudioClip | null) => patchSlide(slideIdx, { sound })}
          />
        ) : dock === 'effects' ? (
          <EffectLibrary
            targetName={
              selected.length > 1 ? `선택한 ${selected.length}개` : single ? '선택한 요소' : null
            }
            slideName={slide.name || `슬라이드 ${slideIdx + 1}`}
            onApply={(effectId) => selected.length > 0 && applyEffect(selected, effectId)}
            onApplyScreen={(effectId) => applyScreenFx(slideIdx, effectId)}
            onNewEffect={(category) => void editEffect(newCustomEffect(category), true)}
            onEditEffect={(id) => {
              const found = effectsOf(deck).find((f) => f.id === id)
              // 예전 모양으로 저장된 것도 트랙으로 옮겨서 연다
              if (found) void editEffect(normalize(structuredClone(found)), false)
            }}
            customStamp={customStamp}
          />
        ) : (
          <FieldPanel
            data={info.data}
            targetName={single && single.kind === 'text' ? '선택한 텍스트' : null}
            onInsert={insertField}
            onAddText={(t) => addTextField(t)}
            sample={info.sample}
            onEnableSample={() => window.endcredit.overlay.setSample(true)}
          />
        )}
      </div>
    </div>
  )
}

/** 두 사각형이 조금이라도 겹치는지. 범위 선택은 "닿기만 해도" 잡는 쪽이 편하다. */
function overlaps(a: Frame, b: Frame): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** 자동 저장 표시 — 포토샵처럼 바꿀 때마다 저장되고 있다는 걸 보여준다. */
function SaveBadge({
  savedAt,
  onSave
}: {
  savedAt: number | null
  onSave: () => void
}): React.JSX.Element {
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])

  const sec = savedAt === null ? null : Math.floor((Date.now() - savedAt) / 1000)
  const when =
    sec === null ? '자동 저장' : sec < 5 ? '방금' : sec < 60 ? `${sec}초 전` : `${Math.floor(sec / 60)}분 전`

  return (
    <button
      className={`save-badge ${sec !== null && sec < 3 ? 'flash' : ''} ${savedAt ? '' : 'idle'}`}
      onClick={onSave}
      title="변경할 때마다 자동 저장됩니다. 눌러서 바로 저장 (Ctrl+S)"
    >
      {savedAt ? `저장됨 · ${when}` : '자동 저장'}
    </button>
  )
}

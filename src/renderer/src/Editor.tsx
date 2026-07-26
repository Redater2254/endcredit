import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeckRenderer } from '@shared/DeckRenderer'
import {
  createData,
  createImage,
  createRank,
  createShape,
  createSlide,
  createText,
  createTrain,
  DEFAULT_MOTION,
  delaysFor,
  docSlide,
  effectsOf,
  formatDuration,
  groupMotion,
  makeSmart,
  newId,
  rankSlide,
  resizeDeckCanvas,
  slideDurationMs,
  slideHeightRatio,
  smartInstances,
  smartsOf,
  smartUses,
  unpackSmart,
  type AudioClip,
  type Deck,
  type DeckAudio,
  type Frame,
  type Motion,
  type Slide,
  type SlideElement,
  type ShapeElement,
  type SlideGroup,
  type SmartDoc
} from '@shared/deck'
import { getEffect } from '@shared/effects'
import { getScreenEffect, type ScreenFx } from '@shared/screen-fx'
import type { OverlayInfo } from '@shared/overlay'
import { EffectLibrary, SCREEN_FX_DRAG_TYPE, SPECIAL_DRAG_TYPE } from './EffectLibrary'
import { EffectEditor } from './EffectEditor'
import { newCustomEffect, normalize, type CustomEffect } from '@shared/custom-effect'
import { CustomEffectStyles } from '@shared/useCustomEffects'
import { FieldPanel, FIELD_DRAG_TYPE } from './FieldPanel'
import { SlidePanel } from './SlidePanel'
import { Inspector, type LayerCmd } from './Inspector'
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

/** 캔버스에서 마우스가 무엇을 하는지. `draw` 는 도형을 끌어 그리는 중. */
type Tool = 'move' | 'lasso' | 'draw'

/** 캔버스에 끌어다 놓을 수 있는 그림 파일 (main 의 `IMAGE_EXTS` 와 같아야 한다) */
const IMAGE_DROP = /\.(png|jpe?g|gif|webp|svg|apng)$/i

/**
 * 그림의 원래 가로:세로.
 *
 * 놓자마자 상자를 비율대로 잡아주려면 실제 크기를 알아야 한다. 못 읽으면 4:3 으로 둔다
 * — 파일 하나 때문에 놓기가 통째로 실패하는 것보다 낫다.
 */
function imageRatio(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight))
    img.onerror = () => resolve(4 / 3)
    img.src = url
  })
}

/** 도형 도구가 그릴 수 있는 종류 (도구 막대 · 단축키 R 로 돌려가며 고른다) */
const SHAPE_KINDS: { value: ShapeElement['shape']; label: string; icon: string }[] = [
  { value: 'rect', label: '사각형', icon: '▭' },
  { value: 'ellipse', label: '타원', icon: '◯' },
  { value: 'line', label: '선', icon: '━' }
]

/** 요소에서 사람이 읽을 이름을 뽑는다. 슬라이드 이름으로 쓴다. */
function elementTitle(el: SlideElement): string {
  if (el.kind === 'data') return el.title || el.name
  if (el.kind === 'text') return el.text.slice(0, 20)
  if (el.kind === 'rank') return `${el.rank}등`
  if (el.kind === 'image') return '이미지'
  return el.name
}

/**
 * 병합할 때 요소 안의 `<img>` 를 data URL 로 바꿔 넣는다.
 *
 * SVG(foreignObject)를 이미지로 그릴 때, 그 안의 **외부 주소 이미지는 로드되지 않는다**
 * (보안상). 미리 같은-출처(localhost)에서 받아 data URL 로 심어야 그림에 찍힌다.
 */
async function inlineImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || src.startsWith('data:')) return
      try {
        const res = await fetch(src)
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader()
          fr.onload = () => resolve(fr.result as string)
          fr.onerror = reject
          fr.readAsDataURL(blob)
        })
        img.setAttribute('src', dataUrl)
      } catch {
        /* 못 받으면 그 이미지는 빈 채로 둔다 — 병합 자체는 계속 진행한다 */
      }
    })
  )
}

/** 점이 다각형 안에 있는지 — 올가미 선택 판정 (표준 광선 투사). */
function pointInPolygon(
  p: { x: number; y: number },
  poly: { x: number; y: number }[]
): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
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
  /** 효과만 따로 복사해 다른 레이어에 붙이는 보관함 (포토샵 '레이어 스타일 붙여넣기'). */
  const [effectClip, setEffectClip] = useState<Motion | null>(null)
  /** 빈 곳을 끌어 범위로 잡기 (캔버스 % 좌표) */
  const [marquee, setMarquee] = useState<Frame | null>(null)
  /**
   * 현재 도구. 올가미(L)·도형(R)은 손도구(Space)와 달리 **눌러서 유지되는 모드**다 —
   * 포토샵처럼 도구를 골라두면 다음 도구를 고를 때까지 그대로다.
   * 다만 도형은 하나 그리고 나면 이동으로 돌아온다 (파워포인트·피그마와 같다).
   */
  const [tool, setTool] = useState<Tool>('move')
  /** 도형 도구가 그릴 종류. 도구를 켜 둔 동안 도구 막대에서 바꾼다 */
  const [drawKind, setDrawKind] = useState<ShapeElement['shape']>('rect')
  /** 도형을 끌어 그리는 중인 상자 (캔버스 % 좌표) */
  const [drawBox, setDrawBox] = useState<Frame | null>(null)
  /** 탐색기에서 끌어온 파일이 캔버스 위에 떠 있는지 — 놓을 자리를 눈으로 알려준다 */
  const [fileOver, setFileOver] = useState(false)
  /**
   * 파고든 고급 개체들 (docId). 비어 있으면 슬라이드를 편집 중이다.
   *
   * 포토샵이 고급 개체를 두 번 누르면 별도 문서로 여는 것과 같다. 여기서는 같은 창에서
   * 캔버스만 그 개체의 캔버스로 통째로 바꾼다 — 툴바·요소칸·속성·효과가 그대로 쓰인다.
   */
  const [editPath, setEditPath] = useState<string[]>([])
  /**
   * 타임라인에서 찍어 본 시점 (크레딧 전체 기준 ms). null 이면 평소 편집 상태다.
   *
   * 3분짜리 크레딧에서 1분 40초 지점 효과 하나를 고치려고 매번 처음부터 재생하는 건
   * 고문이다 — 프리미어처럼 아무 데나 찍어 그 순간을 세워 놓고 볼 수 있어야 한다.
   */
  const [seek, setSeek] = useState<number | null>(null)
  /** 올가미로 그리는 중인 자유곡선 (캔버스 % 좌표). 그릴 때만 채워진다 */
  const [lasso, setLasso] = useState<{ x: number; y: number }[] | null>(null)

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

  const realSlide = deck?.slides[slideIdx] ?? null
  /** 격리 편집 중인 고급 개체 (가장 안쪽). 없으면 슬라이드를 편집 중이다. */
  const doc = editPath.length > 0 ? (deck?.smarts?.[editPath[editPath.length - 1]] ?? null) : null
  /**
   * **지금 편집 중인 화면.** 슬라이드이거나 고급 개체 안쪽이다.
   * 아래 편집 코드는 전부 이것만 본다 — 두 갈래로 나뉘면 반드시 어긋난다.
   */
  const slide = doc ? docSlide(doc) : realSlide
  const cw = doc ? doc.canvas.width : (deck?.canvas.width ?? 1920)
  const ch = doc ? doc.canvas.height : (deck?.canvas.height ?? 1080)
  // 만든 효과의 id·이름·분류만 모은 표식 — 키프레임까지 넣으면 손잡이를 끌 때마다 바뀐다
  const customStamp = (deck?.effects ?? []).map((f) => `${f.id}:${f.name}:${f.category}`).join('|')
  const ratio = doc ? 1 : slide ? slideHeightRatio(slide) : 1

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
    pickTool: (t: Tool) => void
    /** 도형 도구 — 이미 켜져 있으면 다음 종류로 넘어간다 (포토샵의 Shift+도구와 같은 감각) */
    shapeTool: () => void
    merge: () => void
  } | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const a = document.activeElement
      /**
       * 글자를 **치고 있는** 칸인지. 여기서는 브라우저의 원래 되돌리기가 맞다
       * (친 글자만 되돌아간다). 색 칸의 16진수 입력도 글자 입력이라 여기 든다.
       */
      const typing =
        a instanceof HTMLTextAreaElement ||
        Boolean((a as HTMLElement | null)?.isContentEditable) ||
        (a instanceof HTMLInputElement &&
          ['text', 'search', 'email', 'url', 'password'].includes(a.type))
      /** 값 조절 칸(슬라이더·숫자·목록·체크·색) 안에 있는지 */
      const inControl =
        typing ||
        a instanceof HTMLInputElement ||
        a instanceof HTMLSelectElement ||
        a instanceof HTMLTextAreaElement

      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      /*
       * 되돌리기·저장은 **속성창 안에서도** 통해야 한다.
       * 슬라이더를 만진 직후가 제일 되돌리고 싶은 순간인데, 그때 초점이 슬라이더에
       * 남아 있어 여태 Ctrl+Z 가 씹혔다. 슬라이더·목록·체크에는 브라우저의 되돌리기가
       * 아무 일도 하지 않으므로 우리 것이 받는 게 맞다.
       */
      if (ctrl && (k === 'z' || k === 'y') && !typing) {
        e.preventDefault()
        if (k === 'y' || e.shiftKey) actionsRef.current?.redo()
        else actionsRef.current?.undo()
        return
      }
      if (ctrl && k === 's') {
        e.preventDefault()
        if (e.shiftKey) actionsRef.current?.saveAs()
        else actionsRef.current?.save()
        return
      }

      if (inControl) return

      if (e.key === 'F1') {
        e.preventDefault()
        actionsRef.current?.help()
        return
      }
      if (ctrl && k === 'n') {
        e.preventDefault()
        actionsRef.current?.newDeck()
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
      } else if (ctrl && k === 'e') {
        // 포토샵과 같은 단축키 — 선택을 한 장의 이미지로 병합
        e.preventDefault()
        actionsRef.current?.merge()
      } else if (ctrl && k === 'a') {
        e.preventDefault()
        actionsRef.current?.selectAll()
      } else if (!ctrl && k === 'l') {
        // 올가미 도구 (포토샵과 같은 단축키)
        e.preventDefault()
        actionsRef.current?.pickTool('lasso')
      } else if (!ctrl && k === 'r') {
        // 도형 도구 (피그마와 같은 단축키). 연달아 누르면 사각형 → 타원 → 선
        e.preventDefault()
        actionsRef.current?.shapeTool()
      } else if (!ctrl && k === 'v') {
        // 이동/선택 도구로 되돌리기
        e.preventDefault()
        actionsRef.current?.pickTool('move')
      } else if (e.key.startsWith('Arrow')) {
        // 선택이 있으면 미세 이동, 없으면 슬라이드 넘기기 — 파워포인트와 같은 감각
        e.preventDefault()
        actionsRef.current?.nudge(e.key, e.shiftKey)
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        // 변형 중이면 변형만 끝낸다. 선택은 유지 — 바로 다시 손보고 싶을 때가 많다
        actionsRef.current?.clear()
        // Esc 는 올가미 같은 도구도 기본(이동)으로 되돌린다
        if (e.key === 'Escape') actionsRef.current?.pickTool('move')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * 캔버스 **밖**에 떨어진 파일은 조용히 무시한다.
   *
   * 막지 않으면 크로미움이 그 파일로 이동해 편집 화면이 통째로 사라진다.
   * 캔버스는 자기 자리에서 `preventDefault` 로 먼저 가로채므로 여기까지 오지 않는다.
   */
  useEffect(() => {
    const swallow = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  /**
   * 타임라인 구간과 전체 길이.
   *
   * 문서가 바뀔 때만 다시 센다 — 선택이나 도구를 바꿨다고 다시 셀 이유가 없다.
   * (조기 return 앞이라 훅 순서가 흔들리지 않게 여기서 계산한다)
   */
  const timeline = useMemo(() => {
    const segments: { idx: number; name: string; ms: number; start: number }[] = []
    let at = 0
    for (const [idx, s] of (deck?.slides ?? []).entries()) {
      if (!s.elements.some((e) => e.visible)) continue
      const ms = slideDurationMs(s, deck!.canvas.height, deck!.smarts)
      segments.push({ idx, name: s.name || `슬라이드 ${idx + 1}`, ms, start: at })
      at += ms
    }
    return { segments, totalMs: at }
  }, [deck])

  /** 지금 보고 있는 장의 길이 (상태바 표시용) */
  const thisSlideMs = useMemo(
    () => (realSlide && deck ? slideDurationMs(realSlide, deck.canvas.height, deck.smarts) : 0),
    [realSlide, deck]
  )

  /**
   * 되돌리기·불러오기로 편집 중이던 고급 개체가 사라졌으면 밖으로 나온다.
   * 없는 내용을 계속 편집하고 있는 상태가 제일 곤란하다.
   */
  useEffect(() => {
    if (editPath.length > 0 && !editPath.every((id) => deck?.smarts?.[id])) setEditPath([])
  }, [deck, editPath])

  const nav = useCanvasNav({
    onPan: (dx, dy) => {
      const area = areaRef.current
      if (!area) return
      area.scrollLeft -= dx
      area.scrollTop -= dy
    },
    onZoomBy: zoomByFactor
  })

  if (!deck || !slide || !realSlide || !info) return <p className="mono">불러오는 중…</p>

  const selectedEls = slide.elements.filter((e) => selected.includes(e.id))
  const single = selectedEls.length === 1 ? selectedEls[0] : null

  function patchSlide(i: number, p: Partial<Slide>): void {
    update({ ...deck!, slides: deck!.slides.map((s, k) => (k === i ? { ...s, ...p } : s)) })
  }

  /**
   * **지금 편집 중인 화면**의 내용을 갈아끼운다 — 슬라이드일 수도, 고급 개체 안쪽일 수도.
   *
   * 요소·묶음을 고치는 모든 길이 여기 하나로 모인다. 각자 `patchSlide` 를 부르면
   * 고급 개체 안에서 한 편집이 엉뚱하게 바깥 슬라이드에 쓰인다.
   */
  function patchView(p: Partial<Slide>, addSmarts?: Record<string, SmartDoc>): void {
    const smarts = addSmarts ? { ...smartsOf(deck!), ...addSmarts } : deck!.smarts
    if (doc) {
      const next: SmartDoc = { ...doc }
      if (p.elements) next.elements = p.elements
      if (p.groups) next.groups = p.groups
      if (p.order) next.order = p.order
      update({ ...deck!, smarts: { ...(smarts ?? {}), [doc.id]: next } })
      return
    }
    update({
      ...deck!,
      ...(smarts ? { smarts } : {}),
      slides: deck!.slides.map((s, k) => (k === slideIdx ? { ...s, ...p } : s))
    })
  }

  function patchElements(ids: string[], p: Partial<SlideElement>): void {
    patchView({
      elements: slide!.elements.map((e) =>
        ids.includes(e.id) ? ({ ...e, ...p } as SlideElement) : e
      )
    })
  }

  function patchFrames(frames: Record<string, Frame>): void {
    patchView({
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
    patchView({ elements: list })
    setSelected([el.id])
    // 텍스트는 만들자마자 칠 수 있어야 한다 — 속성 패널까지 가서 고치게 하면 번거롭다
    if (el.kind === 'text') setEditingText(el.id)
  }

  /** 특이 효과(기차 등)를 만든다 — 라이브러리 '특이 효과' 칸에서 끌거나 클릭할 때. */
  function addSpecial(id: string, frame?: Partial<Frame>): void {
    if (id === 'train') addElement(createTrain('chatRank', frame))
  }

  /**
   * 탐색기에서 캔버스로 끌어다 놓은 파일.
   *
   * 놓은 자리에 이미지 요소를 만든다. 경로가 아니라 **내용**을 보낸다 —
   * Electron 32 부터 렌더러에서 `File.path` 를 못 읽고, 어차피 에셋 폴더로 복사한다.
   * 그림의 원래 비율을 재서 상자를 잡는다. 안 그러면 세로 사진이 가로로 늘어난 것처럼
   * 보여서 놓자마자 크기부터 고쳐야 한다.
   */
  async function dropFiles(files: File[], at: { x: number; y: number }): Promise<void> {
    const images = files.filter((f) => IMAGE_DROP.test(f.name))
    if (images.length === 0) {
      if (files.length > 0) {
        void dlg.confirm({
          title: '이미지만 놓을 수 있습니다',
          message: 'png · jpg · gif · webp · svg 를 캔버스로 끌어다 놓으세요.',
          detail: '소리는 아래 “소리” 칸에서, 프리셋은 위 메뉴의 “가져오기” 로 넣습니다.',
          buttons: ['확인'],
          cancelIndex: 0
        })
      }
      return
    }

    const made: SlideElement[] = []
    for (const [i, f] of images.entries()) {
      const asset = await window.endcredit.assets.importBytes(f.name, await f.arrayBuffer())
      const ratio = await imageRatio(asset.url)
      // 캔버스 너비의 35% 를 기준으로 원래 비율만큼 높이를 잡는다
      const w = 35
      const h = (w * cw) / ratio / ch
      made.push(
        createImage(asset.url, {
          x: Math.max(0, Math.min(100 - w, at.x - w / 2 + i * 2)),
          y: Math.max(0, Math.min(100 - h, at.y - h / 2 + i * 2)),
          w,
          h
        })
      )
    }

    // 여러 장을 한 번에 놓아도 되돌리기 한 번이면 되도록 한꺼번에 넣는다
    const list = [...slide!.elements, ...made]
    patchView({ elements: list })
    setSelected(made.map((m) => m.id))
  }

  /**
   * 선택한 여러 요소를 **한 장의 이미지로 굽는다** (포토샵 '레이어 병합').
   *
   * 지금 보이는 모습 그대로 PNG 로 만들어 한 이미지 요소로 바꾼다. 데이터·효과는
   * 그 순간 값으로 고정되고 다시 못 쪼갠다(되돌리기는 됨). 캔버스와 **같은 렌더러**
   * (DeckRenderer)를 화면 밖에서 정지 상태로 한 번 더 그려 그걸 굽기 때문에, 글꼴·
   * 스타일이 화면과 어긋나지 않는다.
   */
  async function mergeIds(ids: string[]): Promise<void> {
    if (ids.length < 2 || !info) return
    const els = slide!.elements.filter((e) => ids.includes(e.id))
    if (els.length < 2) return

    // 선택한 것만, 배경·화면효과·소리 없이, 원래 좌표 그대로 담은 임시 문서
    // (고급 개체 안에서 구우면 그 개체의 캔버스가 기준이 된다)
    const tempDeck: Deck = {
      ...deck!,
      canvas: { width: cw, height: ch },
      slides: [
        {
          ...slide!,
          kind: 'static',
          background: { transparent: true, color: '#000000' },
          screen: null,
          sound: null,
          elements: els,
          groups: slide!.groups
        }
      ]
    }

    const host = document.createElement('div')
    host.style.cssText = 'position:fixed; left:-99999px; top:0; opacity:0; pointer-events:none;'
    const stage = document.createElement('div')
    stage.style.cssText = `width:${cw}px; height:${ch}px; position:relative; overflow:hidden;`
    host.appendChild(stage)
    document.body.appendChild(host)
    const root = createRoot(stage)

    try {
      root.render(
        <DeckRenderer
          deck={tempDeck}
          data={info.data}
          playing={false}
          generation={0}
          slideIndex={0}
          audio={false}
          onFinished={() => {}}
        />
      )
      // 두 프레임 기다려 정지 화면이 실제로 그려지게 한다
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      )
      await inlineImages(stage)

      const xml =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}">` +
        `<foreignObject width="100%" height="100%">` +
        new XMLSerializer().serializeToString(stage) +
        `</foreignObject></svg>`

      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('svg load failed'))
        img.src = svgUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const png = canvas.toDataURL('image/png')

      const asset = await window.endcredit.assets.saveImage(png)
      if (!asset) return

      // 병합 이미지는 선택 중 **가장 위**에 있던 자리에 놓는다 (겹침 순서 보존)
      const order = slide!.elements.map((e) => e.id)
      const maxPos = Math.max(...ids.map((id) => order.indexOf(id)))
      const remaining = slide!.elements.filter((e) => !ids.includes(e.id))
      const insertAt = remaining.filter((e) => order.indexOf(e.id) < maxPos).length
      const merged = createImage(asset.url, { x: 0, y: 0, w: 100, h: 100 })
      merged.name = '병합된 이미지'
      remaining.splice(insertAt, 0, merged)
      patchView({ elements: remaining })
      setSelected([merged.id])
      setTransforming(false)
    } catch (err) {
      console.error('레이어 병합 실패', err)
    } finally {
      root.unmount()
      host.remove()
    }
  }

  function mergeSelected(): void {
    void mergeIds(selected)
  }

  /** 효과는 **선택한 모든 요소**에 걸린다. 그룹을 잡으면 그룹 전체가 함께 움직인다. */
  function applyEffect(ids: string[], effectId: string): void {
    const e = getEffect(effectId)
    patchView({
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

    patchView({
      elements: slide!.elements.map((e) =>
        selected.includes(e.id) ? ({ ...e, groupId: gid } as SlideElement) : e
      ),
      groups: { ...(slide!.groups ?? {}), [gid]: { name: `그룹 ${count}` } }
    })
  }

  /** 묶음 설정 한 조각만 갈아끼운다. 이름을 고칠 때 효과가 날아가면 안 된다. */
  function patchGroup(gid: string, p: Partial<SlideGroup>): void {
    const cur = slide!.groups?.[gid] ?? { name: '' }
    patchView({ groups: { ...(slide!.groups ?? {}), [gid]: { ...cur, ...p } } })
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
    patchView({ elements: slide!.elements.filter((e) => !selected.includes(e.id)) })
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
    patchView({
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
      // 잡은 게 없으면 장을 넘긴다 (고급 개체 안에서는 넘길 장이 없다)
      if (doc) return
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
  function reorderZ(
    mode: 'front' | 'forward' | 'backward' | 'back',
    ids: string[] = selected
  ): void {
    if (ids.length === 0) return
    const list = [...slide!.elements]
    const on = (e: SlideElement): boolean => ids.includes(e.id)

    if (mode === 'front' || mode === 'back') {
      const picked = list.filter(on)
      const rest = list.filter((e) => !on(e))
      patchView({
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
    patchView({ elements: list })
  }

  function deleteIds(ids: string[]): void {
    if (ids.length === 0) return
    patchView({ elements: slide!.elements.filter((e) => !ids.includes(e.id)) })
    setSelected((prev) => prev.filter((i) => !ids.includes(i)))
    setTransforming(false)
  }

  // ── 고급 개체 ─────────────────────────────────────────────

  /**
   * 고른 것을 **고급 개체 한 줄로 접는다** (포토샵 '고급 개체로 변환').
   *
   * 내용은 문서 보관함으로 옮겨 가고 그 자리엔 개체 요소 하나만 남는다. 하나만 골라도 된다 —
   * 도형 한 장을 원본을 지키며 늘이고 싶을 때가 있다.
   */
  function smartify(ids: string[]): void {
    const els = slide!.elements.filter((e) => ids.includes(e.id))
    if (els.length === 0) return

    const count = Object.keys(smartsOf(deck!)).length + 1
    const { el, doc: made } = makeSmart(
      // 묶음은 안쪽으로 그대로 딸려간다 (이름·묶음 효과까지) — 접었다고 구조가 무너지면 안 된다
      els,
      slide!.groups ?? {},
      { width: cw, height: ch },
      `고급 개체 ${count}`,
      delaysFor(slide!)
    )

    // 접힌 자리는 **가장 위에 있던 것** 자리 — 겹침 순서가 튀지 않게
    const order = slide!.elements.map((e) => e.id)
    const top = Math.max(...ids.map((id) => order.indexOf(id)))
    const rest = slide!.elements.filter((e) => !ids.includes(e.id))
    rest.splice(rest.filter((e) => order.indexOf(e.id) < top).length, 0, el)

    patchView({ elements: rest }, { [made.id]: made })
    setSelected([el.id])
    setTransforming(false)
  }

  /**
   * 고급 개체를 그 자리에 **풀어놓는다**.
   * 보관함 항목은 남긴다 — 다른 자리가 같은 내용을 쓰고 있을 수 있다.
   */
  function unsmartify(id: string): void {
    const el = slide!.elements.find((e) => e.id === id)
    if (!el || el.kind !== 'smart') return
    const src = smartsOf(deck!)[el.docId]
    if (!src) return

    const out = unpackSmart(el, src, { width: cw, height: ch })
    const list = [...slide!.elements]
    list.splice(
      list.findIndex((e) => e.id === id),
      1,
      ...out.elements
    )
    patchView({ elements: list, groups: { ...(slide!.groups ?? {}), ...out.groups } })
    setSelected(out.elements.map((e) => e.id))
    setTransforming(false)
  }

  /** 고급 개체 안으로 들어간다 (두 번 클릭 · 메뉴 · 속성 버튼). */
  function enterSmart(id: string): void {
    const el = slide!.elements.find((e) => e.id === id)
    if (!el || el.kind !== 'smart' || !smartsOf(deck!)[el.docId]) return
    setEditPath((p) => [...p, el.docId])
    setSelected([])
    setTransforming(false)
    setEditingText(null)
  }

  /** `depth` 단계까지만 남기고 나온다 (0 = 슬라이드로). */
  function exitSmart(depth: number): void {
    setEditPath((p) => p.slice(0, Math.max(0, depth)))
    setSelected([])
    setTransforming(false)
    setEditingText(null)
  }

  function renameSmart(docId: string, name: string): void {
    const d = smartsOf(deck!)[docId]
    if (!d) return
    update({ ...deck!, smarts: { ...smartsOf(deck!), [docId]: { ...d, name } } })
  }

  /**
   * 고급 개체 안에 **자기 자신**(또는 자기를 품은 것)을 넣으려는지.
   * 한 번 만들어지면 그리는 쪽이 끝없이 파고들어 화면이 멈춘다.
   */
  function loops(el: SlideElement): boolean {
    return Boolean(doc) && el.kind === 'smart' && smartUses(el.docId, doc!.id, smartsOf(deck!))
  }

  /**
   * 요소칸 우클릭 메뉴의 명령을 한 곳에서 처리한다.
   *
   * 대상 id 를 **명시적으로** 받는다 — 우클릭이 선택을 바꾸는 순간과 메뉴 클릭 사이에
   * `selected` 가 아직 갱신되지 않았을 수 있어, 선택 상태에 기대면 엉뚱한 레이어에 걸린다.
   */
  function layerCmd(cmd: LayerCmd, ids: string[]): void {
    switch (cmd) {
      case 'front':
      case 'forward':
      case 'backward':
      case 'back':
        reorderZ(cmd, ids)
        break
      case 'lock':
        patchElements(ids, { locked: true } as Partial<SlideElement>)
        break
      case 'unlock':
        patchElements(ids, { locked: false } as Partial<SlideElement>)
        break
      case 'hide':
        patchElements(ids, { visible: false })
        break
      case 'show':
        patchElements(ids, { visible: true })
        break
      case 'duplicate':
        duplicateSelected(3, ids)
        break
      case 'delete':
        deleteIds(ids)
        break
      case 'ungroup':
        patchElements(ids, { groupId: null } as Partial<SlideElement>)
        break
      case 'copyEffect': {
        // 등장·강조·퇴장 한 벌을 통째로 복사한다. 위치·크기는 건드리지 않는다.
        const el = slide!.elements.find((e) => e.id === ids[0])
        if (el) setEffectClip(structuredClone(el.motion))
        break
      }
      case 'pasteEffect':
        if (effectClip) patchElements(ids, { motion: structuredClone(effectClip) })
        break
      case 'smart':
        smartify(ids)
        break
      case 'unsmart':
        unsmartify(ids[0])
        break
      case 'editSmart':
        enterSmart(ids[0])
        break
      case 'merge':
        void mergeIds(ids)
        break
    }
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
    // 자기 안에 자기를 넣는 것만 조용히 거른다 (순환)
    const usable = elements.filter((e) => !loops(e))
    if (usable.length === 0) return
    const here = new Set(slide!.elements.map((e) => e.id))
    const sameSlide = usable.some((e) => here.has(e.id))
    const copies = cloneElements(usable, sameSlide ? 3 : 0, groups)
    patchView({
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
    patchView({ elements: list })
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

  /**
   * 미리보기를 즉시 끝낸다.
   *
   * 장 길이는 기차가 다 지나갈 때까지 늘어나 2분이 넘기도 한다 — 끝날 때까지 기다리게
   * 두면 "정지를 눌렀는데 안 멈춘다" 가 된다. 멈추는 길은 항상 열려 있어야 한다.
   */
  function stopPreview(): void {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current)
      previewTimer.current = null
    }
    setPreviewing(false)
  }

  /** 지금 보고 있는 장의 효과를 한 번 재생한다. 재생 중에 누르면 멈춘다. */
  function previewSlide(): void {
    if (previewing) return stopPreview()
    if (previewTimer.current) clearTimeout(previewTimer.current)
    setSeek(null)
    setPreviewGen((g) => g + 1)
    setPreviewing(true)

    // 길이 계산은 한 곳(deck.ts)만 쓴다 — 미리보기가 짧으면 퇴장 효과를 못 본다
    const dur = slideDurationMs(slide!, ch, deck!.smarts)
    previewTimer.current = setTimeout(() => setPreviewing(false), dur + 400)
  }

  /** 지금 도는 것 전부 멈춤 — 방송 재생 · 미리보기 · 세워둔 시점. */
  function stopEverything(): void {
    window.endcredit.overlay.stop()
    stopPreview()
    setSeek(null)
  }

  actionsRef.current = {
    del: deleteSelected,
    dup: () => duplicateSelected(3),
    dupInPlace: () => duplicateSelected(0),
    copy: copySelected,
    cut: cutSelected,
    paste: pasteClipboard,
    clear: () => {
      // 자유 변형 → 시점 보기 → 선택 → 고급 개체에서 한 단계 나가기 순으로 물러난다
      if (transforming) setTransforming(false)
      else if (previewing) stopPreview()
      else if (seek !== null) setSeek(null)
      else if (selected.length > 0) setSelected([])
      else if (editPath.length > 0) exitSmart(editPath.length - 1)
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
    nudge: nudgeSelection,
    pickTool: setTool,
    shapeTool: () => {
      if (tool !== 'draw') return setTool('draw')
      const at = SHAPE_KINDS.findIndex((k) => k.value === drawKind)
      setDrawKind(SHAPE_KINDS[(at + 1) % SHAPE_KINDS.length].value)
    },
    merge: mergeSelected
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
    const smartOne = single && single.kind === 'smart' ? single : null
    return [
      ...(single && single.kind === 'text'
        ? [{ label: '글자 편집', hint: '두 번 클릭', onClick: () => setEditingText(single.id) }]
        : []),
      ...(smartOne
        ? [{ label: '내용 편집', hint: '두 번 클릭', onClick: () => enterSmart(smartOne.id) }]
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
      {
        label: smartOne ? '고급 개체 해제' : '고급 개체로 변환',
        hint: smartOne ? '풀어놓기' : '한 줄로 접기',
        onClick: () => layerCmd(smartOne ? 'unsmart' : 'smart', selected)
      },
      {
        label: '이미지로 병합',
        hint: 'Ctrl+E',
        disabled: selected.length < 2,
        onClick: mergeSelected
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

  /**
   * 올가미 선택.
   *
   * 자유곡선을 그려 **중심이 그 안에 든** 요소를 잡는다. 사각 범위(마퀴)로는
   * 못 고르는 비스듬한 무리를 골라낼 수 있다. Shift 로 끌면 기존 선택에 더한다.
   */
  function startLasso(e: React.PointerEvent<HTMLDivElement>): void {
    const box = e.currentTarget.getBoundingClientRect()
    const toPct = (cx: number, cy: number): { x: number; y: number } => ({
      x: ((cx - box.left) / (cw * scale)) * 100,
      y: ((cy - box.top) / (ch * scale)) * 100
    })
    const additive = e.shiftKey
    const before = additive ? selected : []
    const pts: { x: number; y: number }[] = [toPct(e.clientX, e.clientY)]
    setLasso(pts)

    const move = (ev: PointerEvent): void => {
      const p = toPct(ev.clientX, ev.clientY)
      const last = pts[pts.length - 1]
      // 점이 너무 촘촘하면 버린다 — 수백 점이 쌓이면 판정만 느려진다
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return
      pts.push(p)
      setLasso([...pts])
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLasso(null)
      if (pts.length < 3) return
      const hit = slide!.elements
        .filter(
          (el) =>
            el.visible &&
            !el.locked &&
            pointInPolygon({ x: el.frame.x + el.frame.w / 2, y: el.frame.y + el.frame.h / 2 }, pts)
        )
        .map((el) => el.id)
      setSelected([...new Set([...before, ...hit])])
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * 도형을 끌어서 그린다 (파워포인트·피그마와 같다).
   *
   * 끈 자리가 곧 그 도형의 자리다. 그냥 누르기만 하면 기본 크기로 하나 놓는다 —
   * 예전처럼 도구 막대만 눌러도 도형이 나오던 동작을 잃지 않게.
   * Shift 를 누르고 끌면 정사각형/정원이 된다.
   *
   * `frame` 은 %인데 가로·세로의 1% 가 서로 다른 픽셀이다. 정사각형·선 굵기처럼
   * **눈에 보이는 픽셀**로 따져야 하는 것은 캔버스 크기를 곱해서 계산한다.
   */
  function startDraw(e: React.PointerEvent<HTMLDivElement>): void {
    const box = e.currentTarget.getBoundingClientRect()
    const toPct = (cx: number, cy: number): { x: number; y: number } => ({
      x: ((cx - box.left) / (cw * scale)) * 100,
      y: ((cy - box.top) / (ch * scale)) * 100
    })
    const from = toPct(e.clientX, e.clientY)
    const kind = drawKind
    /** px → % (가로·세로가 다르다) */
    const pctW = (px: number): number => (px / cw) * 100
    const pctH = (px: number): number => (px / ch) * 100

    let drawn: Frame | null = null

    const rectAt = (ev: PointerEvent): Frame => {
      const to = toPct(ev.clientX, ev.clientY)
      let w = to.x - from.x
      let h = to.y - from.y

      if (ev.shiftKey && kind !== 'line') {
        // 화면에서 정사각으로 보여야 하므로 픽셀로 맞춘다
        const px = Math.max((Math.abs(w) * cw) / 100, (Math.abs(h) * ch) / 100)
        w = Math.sign(w || 1) * pctW(px)
        h = Math.sign(h || 1) * pctH(px)
      }
      if (kind === 'line') {
        // 가로로 길게 끌면 가로선, 세로로 길게 끌면 세로선 — 굵기 2px
        if (Math.abs(w) * cw >= Math.abs(h) * ch) h = Math.sign(h || 1) * pctH(2)
        else w = Math.sign(w || 1) * pctW(2)
      }

      return {
        x: Math.min(from.x, from.x + w),
        y: Math.min(from.y, from.y + h),
        w: Math.abs(w),
        h: Math.abs(h)
      }
    }

    const move = (ev: PointerEvent): void => {
      const r = rectAt(ev)
      // 살짝 떨린 클릭까지 '끌었다'로 보면 그냥 누르기가 안 된다 (3px 미만은 무시)
      if ((r.w * cw) / 100 < 3 && (r.h * ch) / 100 < 3) return
      drawn = r
      setDrawBox(r)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrawBox(null)
      setTool('move')
      addElement(createShape(kind, drawn ?? undefined))
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
    const cleanGroups = (
      groups: Record<string, SlideGroup> | undefined
    ): Record<string, SlideGroup> | undefined =>
      groups
        ? Object.fromEntries(
            Object.entries(groups).map(([gid, g]) => [
              gid,
              g.motion ? { ...g, motion: clean(g.motion) } : g
            ])
          )
        : groups

    update({
      ...deck!,
      effects: effectsOf(deck!).filter((f) => f.id !== id),
      // 고급 개체 안에 든 요소도 함께 훑는다 — 안 그러면 없는 효과 id 가 남는다
      smarts: Object.fromEntries(
        Object.entries(smartsOf(deck!)).map(([docId, d]) => [
          docId,
          {
            ...d,
            elements: d.elements.map((e) => ({ ...e, motion: clean(e.motion) })),
            groups: cleanGroups(d.groups)
          }
        ])
      ),
      slides: deck!.slides.map((s) => ({
        ...s,
        elements: s.elements.map((e) => ({ ...e, motion: clean(e.motion) })),
        groups: cleanGroups(s.groups),
        transition:
          s.transition?.preset === id ? { ...s.transition, preset: 'fade' } : s.transition
      }))
    })
    setFxDraft(null)
  }

  async function pickBackground(): Promise<void> {
    const asset = await window.endcredit.assets.pickImage()
    if (asset) patchSlide(slideIdx, { background: { ...realSlide!.background, image: asset.url } })
  }

  /** 배경을 모든 장에 똑같이. 장마다 파일을 고르게 하면 열 장짜리 크레딧이 고역이다. */
  function applyBackgroundToAll(): void {
    const bg = { ...realSlide!.background }
    update({ ...deck!, slides: deck!.slides.map((s) => ({ ...s, background: { ...bg } })) })
  }

  async function addImage(): Promise<void> {
    const asset = await window.endcredit.assets.pickImage()
    addElement(createImage(asset?.url ?? ''))
  }

  const busy = info.playing || previewing

  /**
   * 타임라인 구간 — 재생기가 건너뛰는 장(보이는 요소가 없는 장)은 빼고 센다.
   * 그래야 막대의 눈금과 실제 재생 시각이 어긋나지 않는다.
   *
   * **반드시 캐시해야 한다.** 장 하나의 길이를 재려면 요소와 고급 개체 안쪽까지 훑는데,
   * 슬라이더를 끌면 초당 60번 다시 그려진다 — 그때마다 전 슬라이드를 훑으면 버벅인다.
   */
  const { segments, totalMs } = timeline
  const segAt = (t: number): (typeof segments)[number] | null =>
    segments.find((s) => t < s.start + s.ms) ?? segments[segments.length - 1] ?? null

  /** 타임라인을 찍거나 끌었을 때 — 그 장으로 옮기고 그 시점에 세워 둔다. */
  function scrubTo(t: number): void {
    const clamped = Math.max(0, Math.min(totalMs, t))
    const seg = segAt(clamped)
    if (!seg) return
    setSeek(clamped)
    setSlideIdx(seg.idx)
    setSelected([])
    setTransforming(false)
    setEditingText(null)
  }

  /** 지금 찍어 둔 시점이 **그 장 안에서** 몇 ms 인지 (렌더러가 쓰는 값) */
  const seekInSlide = ((): number | null => {
    if (seek === null || doc) return null
    const seg = segAt(seek)
    return seg ? Math.max(0, seek - seg.start) : null
  })()
  /**
   * 시점을 세워 놓고 보는 중.
   * 요소가 효과 중간에 멈춰 있어 **화면 위치와 frame 이 다르므로**, 이때는 클릭판·선택
   * 상자를 띄우지 않는다 — 엉뚱한 자리를 잡게 된다. 캔버스를 누르면 편집으로 돌아온다.
   */
  const scrubbing = seekInSlide !== null

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
          <button onClick={stopEverything}>
            ■ 정지{info.onlySlide != null ? ` (${info.onlySlide + 1}장)` : ''}
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => window.endcredit.overlay.play()}>
              ▶ 전체 재생
            </button>
            {/*
              보고 있는 장 하나만 방송으로 내보낸다. 40장짜리에서 12번째 장을 OBS 로
              확인하려고 앞의 11장을 기다릴 수는 없다. 그 장이 끝나면 크레딧도 끝난다.
            */}
            <button
              onClick={() => window.endcredit.overlay.play(slideIdx)}
              title="지금 보고 있는 장만 OBS 로 내보냅니다 (끝나면 자동으로 멈춥니다)"
            >
              ▶ 이 장만 방송
            </button>
          </>
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
            // 다른 장을 고르면 고급 개체 안에서 나온다 — 안에 있는데 장이 바뀌면 어리둥절하다
            setEditPath([])
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
            <button
              className={tool === 'move' ? 'active' : ''}
              onClick={() => setTool('move')}
              title="이동·선택 도구 (V)"
            >
              <b>⤢</b>
              <span className="lbl">이동</span>
            </button>
            <button
              className={tool === 'lasso' ? 'active' : ''}
              onClick={() => setTool('lasso')}
              title="올가미 — 자유곡선으로 감싼 요소를 선택 (L)"
            >
              <b>◌</b>
              <span className="lbl">올가미</span>
            </button>

            <span className="pp-div" />

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
            {/*
              도형은 '넣기'가 아니라 **도구**다 — 골라두고 캔버스에 끌어 그린다.
              종류 고르개는 도구를 켠 동안에만 나온다. 늘 띄워두면 도구 막대가 세 칸 더
              길어지는데, 이 막대는 이미 창을 좁히면 잘린다.
            */}
            <button
              className={tool === 'draw' ? 'active' : ''}
              onClick={() => setTool(tool === 'draw' ? 'move' : 'draw')}
              title="도형 — 캔버스에 끌어서 그립니다 (R). Shift 로 정사각형·정원"
            >
              <b>{SHAPE_KINDS.find((k) => k.value === drawKind)?.icon}</b>
              <span className="lbl">도형</span>
            </button>
            {tool === 'draw' && (
              <span className="pp-kinds">
                {SHAPE_KINDS.map((k) => (
                  <button
                    key={k.value}
                    className={drawKind === k.value ? 'active' : ''}
                    onClick={() => setDrawKind(k.value)}
                    title={k.label}
                  >
                    <b>{k.icon}</b>
                    <span className="lbl">{k.label}</span>
                  </button>
                ))}
              </span>
            )}

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
            <button
              className={previewing ? 'active' : 'primary'}
              onClick={previewSlide}
              title={previewing ? '미리보기 멈추기' : '이 장의 효과를 재생해 봅니다'}
            >
              <b>{previewing ? '■' : '▶'}</b>
              <span className="lbl">{previewing ? '멈추기' : '이 장 재생'}</span>
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
Ctrl+T 자유 변형 · 두 번 클릭 글자 편집 · 화살표 미세 이동 · 빈 곳 끌어 범위 선택 · L 올가미 · R 도형 끌어 그리기 · 오른쪽 클릭 메뉴
            </span>
          </div>

          {/* 고급 개체 안이면 어디에 들어와 있는지 — 나가는 길이 늘 보여야 갇힌 느낌이 없다 */}
          {editPath.length > 0 && (
            <div className="crumb-bar">
              <button onClick={() => exitSmart(0)}>{realSlide.name || `슬라이드 ${slideIdx + 1}`}</button>
              {editPath.map((id, i) => (
                <span key={id}>
                  <i>›</i>
                  <button
                    className={i === editPath.length - 1 ? 'here' : ''}
                    onClick={() => exitSmart(i + 1)}
                  >
                    ◈ {deck.smarts?.[id]?.name ?? '고급 개체'}
                  </button>
                </span>
              ))}
              <div className="spacer" />
              <span className="mono">
                {cw}×{ch} · 여기서 고친 내용은 이 개체를 쓰는 모든 자리에 반영됩니다
              </span>
              <button className="primary" onClick={() => exitSmart(editPath.length - 1)}>
                나가기 (Esc)
              </button>
            </div>
          )}

          <div className="ps-area" ref={areaRef} onWheel={nav.handlers.onWheel}>
            <div
              ref={canvasRef}
              className={`ps-canvas nav-${nav.mode} ${
                nav.mode === 'none' && tool !== 'move' ? `tool-${tool}` : ''
              } ${fileOver ? 'file-over' : ''}`}
              style={{ width: cw * scale, height: ch * ratio * scale }}
              onDragOver={(e) => {
                const t = e.dataTransfer.types
                if (
                  t.includes(FIELD_DRAG_TYPE) ||
                  t.includes(SCREEN_FX_DRAG_TYPE) ||
                  t.includes(SPECIAL_DRAG_TYPE) ||
                  // 탐색기에서 끌어온 파일
                  t.includes('Files')
                ) {
                  e.preventDefault()
                  setFileOver(t.includes('Files'))
                }
              }}
              onDragLeave={(e) => {
                // 안쪽 요소를 지나갈 때마다 깜빡이지 않게, 캔버스를 정말로 벗어났을 때만 끈다
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
              }}
              onDrop={(e) => {
                setFileOver(false)
                // 탐색기에서 끌어온 파일이 먼저다 (안쪽 끌기와 섞이지 않는다)
                if (e.dataTransfer.files.length > 0) {
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  void dropFiles(Array.from(e.dataTransfer.files), {
                    x: ((e.clientX - r.left) / (cw * scale)) * 100,
                    y: ((e.clientY - r.top) / (ch * scale)) * 100
                  })
                  return
                }
                // 화면 효과는 장 전체에 걸린다 — 캔버스 아무 데나 놓으면 된다
                const fx = e.dataTransfer.getData(SCREEN_FX_DRAG_TYPE)
                if (fx) {
                  e.preventDefault()
                  return applyScreenFx(slideIdx, fx)
                }
                // 특이 효과는 놓은 자리에 그 요소를 만든다
                const special = e.dataTransfer.getData(SPECIAL_DRAG_TYPE)
                if (special) {
                  e.preventDefault()
                  const r = e.currentTarget.getBoundingClientRect()
                  const y = ((e.clientY - r.top) / (ch * scale)) * 100
                  return addSpecial(special, { y: Math.max(0, Math.min(80, y - 13)) })
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
                // 시점을 세워 보던 중이면 먼저 편집으로 돌아온다
                if (scrubbing) return setSeek(null)
                if (tool === 'lasso') return startLasso(e)
                // 도형은 요소 위에서 시작해도 그려져야 한다 — 빈 곳 검사를 하지 않는다
                if (tool === 'draw') return startDraw(e)
                if (e.target === e.currentTarget) startMarquee(e)
              }}
            >
              <div
                className="ps-canvas-inner"
                style={{ width: cw, height: ch * ratio, transform: `scale(${scale})` }}
              >
                {/* 전체 재생 중이면 실제 재생을 따라가고, 아니면 이 장만 보여준다.
                    고급 개체 안이면 그 개체를 **자기 캔버스를 가진 한 장**으로 만들어 보여준다 */}
                <DeckRenderer
                  deck={
                    doc
                      ? { ...deck, canvas: { width: cw, height: ch }, slides: [slide] }
                      : deck
                  }
                  data={info.data}
                  /* 시점 보기도 '재생 중'이어야 효과가 붙는다 — 붙은 것을 그 시각에 세운다 */
                  playing={busy || seekInSlide !== null}
                  generation={info.playing ? info.generation : previewGen}
                  slideIndex={doc ? 0 : info.playing ? null : slideIdx}
                  /* 방송이 한 장만 내보내는 중이면 편집 화면도 같은 것을 본다 */
                  onlySlide={info.playing && !doc ? (info.onlySlide ?? null) : null}
                  seekMs={seekInSlide}
                  hideElementId={editingText}
                  /* OBS 가 붙어 있으면 소리는 그쪽에 맡긴다 — 둘 다 울리면 두 번 들린다 */
                  audio={previewing || (info.playing && info.clients === 0)}
                  onFinished={() => window.endcredit.overlay.finished(info.generation)}
                />
              </div>

              {!busy &&
                !scrubbing &&
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
                        // 이동 도구가 아니면 요소를 가로채지 않는다 —
                        // 요소 위에서 시작해도 올가미가 그려지고 도형이 놓이게
                        if (tool !== 'move') return
                        e.stopPropagation()
                        selectElement(el.id, { additive: e.shiftKey, alone: e.altKey })
                      }}
                      onContextMenu={(e) => {
                        // 안 잡힌 것을 오른쪽 클릭하면 먼저 잡고 연다 — 메뉴가 엉뚱한 데 걸리지 않게
                        if (!selected.includes(el.id)) selectElement(el.id)
                        openMenu(e)
                      }}
                      onDoubleClick={(e) => {
                        // 포토샵과 같다 — 글자는 그 자리에서 고치고, 고급 개체는 그 안으로 들어간다
                        if (el.kind === 'smart') {
                          e.stopPropagation()
                          return enterSmart(el.id)
                        }
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

              {/* 그리는 중인 도형 — 놓기 전에 어떤 모양이 될지 그대로 보여준다 */}
              {drawBox && (
                <span
                  className="draw-box"
                  style={{
                    left: (drawBox.x / 100) * cw * scale,
                    top: (drawBox.y / 100) * ch * scale,
                    width: (drawBox.w / 100) * cw * scale,
                    height: (drawBox.h / 100) * ch * scale,
                    borderRadius: drawKind === 'ellipse' ? '50%' : 4
                  }}
                />
              )}

              {lasso && lasso.length > 1 && (
                <svg className="lasso-svg" width={cw * scale} height={ch * ratio * scale}>
                  <polygon
                    points={lasso
                      .map((p) => `${(p.x / 100) * cw * scale},${(p.y / 100) * ch * scale}`)
                      .join(' ')}
                  />
                </svg>
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

              {!busy && !scrubbing && !editingText && nav.mode === 'none' && single && (
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
                  onDoubleClick={() => {
                    if (single.kind === 'smart') enterSmart(single.id)
                    else if (single.kind === 'text') setEditingText(single.id)
                  }}
                />
              )}

              {!busy && !scrubbing && !editingText && nav.mode === 'none' && selectedEls.length > 1 && (
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

          {/* 재생 타임라인 — 아무 데나 찍으면 그 순간을 세워 놓고 본다.
              고급 개체 안에서는 장 개념이 없으므로 띄우지 않는다. */}
          {!doc && segments.length > 0 && (
            <div className="tl-bar">
              <button
                className={scrubbing || previewing ? '' : 'active'}
                onClick={() => (scrubbing ? setSeek(null) : previewSlide())}
                title={
                  scrubbing ? '편집으로 돌아가기 (Esc)' : previewing ? '미리보기 멈추기' : '이 장 재생'
                }
              >
                {scrubbing ? '✎ 편집' : previewing ? '■ 멈추기' : '▶ 재생'}
              </button>

              <div
                className="tl-track"
                onPointerDown={(e) => {
                  const box = e.currentTarget.getBoundingClientRect()
                  const at = (cx: number): number => ((cx - box.left) / box.width) * totalMs
                  scrubTo(at(e.clientX))
                  const move = (ev: PointerEvent): void => scrubTo(at(ev.clientX))
                  const up = (): void => {
                    window.removeEventListener('pointermove', move)
                    window.removeEventListener('pointerup', up)
                  }
                  window.addEventListener('pointermove', move)
                  window.addEventListener('pointerup', up)
                }}
              >
                {segments.map((s) => (
                  <span
                    key={s.idx}
                    className={`tl-seg ${s.idx === slideIdx ? 'on' : ''}`}
                    style={{ width: `${(s.ms / Math.max(1, totalMs)) * 100}%` }}
                    title={`${s.name} · ${formatDuration(s.ms)}`}
                  >
                    <b>{s.name}</b>
                  </span>
                ))}
                {seek !== null && (
                  <span
                    className="tl-head"
                    style={{ left: `${(seek / Math.max(1, totalMs)) * 100}%` }}
                  />
                )}
              </div>

              <span className="mono tl-time">
                {scrubbing ? `${(seek! / 1000).toFixed(1)}초` : '—'} / {formatDuration(totalMs)}
              </span>
            </div>
          )}

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
              {doc ? `◈ ${doc.name}` : slide.name} · {cw}×{Math.round(ch * ratio)}
              {selected.length > 0 && ` · ${selected.length}개 선택`}
              {nav.mode === 'hand' ? ' · 손도구' : nav.mode === 'zoom' ? ' · 돋보기' : ''}
            </span>
            {/* 아웃트로 음악 안에 끝나야 하는 경우가 많다 — 총 길이가 보여야 맞출 수 있다 */}
            <span className="len-chip" title="이 장 길이 · 크레딧 전체 길이">
              이 장 {formatDuration(thisSlideMs)} · 전체 <b>{formatDuration(totalMs)}</b>
            </span>
          </div>
        </div>

        <Splitter axis="x" value={rightW} onChange={setRightW} invert />

        <Inspector
          slide={slide}
          selectedIds={selected}
          onSelect={selectElement}
          onPatch={(p) => patchElements(selected, p)}
          onPatchSlide={patchView}
          onToggle={(id, on) => patchElements([id], { visible: on })}
          onDelete={(id) => {
            patchView({ elements: slide.elements.filter((e) => e.id !== id) })
            setSelected((prev) => prev.filter((i) => i !== id))
          }}
          onDuplicate={(id) => duplicateSelected(3, [id])}
          onReorder={(from, to) => {
            const list = [...slide.elements]
            const [m] = list.splice(from, 1)
            list.splice(to, 0, m)
            patchView({ elements: list })
          }}
          onDropEffect={(id, effectId) => applyEffect([id], effectId)}
          onPickImage={() => single && pickImage(single.id)}
          onSplitRanks={splitRanks}
          onSplitSlide={() => splitSlideIntoSlides(slideIdx)}
          canSplitSlide={!doc && slide.elements.length > 1}
          smartDoc={doc}
          smartUses={(docId) => smartInstances(deck, docId)}
          smartName={(docId) => deck.smarts?.[docId]?.name ?? '고급 개체'}
          onRenameSmart={renameSmart}
          onPickImageUrl={async () => (await window.endcredit.assets.pickImage())?.url ?? null}
          onGroup={toggleGroup}
          onUngroup={ungroupSelected}
          onRenameGroup={renameGroup}
          onPatchGroup={patchGroup}
          onDropGroupEffect={applyGroupEffect}
          onLayerCmd={layerCmd}
          canPasteEffect={effectClip !== null}
          onPickBackground={pickBackground}
          onApplyBackgroundToAll={applyBackgroundToAll}
          onScreenFx={(fx: ScreenFx | null) => patchSlide(slideIdx, { screen: fx })}
          canvas={deck.canvas}
          onCanvas={(c) => update(resizeDeckCanvas(deck, c))}
          font={deck.font.family}
          onFont={(family) => update({ ...deck, font: { family } })}
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
            onAddSpecial={(id) => addSpecial(id)}
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

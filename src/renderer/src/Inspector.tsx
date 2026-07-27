import { useMemo, useRef, useState } from 'react'
import { allEffects, getEffect } from '@shared/effects'
import { isCustomId } from '@shared/custom-effect'
import {
  appearOrderOf,
  backgroundOf,
  CANVAS_PRESETS,
  DEFAULT_MOTION,
  groupMotion,
  groupName,
  hasMotion,
  IMAGE_SHADOW_MAX,
  orderOf,
  runsToText,
  shadowsOf,
  strokesOf,
  transitionOf
} from '@shared/deck'
import { exitDurationOf } from '@shared/preset'
import { getScreenEffect, SCREEN_EFFECTS, type ScreenFx } from '@shared/screen-fx'
import { availableFonts } from './fonts'
import { hasFields, interpolate } from '@shared/fields'
import type { CreditData } from '@shared/aggregate'
import { BUILTIN_SOUNDS, builtinAudioUrl } from '@shared/builtin-audio'
import { PitchField, TryButton } from './AudioPanel'
import type {
  AudioClip,
  DataElement,
  ImageElement,
  Motion,
  RankElement,
  ShapeElement,
  Slide,
  SlideElement,
  SlideGroup,
  SmartDoc,
  SmartElement,
  TextShadow,
  TextStroke,
  TextStyle,
  TrainElement
} from '@shared/deck'
import { SOURCE_OPTIONS } from './sources'
import { EFFECT_DRAG_TYPE } from './EffectLibrary'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { Splitter, fitSplit, useBoxSize, useSplit } from './Splitter'

/** 요소칸이 아무리 길어도 속성 패널에 남겨두는 높이 */
const MIN_PROPS_H = 200
import {
  CheckBox,
  ColorInput,
  Field,
  NumberInput,
  SegButtons,
  Select,
  Slider,
  TextInput
} from './Controls'

/** 포토샵과 같은 단색 눈 아이콘. 이모지는 줄 높이를 들쭉날쭉하게 만든다. */
function EyeIcon({ on = false }: { on?: boolean }): React.JSX.Element {
  if (!on) return <span className="eye-off" />
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M8 3.5C4.7 3.5 2 8 2 8s2.7 4.5 6 4.5S14 8 14 8 11.3 3.5 8 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="1.9" fill="currentColor" />
    </svg>
  )
}

function FolderIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path
        d="M1.5 3.5h4l1.2 1.6h7.8v7.4H1.5V3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 등장·퇴장을 **따로** 고르게 한다. 한 목록에 섞으면 둘을 함께 쓸 수가 없다.
 *
 * 내가 만든 효과가 목록에 들어와야 하므로 상수가 아니라 함수다 —
 * 문서를 열 때마다 목록이 달라진다.
 */
function entranceOptions(): { value: string; label: string }[] {
  return [
    { value: 'none', label: '없음' },
    ...byCategory('in').map((e) => ({ value: e.id, label: label(e) }))
  ]
}

function exitOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: '없음 (그대로 사라짐)' },
    ...byCategory('out').map((e) => ({ value: e.id, label: label(e) }))
  ]
}

function emphasisOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: '없음' },
    ...byCategory('emphasis').map((e) => ({ value: e.id, label: label(e) }))
  ]
}

/** 내가 만든 것을 앞에 세우고 표시를 붙인다 — 기본 44종에 섞이면 찾을 수 없다 */
function byCategory(c: 'in' | 'out' | 'emphasis'): { id: string; name: string }[] {
  const all = allEffects().filter((e) => e.category === c && e.id !== 'none')
  return [...all.filter((e) => isCustomId(e.id)), ...all.filter((e) => !isCustomId(e.id))]
}

function label(e: { id: string; name: string }): string {
  return isCustomId(e.id) ? `✎ ${e.name}` : e.name
}

/**
 * 접었다 펴는 속성 묶음.
 *
 * 기차 하나에 속성이 스물몇 개다. 전부 같은 무게로 늘어놓으면 자주 쓰는 '칸 수'가
 * 거의 안 쓰는 '장식 강조 주기'와 똑같이 생겨서 눈에 안 들어온다. 프리미어 이펙트
 * 컨트롤·유니티 인스펙터처럼 묶어서 접는다.
 *
 * 펼침 상태는 **기억한다** — 매번 같은 칸을 다시 여는 건 접이식의 의미를 지운다.
 */
function Section({
  id,
  title,
  hint,
  defaultOpen = false,
  children
}: {
  /** 저장 키. 요소 종류마다 달라야 서로 상태를 덮어쓰지 않는다 */
  id: string
  title: string
  hint?: string
  defaultOpen?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const key = `endcredit.fold.${id}`
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem(key)
    return v === null ? defaultOpen : v === '1'
  })

  const toggle = (): void => {
    const next = !open
    localStorage.setItem(key, next ? '1' : '0')
    setOpen(next)
  }

  return (
    <div className={`ps-sec ${open ? 'open' : ''}`}>
      <button className="ps-sec-head" onClick={toggle}>
        <i>{open ? '▾' : '▸'}</i>
        <b>{title}</b>
        {hint && <em>{hint}</em>}
      </button>
      {open && <div className="ps-sec-body">{children}</div>}
    </div>
  )
}

/**
 * 가속 곡선 — 같은 효과라도 속도감이 달라진다.
 * CSS 값을 그대로 쓰되 이름은 눈에 보이는 대로 붙였다.
 */
const EASINGS: { value: string; label: string }[] = [
  { value: 'ease-out', label: '부드럽게 멈춤 (기본)' },
  { value: 'ease-in', label: '천천히 시작' },
  { value: 'ease-in-out', label: '양끝 부드럽게' },
  { value: 'linear', label: '일정한 속도' },
  { value: 'cubic-bezier(.34,1.56,.64,1)', label: '통통 튀며 (살짝 지나쳤다 옴)' },
  { value: 'cubic-bezier(.68,-.55,.27,1.55)', label: '확 당겼다 튀며' },
  { value: 'steps(12, end)', label: '뚝뚝 끊기며' }
]

/** 요소칸 우클릭 메뉴가 Editor 로 보내는 명령. 대상 id 는 함께 넘긴다. */
export type LayerCmd =
  | 'front'
  | 'forward'
  | 'backward'
  | 'back'
  | 'lock'
  | 'unlock'
  | 'hide'
  | 'show'
  | 'duplicate'
  | 'delete'
  | 'ungroup'
  | 'copyEffect'
  | 'pasteEffect'
  | 'smart'
  | 'unsmart'
  | 'editSmart'
  | 'merge'

/** 포토샵과 같은 단색 자물쇠. 잠긴 레이어에만 뜬다. */
function LockIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="currentColor" />
      <path
        d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}

const KIND_ICON: Record<string, string> = {
  text: 'T',
  image: '🖼',
  data: '#',
  rank: '①',
  shape: '▬',
  train: '🚂',
  smart: '◈'
}

/** 오른쪽 도크: 현재 슬라이드의 요소 목록 + 선택한 요소의 속성. */
export function Inspector({
  slide,
  selectedIds,
  onSelect,
  onPatch,
  onPatchSlide,
  onToggle,
  onDelete,
  onDuplicate,
  onReorder,
  onDropEffect,
  onPickImage,
  onSplitRanks,
  onSplitSlide,
  canSplitSlide,
  smartDoc,
  smartUses,
  smartName,
  onRenameSmart,
  onPickImageUrl,
  onGroup,
  onUngroup,
  onRenameGroup,
  onPatchGroup,
  onDropGroupEffect,
  onLayerCmd,
  canPasteEffect,
  onPickBackground,
  onApplyBackgroundToAll,
  onScreenFx,
  canvas,
  onCanvas,
  font,
  onFont,
  data
}: {
  slide: Slide
  selectedIds: string[]
  onSelect: (id: string, opts?: { additive?: boolean; alone?: boolean }) => void
  onPatch: (p: Partial<SlideElement>) => void
  onPatchSlide: (p: Partial<Slide>) => void
  onToggle: (id: string, on: boolean) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onReorder: (from: number, to: number) => void
  onDropEffect: (id: string, effectId: string) => void
  onPickImage: () => void
  /** 순위 목록을 1·2·3등 개별 요소로 나눈다 */
  onSplitRanks: (id: string, count: number) => void
  /** 이 슬라이드의 요소들을 한 장씩으로 편다 */
  onSplitSlide: () => void
  canSplitSlide: boolean
  /** 지금 격리 편집 중인 고급 개체. null 이면 슬라이드를 편집 중이다 */
  smartDoc: SmartDoc | null
  /** 이 내용을 쓰고 있는 자리 수 — 여러 곳이면 고치면 같이 바뀐다는 표시를 띄운다 */
  smartUses: (docId: string) => number
  smartName: (docId: string) => string
  onRenameSmart: (docId: string, name: string) => void
  /** 이미지를 고르고 그 주소를 돌려준다 (기차의 여러 이미지 목록용) */
  onPickImageUrl: () => Promise<string | null>
  onGroup: () => void
  onUngroup: () => void
  onRenameGroup: (gid: string, name: string) => void
  /** 묶음 자체의 설정 (이름·묶음 효과·안쪽 등장 방식) */
  onPatchGroup: (gid: string, p: Partial<SlideGroup>) => void
  /** 폴더 줄에 효과를 떨어뜨리면 **묶음 전체**에 걸린다 */
  onDropGroupEffect: (gid: string, effectId: string) => void
  /** 요소칸 우클릭 메뉴의 명령. 대상 id 를 명시적으로 넘긴다 */
  onLayerCmd: (cmd: LayerCmd, ids: string[]) => void
  /** 효과 클립보드에 복사해 둔 게 있는지 (‘효과 붙여넣기’ 활성화) */
  canPasteEffect: boolean
  onPickBackground: () => void
  onApplyBackgroundToAll: () => void
  /** 화면 전체 효과 (폭죽·눈 …). null 이면 없앤다 */
  onScreenFx: (fx: ScreenFx | null) => void
  /** 문서 화면 크기 (장이 아니라 문서 전체에 걸린다) */
  canvas: { width: number; height: number }
  onCanvas: (c: { width: number; height: number }) => void
  /** 문서 기본 글꼴 — 요소가 따로 안 정하면 이걸 물려받는다 */
  font: string
  onFont: (family: string) => void
  /** 데이터 필드가 실제로 어떻게 보이는지 미리 보여주기 위해 */
  data: CreditData
}): React.JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [listH, setListH] = useSplit('elements', 210, 80, 620)
  /**
   * 요소칸 높이도 도크 안에서 다시 조인다. 저장값이 620 인 채로 세로가 짧은 화면에
   * 오면 속성 패널이 통째로 밀려 나가 아무것도 못 고치게 된다.
   * (`MIN_PROPS_H` = 속성 패널이 최소한 한두 줄은 보여야 하는 높이)
   */
  const dockRef = useRef<HTMLDivElement>(null)
  const dockBox = useBoxSize(dockRef)
  const listFit = fitSplit(listH, 80, dockBox.h, MIN_PROPS_H)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  // '각자 지정' 모드에서는 차례 개념이 없으므로 배지를 띄우지 않는다.
  // 차례 계산은 요소를 전부 훑어 정렬한다 — 슬라이더를 끌 때마다 다시 세지 않도록 캐시한다
  const turns = useMemo(
    () => (orderOf(slide).mode === 'order' ? appearOrderOf(slide) : {}),
    [slide]
  )
  const chosen = slide.elements.filter((e) => selectedIds.includes(e.id))
  const el = chosen.length === 1 ? chosen[0] : null

  /**
   * 묶음을 **폴더처럼** 보여주기 위한 목록 구성.
   * 폴더를 누르면 전체가, 안의 요소를 누르면 그 하나만 잡힌다.
   *
   * **맨 위 줄이 화면에서 맨 앞에 보이는 것이다** — 포토샵·피그마·파워포인트 선택 창과
   * 같다. 문서 배열은 반대로(뒤에 있을수록 위에 그려지게) 쌓이므로 뒤에서부터 훑는다.
   * 배열 자체는 건드리지 않는다 — 보여주는 방향만 뒤집는다.
   */
  const rows = useMemo(() => {
    const out: (
      | { kind: 'group'; gid: string; order: number; members: SlideElement[] }
      | { kind: 'el'; el: SlideElement }
    )[] = []
    // 묶음 번호는 **문서 순서**로 매긴다 — 보여주는 방향을 뒤집었다고 이름이 바뀌면 안 된다
    const gOrder = new Map<string, number>()
    for (const e of slide.elements) {
      if (e.groupId && !gOrder.has(e.groupId)) gOrder.set(e.groupId, gOrder.size + 1)
    }

    const front = [...slide.elements].reverse()
    const placed = new Set<string>()
    for (const e of front) {
      if (e.groupId) {
        if (placed.has(e.groupId)) continue
        placed.add(e.groupId)
        out.push({
          kind: 'group',
          gid: e.groupId,
          order: gOrder.get(e.groupId) ?? placed.size,
          members: front.filter((m) => m.groupId === e.groupId)
        })
      } else {
        out.push({ kind: 'el', el: e })
      }
    }
    return out
  }, [slide.elements])

  const groupIdsOf = (gid: string): string[] =>
    slide.elements.filter((m) => m.groupId === gid).map((m) => m.id)

  /** 고급 개체 줄에서만 쓰는 동작 묶음 — 열기·이름 바꾸기·연결 개수 */
  const smartOps = {
    open: (id: string) => onLayerCmd('editSmart', [id]),
    rename: (docId: string, name: string) => {
      onRenameSmart(docId, name)
      setRenaming(null)
    },
    cancel: () => setRenaming(null),
    uses: smartUses,
    name: smartName
  }

  /** 요소 한 줄의 우클릭 메뉴. 그 레이어 하나에 걸리는 기능들. */
  function elMenu(e: SlideElement): MenuItem[] {
    const ids = [e.id]
    const items: MenuItem[] = [
      { label: '복제', hint: 'Ctrl+J', onClick: () => onDuplicate(e.id) },
      { label: '효과 복사', onClick: () => onLayerCmd('copyEffect', ids) },
      {
        label: '효과 붙여넣기',
        disabled: !canPasteEffect,
        onClick: () => onLayerCmd('pasteEffect', ids)
      },
      { sep: true, label: '' },
      { label: '맨 앞으로', onClick: () => onLayerCmd('front', ids) },
      { label: '앞으로', onClick: () => onLayerCmd('forward', ids) },
      { label: '뒤로', onClick: () => onLayerCmd('backward', ids) },
      { label: '맨 뒤로', onClick: () => onLayerCmd('back', ids) },
      { sep: true, label: '' },
      {
        label: e.locked ? '잠금 해제' : '잠금',
        onClick: () => onLayerCmd(e.locked ? 'unlock' : 'lock', ids)
      },
      {
        label: e.visible ? '숨기기' : '보이기',
        onClick: () => onLayerCmd(e.visible ? 'hide' : 'show', ids)
      }
    ]
    if (e.groupId) {
      const memberIds = slide.elements.filter((m) => m.groupId === e.groupId).map((m) => m.id)
      items.push({ label: '묶음 해제', onClick: () => onLayerCmd('ungroup', memberIds) })
    }
    if (e.kind === 'smart') {
      items.push(
        { sep: true, label: '' },
        { label: '내용 편집', hint: '두 번 클릭', onClick: () => onLayerCmd('editSmart', ids) },
        { label: '이름 바꾸기', onClick: () => setRenaming(e.id) },
        { label: '고급 개체 해제', hint: '풀어놓기', onClick: () => onLayerCmd('unsmart', ids) }
      )
    } else {
      items.push({
        label: '고급 개체로 변환',
        hint: '한 줄로 접기',
        onClick: () => onLayerCmd('smart', e.groupId ? groupIdsOf(e.groupId) : ids)
      })
    }
    items.push(
      { sep: true, label: '' },
      { label: '삭제', hint: 'Delete', danger: true, onClick: () => onDelete(e.id) }
    )
    return items
  }

  /** 폴더(묶음) 줄의 우클릭 메뉴. 안의 요소 전부에 함께 걸린다. */
  function groupMenu(gid: string, members: SlideElement[]): MenuItem[] {
    const ids = members.map((m) => m.id)
    const allLocked = members.every((m) => m.locked)
    const anyVisible = members.some((m) => m.visible)
    return [
      { label: '이름 바꾸기', onClick: () => setRenaming(gid) },
      { label: '복제', onClick: () => onLayerCmd('duplicate', ids) },
      { sep: true, label: '' },
      { label: '맨 앞으로', onClick: () => onLayerCmd('front', ids) },
      { label: '맨 뒤로', onClick: () => onLayerCmd('back', ids) },
      { sep: true, label: '' },
      {
        label: allLocked ? '잠금 해제' : '잠금',
        onClick: () => onLayerCmd(allLocked ? 'unlock' : 'lock', ids)
      },
      {
        label: anyVisible ? '숨기기' : '보이기',
        onClick: () => onLayerCmd(anyVisible ? 'hide' : 'show', ids)
      },
      { sep: true, label: '' },
      { label: '묶음 해제', onClick: () => onLayerCmd('ungroup', ids) },
      { label: '고급 개체로 변환', hint: '한 줄로 접기', onClick: () => onLayerCmd('smart', ids) },
      { label: '이미지로 병합', hint: '데이터 고정', onClick: () => onLayerCmd('merge', ids) },
      { sep: true, label: '' },
      { label: '삭제', danger: true, onClick: () => onLayerCmd('delete', ids) }
    ]
  }

  /** 우클릭한 줄을 먼저 선택한 뒤 메뉴를 연다 — 무엇에 거는지 눈에 보이게. */
  function openRowMenu(ev: React.MouseEvent, e: SlideElement, indent: boolean): void {
    ev.preventDefault()
    ev.stopPropagation()
    onSelect(e.id, { alone: indent })
    setMenu({ x: ev.clientX, y: ev.clientY, items: elMenu(e) })
  }

  return (
    <div className="ps-dock" ref={dockRef}>
      <div className="ps-panel ps-layers" style={{ height: listFit, flex: 'none' }}>
        <header>
          <span>요소</span>
          <em>{slide.elements.length}</em>
        </header>
        <div className="lay-list">
          {rows.map((row) =>
            row.kind === 'group' ? (
              <div key={row.gid} className="lay-group">
                {/* 폴더 줄 — 눈 · 펼침 · 폴더 · 이름 (포토샵과 같은 순서·간격) */}
                <div
                  className={[
                    'lay-row',
                    row.members.every((m) => selectedIds.includes(m.id)) ? 'sel' : '',
                    dropOn === row.gid ? 'drop' : ''
                  ].join(' ')}
                  onClick={(ev) =>
                    onSelect(row.members[0].id, { additive: ev.shiftKey, alone: false })
                  }
                  onContextMenu={(ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    onSelect(row.members[0].id, { alone: false })
                    setMenu({
                      x: ev.clientX,
                      y: ev.clientY,
                      items: groupMenu(row.gid, row.members)
                    })
                  }}
                  onDragOver={(ev) => {
                    if (!ev.dataTransfer.types.includes(EFFECT_DRAG_TYPE)) return
                    ev.preventDefault()
                    setDropOn(row.gid)
                  }}
                  onDragLeave={() => setDropOn(null)}
                  onDrop={(ev) => {
                    ev.preventDefault()
                    setDropOn(null)
                    const fx = ev.dataTransfer.getData(EFFECT_DRAG_TYPE)
                    // 폴더에 떨어뜨렸으면 **덩어리 전체**에 건다 (안의 요소는 그대로 둔다)
                    if (fx) onDropGroupEffect(row.gid, fx)
                  }}
                >
                  <button
                    className={`lay-eye ${row.members.some((m) => m.visible) ? 'on' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      const on = !row.members.every((m) => m.visible)
                      row.members.forEach((m) => onToggle(m.id, on))
                    }}
                  >
                    <EyeIcon on={row.members.some((m) => m.visible)} />
                  </button>

                  <button
                    className="lay-tri"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.gid)) next.delete(row.gid)
                        else next.add(row.gid)
                        return next
                      })
                    }}
                  >
                    {collapsed.has(row.gid) ? '▸' : '▾'}
                  </button>

                  <span className="lay-folder"><FolderIcon /></span>

                  {renaming === row.gid ? (
                    <input
                      className="lay-rename"
                      autoFocus
                      defaultValue={groupName(slide, row.gid, row.order)}
                      onClick={(ev) => ev.stopPropagation()}
                      onBlur={(ev) => {
                        onRenameGroup(row.gid, ev.target.value.trim() || `그룹 ${row.order}`)
                        setRenaming(null)
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
                        if (ev.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <span
                      className="lay-name"
                      title="두 번 눌러 이름 바꾸기"
                      onDoubleClick={(ev) => {
                        ev.stopPropagation()
                        setRenaming(row.gid)
                      }}
                    >
                      {groupName(slide, row.gid, row.order)}
                    </span>
                  )}

                  {/* 묶음에 걸린 효과. 안의 요소 효과와 헷갈리지 않게 폴더 줄에만 뜬다 */}
                  {hasMotion(groupMotion(slide, row.gid)) && (
                    <span className="lay-eff" title="묶음 전체에 걸린 효과">
                      {motionLabel(groupMotion(slide, row.gid)!)}
                    </span>
                  )}

                  <span className="lay-ops">
                    <button
                      title="묶음 해제"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        onSelect(row.members[0].id, { alone: false })
                        onUngroup()
                      }}
                    >
                      ▢
                    </button>
                  </span>
                </div>

                {!collapsed.has(row.gid) &&
                  row.members.map((e) => (
                    <LayerRow
                      appearAt={turns[e.id] ?? null}
                      key={e.id}
                      e={e}
                      index={slide.elements.indexOf(e)}
                      indent
                      renamingId={renaming}
                      smart={smartOps}
                      selectedIds={selectedIds}
                      dropOn={dropOn}
                      dragFrom={dragFrom}
                      data={data}
                      onSelect={onSelect}
                      onToggle={onToggle}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onDropEffect={onDropEffect}
                      onReorder={onReorder}
                      onContext={openRowMenu}
                      onLock={(id, locked) => onLayerCmd(locked ? 'lock' : 'unlock', [id])}
                      setDragFrom={setDragFrom}
                      setDropOn={setDropOn}
                    />
                  ))}
              </div>
            ) : (
              <LayerRow
                appearAt={turns[row.el.id] ?? null}
                key={row.el.id}
                e={row.el}
                index={slide.elements.indexOf(row.el)}
                indent={false}
                renamingId={renaming}
                smart={smartOps}
                selectedIds={selectedIds}
                dropOn={dropOn}
                dragFrom={dragFrom}
                data={data}
                onSelect={onSelect}
                onToggle={onToggle}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onDropEffect={onDropEffect}
                onReorder={onReorder}
                onContext={openRowMenu}
                onLock={(id, locked) => onLayerCmd(locked ? 'lock' : 'unlock', [id])}
                setDragFrom={setDragFrom}
                setDropOn={setDropOn}
              />
            )
          )}
          {slide.elements.length === 0 && (
            <p className="ps-empty">위 도구로 텍스트·이미지를 추가하세요</p>
          )}
        </div>
      </div>

      <Splitter axis="y" value={listFit} onChange={setListH} />

      <div className="ps-panel ps-props">
        <header>
          <span>
            {chosen.length > 1
              ? `${chosen.length}개 선택됨`
              : el
                ? '요소 속성'
                : smartDoc
                  ? '고급 개체'
                  : '슬라이드'}
          </span>
        </header>

        {/* 요소를 잡았을 땐 슬라이드 칸을 띄우지 않는다 — 빈 곳을 눌러 선택을 풀면 나온다 */}
        {chosen.length > 1 ? (
          <MultiProps
            chosen={chosen}
            slide={slide}
            onPatch={onPatch}
            onGroup={onGroup}
            onUngroup={onUngroup}
            onPatchGroup={onPatchGroup}
            onMerge={() => onLayerCmd('merge', chosen.map((e) => e.id))}
          />
        ) : el ? (
          <>
            {el.kind === 'smart' && (
              <SmartProps
                el={el}
                name={smartName(el.docId)}
                uses={smartUses(el.docId)}
                onRename={(n) => onRenameSmart(el.docId, n)}
                onOpen={() => onLayerCmd('editSmart', [el.id])}
                onUnpack={() => onLayerCmd('unsmart', [el.id])}
                onMerge={() => onLayerCmd('merge', [el.id])}
              />
            )}
            <ElementProps
              el={el}
              byOrder={orderOf(slide).mode === 'order'}
              appearAt={turns[el.id] ?? 1}
              onPatch={onPatch}
              onPickImage={onPickImage}
              onPickImageUrl={onPickImageUrl}
              onSplitRanks={(n) => onSplitRanks(el.id, n)}
              onUngroup={onUngroup}
              data={data}
            />
          </>
        ) : smartDoc ? (
          /* 고급 개체 안에서는 배경·전환·화면 효과가 뜻이 없다 — 개체 자체의 설정만 */
          <SmartDocProps doc={smartDoc} onPatch={onPatchSlide} onRename={onRenameSmart} />
        ) : (
          <SlideProps
            onScreenFx={onScreenFx}
            slide={slide}
            onPatch={onPatchSlide}
            onSplit={onSplitSlide}
            canSplit={canSplitSlide}
            onPickBackground={onPickBackground}
            onApplyBackgroundToAll={onApplyBackgroundToAll}
            canvas={canvas}
            onCanvas={onCanvas}
            font={font}
            onFont={onFont}
          />
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

/**
 * 레이어 한 줄. 포토샵과 같은 배치:
 *   눈 · (펼침칸) · 썸네일 · 이름
 * 묶음 안의 요소는 펼침칸만큼 한 칸 밀려 폴더 아래로 들어간 것처럼 보인다.
 */
/** "나타나기 → 사라지기" 처럼 등장·퇴장을 한 줄로. */
function motionLabel(m: Motion): string {
  const inName = m.preset !== 'none' ? getEffect(m.preset).name : ''
  const outName = m.exit ? getEffect(m.exit).name : ''
  return outName ? `${inName || '—'} → ${outName}` : inName
}

function LayerRow({
  e,
  index,
  indent,
  selectedIds,
  dropOn,
  dragFrom,
  data,
  onSelect,
  onToggle,
  onDelete,
  onDuplicate,
  onDropEffect,
  onReorder,
  onContext,
  onLock,
  setDragFrom,
  setDropOn,
  appearAt,
  renamingId,
  smart
}: {
  e: SlideElement
  index: number
  indent: boolean
  /** 이름을 고치는 중인 줄 (고급 개체) */
  renamingId: string | null
  /** 고급 개체 줄에서만 쓰는 것들 — 열기·이름·연결 개수 */
  smart: {
    open: (id: string) => void
    rename: (docId: string, name: string) => void
    cancel: () => void
    uses: (docId: string) => number
    name: (docId: string) => string
  }
  /** 등장 차례 (순서대로 모드에서만, 아니면 null) */
  appearAt: number | null
  selectedIds: string[]
  dropOn: string | null
  dragFrom: number | null
  data: CreditData
  onSelect: (id: string, opts?: { additive?: boolean; alone?: boolean }) => void
  onToggle: (id: string, on: boolean) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onDropEffect: (id: string, effectId: string) => void
  onReorder: (from: number, to: number) => void
  /** 우클릭 메뉴 열기 (줄을 먼저 선택한다) */
  onContext: (ev: React.MouseEvent, e: SlideElement, indent: boolean) => void
  /** 자물쇠 아이콘으로 잠금 토글 */
  onLock: (id: string, locked: boolean) => void
  setDragFrom: (i: number | null) => void
  setDropOn: (id: string | null) => void
}): React.JSX.Element {
  // 등장과 퇴장을 함께 걸 수 있으므로 둘 다 보여준다
  const eff = motionLabel(e.motion)
  // 같은 내용을 여러 자리가 쓰고 있으면 알려준다 — 고치면 저쪽도 바뀐다
  const linked = e.kind === 'smart' ? smart.uses(e.docId) : 0
  const label = e.kind === 'smart' ? smart.name(e.docId) : elementLabel(e, data)

  return (
    <div
      draggable
      className={[
        'lay-row',
        selectedIds.includes(e.id) ? 'sel' : '',
        e.visible ? '' : 'off',
        dropOn === e.id ? 'drop' : ''
      ].join(' ')}
      // 묶음 안의 요소는 **그 하나만** 잡힌다 — 폴더를 펼쳤다는 건 안을 만지겠다는 뜻이다
      onClick={(ev) => onSelect(e.id, { additive: ev.shiftKey, alone: indent })}
      // 고급 개체는 두 번 누르면 그 안으로 들어간다 (포토샵과 같다)
      onDoubleClick={(ev) => {
        if (e.kind !== 'smart') return
        ev.stopPropagation()
        smart.open(e.id)
      }}
      onContextMenu={(ev) => onContext(ev, e, indent)}
      onDragStart={(ev) => {
        setDragFrom(index)
        ev.dataTransfer.setData('text/plain', String(index))
      }}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes(EFFECT_DRAG_TYPE) || dragFrom !== null) {
          ev.preventDefault()
          setDropOn(e.id)
        }
      }}
      onDragLeave={() => setDropOn(null)}
      onDrop={(ev) => {
        ev.preventDefault()
        setDropOn(null)
        const fx = ev.dataTransfer.getData(EFFECT_DRAG_TYPE)
        if (fx) return onDropEffect(e.id, fx)
        if (dragFrom !== null && dragFrom !== index) onReorder(dragFrom, index)
        setDragFrom(null)
      }}
    >
      <button
        className={`lay-eye ${e.visible ? 'on' : ''}`}
        onClick={(ev) => {
          ev.stopPropagation()
          onToggle(e.id, !e.visible)
        }}
      >
        <EyeIcon on={e.visible} />
      </button>

      {/* 폴더의 펼침 화살표 자리. 묶음 안이면 그만큼 밀린다 */}
      {indent && <span className="lay-tri-space" />}

      <span className="lay-thumb">
        {e.kind === 'image' && e.src ? <img src={e.src} alt="" /> : <b>{KIND_ICON[e.kind]}</b>}
      </span>

      {renamingId === e.id && e.kind === 'smart' ? (
        <input
          className="lay-rename"
          autoFocus
          defaultValue={label}
          onClick={(ev) => ev.stopPropagation()}
          onBlur={(ev) => smart.rename(e.docId, ev.target.value.trim() || '고급 개체')}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur()
            if (ev.key === 'Escape') smart.cancel()
          }}
        />
      ) : (
        <span className="lay-name">{label}</span>
      )}

      {linked > 1 && (
        <span className="lay-linked" title={`같은 내용을 ${linked}곳이 쓰고 있습니다 — 한 곳을 고치면 전부 바뀝니다`}>
          ⧉{linked}
        </span>
      )}

      {/* 몇 번째로 등장하는지. 목록 순서(=겹침 순서)와 다를 수 있어 눈에 보여야 한다 */}
      {appearAt !== null && (
        <span className={`lay-turn ${e.motion.order ? 'fixed' : ''}`} title="등장 차례">
          {appearAt}
        </span>
      )}

      {eff && <span className="lay-eff">{eff}</span>}

      {e.locked && (
        <button
          className="lay-lock"
          title="잠김 — 눌러서 풀기"
          onClick={(ev) => {
            ev.stopPropagation()
            onLock(e.id, false)
          }}
        >
          <LockIcon />
        </button>
      )}

      <span className="lay-ops">
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            onDuplicate(e.id)
          }}
        >
          ⧉
        </button>
        <button
          onClick={(ev) => {
            ev.stopPropagation()
            onDelete(e.id)
          }}
        >
          🗑
        </button>
      </span>
    </div>
  )
}

/**
 * 여러 개를 잡았을 때.
 *
 * 묶음을 통째로 잡았으면 **묶음 효과만** 다룬다. 안의 요소는 폴더를 펼쳐
 * 하나씩 고르면 그 요소의 속성 칸이 그대로 나오므로, 여기에 "전부에 적용"을
 * 또 두면 실수로 안쪽 효과를 통째로 덮어쓰게 된다.
 *
 * 묶이지 않은 여러 개를 잡았을 때만 예전처럼 공통 효과를 건다.
 */
function MultiProps({
  chosen,
  slide,
  onPatch,
  onGroup,
  onUngroup,
  onPatchGroup,
  onMerge
}: {
  chosen: SlideElement[]
  slide: Slide
  onPatch: (p: Partial<SlideElement>) => void
  onGroup: () => void
  onUngroup: () => void
  onPatchGroup: (gid: string, p: Partial<SlideGroup>) => void
  /** 선택한 것들을 한 장의 이미지로 병합 */
  onMerge: () => void
}): React.JSX.Element {
  const gid = chosen[0].groupId
  const grouped =
    Boolean(gid) && chosen.every((e) => e.groupId === gid) &&
    slide.elements.filter((e) => e.groupId === gid).length === chosen.length
  const mo = chosen[0].motion

  return (
    <div className="fields">
      <Field label="묶음" hint={grouped ? '이미 한 덩어리입니다' : `${chosen.length}개를 묶습니다`}>
        <span className="row" style={{ gap: '0.4rem' }}>
          <button onClick={onGroup} disabled={grouped}>
            ▣ 묶기
          </button>
          <button onClick={onUngroup} disabled={!chosen.some((e) => e.groupId)}>
            ▢ 해제
          </button>
        </span>
      </Field>

      <Field label="병합" hint="한 장의 이미지로 굽기 · 데이터가 고정됩니다">
        <button onClick={onMerge}>🖼 이미지로 병합</button>
      </Field>

      <p className="ps-note">
        {grouped
          ? '안의 요소는 폴더를 펼쳐 하나씩 고르면 따로 고칠 수 있습니다. (Alt+클릭도 됩니다)'
          : '묶으면 하나만 눌러도 전체가 잡힙니다. (Alt+클릭 = 안에서 하나만)'}
      </p>

      {grouped && gid ? (
        <GroupMotionFields slide={slide} gid={gid} onPatchGroup={onPatchGroup} />
      ) : (
        <>
          <hr />
          <p className="ps-note">아래는 선택한 요소 각각에 걸립니다.</p>
          <Field label="등장 효과" hint="선택한 전부에 적용">
            <Select
              value={mo.preset}
              onChange={(p) => onPatch({ motion: { ...mo, preset: p } })}
              options={entranceOptions()}
            />
          </Field>
          <Field label="퇴장 효과" hint="장이 끝나기 직전">
            <Select
              value={mo.exit ?? ''}
              onChange={(v) => onPatch({ motion: { ...mo, exit: v === '' ? null : v } })}
              options={exitOptions()}
            />
          </Field>
          <Field label="효과 속도">
            <Slider
              min={100}
              max={2500}
              step={50}
              value={mo.durationMs}
              onChange={(durationMs) => onPatch({ motion: { ...mo, durationMs } })}
              suffix="ms"
            />
          </Field>
          <Field label="시작 지연">
            <Slider
              min={0}
              max={3000}
              step={50}
              value={mo.delayMs}
              onChange={(delayMs) => onPatch({ motion: { ...mo, delayMs } })}
              suffix="ms"
            />
          </Field>
          <Field label="강조 효과">
            <Select
              value={mo.loop ?? ''}
              onChange={(v) => onPatch({ motion: { ...mo, loop: v === '' ? null : v } })}
              options={emphasisOptions()}
            />
          </Field>
        </>
      )}
    </div>
  )
}

/**
 * 고급 개체 요소의 속성.
 *
 * 크기·회전은 여느 요소처럼 **캔버스에서 직접** 잡아 늘인다(Ctrl+T) — 여기서는
 * 내용을 열고, 이름을 붙이고, 다시 풀어놓는 일만 한다.
 */
function SmartProps({
  el,
  name,
  uses,
  onRename,
  onOpen,
  onUnpack,
  onMerge
}: {
  el: SmartElement
  name: string
  /** 같은 내용을 쓰는 자리 수 */
  uses: number
  onRename: (name: string) => void
  onOpen: () => void
  onUnpack: () => void
  onMerge: () => void
}): React.JSX.Element {
  return (
    <div className="fields" style={{ paddingBottom: 0 }}>
      <Field label="고급 개체" hint="두 번 클릭해도 열립니다">
        <button className="primary" onClick={onOpen}>
          ◈ 내용 편집
        </button>
      </Field>

      <Field label="이름">
        <TextInput value={name} onChange={onRename} />
      </Field>

      {uses > 1 && (
        <p className="ps-note">
          이 내용을 <b>{uses}곳</b>이 함께 쓰고 있습니다. 한 곳을 고치면 전부 바뀝니다 —
          따로 놀게 하려면 해제한 뒤 다시 접으세요.
        </p>
      )}

      <Field label="풀어놓기" hint="지금 크기·회전 그대로 요소들로">
        <span className="row" style={{ gap: '0.4rem' }}>
          <button onClick={onUnpack}>▢ 고급 개체 해제</button>
          <button onClick={onMerge}>🖼 이미지로 굽기</button>
        </span>
      </Field>

      <p className="ps-note mono">
        크기·회전은 캔버스에서 직접 (Ctrl+T) · 안의 좌표는 그대로 남습니다 · id {el.docId.slice(-4)}
      </p>
      <hr />
    </div>
  )
}

/** 고급 개체 **안쪽**을 편집하는 동안의 설정. 배경·전환은 여기서 뜻이 없다. */
function SmartDocProps({
  doc,
  onPatch,
  onRename
}: {
  doc: SmartDoc
  onPatch: (p: Partial<Slide>) => void
  onRename: (docId: string, name: string) => void
}): React.JSX.Element {
  const order = doc.order ?? { mode: 'order' as const, gapMs: 260 }
  return (
    <div className="fields">
      <Field label="이름">
        <TextInput value={doc.name} onChange={(name) => onRename(doc.id, name)} />
      </Field>

      <Field label="안쪽 크기" hint="접을 때의 크기로 굳습니다 — 밖에서 늘이면 통째로 커집니다">
        <span className="mono">
          {doc.canvas.width}×{doc.canvas.height}
        </span>
      </Field>

      <Field label="요소 등장" hint="‘쌓인 순서’ = 뒤에 깔린 것부터 (목록 아래→위)">
        <SegButtons
          value={order.mode}
          onChange={(mode) => onPatch({ order: { ...order, mode: mode as 'order' | 'manual' } })}
          options={[
            { value: 'order', label: '쌓인 순서대로' },
            { value: 'manual', label: '각자 지정' }
          ]}
        />
      </Field>

      {order.mode === 'order' && (
        <Field label="차례 간격">
          <Slider
            min={0}
            max={1200}
            step={20}
            value={order.gapMs}
            onChange={(gapMs) => onPatch({ order: { ...order, gapMs } })}
            suffix="ms"
          />
        </Field>
      )}

      <p className="ps-note">
        여기서 고친 내용은 이 고급 개체를 쓰는 <b>모든 자리</b>에 반영됩니다. Esc 로 나갑니다.
      </p>
    </div>
  )
}

/**
 * 묶음 **자체**에 걸리는 효과.
 *
 * 안의 요소들을 감싼 상자 하나에 걸리므로, 확대·회전은 덩어리 한가운데를 축으로 돈다.
 * 효과를 하나도 안 걸면 상자를 아예 만들지 않아 겹침 순서가 예전 그대로 유지된다.
 */
/**
 * 등장 효과음 한 줄 — 요소와 묶음이 같은 것을 쓴다.
 *
 * 장 효과음(소리 서랍)과는 자리가 다르다. 이건 **이것이 나타나는 순간**이라 효과 칸에
 * 있어야 맞다 — 등장 효과 바로 아래에서 "어떻게 나타나는가"와 함께 고르게 된다.
 * 등장 지연을 그대로 따라가므로 화면과 소리가 어긋나지 않는다.
 */
function AppearSoundField({
  label,
  hint,
  clip,
  onChange
}: {
  label: string
  hint: string
  clip: AudioClip | null | undefined
  onChange: (next: AudioClip | null) => void
}): React.JSX.Element {
  const chosen = BUILTIN_SOUNDS.find((b) => clip?.src === builtinAudioUrl(b.id))?.id ?? ''
  const vol = clip?.volume ?? 90

  async function pickFile(): Promise<void> {
    const asset = await window.endcredit.assets.pickAudio()
    if (asset) onChange({ src: asset.url, volume: vol })
  }

  return (
    <>
      <Field label={label} hint={hint}>
        <Select
          value={chosen}
          onChange={(id) =>
            onChange(id === '' ? null : { src: builtinAudioUrl(id), volume: vol })
          }
          options={[
            { value: '', label: clip?.src && !chosen ? '내 파일 사용 중' : '없음' },
            ...BUILTIN_SOUNDS.map((b) => ({ value: b.id, label: `${b.name} — ${b.hint}` }))
          ]}
        />
      </Field>
      <Field label="">
        <span className="row" style={{ gap: '0.35rem' }}>
          <button onClick={() => void pickFile()}>내 파일…</button>
          <TryButton clip={clip ?? null} />
          {clip?.src && (
            <button title="효과음 빼기" onClick={() => onChange(null)}>
              ×
            </button>
          )}
        </span>
      </Field>
      {clip?.src && (
        <>
          <Field label="소리 크기">
            <Slider
              min={0}
              max={100}
              value={vol}
              onChange={(volume) => onChange({ ...clip, volume })}
              suffix="%"
            />
          </Field>
          <PitchField clip={clip} onChange={onChange} />
        </>
      )}
    </>
  )
}

function GroupMotionFields({
  slide,
  gid,
  onPatchGroup
}: {
  slide: Slide
  gid: string
  onPatchGroup: (gid: string, p: Partial<SlideGroup>) => void
}): React.JSX.Element {
  const m = groupMotion(slide, gid) ?? DEFAULT_MOTION
  const set = (p: Partial<Motion>): void => onPatchGroup(gid, { motion: { ...m, ...p } })
  const on = hasMotion(groupMotion(slide, gid))

  return (
    <>
      <hr />
      <p className="ps-note">
        <b>묶음 전체</b>에 걸리는 효과입니다. 덩어리가 통째로 하나처럼 움직입니다.
      </p>
      <Field label="묶음 등장 효과" hint="폴더 줄에 효과를 끌어다 놔도 됩니다">
        <Select
          value={m.preset}
          onChange={(preset) => set({ preset })}
          options={entranceOptions()}
        />
      </Field>
      <Field label="묶음 퇴장 효과">
        <Select
          value={m.exit ?? ''}
          onChange={(v) => set({ exit: v === '' ? null : v })}
          options={exitOptions()}
        />
      </Field>
      {on && (
        <>
          <Field label="묶음 효과 속도">
            <Slider
              min={100}
              max={2500}
              step={50}
              value={m.durationMs}
              onChange={(durationMs) => set({ durationMs })}
              suffix="ms"
            />
          </Field>
          <Field label="묶음 강조 효과" hint="등장 뒤 계속 반복">
            <Select
              value={m.loop ?? ''}
              onChange={(v) => set({ loop: v === '' ? null : v })}
              options={emphasisOptions()}
            />
          </Field>
        </>
      )}
      <AppearSoundField
        label="묶음 등장 효과음"
        hint="덩어리가 나타날 때 한 번 (안의 요소마다가 아니라)"
        clip={m.sound}
        onChange={(sound) => set({ sound })}
      />

      {orderOf(slide).mode === 'manual' && (
        <Field label="묶음 시작 지연">
          <Slider
            min={0}
            max={3000}
            step={50}
            value={m.delayMs}
            onChange={(delayMs) => set({ delayMs })}
            suffix="ms"
          />
        </Field>
      )}

      <Field label="안의 요소 등장" hint="‘순서대로’ 모드에서만">
        <SegButtons
          value={slide.groups?.[gid]?.inner ?? 'together'}
          onChange={(inner) => onPatchGroup(gid, { inner })}
          options={[
            { value: 'together', label: '함께' },
            { value: 'sequence', label: '차례로' }
          ]}
        />
      </Field>
    </>
  )
}

/**
 * 목록에 보일 이름.
 * 데이터 필드는 **실제 값으로 바꿔서** 보여준다 — 목록에 `{chatRank.1.name}` 이
 * 그대로 뜨면 그게 뭘로 나올지 알 수 없다.
 */
function elementLabel(e: SlideElement, data: CreditData): string {
  if (e.kind === 'text') {
    const raw = runsToText(e.runs, e.text)
    if (!hasFields(raw)) return raw.slice(0, 24) || '(빈 텍스트)'
    // 값이 아직 없으면 토큰을 그대로 두어(placeholder) 무엇을 가리키는지는 보이게 한다
    const resolved = interpolate(raw, data).trim()
    return (resolved || interpolate(raw, data, true)).slice(0, 24)
  }
  if (e.kind === 'image') return e.src ? '이미지' : '이미지 (비어 있음)'
  if (e.kind === 'data')
    return e.title || SOURCE_OPTIONS.find((o) => o.value === e.source)?.label || '순위'
  if (e.kind === 'rank')
    return `${e.rank}등 · ${SOURCE_OPTIONS.find((o) => o.value === e.source)?.label ?? ''}`
  if (e.kind === 'train')
    return `기차 · ${SOURCE_OPTIONS.find((o) => o.value === e.source)?.label ?? ''}`
  // 고급 개체는 보관함의 이름을 쓴다 — 부르는 쪽(LayerRow)이 넘겨준다
  if (e.kind === 'smart') return e.name || '고급 개체'
  return '도형'
}

function ElementProps({
  el,
  byOrder,
  appearAt,
  onPatch,
  onPickImage,
  onPickImageUrl,
  onSplitRanks,
  onUngroup,
  data
}: {
  el: SlideElement
  /** 이 장이 '순서대로' 모드인지. '각자 지정'이면 지연을 직접 준다 */
  byOrder: boolean
  /** 지금 계산된 등장 차례 — 비워뒀을 때 placeholder 로 보여준다 */
  appearAt: number
  onPatch: (p: Partial<SlideElement>) => void
  onPickImage: () => void
  onPickImageUrl: () => Promise<string | null>
  onSplitRanks: (count: number) => void
  onUngroup: () => void
  data: CreditData
}): React.JSX.Element {
  const f = el.frame
  const mo = el.motion

  return (
    <div className="fields">
      {el.groupId && (
        <Field label="묶음" hint="다른 요소와 한 덩어리입니다">
          <button onClick={onUngroup}>▢ 묶음 해제</button>
        </Field>
      )}
      {el.kind === 'text' && (
        <Section id="text-content" title="텍스트" defaultOpen>
          <Field label="내용" hint="아래 '데이터 필드' 에서 끌어다 넣으세요">
            <textarea
              className="input"
              rows={3}
              value={el.text}
              onChange={(e) => onPatch({ text: e.target.value } as Partial<SlideElement>)}
            />
            {hasFields(el.text) && (
              <span className="field-preview">
                실제 표시: <b>{interpolate(el.text, data) || '(값 없음)'}</b>
              </span>
            )}
          </Field>
        </Section>
      )}

      {el.kind === 'image' && (
        <ImageProps el={el} onPatch={onPatch} onPickImage={onPickImage} />
      )}

      {el.kind === 'shape' && <ShapeProps el={el} onPatch={onPatch} />}

      {el.kind === 'data' && (
        <Section id="data-content" title="내용" defaultOpen>
          <DataProps el={el} onPatch={onPatch} onSplitRanks={onSplitRanks} />
        </Section>
      )}

      {el.kind === 'rank' && (
        <Section id="rank-content" title="내용" defaultOpen>
          <RankProps el={el} onPatch={onPatch} />
        </Section>
      )}

      {/* 기차는 속성이 스물 몇 개라 자기 안에서 다시 여러 묶음으로 나뉜다 */}
      {el.kind === 'train' && (
        <TrainProps el={el} onPatch={onPatch} onPickImageUrl={onPickImageUrl} />
      )}

      {/* ── 글자 ─────────────────────────────────── */}
      {/* TextStyleFields 가 스스로 묶음을 만든다 — 한 번 더 감싸면 두 번 펼쳐야 한다 */}
      {el.kind === 'rank' && (
        <>
          <TextStyleFields
            style={el.rankStyle}
            label="등수"
            onChange={(rankStyle) => onPatch({ rankStyle } as Partial<SlideElement>)}
          />
          <TextStyleFields
            style={el.nameStyle}
            label="이름"
            onChange={(nameStyle) => onPatch({ nameStyle } as Partial<SlideElement>)}
          />
        </>
      )}

      {(el.kind === 'text' || el.kind === 'data') && (
        <>
          <TextStyleFields
            style={el.kind === 'text' ? el.style : el.titleStyle}
            label={el.kind === 'data' ? '제목' : '글자'}
            onChange={(style) =>
              onPatch(
                (el.kind === 'text' ? { style } : { titleStyle: style }) as Partial<SlideElement>
              )
            }
          />
          {el.kind === 'data' && (
            <TextStyleFields
              style={el.itemStyle}
              label="항목"
              onChange={(itemStyle) => onPatch({ itemStyle } as Partial<SlideElement>)}
            />
          )}
        </>
      )}

      {/* ── 위치·크기 ─────────────────────────────── */}
      <Section id="frame" title="위치·크기" hint="캔버스에서 직접 끌어도 됩니다">
        <div className="xy4">
          <Field label="X">
            <NumberInput value={Math.round(f.x)} onChange={(x) => onPatch({ frame: { ...f, x } })} suffix="%" />
          </Field>
          <Field label="Y">
            <NumberInput value={Math.round(f.y)} onChange={(y) => onPatch({ frame: { ...f, y } })} suffix="%" />
          </Field>
          <Field label="폭">
            <NumberInput value={Math.round(f.w)} onChange={(w) => onPatch({ frame: { ...f, w } })} suffix="%" />
          </Field>
          <Field label="높이">
            <NumberInput value={Math.round(f.h)} onChange={(h) => onPatch({ frame: { ...f, h } })} suffix="%" />
          </Field>
        </div>
        <Field label="회전">
          <Slider min={-180} max={180} value={el.rotation} onChange={(rotation) => onPatch({ rotation })} suffix="°" />
        </Field>
        <Field label="불투명도">
          <Slider min={0} max={100} value={el.opacity} onChange={(opacity) => onPatch({ opacity })} suffix="%" />
        </Field>
      </Section>

      {/* ── 효과 ─────────────────────────────────── */}
      <Section id="motion" title="효과" hint="등장 · 퇴장 · 강조" defaultOpen>
      <Field label="등장 효과" hint="아래 라이브러리에서 끌어와도 됩니다">
        <Select
          value={mo.preset}
          onChange={(p) => onPatch({ motion: { ...mo, preset: p } })}
          options={entranceOptions()}
        />
      </Field>
      <Field label="등장 속도">
        <Slider
          min={100}
          max={2500}
          step={50}
          value={mo.durationMs}
          onChange={(durationMs) => onPatch({ motion: { ...mo, durationMs } })}
          suffix="ms"
        />
      </Field>
      {/* 쌓인 순서가 겹침 순서를 겸하므로, 등장 차례는 따로 정할 길이 있어야 한다 */}
      {byOrder ? (
        <Field label="등장 차례" hint="비우면 쌓인 차례를 따름 (목록 아래→위)">
          <span className="turn-row">
            <input
              className="input"
              type="number"
              min={1}
              max={99}
              placeholder={String(appearAt)}
              value={mo.order ?? ''}
              onChange={(ev) => {
                const v = ev.target.value.trim()
                onPatch({ motion: { ...mo, order: v === '' ? undefined : Number(v) } })
              }}
            />
            {mo.order !== undefined && (
              <button
                title="목록 위치를 따르게"
                onClick={() => onPatch({ motion: { ...mo, order: undefined } })}
              >
                ↺
              </button>
            )}
          </span>
        </Field>
      ) : (
        <Field label="시작 지연">
          <Slider
            min={0}
            max={3000}
            step={50}
            value={mo.delayMs}
            onChange={(delayMs) => onPatch({ motion: { ...mo, delayMs } })}
            suffix="ms"
          />
        </Field>
      )}
      {el.kind === 'data' && (
        <Field label="한 줄씩 시차" hint="0이면 동시에">
          <Slider
            min={0}
            max={300}
            step={10}
            value={mo.staggerMs}
            onChange={(staggerMs) => onPatch({ motion: { ...mo, staggerMs } })}
            suffix="ms"
          />
        </Field>
      )}
      {/* 등장과 별개다 — 왼쪽에서 들어와 오른쪽으로 나가는 조합이 되어야 한다 */}
      <Field label="퇴장 효과" hint="장이 끝나기 직전에 사라짐">
        <Select
          value={mo.exit ?? ''}
          onChange={(v) => onPatch({ motion: { ...mo, exit: v === '' ? null : v } })}
          options={exitOptions()}
        />
      </Field>
      {mo.exit && (
        <Field label="퇴장 속도" hint="장 길이는 자동으로 늘어납니다">
          <Slider
            min={100}
            max={2500}
            step={50}
            value={exitDurationOf(mo)}
            onChange={(exitDurationMs) => onPatch({ motion: { ...mo, exitDurationMs } })}
            suffix="ms"
          />
        </Field>
      )}

      <Field label="가속 곡선" hint="등장이 어떤 속도감으로 움직이는지">
        <Select
          value={mo.easing}
          onChange={(easing) => onPatch({ motion: { ...mo, easing } })}
          options={EASINGS}
        />
      </Field>

      <Field label="강조 효과" hint="등장이 끝난 뒤 계속 반복">
        <Select
          value={mo.loop ?? ''}
          onChange={(v) => onPatch({ motion: { ...mo, loop: v === '' ? null : v } })}
          options={emphasisOptions()}
        />
      </Field>
      {mo.loop && (
        <>
          <Field label="강조 주기" hint="한 번 도는 시간 · 작을수록 빠름">
            <Slider
              min={100}
              max={6000}
              step={50}
              value={mo.loopDurationMs}
              onChange={(loopDurationMs) => onPatch({ motion: { ...mo, loopDurationMs } })}
              suffix="ms"
            />
          </Field>
          <Field label="강조 세기" hint="흔들리는 폭·커지는 정도">
            <Slider
              min={0}
              max={400}
              step={5}
              value={mo.loopAmp ?? 100}
              onChange={(loopAmp) => onPatch({ motion: { ...mo, loopAmp } })}
              suffix="%"
            />
          </Field>
        </>
      )}

      <AppearSoundField
        label="등장 효과음"
        hint="이 요소가 나타나는 순간 한 번"
        clip={mo.sound}
        onChange={(sound) => onPatch({ motion: { ...mo, sound } })}
      />
      </Section>
    </div>
  )
}

function RankProps({
  el,
  onPatch
}: {
  el: RankElement
  onPatch: (p: Partial<SlideElement>) => void
}): React.JSX.Element {
  return (
    <>
      <Field label="내용">
        <Select
          value={el.source}
          onChange={(source) => onPatch({ source } as Partial<SlideElement>)}
          options={SOURCE_OPTIONS.filter((o) => !['text', 'image', 'spacer'].includes(o.value))}
        />
      </Field>
      <Field label="등수">
        <NumberInput
          value={el.rank}
          min={1}
          max={50}
          onChange={(rank) => onPatch({ rank } as Partial<SlideElement>)}
          suffix="등"
        />
      </Field>
      <Field label="등수 표기" hint="{n} 자리에 숫자가 들어갑니다">
        <TextInput
          value={el.rankFormat}
          onChange={(rankFormat) => onPatch({ rankFormat } as Partial<SlideElement>)}
        />
      </Field>
      <Field label="표시 항목">
        <span className="row" style={{ gap: '0.8rem' }}>
          <CheckBox
            checked={el.showRank}
            onChange={(showRank) => onPatch({ showRank } as Partial<SlideElement>)}
            label="등수"
          />
          <CheckBox
            checked={el.showValue}
            onChange={(showValue) => onPatch({ showValue } as Partial<SlideElement>)}
            label="수치"
          />
        </span>
      </Field>
      <Field label="해당 등수가 없을 때">
        <SegButtons
          value={el.emptyBehavior}
          onChange={(emptyBehavior) => onPatch({ emptyBehavior } as Partial<SlideElement>)}
          options={[
            { value: 'hide', label: '숨기기' },
            { value: 'placeholder', label: '문구' }
          ]}
        />
      </Field>
    </>
  )
}

/** 이미지 여러 장을 담는 작은 목록 (썸네일 + 빼기 + 추가). 기차의 칸·장식 이미지에 쓴다. */
function TrainImageList({
  label,
  hint,
  list,
  onChange,
  onPick
}: {
  label: string
  hint?: string
  list: string[]
  onChange: (list: string[]) => void
  onPick: () => Promise<string | null>
}): React.JSX.Element {
  return (
    <Field label={label} hint={hint}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {list.map((src, i) => (
          <span key={i} className="train-thumb">
            <img src={src} alt="" />
            <button title="빼기" onClick={() => onChange(list.filter((_, k) => k !== i))}>
              ×
            </button>
          </span>
        ))}
        <button
          onClick={async () => {
            const u = await onPick()
            if (u) onChange([...list, u])
          }}
        >
          + 추가
        </button>
      </div>
    </Field>
  )
}

/**
 * 기차의 양 끝 칸 이미지 — **한 장만** 받는다.
 * 마지막 칸은 좌우로 뒤집어 쓰므로, 뒤집힌 모습도 나란히 보여준다.
 */
function TrainCapImage({
  src,
  onChange,
  onPick
}: {
  src: string | null
  onChange: (src: string | null) => void
  onPick: () => Promise<string | null>
}): React.JSX.Element {
  return (
    <Field label="양 끝 칸 이미지" hint="첫 칸에 쓰고, 마지막 칸은 좌우로 뒤집어 씁니다">
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {src && (
          <>
            <span className="train-thumb">
              <img src={src} alt="" />
              <button title="빼기" onClick={() => onChange(null)}>
                ×
              </button>
            </span>
            <span className="train-thumb" title="마지막 칸에는 이렇게 붙습니다">
              <img src={src} alt="" style={{ transform: 'scaleX(-1)' }} />
            </span>
          </>
        )}
        <button
          onClick={async () => {
            const u = await onPick()
            if (u) onChange(u)
          }}
        >
          {src ? '바꾸기' : '+ 추가'}
        </button>
      </div>
    </Field>
  )
}

function TrainProps({
  el,
  onPatch,
  onPickImageUrl
}: {
  el: TrainElement
  onPatch: (p: Partial<SlideElement>) => void
  onPickImageUrl: () => Promise<string | null>
}): React.JSX.Element {
  return (
    <>
      <Section id="train-data" title="내용" hint="무엇을 태울지" defaultOpen>
      <Field label="데이터" hint="칸에 태울 데이터">
        <Select
          value={el.source}
          onChange={(source) => onPatch({ source } as Partial<SlideElement>)}
          options={SOURCE_OPTIONS.filter((o) => !['text', 'image', 'spacer'].includes(o.value))}
        />
      </Field>
      <Field label="칸 갯수">
        <Slider
          min={1}
          max={100}
          value={el.count}
          onChange={(count) => onPatch({ count } as Partial<SlideElement>)}
          suffix="칸"
        />
      </Field>
      <Field label="태우는 순서" hint="칸에 얹는 데이터 차례">
        <SegButtons
          value={el.order}
          onChange={(order) => onPatch({ order } as Partial<SlideElement>)}
          options={[
            { value: 'asc', label: '처음부터 (1→N)' },
            { value: 'desc', label: '마지막부터 (N→1)' }
          ]}
        />
      </Field>
      </Section>

      <Section id="train-move" title="움직임" hint="방향 · 속도" defaultOpen>
      <Field label="진행 방향">
        <SegButtons
          value={el.dir}
          onChange={(dir) => onPatch({ dir } as Partial<SlideElement>)}
          options={[
            { value: 'rtl', label: '우 → 좌' },
            { value: 'ltr', label: '좌 → 우' }
          ]}
        />
      </Field>
      <Field label="지나가는 시간" hint="화면 밖에서 나타나 반대쪽 밖으로 빠져나갈 때까지 · 한 번만 지나갑니다">
        <Slider
          min={2000}
          max={160000}
          step={500}
          value={el.durationMs}
          onChange={(durationMs) => onPatch({ durationMs } as Partial<SlideElement>)}
          suffix="ms"
        />
      </Field>
      </Section>

      <Section id="train-car" title="칸 모양" hint="크기 · 비율 · 글자 자리">
      <Field label="칸 크기" hint="기차 상자 높이 대비">
        <Slider
          min={20}
          max={100}
          value={el.carSize}
          onChange={(carSize) => onPatch({ carSize } as Partial<SlideElement>)}
          suffix="%"
        />
      </Field>
      <Field label="칸 비율" hint="가로:세로 · 글이 길면 넓히세요 (1.5 = 3:2)">
        <Slider
          min={0.5}
          max={5}
          step={0.1}
          value={el.carRatio ?? 1.5}
          onChange={(carRatio) => onPatch({ carRatio } as Partial<SlideElement>)}
          suffix="배"
        />
      </Field>

      </Section>

      {/* 칸에 무엇이 실리는지가 이 요소의 핵심이다 — 이미지 설정보다 위에 둔다 */}
      <Section id="train-label" title="칸에 실리는 글" hint="등수 · 이름 · 수치" defaultOpen>
      <Field label="칸에 넣을 것" hint="꺼둔 것은 자리째 빠집니다">
        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <CheckBox
            checked={el.showRank !== false}
            onChange={(showRank) => onPatch({ showRank } as Partial<SlideElement>)}
            label="등수 (1등 · 2등 …)"
          />
          <CheckBox
            checked={el.showValue}
            onChange={(showValue) => onPatch({ showValue } as Partial<SlideElement>)}
            label="수치 (247회 · 320개 …)"
          />
        </span>
      </Field>
      <Field label="칸 안 배치">
        <SegButtons
          value={el.carLayout ?? 'stack'}
          onChange={(carLayout) => onPatch({ carLayout } as Partial<SlideElement>)}
          options={[
            { value: 'stack', label: '수치를 아랫줄' },
            { value: 'row', label: '한 줄' }
          ]}
        />
      </Field>
      <Field
        label="늘어놓는 차례"
        hint={
          (el.carLayout ?? 'stack') === 'stack'
            ? '윗줄에 놓이는 등수·이름 차례 (수치는 늘 아랫줄)'
            : undefined
        }
      >
        <SegButtons
          value={el.carOrder ?? 'rank-name-value'}
          onChange={(carOrder) => onPatch({ carOrder } as Partial<SlideElement>)}
          options={
            (el.carLayout ?? 'stack') === 'stack'
              ? [
                  { value: 'rank-name-value', label: '등수·이름' },
                  { value: 'name-value-rank', label: '이름·등수' }
                ]
              : [
                  { value: 'rank-name-value', label: '등수·이름·수치' },
                  { value: 'rank-value-name', label: '등수·수치·이름' },
                  { value: 'name-value-rank', label: '이름·수치·등수' }
                ]
          }
        />
      </Field>
      <Field label="글자 크기" hint="칸에 실리는 이름 기준 · 등수·수치는 아래 배율로 따라갑니다">
        <Slider
          min={8}
          max={200}
          value={el.nameStyle.size}
          onChange={(size) =>
            onPatch({ nameStyle: { ...el.nameStyle, size } } as Partial<SlideElement>)
          }
          suffix="px"
        />
      </Field>
      <Field label="글자 영역 폭" hint="칸 너비 대비 · 칸 그림에 글자 자리가 따로 있으면 좁히세요">
        <Slider
          min={20}
          max={100}
          value={el.textWidth ?? 92}
          onChange={(textWidth) => onPatch({ textWidth } as Partial<SlideElement>)}
          suffix="%"
        />
      </Field>
      <Field label="글자 세로 위치" hint="칸 높이 기준 · 50 = 한가운데">
        <Slider
          min={0}
          max={100}
          value={el.textY ?? 50}
          onChange={(textY) => onPatch({ textY } as Partial<SlideElement>)}
          suffix="%"
        />
      </Field>
      {el.showRank !== false && (
        <>
          <Field label="등수 표기" hint="{n} 자리에 숫자 (예: {n}등, #{n})">
            <TextInput
              value={el.rankFormat ?? '{n}'}
              onChange={(rankFormat) => onPatch({ rankFormat } as Partial<SlideElement>)}
            />
          </Field>
          <Field label="등수 크기 · 색" hint="이름 대비">
            <span className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
              <Slider
                min={30}
                max={250}
                value={el.rankScale ?? 100}
                onChange={(rankScale) => onPatch({ rankScale } as Partial<SlideElement>)}
                suffix="%"
              />
              <ColorInput
                value={el.rankColor ?? '#ffd166'}
                onChange={(rankColor) => onPatch({ rankColor } as Partial<SlideElement>)}
              />
            </span>
          </Field>
        </>
      )}
      {el.showValue && (
        <Field label="수치 크기 · 색" hint="이름 대비">
          <span className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
            <Slider
              min={30}
              max={250}
              value={el.valueScale ?? 68}
              onChange={(valueScale) => onPatch({ valueScale } as Partial<SlideElement>)}
              suffix="%"
            />
            <ColorInput
              value={el.valueColor}
              onChange={(valueColor) => onPatch({ valueColor } as Partial<SlideElement>)}
            />
          </span>
        </Field>
      )}

      </Section>

      <Section id="train-img" title="칸 이미지" hint="양 끝 · 가운데">
      <TrainCapImage
        src={el.capImage ?? null}
        onChange={(capImage) => onPatch({ capImage } as Partial<SlideElement>)}
        onPick={onPickImageUrl}
      />
      <TrainImageList
        label="가운데 칸 이미지"
        hint={
          el.images.length
            ? '가운데 칸에 돌아가며 씁니다'
            : el.capImage
              ? '없으면 가운데는 단색 칸'
              : '없으면 단색 칸'
        }
        list={el.images}
        onChange={(images) => onPatch({ images } as Partial<SlideElement>)}
        onPick={onPickImageUrl}
      />
      </Section>

      <Section id="train-ov" title="칸 위 장식" hint="위치 · 크기 · 강조">
      <TrainImageList
        label="칸 위 장식"
        hint="칸 위에 얹을 이미지 (여러 개 · 칸마다 돌아가며)"
        list={el.overlays}
        onChange={(overlays) => onPatch({ overlays } as Partial<SlideElement>)}
        onPick={onPickImageUrl}
      />
      {el.overlays.length > 0 && (
        <>
          <Field label="장식 가로 위치" hint="칸 너비 기준 · 50 = 가운데 · 넘어가도 됩니다">
            <Slider
              min={-150}
              max={250}
              value={el.overlayX ?? 50}
              onChange={(overlayX) => onPatch({ overlayX } as Partial<SlideElement>)}
              suffix="%"
            />
          </Field>
          <Field label="장식 세로 위치" hint="칸 높이 기준 · 0 = 칸 윗변 · 음수면 위로 뜸">
            <Slider
              min={-300}
              max={300}
              value={el.overlayY ?? -6}
              onChange={(overlayY) => onPatch({ overlayY } as Partial<SlideElement>)}
              suffix="%"
            />
          </Field>
          <Field label="장식 크기" hint="칸 높이 대비">
            <Slider
              min={5}
              max={500}
              value={el.overlaySize ?? 46}
              onChange={(overlaySize) => onPatch({ overlaySize } as Partial<SlideElement>)}
              suffix="%"
            />
          </Field>
          <Field label="장식 강조 효과" hint="칸 강조와 따로 · 장식만 계속 반복">
            <Select
              value={el.overlayEmphasis ?? ''}
              onChange={(v) =>
                onPatch({ overlayEmphasis: v === '' ? null : v } as Partial<SlideElement>)
              }
              options={emphasisOptions()}
            />
          </Field>
          {el.overlayEmphasis && (
            <>
              <Field label="장식 강조 주기">
                <Slider
                  min={100}
                  max={3000}
                  step={50}
                  value={el.overlayEmphasisMs ?? 900}
                  onChange={(overlayEmphasisMs) =>
                    onPatch({ overlayEmphasisMs } as Partial<SlideElement>)
                  }
                  suffix="ms"
                />
              </Field>
              <Field label="장식 강조 세기">
                <Slider
                  min={0}
                  max={400}
                  step={5}
                  value={el.overlayEmphasisAmp ?? 100}
                  onChange={(overlayEmphasisAmp) =>
                    onPatch({ overlayEmphasisAmp } as Partial<SlideElement>)
                  }
                  suffix="%"
                />
              </Field>
            </>
          )}
        </>
      )}

      </Section>

      <Section id="train-emp" title="칸 강조">
      <Field label="칸 강조 효과" hint="칸 하나하나가 계속 반복 (장식은 위에서 따로 정합니다)">
        <Select
          value={el.carEmphasis ?? ''}
          onChange={(v) => onPatch({ carEmphasis: v === '' ? null : v } as Partial<SlideElement>)}
          options={emphasisOptions()}
        />
      </Field>
      {el.carEmphasis && (
        <>
          <Field label="강조 주기">
            <Slider
              min={100}
              max={3000}
              step={50}
              value={el.carEmphasisMs}
              onChange={(carEmphasisMs) => onPatch({ carEmphasisMs } as Partial<SlideElement>)}
              suffix="ms"
            />
          </Field>
          <Field label="강조 세기">
            <Slider
              min={0}
              max={400}
              step={5}
              value={el.carEmphasisAmp ?? 100}
              onChange={(carEmphasisAmp) => onPatch({ carEmphasisAmp } as Partial<SlideElement>)}
              suffix="%"
            />
          </Field>
        </>
      )}

      </Section>

      <TextStyleFields
        style={el.nameStyle}
        label="이름"
        onChange={(nameStyle) => onPatch({ nameStyle } as Partial<SlideElement>)}
      />
    </>
  )
}

function DataProps({
  el,
  onPatch,
  onSplitRanks
}: {
  el: DataElement
  onPatch: (p: Partial<SlideElement>) => void
  onSplitRanks: (count: number) => void
}): React.JSX.Element {
  return (
    <>
      <Field label="내용">
        <Select
          value={el.source}
          onChange={(source) => onPatch({ source } as Partial<SlideElement>)}
          options={SOURCE_OPTIONS.filter((o) => !['text', 'image', 'spacer'].includes(o.value))}
        />
      </Field>
      <Field label="제목">
        <TextInput value={el.title} onChange={(title) => onPatch({ title } as Partial<SlideElement>)} />
      </Field>
      {/* 자동 흐름이면 몇 명이든 열로 흘러나가므로 50 에서 끊을 이유가 없다 */}
      <Field label="표시 인원">
        <Slider
          min={1}
          max={200}
          value={el.limit}
          onChange={(limit) => onPatch({ limit } as Partial<SlideElement>)}
          suffix="명"
        />
      </Field>
      <Field label="열 수" hint="자동이면 상자에 들어가는 만큼 늘어납니다">
        <SegButtons
          value={el.autoFlow ? 'auto' : String(el.columns)}
          onChange={(c) =>
            onPatch(
              (c === 'auto'
                ? { autoFlow: true }
                : { autoFlow: false, columns: Number(c) as 1 | 2 | 3 }) as Partial<SlideElement>
            )
          }
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: 'auto', label: '자동' }
          ]}
        />
      </Field>

      {el.autoFlow ? (
        <>
          <Field label="흐르는 방향" hint="상자 끝에 닿으면 다음 열로 넘어갑니다">
            <SegButtons
              value={el.flowDir === 'right' ? 'right' : 'down'}
              onChange={(flowDir) => onPatch({ flowDir } as Partial<SlideElement>)}
              options={[
                { value: 'down', label: '↓ 위에서 아래로' },
                { value: 'right', label: '→ 왼쪽에서 오른쪽으로' }
              ]}
            />
          </Field>
          <Field label="넘치면" hint="새 열·줄이 생기는 쪽">
            <SegButtons
              value={el.flowBack ? 'back' : 'fwd'}
              onChange={(v) => onPatch({ flowBack: v === 'back' } as Partial<SlideElement>)}
              options={
                el.flowDir === 'right'
                  ? [
                      { value: 'fwd', label: '↓ 아랫줄로' },
                      { value: 'back', label: '↑ 윗줄로' }
                    ]
                  : [
                      { value: 'fwd', label: '→ 오른쪽 열로' },
                      { value: 'back', label: '← 왼쪽 열로' }
                    ]
              }
            />
          </Field>
        </>
      ) : (
        el.columns > 1 && (
          <Field label="채우는 순서" hint="여러 열일 때">
            <SegButtons
              value={el.columnFlow === 'row' ? 'row' : 'column'}
              onChange={(columnFlow) => onPatch({ columnFlow } as Partial<SlideElement>)}
              options={[
                { value: 'column', label: '↓ 세로 우선' },
                { value: 'row', label: '→ 가로 우선' }
              ]}
            />
          </Field>
        )
      )}
      {(
        <>
          <Field label="수치 표시">
            <CheckBox
              checked={el.showValue}
              onChange={(showValue) => onPatch({ showValue } as Partial<SlideElement>)}
              label="이름 옆에 횟수·개수"
            />
          </Field>
          <Field label="수치 색">
            <ColorInput
              value={el.valueColor}
              onChange={(valueColor) => onPatch({ valueColor } as Partial<SlideElement>)}
            />
          </Field>
          <Field label="줄 간격">
            <Slider
              min={0}
              max={48}
              value={el.gap}
              onChange={(gap) => onPatch({ gap } as Partial<SlideElement>)}
              suffix="px"
            />
          </Field>
          {(el.autoFlow || el.columns > 1) && (
            <Field label="열 간격" hint="열과 열 사이">
              <Slider
                min={0}
                max={200}
                value={Math.round(el.colGap ?? el.gap * 3)}
                onChange={(colGap) => onPatch({ colGap } as Partial<SlideElement>)}
                suffix="px"
              />
            </Field>
          )}
          <Field label="데이터 없을 때">
            <SegButtons
              value={el.emptyBehavior}
              onChange={(emptyBehavior) => onPatch({ emptyBehavior } as Partial<SlideElement>)}
              options={[
                { value: 'hide', label: '숨기기' },
                { value: 'placeholder', label: '문구' }
              ]}
            />
          </Field>
        </>
      )}
    </>
  )
}

function StrokeRows({
  style,
  onChange
}: {
  style: TextStyle
  onChange: (s: TextStyle) => void
}): React.JSX.Element {
  const list = strokesOf(style)
  const set = (next: TextStroke[]): void => onChange({ ...style, strokes: next })

  return (
    <>
      {list.map((st, i) => (
        <Field
          key={i}
          label={i === 0 ? '선' : `선 ${i + 1}`}
          hint={i === 0 ? '글자에 직접 두르는 겹' : '앞 겹을 감싸는 바깥 겹'}
        >
          <span className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
            <Slider
              min={1}
              max={30}
              value={st.width}
              onChange={(width) => set(list.map((v, k) => (k === i ? { ...v, width } : v)))}
              suffix="px"
            />
            <ColorInput
              value={st.color}
              onChange={(color) => set(list.map((v, k) => (k === i ? { ...v, color } : v)))}
            />
            <button title="빼기" onClick={() => set(list.filter((_, k) => k !== i))}>
              ×
            </button>
          </span>
          <span className="row" style={{ gap: '0.35rem' }}>
            {i === 0 && st.join !== 'sharp' && (
              <SegButtons
                value={st.outside === false ? 'center' : 'outside'}
                onChange={(v) =>
                  set(list.map((s2, k) => (k === i ? { ...s2, outside: v === 'outside' } : s2)))
                }
                options={[
                  { value: 'outside', label: '바깥쪽' },
                  { value: 'center', label: '가운데' }
                ]}
              />
            )}
            <SegButtons
              value={st.join === 'sharp' ? 'sharp' : 'round'}
              onChange={(join) => set(list.map((s2, k) => (k === i ? { ...s2, join } : s2)))}
              options={[
                { value: 'round', label: '둥근 모서리' },
                { value: 'sharp', label: '각진 모서리' }
              ]}
            />
          </span>
        </Field>
      ))}
      {/* 겹마다 글자를 여덟 벌씩 더 그린다 — 세 겹까지만 */}
      {list.length < 3 && (
        <Field label={list.length === 0 ? '선' : ''} hint={list.length === 0 ? '없음' : ''}>
          <button
            onClick={() =>
              set([...list, { width: list.length === 0 ? 4 : 6, color: '#000000', outside: true }])
            }
          >
            + 선 {list.length === 0 ? '넣기' : '한 겹 더'}
          </button>
        </Field>
      )}
    </>
  )
}

/**
 * `#rrggbb` + 불투명도로 나눈다.
 *
 * 색 고르개(`input type=color`)는 `#rrggbb` 만 읽는다. 그래서 투명도는 여덟 자리
 * 16진수 뒤 두 자리로 붙여 두고, 만질 때만 갈라서 보여준다.
 * `rgba()` 처럼 못 읽는 값이면 불투명도 칸을 아예 띄우지 않는다 (색을 망가뜨리느니).
 */
function splitColor(c: string): { base: string; alpha: number } | null {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim())
  if (!m) return null
  return { base: `#${m[1]}`, alpha: m[2] ? Math.round((parseInt(m[2], 16) / 255) * 100) : 100 }
}

function joinColor(base: string, alpha: number): string {
  const a = Math.round((Math.max(0, Math.min(100, alpha)) * 255) / 100)
  return alpha >= 100 ? base : base + a.toString(16).padStart(2, '0')
}

/**
 * 그림자 한 겹의 상세 설정.
 *
 * 위치를 X·Y 로 주면 "오른쪽 아래로 12px" 같은 걸 계산해서 넣어야 한다 — 포토샵처럼
 * **각도와 거리**로 잡는다. 안에서 X·Y 로 바꿔 저장하므로 그리는 쪽은 그대로다.
 */
function ShadowRow({
  sh,
  index,
  onPatch,
  onRemove
}: {
  sh: TextShadow
  index: number
  onPatch: (v: TextShadow) => void
  onRemove: () => void
}): React.JSX.Element {
  const dist = Math.round(Math.hypot(sh.x, sh.y))
  // 화면 좌표는 아래가 +y 다. 사람이 읽기 좋게 **위쪽을 0°** 로 두고 시계 방향으로 센다
  const angle = Math.round((Math.atan2(sh.x, -sh.y) * 180) / Math.PI + 360) % 360
  const move = (a: number, d: number): TextShadow => ({
    ...sh,
    x: Math.round(Math.sin((a * Math.PI) / 180) * d * 100) / 100,
    y: Math.round(-Math.cos((a * Math.PI) / 180) * d * 100) / 100
  })
  const col = splitColor(sh.color)

  return (
    <>
      <Field label={`그림자 ${index + 1} 색`}>
        <span className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
          <ColorInput
            value={col ? col.base : sh.color}
            onChange={(base) => onPatch({ ...sh, color: col ? joinColor(base, col.alpha) : base })}
          />
          <button title="이 겹 빼기" onClick={onRemove}>
            ×
          </button>
        </span>
      </Field>
      {col && (
        <Field label="불투명도">
          <Slider
            min={0}
            max={100}
            value={col.alpha}
            onChange={(alpha) => onPatch({ ...sh, color: joinColor(col.base, alpha) })}
            suffix="%"
          />
        </Field>
      )}
      <Field label="각도" hint="0° = 위 · 시계 방향">
        <Slider
          min={0}
          max={359}
          value={angle}
          onChange={(a) => onPatch(move(a, dist))}
          suffix="°"
        />
      </Field>
      <Field label="거리">
        <Slider min={0} max={120} value={dist} onChange={(d) => onPatch(move(angle, d))} suffix="px" />
      </Field>
      <Field label="흐림" hint="0 이면 칼같이 선명한 그림자">
        <Slider
          min={0}
          max={80}
          value={Math.round(sh.blur)}
          onChange={(blur) => onPatch({ ...sh, blur })}
          suffix="px"
        />
      </Field>
      <div className="xy4">
        <Field label="가로">
          <NumberInput
            value={Math.round(sh.x)}
            onChange={(x) => onPatch({ ...sh, x })}
            suffix="px"
          />
        </Field>
        <Field label="세로">
          <NumberInput
            value={Math.round(sh.y)}
            onChange={(y) => onPatch({ ...sh, y })}
            suffix="px"
          />
        </Field>
      </div>
    </>
  )
}

function ShadowRows({
  style,
  onChange
}: {
  style: TextStyle
  onChange: (s: TextStyle) => void
}): React.JSX.Element {
  const list = shadowsOf(style)
  const set = (next: TextShadow[]): void =>
    onChange({ ...style, shadows: next, shadow: next.length > 0 })

  return (
    <>
      {list.map((sh, i) => (
        <ShadowRow
          key={i}
          sh={sh}
          index={i}
          onPatch={(v) => set(list.map((old, k) => (k === i ? v : old)))}
          onRemove={() => set(list.filter((_, k) => k !== i))}
        />
      ))}
      {list.length < 4 && (
        <Field label={list.length === 0 ? '그림자' : ''} hint={list.length === 0 ? '없음' : ''}>
          <button onClick={() => set([...list, { color: '#000000b3', x: 0, y: 4, blur: 10 }])}>
            + 그림자 {list.length === 0 ? '넣기' : '한 겹 더'}
          </button>
        </Field>
      )}
    </>
  )
}

/**
 * 도형 꾸미기 한 벌.
 *
 * 글자에 있는 것(칠·그라데이션·선 여러 겹·그림자 여러 겹)을 도형에도 그대로 준다 —
 * 같은 개념을 요소 종류마다 다르게 부르면 한 번 배운 게 안 통한다.
 *
 * 다만 **배경 판은 없다.** 도형 자체가 판이라, 판을 또 까는 건 도형을 하나 더 놓는 것과
 * 같다. 선도 안팎 선택이 없다 — 글자처럼 획을 파먹을 일이 없어 늘 바깥으로 두른다.
 */
function ShapeProps({
  el,
  onPatch
}: {
  el: ShapeElement
  onPatch: (patch: Partial<SlideElement>) => void
}): React.JSX.Element {
  const patch = (v: Partial<ShapeElement>): void => onPatch(v as Partial<SlideElement>)
  const strokes = el.strokes ?? []
  const shadows = el.shadows ?? []
  const setStrokes = (next: TextStroke[]): void => patch({ strokes: next })
  const setShadows = (next: TextShadow[]): void => patch({ shadows: next })

  return (
    <>
      <Section id="shape-content" title="도형" defaultOpen>
        <Field label="종류">
          <SegButtons
            value={el.shape}
            onChange={(shape) => patch({ shape })}
            options={[
              { value: 'rect', label: '사각형' },
              { value: 'ellipse', label: '타원' },
              { value: 'line', label: '선' }
            ]}
          />
        </Field>
        {el.shape !== 'ellipse' && (
          <Field label="모서리 둥글기" hint="타원은 늘 동그랗습니다">
            <Slider
              min={0}
              max={200}
              value={el.radius}
              onChange={(radius) => patch({ radius })}
              suffix="px"
            />
          </Field>
        )}
      </Section>

      <Section id="shape-fill" title="칠" hint="색 · 그라데이션" defaultOpen>
        <Field label="색" hint={el.gradient ? '그라데이션 시작색' : undefined}>
          <ColorInput value={el.fill} onChange={(fill) => patch({ fill })} />
        </Field>
        <Field label="그라데이션">
          <CheckBox
            checked={Boolean(el.gradient)}
            onChange={(gradient) => patch({ gradient, gradientTo: el.gradientTo ?? '#8ab4ff' })}
            label="두 색으로 칠하기"
          />
        </Field>
        {el.gradient && (
          <>
            <Field label="끝색">
              <ColorInput
                value={el.gradientTo ?? '#8ab4ff'}
                onChange={(gradientTo) => patch({ gradientTo })}
              />
            </Field>
            <Field label="방향" hint="180° = 위에서 아래">
              <Slider
                min={0}
                max={360}
                step={5}
                value={el.gradientAngle ?? 180}
                onChange={(gradientAngle) => patch({ gradientAngle })}
                suffix="°"
              />
            </Field>
          </>
        )}
      </Section>

      <Section id="shape-stroke" title="테두리" hint="여러 겹 가능">
        <DecorStrokeRows list={strokes} onChange={setStrokes} inner="도형에 딱 붙는 겹" />
      </Section>

      <Section id="shape-shadow" title="그림자" hint="여러 겹 가능">
        <DecorShadowRows list={shadows} onChange={setShadows} />
      </Section>
    </>
  )
}

/**
 * 이미지 꾸미기.
 *
 * 그림자는 상자가 아니라 **그림의 실제 모양**을 따라간다 — 배경이 뚫린 PNG 에 네모난
 * 그림자가 지면 아무 쓸모가 없다. 그 대신 무거워서 세 겹까지만 받는다.
 * 테두리는 상자를 두르는 액자다.
 */
function ImageProps({
  el,
  onPatch,
  onPickImage
}: {
  el: ImageElement
  onPatch: (patch: Partial<SlideElement>) => void
  onPickImage: () => void
}): React.JSX.Element {
  const patch = (v: Partial<ImageElement>): void => onPatch(v as Partial<SlideElement>)

  return (
    <>
      <Section id="image-content" title="이미지" defaultOpen>
        <Field label="파일">
          <span className="row" style={{ gap: '0.5rem' }}>
            <button onClick={onPickImage}>파일 선택…</button>
            {el.src && <img className="thumb" src={el.src} alt="" />}
          </span>
        </Field>
        <Field label="맞춤" hint="상자보다 그림 비율이 다를 때">
          <SegButtons
            value={el.fit}
            onChange={(fit) => patch({ fit })}
            options={[
              { value: 'contain', label: '전체 보기' },
              { value: 'cover', label: '꽉 채우기' }
            ]}
          />
        </Field>
        <Field label="모서리 둥글기">
          <Slider
            min={0}
            max={200}
            value={el.radius}
            onChange={(radius) => patch({ radius })}
            suffix="px"
          />
        </Field>
      </Section>

      <Section id="image-stroke" title="테두리" hint="상자를 두르는 액자">
        <DecorStrokeRows
          list={el.strokes ?? []}
          onChange={(strokes) => patch({ strokes })}
          inner="그림 상자에 딱 붙는 겹"
        />
      </Section>

      <Section id="image-shadow" title="그림자" hint="그림 모양을 따라갑니다">
        <DecorShadowRows
          list={el.shadows ?? []}
          onChange={(shadows) => patch({ shadows })}
          max={IMAGE_SHADOW_MAX}
          note="배경이 뚫린 PNG 면 인물 모양 그대로 그림자가 집니다. 무거워서 세 겹까지만 됩니다."
        />
      </Section>
    </>
  )
}

/**
 * 테두리 겹 목록 — 도형·이미지가 함께 쓴다.
 *
 * 글자의 `StrokeRows` 와 달리 안팎·모서리 선택이 없다. 상자를 두르는 고리라 늘
 * 바깥이고, 모서리는 그 요소의 둥글기를 알아서 따라간다.
 */
function DecorStrokeRows({
  list,
  onChange,
  inner,
  max = 4
}: {
  list: TextStroke[]
  onChange: (next: TextStroke[]) => void
  /** 첫 겹에 붙일 설명 */
  inner: string
  max?: number
}): React.JSX.Element {
  return (
    <>
      {list.map((st, i) => (
        <Field
          key={i}
          label={i === 0 ? '테두리' : `테두리 ${i + 1}`}
          hint={i === 0 ? inner : '앞 겹을 감싸는 바깥 겹'}
        >
          <span className="row" style={{ gap: '0.35rem', alignItems: 'center' }}>
            <Slider
              min={1}
              max={60}
              value={st.width}
              onChange={(width) => onChange(list.map((v, k) => (k === i ? { ...v, width } : v)))}
              suffix="px"
            />
            <ColorInput
              value={st.color}
              onChange={(color) => onChange(list.map((v, k) => (k === i ? { ...v, color } : v)))}
            />
            <button title="이 겹 빼기" onClick={() => onChange(list.filter((_, k) => k !== i))}>
              ×
            </button>
          </span>
        </Field>
      ))}
      {list.length < max && (
        <Field label={list.length === 0 ? '테두리' : ''} hint={list.length === 0 ? '없음' : ''}>
          <button
            onClick={() => onChange([...list, { width: list.length === 0 ? 4 : 8, color: '#000000' }])}
          >
            + 테두리 {list.length === 0 ? '넣기' : '한 겹 더'}
          </button>
        </Field>
      )}
    </>
  )
}

/** 그림자 겹 목록 — 도형·이미지가 함께 쓴다. 한 겹의 상세는 글자와 같은 `ShadowRow`. */
function DecorShadowRows({
  list,
  onChange,
  max = 4,
  note
}: {
  list: TextShadow[]
  onChange: (next: TextShadow[]) => void
  max?: number
  note?: string
}): React.JSX.Element {
  return (
    <>
      {list.map((sh, i) => (
        <ShadowRow
          key={i}
          sh={sh}
          index={i}
          onPatch={(v) => onChange(list.map((old, k) => (k === i ? v : old)))}
          onRemove={() => onChange(list.filter((_, k) => k !== i))}
        />
      ))}
      {list.length < max && (
        <Field label={list.length === 0 ? '그림자' : ''} hint={list.length === 0 ? '없음' : ''}>
          <button onClick={() => onChange([...list, { color: '#000000b3', x: 0, y: 6, blur: 14 }])}>
            + 그림자 {list.length === 0 ? '넣기' : '한 겹 더'}
          </button>
        </Field>
      )}
      {note && <p className="ps-note">{note}</p>}
    </>
  )
}

/**
 * 글자 꾸미기 한 벌.
 *
 * 항목이 스무 개가 넘어 한 줄로 늘어놓으면 아무것도 눈에 안 들어온다 —
 * 포토샵 레이어 스타일처럼 **성격별로 접어** 둔다.
 */
function TextStyleFields({
  style,
  label,
  onChange
}: {
  style: TextStyle
  label: string
  onChange: (s: TextStyle) => void
}): React.JSX.Element {
  return (
    <>
      <Section id={`ts-${label}-font`} title={`${label} 글꼴·크기`} defaultOpen>
        <Field label="글꼴" hint="비우면 문서 기본">
          <Select
            value={style.fontFamily ?? ''}
            onChange={(fontFamily) =>
              onChange({ ...style, fontFamily: fontFamily === '' ? undefined : fontFamily })
            }
            options={[
              { value: '', label: '문서 기본 글꼴' },
              ...availableFonts().map((f) => ({ value: f.family, label: f.label }))
            ]}
          />
        </Field>
        <Field label="크기">
          <Slider
            min={10}
            max={220}
            value={style.size}
            onChange={(size) => onChange({ ...style, size })}
            suffix="px"
          />
        </Field>
        <Field label="굵기">
          <Slider
            min={100}
            max={900}
            step={100}
            value={style.weight}
            onChange={(weight) => onChange({ ...style, weight })}
          />
        </Field>
        <Field label="줄 간격" hint="여러 줄일 때 줄 사이">
          <Slider
            min={0.8}
            max={3}
            step={0.05}
            value={style.lineHeight}
            onChange={(lineHeight) => onChange({ ...style, lineHeight })}
            suffix="배"
          />
        </Field>
        <Field label="기울임">
          <CheckBox
            checked={style.italic}
            onChange={(italic) => onChange({ ...style, italic })}
            label="이탤릭"
          />
        </Field>
        <Field label="자동 맞춤" hint="상자를 넘치면 줄여서 맞춥니다 (긴 닉네임)">
          <CheckBox
            checked={Boolean(style.fit)}
            onChange={(fit) => onChange({ ...style, fit })}
            label="상자에 맞게 크기 줄이기"
          />
        </Field>
      </Section>

      <Section id={`ts-${label}-align`} title={`${label} 정렬`}>
        <Field label="가로">
          <SegButtons
            value={style.align}
            onChange={(align) => onChange({ ...style, align })}
            options={[
              { value: 'left', label: '왼쪽' },
              { value: 'center', label: '가운데' },
              { value: 'right', label: '오른쪽' }
            ]}
          />
        </Field>
        <Field label="세로">
          <SegButtons
            value={style.vAlign}
            onChange={(vAlign) => onChange({ ...style, vAlign })}
            options={[
              { value: 'top', label: '위' },
              { value: 'middle', label: '중간' },
              { value: 'bottom', label: '아래' }
            ]}
          />
        </Field>
      </Section>

      <Section id={`ts-${label}-fill`} title={`${label} 칠`} hint="색 · 그라데이션" defaultOpen>
        <Field label="색" hint={style.gradient ? '그라데이션 시작색' : undefined}>
          <ColorInput value={style.color} onChange={(color) => onChange({ ...style, color })} />
        </Field>
        <Field label="그라데이션">
          <CheckBox
            checked={Boolean(style.gradient)}
            onChange={(gradient) =>
              onChange({ ...style, gradient, gradientTo: style.gradientTo ?? '#8ab4ff' })
            }
            label="두 색으로 칠하기"
          />
        </Field>
        {style.gradient && (
          <>
            <Field label="끝색">
              <ColorInput
                value={style.gradientTo ?? '#8ab4ff'}
                onChange={(gradientTo) => onChange({ ...style, gradientTo })}
              />
            </Field>
            <Field label="방향" hint="180° = 위에서 아래">
              <Slider
                min={0}
                max={360}
                step={5}
                value={style.gradientAngle ?? 180}
                onChange={(gradientAngle) => onChange({ ...style, gradientAngle })}
                suffix="°"
              />
            </Field>
          </>
        )}
      </Section>

      <Section id={`ts-${label}-stroke`} title={`${label} 선`} hint="여러 겹 가능">
        <StrokeRows style={style} onChange={onChange} />
      </Section>

      <Section id={`ts-${label}-shadow`} title={`${label} 그림자`} hint="여러 겹 가능">
        <ShadowRows style={style} onChange={onChange} />
      </Section>

      <Section id={`ts-${label}-plate`} title={`${label} 배경 판`} hint="글자 뒤 띠">
        <Field label="판">
          <CheckBox
            checked={Boolean(style.bgColor)}
            onChange={(on) =>
              onChange({
                ...style,
                bgColor: on ? (style.bgColor ?? '#000000') : null,
                bgRadius: style.bgRadius ?? 6,
                bgPadX: style.bgPadX ?? 14,
                bgPadY: style.bgPadY ?? 6
              })
            }
            label="글자 뒤에 판 깔기"
          />
        </Field>
        {style.bgColor && (
          <>
            <Field label="판 색">
              <ColorInput
                value={style.bgColor}
                onChange={(bgColor) => onChange({ ...style, bgColor })}
              />
            </Field>
            <div className="xy4">
              <Field label="둥글기">
                <NumberInput
                  value={Math.round(style.bgRadius ?? 6)}
                  min={0}
                  onChange={(bgRadius) => onChange({ ...style, bgRadius })}
                  suffix="px"
                />
              </Field>
              <Field label="좌우 여백">
                <NumberInput
                  value={Math.round(style.bgPadX ?? 14)}
                  min={0}
                  onChange={(bgPadX) => onChange({ ...style, bgPadX })}
                  suffix="px"
                />
              </Field>
              <Field label="위아래 여백">
                <NumberInput
                  value={Math.round(style.bgPadY ?? 6)}
                  min={0}
                  onChange={(bgPadY) => onChange({ ...style, bgPadY })}
                  suffix="px"
                />
              </Field>
            </div>
          </>
        )}
      </Section>
    </>
  )
}

function SlideProps({
  slide,
  onPatch,
  onScreenFx,
  onSplit,
  canSplit,
  onPickBackground,
  onApplyBackgroundToAll,
  canvas,
  onCanvas,
  font,
  onFont
}: {
  slide: Slide
  onPatch: (p: Partial<Slide>) => void
  /** 화면 전체 효과 (폭죽·눈 …). null 이면 없앤다 */
  onScreenFx: (fx: ScreenFx | null) => void
  onSplit: () => void
  canSplit: boolean
  onPickBackground: () => void
  onApplyBackgroundToAll: () => void
  canvas: { width: number; height: number }
  onCanvas: (c: { width: number; height: number }) => void
  font: string
  onFont: (family: string) => void
}): React.JSX.Element {
  const bg = backgroundOf(slide)
  const setBg = (p: Partial<typeof bg>): void => onPatch({ background: { ...bg, ...p } })

  const preset =
    CANVAS_PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height)?.label ?? ''

  return (
    <div className="fields">
      {/* 화면 크기는 장이 아니라 **문서 전체**에 걸린다 — 맨 위에 두고 눈에 띄게 갈라둔다 */}
      <Section id="doc-canvas" title="문서" hint="화면 크기 · 기본 글꼴">
      <Field label="기본 글꼴" hint="요소가 글꼴을 따로 안 정하면 이걸 씁니다">
        <Select
          value={font}
          onChange={onFont}
          options={[
            ...(availableFonts().some((f) => f.family === font)
              ? []
              : [{ value: font, label: `지금 글꼴 (${font.split(',')[0].replace(/["']/g, '')})` }]),
            ...availableFonts().map((f) => ({ value: f.family, label: f.label }))
          ]}
        />
      </Field>
      <Field label="화면 크기" hint="문서 전체 · 세로 9:16 을 고르면 쇼츠용이 됩니다">
        <Select
          value={preset}
          onChange={(label) => {
            const p = CANVAS_PRESETS.find((c) => c.label === label)
            if (p) onCanvas({ width: p.width, height: p.height })
          }}
          options={[
            ...(preset ? [] : [{ value: '', label: `사용자 지정 · ${canvas.width}×${canvas.height}` }]),
            ...CANVAS_PRESETS.map((p) => ({ value: p.label, label: p.label }))
          ]}
        />
      </Field>
      <Field label="직접 입력" hint="배치는 %라 그대로 · 글자 크기는 세로 비율만큼 함께 조정됩니다">
        <span className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
          <NumberInput
            value={canvas.width}
            min={320}
            max={7680}
            onChange={(width) => onCanvas({ width: Math.max(320, Math.round(width)), height: canvas.height })}
          />
          <span className="mono">×</span>
          <NumberInput
            value={canvas.height}
            min={320}
            max={7680}
            onChange={(height) => onCanvas({ width: canvas.width, height: Math.max(320, Math.round(height)) })}
          />
        </span>
      </Field>
      <p className="ps-note">
        OBS 브라우저 소스의 폭·높이도 같은 값으로 맞춰야 글자 크기가 화면과 똑같이 나갑니다.
      </p>
      </Section>

      <Section id="slide-basic" title="슬라이드" hint="이름 · 등장 순서" defaultOpen>
      {canSplit && (
        <Field label="요소를 장별로 나누기" hint={`${slide.elements.length}장이 됩니다`}>
          <button onClick={onSplit}>한 요소당 한 장으로 펴기</button>
        </Field>
      )}
      <Field label="이름">
        <TextInput value={slide.name} onChange={(name) => onPatch({ name })} />
      </Field>

      {/* 목록은 앞에 보이는 것이 위다. 등장은 뒤에 깔린 것부터 — 아래에서 위로 쌓인다 */}
      <Field label="요소 등장 순서" hint="뒤에 깔린 것부터 (목록 아래→위) · 속성에서 차례 지정 가능">
        <SegButtons
          value={orderOf(slide).mode}
          onChange={(mode) => onPatch({ order: { ...orderOf(slide), mode } })}
          options={[
            { value: 'order', label: '순서대로' },
            { value: 'manual', label: '각자 지정' }
          ]}
        />
      </Field>
      {orderOf(slide).mode === 'order' && (
        <Field label="등장 간격">
          <Slider
            min={0}
            max={1500}
            step={20}
            value={orderOf(slide).gapMs}
            onChange={(gapMs) => onPatch({ order: { ...orderOf(slide), gapMs } })}
            suffix="ms"
          />
        </Field>
      )}

      </Section>

      {/* 요소가 아니라 **장 전체**에 덮인다 — 폭죽·눈처럼 분위기를 만드는 것들 */}
      <Section id="slide-fx" title="화면 효과" hint="폭죽 · 눈 · 반짝이">
      <Field label="화면 효과" hint="아래 ‘화면’ 칸에서 끌어와도 됩니다">
        <Select
          value={slide.screen?.effect ?? ''}
          onChange={(id) => {
            if (id === '') return onScreenFx(null)
            const e = getScreenEffect(id)
            if (!e) return
            onScreenFx({
              effect: e.id,
              intensity: slide.screen?.intensity ?? 100,
              durationMs: e.defaultDurationMs,
              delayMs: slide.screen?.delayMs ?? 0
            })
          }}
          options={[
            { value: '', label: '없음' },
            ...SCREEN_EFFECTS.map((e) => ({ value: e.id, label: e.name }))
          ]}
        />
      </Field>
      {slide.screen && (
        <>
          <Field label="효과 세기" hint="입자 양">
            <Slider
              min={10}
              max={200}
              step={5}
              value={slide.screen.intensity}
              onChange={(intensity) => onScreenFx({ ...slide.screen!, intensity })}
              suffix="%"
            />
          </Field>
          <Field
            label="효과 길이"
            hint={getScreenEffect(slide.screen.effect)?.loop ? '반복' : '장 길이에 반영'}
          >
            <Slider
              min={300}
              max={12000}
              step={100}
              value={slide.screen.durationMs}
              onChange={(durationMs) => onScreenFx({ ...slide.screen!, durationMs })}
              suffix="ms"
            />
          </Field>
          <Field label="효과 시작 지연">
            <Slider
              min={0}
              max={5000}
              step={50}
              value={slide.screen.delayMs}
              onChange={(delayMs) => onScreenFx({ ...slide.screen!, delayMs })}
              suffix="ms"
            />
          </Field>
        </>
      )}

      </Section>

      <Section id="slide-time" title="전환·길이" hint="장이 나타나고 머무는 방식">
      <Field label="장 전환 효과" hint="장이 나타날 때 화면 전체에">
        <Select
          value={transitionOf(slide).preset}
          onChange={(preset) =>
            onPatch({ transition: { ...transitionOf(slide), preset } })
          }
          options={[
            { value: 'none', label: '없음' },
            ...allEffects()
              .filter((e) => e.id !== 'none' && e.category !== 'emphasis')
              .map((e) => ({
                value: e.id,
                label:
                  (isCustomId(e.id) ? '✎ ' : '') +
                  (e.category === 'out' ? `${e.name} (퇴장)` : e.name)
              }))
          ]}
        />
      </Field>
      <Field label="전환 길이">
        <Slider
          min={0}
          max={2000}
          step={50}
          value={transitionOf(slide).durationMs}
          onChange={(durationMs) =>
            onPatch({ transition: { ...transitionOf(slide), durationMs } })
          }
          suffix="ms"
        />
      </Field>
      <Field label="종류">
        <SegButtons
          value={slide.kind}
          onChange={(kind) => onPatch({ kind })}
          options={[
            { value: 'static', label: '한 화면' },
            { value: 'scroll', label: '스크롤' }
          ]}
        />
      </Field>
      {slide.kind === 'static' ? (
        <Field label="머무는 시간">
          <Slider
            min={500}
            max={15000}
            step={250}
            value={slide.holdMs}
            onChange={(holdMs) => onPatch({ holdMs })}
            suffix="ms"
          />
        </Field>
      ) : (
        <>
          <Field label="스크롤 속도">
            <Slider
              min={20}
              max={300}
              value={slide.scroll.speed}
              onChange={(speed) => onPatch({ scroll: { ...slide.scroll, speed } })}
              suffix="px/s"
            />
          </Field>
          <Field label="방향">
            <SegButtons
              value={slide.scroll.direction}
              onChange={(direction) => onPatch({ scroll: { ...slide.scroll, direction } })}
              options={[
                { value: 'up', label: '↑ 위로' },
                { value: 'down', label: '↓ 아래로' }
              ]}
            />
          </Field>
          <Field label="내용 길이" hint="화면 몇 개 분량">
            <Slider
              min={100}
              max={800}
              step={10}
              value={slide.scroll.contentHeight}
              onChange={(contentHeight) => onPatch({ scroll: { ...slide.scroll, contentHeight } })}
              suffix="%"
            />
          </Field>
        </>
      )}
      </Section>

      <Section id="slide-bg" title="배경" hint="색 · 이미지">
      <Field label="투명">
        <CheckBox
          checked={bg.transparent}
          onChange={(transparent) => setBg({ transparent })}
          label="투명 (끄면 방송 화면을 가림)"
        />
      </Field>
      {!bg.transparent && (
        <Field label="배경색">
          <ColorInput value={bg.color} onChange={(color) => setBg({ color })} />
        </Field>
      )}

      {/* 배경 이미지는 색 위에 겹쳐 깔린다 — 투명 PNG 를 써도 뒤가 비지 않는다 */}
      <Field label="배경 이미지" hint={bg.image ? '' : '장 전체에 깔립니다'}>
        {bg.image ? (
          <span className="row" style={{ gap: '0.4rem', alignItems: 'center' }}>
            <img
              src={bg.image}
              alt=""
              style={{
                width: 52,
                height: 30,
                objectFit: 'cover',
                borderRadius: 3,
                flex: 'none',
                background: '#000'
              }}
            />
            <button onClick={onPickBackground}>바꾸기…</button>
            <button onClick={() => setBg({ image: null })}>지우기</button>
          </span>
        ) : (
          <button onClick={onPickBackground}>파일 선택…</button>
        )}
      </Field>

      {bg.image && (
        <>
          <Field label="이미지 맞춤">
            <SegButtons
              value={bg.imageFit}
              onChange={(imageFit) => setBg({ imageFit })}
              options={[
                { value: 'cover', label: '채우기' },
                { value: 'contain', label: '전체 보기' },
                { value: 'stretch', label: '늘이기' }
              ]}
            />
          </Field>
          <Field label="이미지 불투명도" hint="낮추면 글자가 잘 읽힙니다">
            <Slider
              min={0}
              max={100}
              value={bg.imageOpacity}
              onChange={(imageOpacity) => setBg({ imageOpacity })}
              suffix="%"
            />
          </Field>
          <Field label="이미지 흐림">
            <Slider
              min={0}
              max={40}
              value={bg.imageBlur}
              onChange={(imageBlur) => setBg({ imageBlur })}
              suffix="px"
            />
          </Field>
          <Field label="모든 장에" hint="이 배경을 크레딧 전체에 똑같이">
            <button onClick={onApplyBackgroundToAll}>모든 장에 적용</button>
          </Field>
        </>
      )}
      </Section>
    </div>
  )
}

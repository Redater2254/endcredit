import { useState } from 'react'
import { allEffects, getEffect } from '@shared/effects'
import { isCustomId } from '@shared/custom-effect'
import {
  appearOrderOf,
  backgroundOf,
  DEFAULT_MOTION,
  groupMotion,
  groupName,
  hasMotion,
  orderOf,
  runsToText,
  transitionOf
} from '@shared/deck'
import { exitDurationOf } from '@shared/preset'
import { getScreenEffect, SCREEN_EFFECTS, type ScreenFx } from '@shared/screen-fx'
import { availableFonts } from './fonts'
import { hasFields, interpolate } from '@shared/fields'
import type { CreditData } from '@shared/aggregate'
import type {
  DataElement,
  Motion,
  RankElement,
  Slide,
  SlideElement,
  SlideGroup,
  TextStyle
} from '@shared/deck'
import { SOURCE_OPTIONS } from './sources'
import { EFFECT_DRAG_TYPE } from './EffectLibrary'
import { Splitter, useSplit } from './Splitter'
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

const KIND_ICON: Record<string, string> = {
  text: 'T',
  image: '🖼',
  data: '#',
  rank: '①',
  shape: '▬'
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
  onGroup,
  onUngroup,
  onRenameGroup,
  onPatchGroup,
  onDropGroupEffect,
  onPickBackground,
  onApplyBackgroundToAll,
  onScreenFx,
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
  onGroup: () => void
  onUngroup: () => void
  onRenameGroup: (gid: string, name: string) => void
  /** 묶음 자체의 설정 (이름·묶음 효과·안쪽 등장 방식) */
  onPatchGroup: (gid: string, p: Partial<SlideGroup>) => void
  /** 폴더 줄에 효과를 떨어뜨리면 **묶음 전체**에 걸린다 */
  onDropGroupEffect: (gid: string, effectId: string) => void
  onPickBackground: () => void
  onApplyBackgroundToAll: () => void
  /** 화면 전체 효과 (폭죽·눈 …). null 이면 없앤다 */
  onScreenFx: (fx: ScreenFx | null) => void
  /** 데이터 필드가 실제로 어떻게 보이는지 미리 보여주기 위해 */
  data: CreditData
}): React.JSX.Element {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [listH, setListH] = useSplit('elements', 210, 80, 620)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  // '각자 지정' 모드에서는 차례 개념이 없으므로 배지를 띄우지 않는다
  const turns = orderOf(slide).mode === 'order' ? appearOrderOf(slide) : {}
  const chosen = slide.elements.filter((e) => selectedIds.includes(e.id))
  const el = chosen.length === 1 ? chosen[0] : null

  /**
   * 묶음을 **폴더처럼** 보여주기 위한 목록 구성.
   * 폴더를 누르면 전체가, 안의 요소를 누르면 그 하나만 잡힌다.
   */
  const rows: (
    | { kind: 'group'; gid: string; order: number; members: SlideElement[] }
    | { kind: 'el'; el: SlideElement }
  )[] = []
  const placed = new Set<string>()
  for (const e of slide.elements) {
    if (e.groupId) {
      if (placed.has(e.groupId)) continue
      placed.add(e.groupId)
      rows.push({
        kind: 'group',
        gid: e.groupId,
        order: placed.size,
        members: slide.elements.filter((m) => m.groupId === e.groupId)
      })
    } else {
      rows.push({ kind: 'el', el: e })
    }
  }

  return (
    <div className="ps-dock">
      <div className="ps-panel ps-layers" style={{ height: listH, flex: 'none' }}>
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

      <Splitter axis="y" value={listH} onChange={setListH} />

      <div className="ps-panel ps-props">
        <header>
          <span>
            {chosen.length > 1 ? `${chosen.length}개 선택됨` : el ? '요소 속성' : '슬라이드'}
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
          />
        ) : el ? (
          <ElementProps
            el={el}
            byOrder={orderOf(slide).mode === 'order'}
            appearAt={turns[el.id] ?? 1}
            onPatch={onPatch}
            onPickImage={onPickImage}
            onSplitRanks={(n) => onSplitRanks(el.id, n)}
            onUngroup={onUngroup}
            data={data}
          />
        ) : (
          <SlideProps
            onScreenFx={onScreenFx}
            slide={slide}
            onPatch={onPatchSlide}
            onSplit={onSplitSlide}
            canSplit={canSplitSlide}
            onPickBackground={onPickBackground}
            onApplyBackgroundToAll={onApplyBackgroundToAll}
          />
        )}
      </div>
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
  setDragFrom,
  setDropOn,
  appearAt
}: {
  e: SlideElement
  index: number
  indent: boolean
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
  setDragFrom: (i: number | null) => void
  setDropOn: (id: string | null) => void
}): React.JSX.Element {
  // 등장과 퇴장을 함께 걸 수 있으므로 둘 다 보여준다
  const eff = motionLabel(e.motion)

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

      <span className="lay-name">{elementLabel(e, data)}</span>

      {/* 몇 번째로 등장하는지. 목록 순서(=겹침 순서)와 다를 수 있어 눈에 보여야 한다 */}
      {appearAt !== null && (
        <span className={`lay-turn ${e.motion.order ? 'fixed' : ''}`} title="등장 차례">
          {appearAt}
        </span>
      )}

      {eff && <span className="lay-eff">{eff}</span>}

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
  onPatchGroup
}: {
  chosen: SlideElement[]
  slide: Slide
  onPatch: (p: Partial<SlideElement>) => void
  onGroup: () => void
  onUngroup: () => void
  onPatchGroup: (gid: string, p: Partial<SlideGroup>) => void
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
 * 묶음 **자체**에 걸리는 효과.
 *
 * 안의 요소들을 감싼 상자 하나에 걸리므로, 확대·회전은 덩어리 한가운데를 축으로 돈다.
 * 효과를 하나도 안 걸면 상자를 아예 만들지 않아 겹침 순서가 예전 그대로 유지된다.
 */
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
  return '도형'
}

function ElementProps({
  el,
  byOrder,
  appearAt,
  onPatch,
  onPickImage,
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
        <Field
          label="텍스트"
          hint="아래 '데이터 필드' 에서 끌어다 넣으세요"
        >
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
      )}

      {el.kind === 'image' && (
        <Field label="이미지">
          <span className="row" style={{ gap: '0.5rem' }}>
            <button onClick={onPickImage}>파일 선택…</button>
            {el.src && <img className="thumb" src={el.src} alt="" />}
          </span>
        </Field>
      )}

      {el.kind === 'data' && <DataProps el={el} onPatch={onPatch} onSplitRanks={onSplitRanks} />}

      {el.kind === 'rank' && <RankProps el={el} onPatch={onPatch} />}

      {/* ── 위치·크기 ─────────────────────────────── */}
      <hr />
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

      {(
        <>
          <Field label="회전">
            <Slider min={-180} max={180} value={el.rotation} onChange={(rotation) => onPatch({ rotation })} suffix="°" />
          </Field>
          <Field label="불투명도">
            <Slider min={0} max={100} value={el.opacity} onChange={(opacity) => onPatch({ opacity })} suffix="%" />
          </Field>
        </>
      )}

      {/* ── 글자 ─────────────────────────────────── */}
      {el.kind === 'rank' && (
        <>
          <hr />
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
          <hr />
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

      {el.kind === 'shape' && (
        <Field label="색">
          <ColorInput value={el.fill} onChange={(fill) => onPatch({ fill } as Partial<SlideElement>)} />
        </Field>
      )}

      {/* ── 효과 ─────────────────────────────────── */}
      <hr />
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
      {/* 목록 순서는 겹침 순서를 겸하므로, 등장 차례는 따로 정할 길이 있어야 한다 */}
      {byOrder ? (
        <Field label="등장 차례" hint="비우면 목록 위치를 따름">
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

      <Field label="강조 효과">
        <Select
          value={mo.loop ?? ''}
          onChange={(v) => onPatch({ motion: { ...mo, loop: v === '' ? null : v } })}
          options={emphasisOptions()}
        />
      </Field>
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
      <Field label="표시 인원">
        <Slider
          min={1}
          max={50}
          value={el.limit}
          onChange={(limit) => onPatch({ limit } as Partial<SlideElement>)}
          suffix="명"
        />
      </Field>
      <Field label="열 수">
        <SegButtons
          value={String(el.columns) as '1' | '2' | '3'}
          onChange={(c) => onPatch({ columns: Number(c) as 1 | 2 | 3 } as Partial<SlideElement>)}
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' }
          ]}
        />
      </Field>
      {el.columns > 1 && (
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
      <Field label={`${label} 글꼴`} hint="비우면 문서 기본">
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
      <Field label={`${label} 크기`}>
        <Slider min={10} max={140} value={style.size} onChange={(size) => onChange({ ...style, size })} suffix="px" />
      </Field>
      <Field label={`${label} 색`}>
        <ColorInput value={style.color} onChange={(color) => onChange({ ...style, color })} />
      </Field>
      <Field label={`${label} 정렬`}>
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
      {(
        <>
          <Field label={`${label} 굵기`}>
            <Slider
              min={100}
              max={900}
              step={100}
              value={style.weight}
              onChange={(weight) => onChange({ ...style, weight })}
            />
          </Field>
          <Field label={`${label} 세로 정렬`}>
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
          <Field label="외곽선">
            <Slider
              min={0}
              max={8}
              value={style.stroke}
              onChange={(stroke) => onChange({ ...style, stroke })}
              suffix="px"
            />
          </Field>
          {style.stroke > 0 && (
            <Field label="외곽선 색">
              <ColorInput
                value={style.strokeColor}
                onChange={(strokeColor) => onChange({ ...style, strokeColor })}
              />
            </Field>
          )}
          <Field label="그림자">
            <CheckBox
              checked={style.shadow}
              onChange={(shadow) => onChange({ ...style, shadow })}
              label="밝은 화면 위에서 잘 보임"
            />
          </Field>
        </>
      )}
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
  onApplyBackgroundToAll
}: {
  slide: Slide
  onPatch: (p: Partial<Slide>) => void
  /** 화면 전체 효과 (폭죽·눈 …). null 이면 없앤다 */
  onScreenFx: (fx: ScreenFx | null) => void
  onSplit: () => void
  canSplit: boolean
  onPickBackground: () => void
  onApplyBackgroundToAll: () => void
}): React.JSX.Element {
  const bg = backgroundOf(slide)
  const setBg = (p: Partial<typeof bg>): void => onPatch({ background: { ...bg, ...p } })

  return (
    <div className="fields">
      {canSplit && (
        <Field label="요소를 장별로 나누기" hint={`${slide.elements.length}장이 됩니다`}>
          <button onClick={onSplit}>한 요소당 한 장으로 펴기</button>
        </Field>
      )}
      <Field label="이름">
        <TextInput value={slide.name} onChange={(name) => onPatch({ name })} />
      </Field>

      <Field label="요소 등장 순서" hint="목록 위에서부터 · 속성에서 차례 지정 가능">
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

      {/* 요소가 아니라 **장 전체**에 덮인다 — 폭죽·눈처럼 분위기를 만드는 것들 */}
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

      <hr />
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
      <hr />
      <Field label="배경">
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
    </div>
  )
}

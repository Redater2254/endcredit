import { useMemo, useState } from 'react'
import {
  allEffects,
  CATEGORY_LABEL,
  keyframeName,
  type Effect,
  type EffectCategory
} from '@shared/effects'
import { isCustomId } from '@shared/custom-effect'
import { ScreenFxLayer, SCREEN_EFFECTS, type ScreenEffect } from '@shared/screen-fx'

/**
 * 효과 라이브러리.
 *
 * 미스터호스처럼 **목록에서 보고 → 끌어다 놓으면 적용**되는 방식.
 * 마우스를 올리면 타일 안에서 실제 효과가 재생돼, 이름만 보고 고르지 않아도 된다.
 * 드래그가 번거로운 사람을 위해 클릭해도 선택된 섹션에 적용된다.
 */

export const EFFECT_DRAG_TYPE = 'application/x-endcredit-effect'
/** 화면 효과는 요소가 아니라 **슬라이드**에 붙으므로 종류를 구분한다 */
export const SCREEN_FX_DRAG_TYPE = 'application/x-endcredit-screenfx'
/** 특이 효과는 효과가 아니라 **요소를 새로 만든다** — 캔버스에 놓으면 그 요소가 생긴다 */
export const SPECIAL_DRAG_TYPE = 'application/x-endcredit-special'

/**
 * 특이 효과 = 안에 데이터·이미지를 실어 나르는 특별한 요소들.
 * 효과처럼 목록에서 보고 끌어다 놓지만, 실제로는 새 요소를 만든다.
 */
export interface SpecialItem {
  id: string
  name: string
  description: string
  icon: string
}

export const SPECIAL_ITEMS: SpecialItem[] = [
  {
    id: 'train',
    name: '기차',
    description: '데이터를 칸마다 태우고 화면을 한 번 가로지르는 기차',
    icon: '🚂'
  }
]

/** 요소 효과 세 칸 + 화면 효과 + 특이 효과 */
type Tab = EffectCategory | 'screen' | 'special'

const TAB_LABEL: Record<Tab, string> = {
  ...CATEGORY_LABEL,
  screen: '화면',
  special: '특이 효과'
}

export function EffectLibrary({
  onApply,
  onApplyScreen,
  targetName,
  slideName,
  onNewEffect,
  onEditEffect,
  onAddSpecial,
  /** 문서에 담긴 내가 만든 효과가 바뀌면 목록을 다시 만든다 */
  customStamp
}: {
  /** 클릭으로 적용할 때 (드래그는 각 섹션이 직접 받는다) */
  onApply: (effectId: string) => void
  /** 화면 효과는 지금 보고 있는 장에 걸린다 */
  onApplyScreen: (effectId: string) => void
  /** 특이 효과 타일을 클릭하면 그 요소를 새로 만든다 */
  onAddSpecial: (id: string) => void
  /** 클릭 시 어디에 적용되는지 사용자에게 알려준다 */
  targetName: string | null
  slideName: string
  onNewEffect: (category: EffectCategory) => void
  onEditEffect: (id: string) => void
  customStamp: string
}): React.JSX.Element {
  const [category, setCategory] = useState<Tab>('in')
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (name: string, desc: string): boolean =>
      q === '' || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)

    if (category === 'screen') {
      return SCREEN_EFFECTS.filter((e) => match(e.name, e.description))
    }
    if (category === 'special') {
      return SPECIAL_ITEMS.filter((e) => match(e.name, e.description))
    }
    // 내가 만든 것을 앞에 둔다 — 방금 만든 걸 44개 뒤에서 찾게 하면 안 된다
    const all = allEffects().filter(
      (e) => e.category === category && e.id !== 'none' && match(e.name, e.description)
    )
    return [...all.filter((e) => isCustomId(e.id)), ...all.filter((e) => !isCustomId(e.id))]
  }, [category, query, customStamp])

  return (
    <section className="lib">
      <header>
        <strong>효과 라이브러리</strong>
        <span className="seg">
          {(['in', 'emphasis', 'out', 'screen', 'special'] as Tab[]).map((c) => (
            <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>
              {TAB_LABEL[c]}
            </button>
          ))}
        </span>
        <input
          className="input lib-search"
          placeholder="효과 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="lib-hint">
          {category === 'screen' ? (
            <>
              화면 전체에 덮이는 효과입니다 — 클릭하면 <b>{slideName}</b> 장에 적용됩니다
            </>
          ) : category === 'special' ? (
            <>
              안에 데이터·이미지를 실어 나르는 특별한 요소입니다 — 타일을{' '}
              <b>캔버스로 끌어다 놓거나</b> 클릭하면 만들어집니다
            </>
          ) : targetName ? (
            <>
              타일을 <b>섹션으로 끌어다 놓거나</b>, 클릭하면 <b>{targetName}</b> 에 적용됩니다
            </>
          ) : (
            '왼쪽에서 섹션을 먼저 선택하세요'
          )}
        </span>
      </header>

      <div className="lib-grid">
        {/* 화면·특이 효과는 키프레임 편집기로 만들 수 없다 */}
        {category !== 'screen' && category !== 'special' && (
          <button className="tile tile-new" onClick={() => onNewEffect(category as EffectCategory)}>
            <span className="tile-stage">
              <span className="tile-plus">+</span>
            </span>
            <span className="tile-name">효과 만들기</span>
            <span className="tile-desc">키프레임과 그래프로 직접</span>
          </button>
        )}
        {category === 'screen' ? (
          (list as ScreenEffect[]).map((e) => (
            <ScreenTile key={e.id} effect={e} onApply={onApplyScreen} />
          ))
        ) : category === 'special' ? (
          (list as SpecialItem[]).map((e) => (
            <SpecialTile key={e.id} item={e} onAdd={onAddSpecial} />
          ))
        ) : (
          (list as Effect[]).map((e) => (
            <EffectTile
              key={e.id}
              effect={e}
              onApply={onApply}
              onEdit={isCustomId(e.id) ? () => onEditEffect(e.id) : undefined}
            />
          ))
        )}
        {list.length === 0 && <p className="mono">검색 결과가 없습니다.</p>}
      </div>
    </section>
  )
}

function EffectTile({
  effect,
  onApply,
  onEdit
}: {
  effect: Effect
  onApply: (id: string) => void
  /** 내가 만든 효과에만 있다 — 기본 44종은 고칠 수 없다 */
  onEdit?: () => void
}): React.JSX.Element {
  // 재생 횟수를 key 로 써서, 다시 올릴 때마다 애니메이션이 처음부터 돌게 한다
  const [play, setPlay] = useState(0)

  const isLoop = effect.category === 'emphasis'
  const demoStyle: React.CSSProperties = {
    animation: `${keyframeName(effect.id)} ${effect.defaultDurationMs}ms ${effect.defaultEasing} both${
      isLoop ? ' infinite' : ''
    }`
  }

  return (
    <button
      className="tile"
      draggable
      title={effect.description}
      onMouseEnter={() => setPlay((p) => p + 1)}
      onClick={() => onApply(effect.id)}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(EFFECT_DRAG_TYPE, effect.id)
        // 일부 환경은 text/plain 이 없으면 드래그를 시작조차 하지 않는다
        ev.dataTransfer.setData('text/plain', effect.id)
        ev.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <span className="tile-stage">
        <span key={play} className="tile-demo" style={demoStyle}>
          Aa
        </span>
        {onEdit && (
          <span
            className="tile-edit"
            title="이 효과 고치기"
            onClick={(ev) => {
              // 타일 자체는 "적용"이다 — 연필까지 적용으로 삼키면 고칠 방법이 없다
              ev.stopPropagation()
              onEdit()
            }}
          >
            ✎
          </span>
        )}
      </span>
      <span className="tile-name">{effect.name}</span>
      <span className="tile-desc">{effect.description}</span>
    </button>
  )
}

/**
 * 특이 효과 타일.
 *
 * 효과가 아니라 **요소를 만든다** — 캔버스로 끌어다 놓으면 그 자리에, 클릭하면 슬라이드에.
 */
function SpecialTile({
  item,
  onAdd
}: {
  item: SpecialItem
  onAdd: (id: string) => void
}): React.JSX.Element {
  return (
    <button
      className="tile tile-special"
      draggable
      title={item.description}
      onClick={() => onAdd(item.id)}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(SPECIAL_DRAG_TYPE, item.id)
        ev.dataTransfer.setData('text/plain', item.id)
        ev.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <span className="tile-stage">
        <span className="tile-special-icon">{item.icon}</span>
      </span>
      <span className="tile-name">{item.name}</span>
      <span className="tile-desc">{item.description}</span>
    </button>
  )
}

/**
 * 화면 효과 타일.
 *
 * 이름만으로는 "색종이"와 "색종이 대포"의 차이를 알 수 없다. 타일 안에서 **실제 그것을**
 * 작게 돌려 보여준다 — 캔버스 크기를 타일 크기로 줘서 입자가 타일 안에서 움직인다.
 */
function ScreenTile({
  effect,
  onApply
}: {
  effect: ScreenEffect
  onApply: (id: string) => void
}): React.JSX.Element {
  const [play, setPlay] = useState(0)

  return (
    <button
      className="tile"
      draggable
      title={effect.description}
      onMouseEnter={() => setPlay((p) => p + 1)}
      onClick={() => onApply(effect.id)}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(SCREEN_FX_DRAG_TYPE, effect.id)
        ev.dataTransfer.setData('text/plain', effect.id)
        ev.dataTransfer.effectAllowed = 'copy'
      }}
    >
      <span className="tile-stage fx-stage">
        <ScreenFxLayer
          key={play}
          fx={{
            effect: effect.id,
            // 타일이 작으므로 입자를 줄인다 — 그대로 넣으면 뭉개져서 안 보인다
            intensity: 26,
            durationMs: effect.defaultDurationMs,
            delayMs: 0
          }}
          seed={`tile-${effect.id}`}
          canvasW={150}
          canvasH={64}
        />
      </span>
      <span className="tile-name">{effect.name}</span>
      <span className="tile-desc">{effect.description}</span>
    </button>
  )
}

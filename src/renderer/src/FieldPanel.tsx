import { useMemo, useState } from 'react'
import { allFields, fieldGroups, resolveField } from '@shared/fields'
import type { CreditData } from '@shared/aggregate'

export const FIELD_DRAG_TYPE = 'application/x-endcredit-field'

/**
 * 데이터 필드 목록.
 *
 * 방송 데이터를 어떻게 넣는지가 이 프로그램에서 제일 안 보이는 부분이었다.
 * **지금 값이 얼마인지 옆에 같이 보여주고**, 끌어다 놓으면 그 자리에 꽂히게 해
 * "무엇을 넣을 수 있는지"와 "넣으면 어떻게 보이는지"를 한 화면에서 알 수 있게 한다.
 */
export function FieldPanel({
  data,
  targetName,
  onInsert,
  onAddText,
  sample,
  onEnableSample
}: {
  data: CreditData
  /** 클릭 시 어디에 꽂히는지 */
  targetName: string | null
  /** 선택한 텍스트에 토큰을 끼워 넣는다 */
  onInsert: (token: string) => void
  /** 그 필드만 보여주는 텍스트 요소를 새로 만든다 */
  onAddText: (token: string) => void
  /** 샘플 데이터가 켜져 있는지 (꺼져 있고 값도 없으면 안내한다) */
  sample: boolean
  onEnableSample: () => void
}): React.JSX.Element {
  /** 몇 등까지 보여줄지. 10등이 상한일 이유가 없다. */
  const [maxRank, setMaxRank] = useState(() => Number(localStorage.getItem('fields:maxRank')) || 10)
  const groups = useMemo(() => fieldGroups(maxRank), [maxRank])
  const [group, setGroup] = useState(groups[0])
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allFields(maxRank).filter(
      (f) =>
        (q === '' ? f.group === group : true) &&
        (q === '' || `${f.group} ${f.label} ${f.token}`.toLowerCase().includes(q))
    )
  }, [group, query, maxRank])

  return (
    <section className="lib fieldlib">
      <header>
        <strong>데이터 필드</strong>
        <span className="seg">
          {groups.map((g) => (
            <button key={g} className={group === g && !query ? 'active' : ''} onClick={() => {
              setGroup(g)
              setQuery('')
            }}>
              {g}
            </button>
          ))}
        </span>
        <input
          className="input lib-search"
          placeholder="필드 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="rank-max">
          등수
          <input
            type="number"
            className="input"
            min={1}
            max={100}
            value={maxRank}
            onChange={(e) => {
              const n = Math.max(1, Math.min(100, Number(e.target.value) || 1))
              setMaxRank(n)
              localStorage.setItem('fields:maxRank', String(n))
            }}
          />
          등까지
        </label>
        <span className="lib-hint">
          {targetName ? (
            <>
              끌어다 놓거나 클릭하면 <b>{targetName}</b> 에 꽂힙니다
            </>
          ) : (
            '클릭하면 이 값을 보여주는 텍스트가 새로 생깁니다'
          )}
        </span>
      </header>

      {!sample && list.every((f) => !resolveField(f.token, data)) && (
        <p className="field-empty">
          아직 값이 없습니다. 실제 방송에서 데이터가 쌓이면 채워집니다.
          <button onClick={onEnableSample}>샘플 데이터 켜서 미리보기</button>
        </p>
      )}

      <div className="field-grid">
        {list.map((f) => {
          const value = resolveField(f.token, data)
          return (
            <button
              key={f.token}
              className="field-chip"
              draggable
              title={`{${f.token}}`}
              onDragStart={(e) => {
                e.dataTransfer.setData(FIELD_DRAG_TYPE, f.token)
                e.dataTransfer.setData('text/plain', `{${f.token}}`)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => (targetName ? onInsert(f.token) : onAddText(f.token))}
            >
              <span className="fc-label">
                {query ? `${f.group} · ` : ''}
                {f.label}
              </span>
              <span className={`fc-value ${value ? '' : 'empty'}`}>
                {value || '값 없음'}
              </span>
            </button>
          )
        })}
        {list.length === 0 && <p className="mono">검색 결과가 없습니다.</p>}
      </div>
    </section>
  )
}

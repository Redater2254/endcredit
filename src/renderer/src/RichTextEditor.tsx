import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TextElement, TextRun } from '@shared/deck'

/**
 * 캔버스 위에서 바로 고치는 글 편집기 — 포토샵식 부분 서식.
 *
 * ## 왜 데이터(runs) 기준인가
 *
 * 처음에는 contentEditable 의 DOM 을 직접 잘라 span 으로 감싸는 방식이었다.
 * 그 방식은 크롬이 끼워 넣는 <br>·<div>, 중첩 span, 깨지는 Range 때문에
 * "안 친 엔터가 생긴다 / 토글이 안 풀린다" 같은 버그가 끝없이 나왔다.
 *
 * 지금은 서식 적용을 **runs 배열 연산**으로만 한다:
 *   1) DOM 을 읽어 runs 로 만들고
 *   2) 선택 구간(문자 오프셋)에서 배열을 갈라 서식을 켜거나 끄고
 *   3) 그 결과로 DOM 을 다시 그린 뒤 선택을 되살린다
 * DOM 수술이 없으므로 결과가 항상 결정적이다.
 *
 * ## flex 금지
 *
 * contentEditable 자체에 flex 를 걸면 span 하나하나가 flex 아이템이 되어
 * **세로로 쌓인다** — 중간만 서식을 걸면 3줄로 보이는 원인이 그것이었다.
 * 세로 정렬은 바깥 래퍼(rt-inner)가 맡고, 편집 영역은 평범한 블록으로 둔다.
 */

function clampSize(n: number): number {
  return Math.max(8, Math.min(400, Math.round(n)))
}

type StyleKey = 'color' | 'size' | 'weight' | 'italic'

export function RichTextEditor({
  el,
  fontFamily,
  scale,
  onChange,
  onDone
}: {
  el: TextElement
  fontFamily: string
  scale: number
  onChange: (patch: { text: string; runs?: TextRun[] }) => void
  onDone: () => void
}): React.JSX.Element {
  const innerRef = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ x: number; y: number } | null>(null)
  const [shownSize, setShownSize] = useState(el.style.size)
  /** 숫자칸에 치는 중인 값. 확정 전까지는 적용하지 않는다. */
  const [draftSize, setDraftSize] = useState<string | null>(null)
  const seeded = useRef(false)
  /**
   * 마지막으로 고른 구간 — **문자 오프셋**으로 기억한다.
   * 서식 막대의 숫자칸을 누르면 글자 선택이 풀리는데, 오프셋은 DOM 이 바뀌어도
   * 그대로 유효해서 Range 객체보다 훨씬 안전하다.
   */
  const savedSel = useRef<[number, number] | null>(null)

  // ── DOM ↔ runs ─────────────────────────────────────────────

  /** 지금 DOM 을 runs 로 읽는다. 크롬이 끼워 넣는 <br>·<div> 를 여기서 정규화한다. */
  function readRuns(): TextRun[] {
    const node = ref.current
    if (!node) return []
    const runs: TextRun[] = []

    const push = (text: string, style: Partial<TextRun>): void => {
      if (!text) return
      const last = runs[runs.length - 1]
      const candidate: TextRun = { text, ...style }
      if (last && sameStyle(last, candidate)) last.text += text
      else runs.push(candidate)
    }

    const walk = (n: Node, inherited: Partial<TextRun>): void => {
      if (n.nodeName === 'BR') {
        push('\n', inherited)
        return
      }
      if (n.nodeType === Node.TEXT_NODE) {
        push(n.textContent ?? '', inherited)
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const e = n as HTMLElement

      // 크롬은 엔터를 치면 줄을 div 로 감싼다 — 그 경계도 줄바꿈이다
      if (/^(DIV|P)$/.test(e.tagName) && runs.length > 0) {
        const prev = runs[runs.length - 1]
        if (!prev.text.endsWith('\n')) prev.text += '\n'
      }

      const d = e.dataset
      const next: Partial<TextRun> = {
        color: d.color ?? inherited.color,
        size: d.size !== undefined ? Number(d.size) : inherited.size,
        weight: d.weight !== undefined ? Number(d.weight) : inherited.weight,
        italic: d.italic === '1' ? true : inherited.italic
      }
      n.childNodes.forEach((c) => walk(c, next))
    }

    node.childNodes.forEach((c) => walk(c, {}))

    // 크롬이 끝에 놔두는 보이지 않는 줄바꿈은 전부 걷어낸다
    while (runs.length > 0) {
      const last = runs[runs.length - 1]
      if (!last.text.endsWith('\n')) break
      last.text = last.text.slice(0, -1)
      if (!last.text) runs.pop()
    }
    return runs
  }

  /** runs 로 DOM 을 다시 그린다. */
  function reseed(runs: TextRun[]): void {
    const node = ref.current
    if (!node) return
    node.innerHTML = ''
    for (const r of runs) node.appendChild(spanFor(r, scale))
  }

  // ── 선택 ↔ 오프셋 ──────────────────────────────────────────

  /** 편집 영역 안의 위치를 문자 오프셋으로. BR 은 한 글자(\n)로 센다. */
  function offsetOf(container: Node, offsetInNode: number): number {
    const node = ref.current
    if (!node) return 0
    let total = 0
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    let cur: Node | null = walker.currentNode

    // 컨테이너가 요소면, 그 요소의 offsetInNode 번째 자식 "앞"이 기준점이다
    const target =
      container.nodeType === Node.ELEMENT_NODE
        ? (container.childNodes[offsetInNode] ?? null)
        : container

    while (cur) {
      if (cur === target && container.nodeType !== Node.ELEMENT_NODE) {
        return total + offsetInNode
      }
      if (cur === target) return total
      if (cur.nodeName === 'BR') total += 1
      else if (cur.nodeType === Node.TEXT_NODE) total += (cur.textContent ?? '').length
      cur = walker.nextNode()
    }
    return total
  }

  /** 문자 오프셋 구간을 다시 선택 상태로 만든다. */
  function selectOffsets(start: number, end: number): void {
    const node = ref.current
    if (!node) return
    const range = document.createRange()
    let total = 0
    let placedStart = false

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let t: Node | null = walker.nextNode()
    while (t) {
      const len = (t.textContent ?? '').length
      if (!placedStart && start <= total + len) {
        range.setStart(t, Math.max(0, start - total))
        placedStart = true
      }
      if (placedStart && end <= total + len) {
        range.setEnd(t, Math.max(0, end - total))
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        return
      }
      total += len
      t = walker.nextNode()
    }
    // 끝까지 못 찾으면 마지막 지점까지 선택
    if (placedStart) {
      range.setEndAfter(node.lastChild ?? node)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }

  // ── runs 배열 연산 ─────────────────────────────────────────

  /** [start, end) 경계에서 runs 를 가른다. 반환: 가른 배열과 구간에 속한 인덱스들 */
  function splitRuns(
    runs: TextRun[],
    start: number,
    end: number
  ): { out: TextRun[]; picked: number[] } {
    const out: TextRun[] = []
    const picked: number[] = []
    let pos = 0

    for (const r of runs) {
      const a = pos
      const b = pos + r.text.length
      pos = b

      // 구간과 안 겹침
      if (b <= start || a >= end) {
        out.push({ ...r })
        continue
      }
      // 앞부분 (구간 밖)
      if (a < start) out.push({ ...r, text: r.text.slice(0, start - a) })
      // 겹치는 가운데
      const from = Math.max(a, start) - a
      const to = Math.min(b, end) - a
      out.push({ ...r, text: r.text.slice(from, to) })
      picked.push(out.length - 1)
      // 뒷부분 (구간 밖)
      if (b > end) out.push({ ...r, text: r.text.slice(to) })
    }
    return { out, picked }
  }

  function mergeRuns(runs: TextRun[]): TextRun[] {
    const out: TextRun[] = []
    for (const r of runs) {
      const last = out[out.length - 1]
      if (last && sameStyle(last, r)) last.text += r.text
      else out.push({ ...r })
    }
    return out.filter((r) => r.text.length > 0)
  }

  function commitRuns(runs: TextRun[]): void {
    const merged = mergeRuns(runs)
    const plain = merged.map((r) => r.text).join('')
    const plainOnly = merged.every(
      (r) => !r.color && !r.size && !r.weight && r.italic === undefined
    )
    onChange({ text: plain, runs: plainOnly ? undefined : merged })
  }

  /**
   * 서식 적용/토글 — 전부 배열 연산.
   *
   * `toggle` 이 참이면: 구간 **전체가 이미 그 값**일 때 해제, 아니면 전체 적용.
   * (일부만 굵을 때 굵게를 누르면 전부 굵게 — 편집기의 상식적인 동작)
   */
  function applyFormat(key: StyleKey, value: string | number | boolean, toggle = false): void {
    const sel = savedSel.current
    if (!sel || sel[0] === sel[1]) return

    const current = readRuns()
    const total = current.reduce((n, r) => n + r.text.length, 0)
    const start = Math.max(0, Math.min(sel[0], total))
    const end = Math.max(start, Math.min(sel[1], total))
    if (start === end) return

    const { out, picked } = splitRuns(current, start, end)

    const allSame =
      toggle &&
      picked.length > 0 &&
      picked.every((i) => {
        const r = out[i]
        return key === 'italic' ? r.italic === value : r[key] === value
      })

    for (const i of picked) {
      if (allSame) delete out[i][key]
      else (out[i] as Record<StyleKey, unknown>)[key] = value
    }

    const merged = mergeRuns(out)
    reseed(merged)
    // 숫자칸에 타이핑 중이면 선택을 되살리지 않는다 — 포커스를 빼앗아 입력이 끊긴다.
    // 오프셋(savedSel)은 남아 있으므로 다음 적용도 같은 구간에 걸린다.
    if (!document.activeElement?.closest('.rt-bar')) selectOffsets(start, end)
    savedSel.current = [start, end]
    commitRuns(merged)
    if (key === 'size') setShownSize(allSame ? el.style.size : (value as number))
    showBar()
  }

  // ── 이벤트 ─────────────────────────────────────────────────

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || seeded.current) return
    seeded.current = true

    const source = el.runs && el.runs.length > 0 ? el.runs : [{ text: el.text }]
    // 예전 버전이 저장해 둔 꼬리 줄바꿈은 열 때 걷어낸다
    const runs = source.map((r, i) =>
      i === source.length - 1 ? { ...r, text: r.text.replace(/\n+$/, '') } : r
    )
    reseed(runs)

    node.focus()
    // 처음 열면 전체 선택 — 바로 갈아엎기 쉽게
    const len = runs.reduce((n, r) => n + r.text.length, 0)
    selectOffsets(0, len)
    savedSel.current = [0, len]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 타이핑 반영은 묶어서 — 매 타건마다 문서를 갱신하면 캔버스가 버벅인다 */
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function commitTyping(now = false): void {
    if (commitTimer.current) clearTimeout(commitTimer.current)
    const run = (): void => commitRuns(readRuns())
    if (now) run()
    else commitTimer.current = setTimeout(run, 250)
  }

  function showBar(): void {
    // 숫자칸에 포커스를 주면 글자 선택이 접히며 selectionchange 가 발동하는데,
    // 그때 막대를 닫으면 **입력하던 칸이 통째로 사라진다.** 막대 사용 중엔 그대로 둔다.
    if (document.activeElement?.closest('.rt-bar')) return

    const sel = window.getSelection()
    const inner = innerRef.current
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !inner) return setBar(null)
    const r = sel.getRangeAt(0).getBoundingClientRect()
    const box = inner.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return setBar(null)
    setBar({ x: r.left - box.left + r.width / 2, y: r.top - box.top })
  }

  useEffect(() => {
    const onSel = (): void => {
      const sel = window.getSelection()
      const node = ref.current
      if (sel && sel.rangeCount > 0 && node) {
        const r = sel.getRangeAt(0)
        if (node.contains(r.commonAncestorContainer) && !r.collapsed) {
          const s = offsetOf(r.startContainer, r.startOffset)
          const e = offsetOf(r.endContainer, r.endOffset)
          savedSel.current = [Math.min(s, e), Math.max(s, e)]
          // 표시 크기도 선택을 따라간다
          const { out, picked } = splitRuns(readRuns(), Math.min(s, e), Math.max(s, e))
          setShownSize(picked.length > 0 ? (out[picked[0]].size ?? el.style.size) : el.style.size)
        }
      }
      showBar()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const vAlign = el.style.vAlign

  return (
    <div
      ref={innerRef}
      className="rt-inner"
      style={{
        justifyContent:
          vAlign === 'middle' ? 'center' : vAlign === 'bottom' ? 'flex-end' : 'flex-start'
      }}
    >
      <div
        ref={ref}
        className="inline-text rich"
        contentEditable
        suppressContentEditableWarning
        style={{
          fontSize: el.style.size * scale,
          lineHeight: el.style.lineHeight,
          fontWeight: el.style.weight,
          color: el.style.color,
          textAlign: el.style.align,
          fontFamily
        }}
        onInput={() => commitTyping()}
        onBlur={(e) => {
          if ((e.relatedTarget as HTMLElement | null)?.closest('.rt-bar')) return
          commitTyping(true)
          onDone()
        }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            commitTyping(true)
            onDone()
          }
        }}
      />

      {bar && (
        <div className="rt-bar" style={{ left: bar.x, top: bar.y }}>
          <label className="rt-color" title="고른 글자 색" onMouseDown={(e) => e.preventDefault()}>
            <input
              type="color"
              defaultValue={el.style.color}
              onChange={(e) => applyFormat('color', e.target.value)}
            />
          </label>

          <span className="rt-size">
            <input
              type="number"
              min={8}
              max={400}
              value={draftSize ?? shownSize}
              onFocus={() => setDraftSize(String(shownSize))}
              onChange={(e) => setDraftSize(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setDraftSize(null)
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
              onBlur={(e) => {
                // 다 치고 나서 한 번에 적용 — '80' 을 치는 도중 '8' 이 적용되면 안 된다
                if (draftSize !== null) {
                  const n = Number(draftSize)
                  if (Number.isFinite(n) && n > 0) applyFormat('size', clampSize(n))
                }
                setDraftSize(null)
                // 막대·편집기 밖으로 나가면 편집 종료
                const to = e.relatedTarget as HTMLElement | null
                if (!to?.closest('.rt-bar') && !to?.closest('.inline-text')) {
                  commitTyping(true)
                  onDone()
                }
              }}
            />
            <span className="rt-unit">px</span>
            <input
              className="rt-slider"
              type="range"
              min={8}
              max={160}
              value={Math.min(160, shownSize)}
              onChange={(e) => applyFormat('size', clampSize(Number(e.target.value)))}
            />
          </span>

          <button
            title="굵게 (다시 누르면 해제)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('weight', 900, true)}
          >
            <b>B</b>
          </button>
          <button
            title="얇게 (다시 누르면 해제)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('weight', 300, true)}
          >
            <span style={{ fontWeight: 300 }}>B</span>
          </button>
          <button
            title="기울임 (다시 누르면 해제)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat('italic', true, true)}
          >
            <i>I</i>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * 조각 하나를 span 으로.
 * `style` 은 화면에 보이는 크기(× 배율), `data-*` 는 저장할 원래 값.
 * 둘을 나눠야 확대해서 편집해도 저장 값이 변하지 않는다.
 */
function spanFor(r: TextRun, scale: number): HTMLSpanElement {
  const s = document.createElement('span')
  if (r.color) {
    s.style.color = r.color
    s.dataset.color = r.color
  }
  if (r.size) {
    s.style.fontSize = `${r.size * scale}px`
    s.dataset.size = String(r.size)
  }
  if (r.weight) {
    s.style.fontWeight = String(r.weight)
    s.dataset.weight = String(r.weight)
  }
  if (r.italic) {
    s.style.fontStyle = 'italic'
    s.dataset.italic = '1'
  }
  s.textContent = r.text
  return s
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return a.color === b.color && a.size === b.size && a.weight === b.weight && a.italic === b.italic
}

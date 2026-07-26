import type { CreditData } from './aggregate'
import type { TextRun } from './deck'

/**
 * 데이터 필드 — 방송 데이터를 글 안에 직접 끼워 넣기 위한 장치.
 *
 * 순위 위젯만 있으면 "오늘의 수다왕은 OOO님!" 같은 문장을 만들 수 없다.
 * 텍스트 어디에나 `{chatRank.1.name}` 을 넣으면 실제 값으로 바뀐다.
 * 사용자는 토큰을 외울 필요 없이 목록에서 끌어다 놓기만 하면 된다.
 */

export interface Field {
  /** 글에 들어가는 토큰 (중괄호 제외) */
  token: string
  label: string
  group: string
}

const RANK_SOURCES: { key: string; label: string; unit: string }[] = [
  { key: 'chatRank', label: '채팅 순위', unit: '회' },
  { key: 'emoticonRank', label: '이모티콘 순위', unit: '개' },
  { key: 'balloonRank', label: '별풍선 순위', unit: '개' },
  { key: 'stickerRank', label: '서포트 스티커', unit: '개' },
  { key: 'giftRank', label: '선물 많이 한 사람', unit: '회' }
]

const LIST_SOURCES: { key: string; label: string }[] = [
  { key: 'newSubscribers', label: '신규 구독자' },
  { key: 'renewedSubscribers', label: '구독 갱신' },
  { key: 'quickviewGifts', label: '플러스 구독 선물' },
  { key: 'newFans', label: '신규 팬클럽' },
  { key: 'newTopFans', label: '열혈 승급' },
  { key: 'newFollowers', label: '신규 애청자' }
]

/**
 * 라이브러리에 늘어놓을 필드 전체.
 * `maxRank` 로 몇 등까지 만들지 정한다 — 10등이 상한일 이유가 없다.
 */
export function allFields(maxRank = 10): Field[] {
  const out: Field[] = []

  for (const s of RANK_SOURCES) {
    for (let i = 1; i <= maxRank; i += 1) {
      out.push({ token: `${s.key}.${i}.name`, label: `${i}등 이름`, group: s.label })
      out.push({ token: `${s.key}.${i}.value`, label: `${i}등 수치`, group: s.label })
    }
  }

  for (const s of LIST_SOURCES) {
    out.push({ token: `${s.key}.count`, label: '인원수', group: s.label })
    out.push({ token: `${s.key}.list`, label: '전체 명단 (쉼표)', group: s.label })
    for (let i = 1; i <= Math.min(maxRank, 20); i += 1) {
      out.push({ token: `${s.key}.${i}.name`, label: `${i}번째 이름`, group: s.label })
    }
  }

  out.push(
    { token: 'now.year', label: '년', group: '날짜·시각' },
    { token: 'now.month', label: '월', group: '날짜·시각' },
    { token: 'now.day', label: '일', group: '날짜·시각' },
    { token: 'now.hour', label: '시 (00~23)', group: '날짜·시각' },
    { token: 'now.minute', label: '분 (00~59)', group: '날짜·시각' },

    { token: 'total.messages', label: '전체 채팅 수', group: '합계' },
    { token: 'total.chatters', label: '채팅 참여자 수', group: '합계' },
    { token: 'total.emoticons', label: '전체 이모티콘 수', group: '합계' },
    { token: 'total.balloons', label: '전체 별풍선 수', group: '합계' },
    { token: 'total.stickers', label: '전체 스티커 수', group: '합계' },
    { token: 'total.subscribers', label: '신규 구독자 수', group: '합계' },
    { token: 'total.fans', label: '신규 팬클럽 수', group: '합계' },
    { token: 'total.duration', label: '방송 시간', group: '합계' },

    { token: 'firstChatter.name', label: '오늘 첫 채팅한 사람', group: '오늘의 기록' },
    { token: 'firstChatter.value', label: '그 사람의 채팅 수', group: '오늘의 기록' },
    { token: 'topDonation.name', label: '최고 후원자 (1회 기준)', group: '오늘의 기록' },
    { token: 'topDonation.value', label: '최고 후원 개수', group: '오늘의 기록' }
  )

  return out
}

export function fieldGroups(maxRank = 10): string[] {
  return [...new Set(allFields(maxRank).map((f) => f.group))]
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0분'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

/**
 * 지금 시각.
 *
 * 이것만 방송 데이터가 아니라 **그리는 순간의 시계**에서 온다. "2026년 7월 26일 방송"
 * 같은 문구를 크레딧에 박으려면 필요한데 집계 데이터에는 그런 게 없다.
 * 크레딧이 돌아가는 도중에 분이 바뀌어도 다시 그려지지 않는 한 그대로다 —
 * '크레딧을 튼 시각'이라고 보면 된다.
 *
 * 시·분만 두 자리로 채운다. `{now.hour}:{now.minute}` 가 `21:5` 로 나오면 못 쓰기 때문이다.
 * 년·월·일은 채우지 않는다 — `07월 26일` 보다 `7월 26일` 이 자연스럽다.
 */
function resolveNow(part: string | undefined): string | null {
  const d = new Date()
  const p2 = (n: number): string => String(n).padStart(2, '0')
  switch (part) {
    case 'year':
      return String(d.getFullYear())
    case 'month':
      return String(d.getMonth() + 1)
    case 'day':
      return String(d.getDate())
    case 'hour':
      return p2(d.getHours())
    case 'minute':
      return p2(d.getMinutes())
    default:
      return null
  }
}

const RANK_UNIT: Record<string, string> = {
  chatRank: '회',
  emoticonRank: '개',
  balloonRank: '개',
  stickerRank: '개',
  giftRank: '회'
}

/** 토큰 하나를 실제 값으로. 없으면 null. */
export function resolveField(token: string, data: CreditData): string | null {
  const parts = token.split('.')
  const d = data as unknown as Record<string, unknown>

  if (parts[0] === 'now') return resolveNow(parts[1])

  if (parts[0] === 'total') {
    if (parts[1] === 'duration') return formatDuration(data.totals.durationMs)
    const v = data.totals[parts[1] as keyof CreditData['totals']]
    return typeof v === 'number' ? v.toLocaleString() : null
  }

  // 단일 기록 (오늘 첫 채팅 · 최고 후원)
  if (parts[0] === 'firstChatter' || parts[0] === 'topDonation') {
    const row = data[parts[0]]
    if (!row) return null
    if (parts[1] === 'name') return row.nickname
    if (parts[1] === 'value') {
      return parts[0] === 'topDonation'
        ? `${row.value.toLocaleString()}개`
        : `${row.value.toLocaleString()}회`
    }
    return null
  }

  const rows = d[parts[0]]
  if (!Array.isArray(rows)) return null

  if (parts[1] === 'count') return String(rows.length)
  if (parts[1] === 'list') {
    return rows.map((r) => (r as { nickname?: string }).nickname ?? '').join(', ')
  }

  const idx = Number(parts[1]) - 1
  const row = rows[idx] as { nickname?: string; value?: number; months?: number } | undefined
  if (!row) return null

  if (parts[2] === 'name') return row.nickname ?? ''
  if (parts[2] === 'value') {
    if (typeof row.value === 'number') {
      return `${row.value.toLocaleString()}${RANK_UNIT[parts[0]] ?? ''}`
    }
    if (typeof row.months === 'number') return `${row.months}개월`
    return ''
  }
  return null
}

/**
 * 글 안의 `{...}` 를 전부 바꾼다.
 *
 * 값이 없는 필드는 빈 문자열이 된다 — 편집 중에는 자리표시자를 보여주고,
 * 실제 송출에서는 조용히 사라지게 해서 "없는 사람 이름"이 뜨지 않게 한다.
 */
export function interpolate(text: string, data: CreditData, placeholder = false): string {
  return text.replace(/\{([^}]+)\}/g, (whole, token: string) => {
    const v = resolveField(token.trim(), data)
    if (v !== null && v !== '') return v
    return placeholder ? whole : ''
  })
}

/** 글에 데이터 필드가 들어 있는지 */
export function hasFields(text: string): boolean {
  return /\{[^}]+\}/.test(text)
}

/** 토큰 → 사람이 읽을 이름 (미리보기 안내용) */
export function labelForToken(token: string): string {
  const f = allFields(50).find((x) => x.token === token)
  return f ? `${f.group} ${f.label}` : token
}

/**
 * 부분 서식이 있는 글(runs)의 필드 치환.
 *
 * 치환을 조각별로 하면 `{chatRank.1.name}` 이 서식 경계에서 갈라졌을 때 —
 * 예: "1등 {chatRank" + ".1.name}" — 어느 조각에도 완전한 토큰이 없어 값이 안 나온다.
 * **이어붙인 전체 문자열**에서 토큰을 찾고, 값은 토큰이 시작된 조각의 서식으로 넣는다.
 */
export function interpolateRuns(
  runs: TextRun[],
  data: CreditData,
  placeholder = false
): TextRun[] {
  const full = runs.map((r) => r.text).join('')

  const repls: { start: number; end: number; val: string }[] = []
  const re = /\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(full)) !== null) {
    const v = resolveField(m[1].trim(), data)
    repls.push({
      start: m.index,
      end: m.index + m[0].length,
      val: v !== null && v !== '' ? v : placeholder ? m[0] : ''
    })
  }
  if (repls.length === 0) return runs

  const out: TextRun[] = []
  const push = (text: string, style: TextRun): void => {
    if (text) out.push({ ...style, text })
  }

  let pos = 0
  for (const r of runs) {
    const a = pos
    const b = pos + r.text.length
    pos = b

    let local = 0
    for (const rep of repls) {
      if (rep.end <= a || rep.start >= b) continue
      const from = Math.max(rep.start, a) - a
      const to = Math.min(rep.end, b) - a
      push(r.text.slice(local, from), r)
      // 값은 토큰이 **시작된** 조각에서 한 번만 넣는다 (걸친 뒤 조각에선 지우기만)
      if (rep.start >= a) push(rep.val, r)
      local = to
    }
    push(r.text.slice(local), r)
  }
  return out
}

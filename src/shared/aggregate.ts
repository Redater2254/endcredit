import type { RawEvent, SoopUserStatus } from './events'

/**
 * 원본 이벤트 → 엔딩크레딧 데이터.
 *
 * 순수 계산만 한다. 라이브 스트림에 밀어넣어도 되고, 저장된 events.ndjson 을
 * 통째로 재생해도 같은 결과가 나온다. 집계 규칙을 고치면 과거 방송분에도 그대로 적용된다.
 */

export interface RankedUser {
  userId: string
  nickname: string
  value: number
}

export interface SubscriberEntry {
  userId: string
  nickname: string
  /** 선물받은 구독이면 선물한 사람 */
  giftedBy: string | null
  /** GIFT_30 / MEMBERSHIP_1 등 SOOP 원본 타입 문자열 */
  type: string | null
  tier: number | null
}

export interface CreditData {
  chatRank: RankedUser[]
  /** 이모티콘을 많이 쓴 사람 */
  emoticonRank: RankedUser[]
  /** 남에게 선물(구독·플러스구독)을 많이 한 사람 */
  giftRank: RankedUser[]
  balloonRank: RankedUser[]
  stickerRank: RankedUser[]
  newSubscribers: SubscriberEntry[]
  renewedSubscribers: { userId: string; nickname: string; months: number; accMonths: number }[]
  quickviewGifts: { userId: string; nickname: string; type: string | null }[]
  /** 수집 중 새로 팬클럽에 가입한 사람 (isFan false→true 를 실제로 목격한 경우만) */
  newFans: RankedUser[]
  /** 열혈팬 승급 */
  newTopFans: RankedUser[]
  /** 신규 애청자 */
  newFollowers: RankedUser[]
  /** 서포터 승급 */
  newSupporters: RankedUser[]
  /** 오늘 처음 채팅한 사람 (없으면 null) */
  firstChatter: RankedUser | null
  /** 한 번에 가장 많이 쏜 후원 */
  topDonation: { userId: string; nickname: string; value: number } | null
  totals: {
    messages: number
    balloons: number
    stickers: number
    uniqueChatters: number
    /** 이모티콘 사용 횟수 */
    emoticons: number
    /** 신규 구독자 수 */
    subscribers: number
    /** 신규 팬클럽 수 */
    fans: number
    /** 수집 시작~마지막 이벤트 (ms). 방송 시간의 근사치 */
    durationMs: number
  }
}

export interface AggregateOptions {
  /** 스트리머 본인을 순위에서 제외 (본인이 1등인 크레딧은 의미가 없다) */
  excludeBJ: boolean
  /** 매니저 제외 */
  excludeManagers: boolean
}

export const DEFAULT_AGGREGATE_OPTIONS: AggregateOptions = {
  excludeBJ: true,
  excludeManagers: false
}

/**
 * SOOP 은 같은 계정이 여러 기기/탭에서 접속하면 `lysrobert(2)`, `lysrobert(3)` 처럼
 * 접미사를 붙인다. 정규화하지 않으면 시청자 한 명이 순위에 여러 번 등장한다.
 * 실제 수집 데이터에서 확인한 동작이다 (2026-07-21).
 */
export function normalizeUserId(userId: string): string {
  return userId.replace(/\(\d+\)$/, '')
}

interface UserRecord {
  userId: string
  nickname: string
  messages: number
  emoticons: number
  gifts: number
  balloons: number
  stickers: number
  isBJ: boolean
  isManager: boolean
  /** 마지막으로 관측된 상태 — 전이 판정의 기준 */
  status: Pick<SoopUserStatus, 'isFan' | 'isTopFan' | 'isFollower' | 'isSupporter'> | null
}

type StatusKey = 'isFan' | 'isTopFan' | 'isFollower' | 'isSupporter'

interface StatusPayload {
  userId?: unknown
  userNickname?: unknown
  userStatus?: Partial<SoopUserStatus>
}

export interface Aggregator {
  push(event: RawEvent): void
  snapshot(): CreditData
}

export function createAggregator(
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS
): Aggregator {
  const users = new Map<string, UserRecord>()
  const promotions: Record<StatusKey, Map<string, true>> = {
    isFan: new Map(),
    isTopFan: new Map(),
    isFollower: new Map(),
    isSupporter: new Map()
  }
  const newSubscribers: SubscriberEntry[] = []
  let firstChatterId: string | null = null
  let topDonation: CreditData['topDonation'] = null
  let firstEventAt = 0
  let lastEventAt = 0
  const renewedSubscribers: CreditData['renewedSubscribers'] = []
  const quickviewGifts: CreditData['quickviewGifts'] = []

  function record(rawId: unknown, rawNick: unknown): UserRecord | null {
    if (typeof rawId !== 'string' || rawId.length === 0) return null
    const userId = normalizeUserId(rawId)

    let u = users.get(userId)
    if (!u) {
      u = {
        userId,
        nickname: typeof rawNick === 'string' && rawNick ? rawNick : userId,
        messages: 0,
        emoticons: 0,
        gifts: 0,
        balloons: 0,
        stickers: 0,
        isBJ: false,
        isManager: false,
        status: null
      }
      users.set(userId, u)
    } else if (typeof rawNick === 'string' && rawNick) {
      // 닉네임 변경 시 마지막 닉을 쓴다
      u.nickname = rawNick
    }
    return u
  }

  /**
   * 상태 전이 감지.
   *
   * **처음 본 사용자의 true 는 승급으로 세지 않는다.** 이미 팬이던 사람이 오늘 처음
   * 채팅한 것과, 오늘 팬이 된 것을 구분할 방법이 그것뿐이기 때문이다.
   * 없는 데이터를 있는 척 만들지 않는다.
   */
  function applyStatus(u: UserRecord, status: Partial<SoopUserStatus> | undefined): void {
    if (!status) return

    if (status.isBJ) u.isBJ = true
    if (status.isManager) u.isManager = true

    const next = {
      isFan: Boolean(status.isFan),
      isTopFan: Boolean(status.isTopFan),
      isFollower: Boolean(status.isFollower),
      isSupporter: Boolean(status.isSupporter)
    }

    if (u.status !== null) {
      for (const key of ['isFan', 'isTopFan', 'isFollower', 'isSupporter'] as StatusKey[]) {
        if (!u.status[key] && next[key]) promotions[key].set(u.userId, true)
      }
    }
    u.status = next
  }

  function fromStatusPayload(payload: unknown): UserRecord | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as StatusPayload
    const u = record(p.userId, p.userNickname)
    if (u) applyStatus(u, p.userStatus)
    return u
  }

  function countOf(payload: unknown): number {
    const n = Number((payload as { count?: unknown })?.count)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  function str(v: unknown): string | null {
    return typeof v === 'string' && v ? v : null
  }

  function push(event: RawEvent): void {
    const p = (event.payload ?? {}) as Record<string, unknown>
    if (!firstEventAt) firstEventAt = event.t
    lastEventAt = event.t

    switch (event.action) {
      // 접속 시 전원의 상태를 한 번에 준다 — 전이 판정의 기준선이 된다
      case 'IN':
      case 'JOIN':
      case 'OUT': {
        const list = p.userList
        if (Array.isArray(list)) list.forEach(fromStatusPayload)
        else fromStatusPayload(p)
        break
      }

      case 'MESSAGE':
      case 'MANAGER_MESSAGE': {
        const u = fromStatusPayload(p)
        if (u) {
          u.messages += 1
          // OGQ 이모티콘으로 친 채팅은 imageUrl 이 붙어 온다
          if (typeof p.imageUrl === 'string' && p.imageUrl) u.emoticons += 1
          if (!firstChatterId && eligible(u)) firstChatterId = u.userId
        }
        break
      }

      case 'USERSTATUS_CHANGED':
      case 'ADMINSTATUS_CHANGED':
      case 'NICKNAME_CHANGED':
        fromStatusPayload(p)
        break

      /**
       * 미션에 쓴 별풍선도 같은 별풍선이다.
       *
       * SOOP 은 도전/대결미션 참여를 `SVC_MISSION`(121) 한 통로로 보내고 일반 별풍선
       * 패킷(`SVC_SENDBALLOON` 계열)으로는 **다시 보내지 않는다.** 그래서 여기서 안 세면
       * 미션에 쏜 별풍선이 순위에서 통째로 빠지고, 겹쳐 세일 일도 없다.
       * (정산 때 오는 `CHALLENGE_MISSION_SPONSORS` 는 같은 후원을 한 번 더 나열한
       *  명단이므로 세지 않는다 — 그걸 같이 세면 정확히 두 배가 된다)
       */
      case 'CHALLENGE_MISSION_GIFTED':
      case 'BATTLE_MISSION_GIFTED':
      case 'BALLOON_GIFTED':
      case 'ADBALLOON_GIFTED':
      case 'VIDEOBALLOON_GIFTED': {
        const u = record(p.userId, p.userNickname)
        if (u) {
          const n = countOf(p)
          u.balloons += n
          if (n > 0 && (!topDonation || n > topDonation.value)) {
            topDonation = { userId: u.userId, nickname: u.nickname, value: n }
          }
          // 별풍선 이벤트는 열혈 승급을 직접 알려준다 (userStatus 전이와 별개 경로)
          if (p.becomesTopFan === true) promotions.isTopFan.set(u.userId, true)
        }
        break
      }

      case 'STICKER_GIFTED': {
        const u = record(p.userId, p.userNickname)
        if (u) u.stickers += countOf(p)
        break
      }

      case 'SUBSCRIBED': {
        const u = record(p.userId, p.userNickname)
        if (u) {
          newSubscribers.push({
            userId: u.userId,
            nickname: u.nickname,
            giftedBy: null,
            type: str(p.type),
            tier: Number.isFinite(Number(p.tier)) ? Number(p.tier) : null
          })
        }
        break
      }

      case 'SUBSCRIPTION_GIFTED': {
        // userId=선물한 사람, receiverId=구독을 받은 사람. 크레딧에 올릴 대상은 받은 쪽이다.
        const receiver = record(p.receiverId, p.receiverNickname)
        const sender = record(p.userId, p.userNickname)
        if (sender) sender.gifts += 1
        if (receiver) {
          newSubscribers.push({
            userId: receiver.userId,
            nickname: receiver.nickname,
            giftedBy: sender?.nickname ?? null,
            type: str(p.type),
            tier: null
          })
        }
        break
      }

      case 'SUBSCRIPTION_RENEWED': {
        const u = record(p.userId, p.userNickname)
        if (u) {
          renewedSubscribers.push({
            userId: u.userId,
            nickname: u.nickname,
            months: Number(p.subscriptionMonths) || 0,
            accMonths: Number(p.accSubscriptionMonths) || 0
          })
        }
        break
      }

      case 'QUICKVIEW_GIFTED': {
        const receiver = record(p.receiverId, p.receiverNickname)
        const giver = record(p.userId, p.userNickname)
        if (giver) giver.gifts += 1
        if (receiver) {
          quickviewGifts.push({
            userId: receiver.userId,
            nickname: receiver.nickname,
            type: str(p.type)
          })
        }
        break
      }

      default:
        // 모르는 action 도 사용자 정보가 있으면 닉네임 갱신 정도는 해둔다
        if (typeof p.userId === 'string') fromStatusPayload(p)
    }
  }

  function eligible(u: UserRecord): boolean {
    if (options.excludeBJ && u.isBJ) return false
    if (options.excludeManagers && u.isManager) return false
    return true
  }

  function rank(pick: (u: UserRecord) => number): RankedUser[] {
    return [...users.values()]
      .filter((u) => eligible(u) && pick(u) > 0)
      .map((u) => ({ userId: u.userId, nickname: u.nickname, value: pick(u) }))
      .sort((a, b) => b.value - a.value || a.nickname.localeCompare(b.nickname))
  }

  function promoted(key: StatusKey): RankedUser[] {
    return [...promotions[key].keys()]
      .map((id) => users.get(id))
      .filter((u): u is UserRecord => Boolean(u) && eligible(u as UserRecord))
      .map((u) => ({ userId: u.userId, nickname: u.nickname, value: 1 }))
  }

  function snapshot(): CreditData {
    const chatRank = rank((u) => u.messages)
    const first = firstChatterId ? users.get(firstChatterId) : undefined
    const newFans = promoted('isFan')
    return {
      chatRank,
      emoticonRank: rank((u) => u.emoticons),
      giftRank: rank((u) => u.gifts),
      balloonRank: rank((u) => u.balloons),
      stickerRank: rank((u) => u.stickers),
      newSubscribers: dedupeBy(newSubscribers, (e) => e.userId),
      renewedSubscribers: dedupeBy(renewedSubscribers, (e) => e.userId),
      quickviewGifts: dedupeBy(quickviewGifts, (e) => e.userId),
      newFans,
      newTopFans: promoted('isTopFan'),
      newFollowers: promoted('isFollower'),
      newSupporters: promoted('isSupporter'),
      firstChatter: first
        ? { userId: first.userId, nickname: first.nickname, value: first.messages }
        : null,
      topDonation,
      totals: {
        messages: chatRank.reduce((s, u) => s + u.value, 0),
        balloons: [...users.values()].reduce((s, u) => s + u.balloons, 0),
        stickers: [...users.values()].reduce((s, u) => s + u.stickers, 0),
        uniqueChatters: chatRank.length,
        emoticons: [...users.values()].reduce((s, u) => s + u.emoticons, 0),
        subscribers: dedupeBy(newSubscribers, (e) => e.userId).length,
        fans: newFans.length,
        durationMs: firstEventAt ? lastEventAt - firstEventAt : 0
      }
    }
  }

  return { push, snapshot }
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 저장된 로그 전체를 재생해 집계한다. */
export function aggregateAll(
  events: RawEvent[],
  options: AggregateOptions = DEFAULT_AGGREGATE_OPTIONS
): CreditData {
  const agg = createAggregator(options)
  for (const e of events) agg.push(e)
  return agg.snapshot()
}

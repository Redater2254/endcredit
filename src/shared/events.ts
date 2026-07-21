/**
 * SOOP Chat SDK 가 실제로 방출하는 action 목록.
 * sooplive-chat-sdk.js 를 해부해 `action:"..."` 로 실제 생성되는 것만 추렸다 (2026-07-21).
 * 문서에 없는 것도 있으므로, 여기 없는 action 이 들어와도 버리지 말고 로그에 남긴다.
 */
export const KNOWN_ACTIONS = [
  'MESSAGE',
  'MANAGER_MESSAGE',
  'WHISPER',
  'BALLOON_GIFTED',
  'ADBALLOON_GIFTED',
  'VIDEOBALLOON_GIFTED',
  'STICKER_GIFTED',
  'OGQ_EMOTICON_GIFTED',
  'GEM_GIFTED',
  'SUBSCRIBED',
  'SUBSCRIPTION_GIFTED',
  'SUBSCRIPTION_RENEWED',
  'QUICKVIEW_GIFTED',
  'TICKET_GIFTED',
  'GOODS_PURCHASED',
  'ITEM_DROPS',
  'USERSTATUS_CHANGED',
  'ADMINSTATUS_CHANGED',
  'NICKNAME_CHANGED',
  'CHAT_MUTED',
  'BANNED',
  'BAN_REVOKED',
  'BANNED_USER_LIST',
  'MANAGER_APPOINTMENT',
  'SLOW_MODE',
  'CHAT_FREEZE',
  'POLL',
  'NOTICE',
  'BJ_NOTICE',
  'ADMIN_NOTICE',
  'BREAK_TIME',
  'JOIN',
  'OUT',
  'QUIT'
] as const

/** 엔딩크레딧 집계에 실제로 쓰는 action. 나머지는 로그에만 남는다. */
export const AGGREGATED_ACTIONS = new Set([
  'MESSAGE',
  'BALLOON_GIFTED',
  'ADBALLOON_GIFTED',
  'VIDEOBALLOON_GIFTED',
  'STICKER_GIFTED',
  'OGQ_EMOTICON_GIFTED',
  'SUBSCRIBED',
  'SUBSCRIPTION_GIFTED',
  'SUBSCRIPTION_RENEWED',
  'QUICKVIEW_GIFTED',
  'USERSTATUS_CHANGED'
])

/** SDK 의 `userStatus` 오브젝트. getStatus() 구현에서 그대로 옮겼다. */
export interface SoopUserStatus {
  isBJ: boolean
  isManager: boolean
  isGuest: boolean
  isTopFan: boolean
  isFan: boolean
  isFollower: boolean
  isSupporter: boolean
  hasAppliedQuickview: boolean
  isTranslatable: boolean
}

/** events.ndjson 한 줄. payload 는 SDK 가 준 그대로 — 해석하지 않는다. */
export interface RawEvent {
  /** 수신 시각 (epoch ms) */
  t: number
  action: string
  payload: unknown
}

export type CollectorStatus =
  | { state: 'idle' }
  | { state: 'connecting' }
  | { state: 'live'; sessionId: string; since: number }
  /** 인증은 통과했지만 아직 방송이 안 켜진 상태. 켜지면 자동으로 붙는다. */
  | { state: 'waiting-broadcast'; since: number }
  | { state: 'reconnecting'; attempt: number; nextRetryMs: number }
  | { state: 'stopped'; sessionId: string | null }
  | { state: 'error'; message: string }

export interface SessionStats {
  sessionId: string
  startedAt: number
  /** action 별 수신 개수 */
  counts: Record<string, number>
  total: number
  /** 재연결로 생긴 수집 공백 구간 */
  gaps: { from: number; to: number }[]
}

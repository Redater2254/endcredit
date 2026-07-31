/**
 * SOOP Chat SDK 가 실제로 방출하는 action 목록.
 * sooplive-chat-sdk.js 를 해부해 실제로 생성되는 것만 추렸다 (2026-07-26 재확인).
 *
 * 처음엔 `action:"..."` 만 훑어서 6개를 통째로 놓쳤다. **미션 계열은 이름을 변수에 담아
 * `return {action: _}` 로 돌려주기 때문에** 그 방식으로는 절대 안 잡힌다. 아래는 두 형태를
 * 모두 훑은 결과다. 문서에 없는 것도 있으므로, 여기 없는 action 이 들어와도 버리지 말고
 * 로그에 남긴다.
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
  // 도전미션 — 참여(별풍선) · 정산 · 종료 · 정산 시점의 후원자 명단
  'CHALLENGE_MISSION_GIFTED',
  'CHALLENGE_MISSION_SETTLED',
  'CHALLENGE_MISSION_FINISHED',
  'CHALLENGE_MISSION_SPONSORS',
  // 대결미션 — 참여(별풍선) · 정산 · 승패
  'BATTLE_MISSION_GIFTED',
  'BATTLE_MISSION_SETTLED',
  'BATTLE_MISSION_FINISHED',
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
  'MANAGER_LIST_CHANGED',
  'CHAT_MUTED',
  'BANNED',
  'BAN_REVOKED',
  'BANNED_USER_LIST',
  'BANNED_WORDS',
  'BAN_MESSAGE_STATE',
  'MANAGER_APPOINTMENT',
  'SLOW_MODE',
  'CHAT_FREEZE',
  'POLL',
  'BJ_NOTICE',
  'ADMIN_NOTICE',
  'BREAK_TIME',
  'LIVE_CAPTION',
  'TRANSLATION',
  'TRANSLATION_STATE',
  'MOBILE_BROAD_STATUS',
  'VR',
  'LOGIN',
  'IN',
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
  'CHALLENGE_MISSION_GIFTED',
  'BATTLE_MISSION_GIFTED',
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
  | {
      state: 'waiting-broadcast'
      since: number
      /**
       * 방송이 끝난 것으로 보고 닫은 세션. 다음 방송은 **새 세션**으로 모은다 —
       * 없으면 어제 채팅과 오늘 채팅이 한 크레딧에 섞인다.
       */
      closedSessionId?: string
    }
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

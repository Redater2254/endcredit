/** 메인 ↔ 렌더러가 공유하는 타입. 여기에만 두고 양쪽에서 import 한다. */

export type AuthState =
  | { status: 'unconfigured'; reason: string }
  | { status: 'logged-out' }
  | { status: 'logging-in' }
  | { status: 'logged-in'; station: StationInfo; expiresAt: number }
  /** recoverable — 저장된 토큰이 아직 살아있어 재시도로 복구 가능한 경우 (주로 네트워크 오류) */
  | { status: 'error'; message: string; recoverable?: boolean }

/**
 * SOOP `/user/stationinfo` 응답에서 우리가 쓰는 것만 추린 형태.
 * 실측한 원본 응답 (2026-07-21):
 *   { result: 1, data: { user_nick, station_name, profile_image, lately_broad_date, favorite_cnt } }
 */
export interface StationInfo {
  /**
   * SOOP 아이디(BJ ID). **응답에 직접 담겨 오지 않아** profile_image URL 에서 추출한다.
   * 추출에 실패하면 빈 문자열이 된다 — 표시용으로만 쓰고, 없어도 동작이 깨지지 않게 할 것.
   */
  userId: string
  userNickname: string
  stationName: string
  profileImage: string
  favoriteCount: number | null
  /** 최근 방송 일시 (`lately_broad_date`, 예: "2026-07-17 21:55") */
  latelyBroadDate: string | null
  /** 정규화 전 원본. 응답 스키마가 바뀌면 여기서 먼저 드러난다. */
  raw: unknown
}

export interface ServerStatus {
  port: number
  listening: boolean
  overlayUrl: string
  error: string | null
}

/**
 * 자동 업데이트 상태. 문구는 렌더러가 만든다 — 메인은 사실만 알린다.
 *
 * 받는 것은 사용자가 `받기` 를 눌러야 시작하고(`available` → `downloading`),
 * 설치는 **앱을 끌 때** 조용히 이뤄진다(`ready` 에서 더 나아가지 않는다).
 */
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  /** 최신 버전을 쓰는 중 */
  | { kind: 'current' }
  /** 새 버전이 있다 — 받을지는 사용자가 정한다 */
  | { kind: 'available'; version: string; notes: string | null }
  | { kind: 'downloading'; version: string; percent: number }
  /** 다 받았다. 앱을 끄면 설치된다 */
  | { kind: 'ready'; version: string }
  /** 확인·다운로드 실패. 릴리스 페이지를 여는 길만 열어주면 손으로 받으면 된다 */
  | { kind: 'error'; message: string }

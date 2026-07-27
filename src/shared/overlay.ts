import type { CreditData } from './aggregate'
import type { Deck } from './deck'

/** 앱 UI · 오버레이 페이지 · 메인 프로세스가 공유하는 오버레이 상태. */
export interface OverlayState {
  deck: Deck
  data: CreditData
  playing: boolean
  /** 재생 세대. 값이 바뀌면 처음부터 다시 재생한다. */
  generation: number
  /**
   * 이 장 하나만 내보내는 중이면 그 번호. null 이면 전체 재생.
   *
   * 40장짜리 크레딧에서 12번째 장만 OBS 로 확인하고 싶을 때 앞의 11장을 기다릴 수 없다.
   */
  onlySlide?: number | null
  /** 지금 보이는 데이터가 실제 방송분이 아니라 샘플인지 */
  sample: boolean
}

/**
 * 앱이 살아 있음을 알리는 주기.
 *
 * 유휴 연결이 끊기지 않게 하는 것과, **앱이 죽었는지 알리는 것**을 겸한다.
 */
export const OVERLAY_PING_MS = 4000

/**
 * 이만큼 아무 소식이 없으면 앱이 죽은 것으로 보고 **화면을 비운다.**
 *
 * 안 그러면 앱이 죽는 순간의 장이 방송 화면에 그대로 박힌 채 남는다 — 크레딧 한 장이
 * 방송 끝까지 덮여 있는 사고가 된다. 잠깐 끊긴 것과 구분해야 하므로 몇 번 놓칠 여유를 둔다.
 */
export const OVERLAY_STALE_MS = 12000

/** 앱 UI 가 추가로 보는 정보 (오버레이 페이지에는 필요 없다). */
export interface OverlayInfo extends OverlayState {
  /** 붙어 있는 OBS 브라우저 소스 개수 */
  clients: number
}

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

/** 앱 UI 가 추가로 보는 정보 (오버레이 페이지에는 필요 없다). */
export interface OverlayInfo extends OverlayState {
  /** 붙어 있는 OBS 브라우저 소스 개수 */
  clients: number
}

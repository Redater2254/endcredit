import type { SourceKind } from '@shared/preset'

export const SOURCE_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: 'chatRank', label: '채팅 순위' },
  { value: 'emoticonRank', label: '이모티콘 순위' },
  { value: 'giftRank', label: '선물 많이 한 사람' },
  { value: 'balloonRank', label: '별풍선 순위' },
  { value: 'stickerRank', label: '서포트 스티커 순위' },
  { value: 'newSubscribers', label: '신규 구독자' },
  { value: 'renewedSubscribers', label: '구독 갱신' },
  { value: 'quickviewGifts', label: '플러스 구독 선물' },
  { value: 'newFans', label: '신규 팬클럽' },
  { value: 'newTopFans', label: '열혈 승급' },
  { value: 'newFollowers', label: '신규 애청자' },
  { value: 'newSupporters', label: '서포터 승급' },
  { value: 'text', label: '자유 문구' },
  { value: 'image', label: '이미지' },
  { value: 'spacer', label: '여백' }
]

/** 집계 데이터를 쓰지 않는 소스 — 인원수·수치 옵션이 의미 없다. */
export function isStaticSource(source: SourceKind): boolean {
  return source === 'text' || source === 'image' || source === 'spacer'
}

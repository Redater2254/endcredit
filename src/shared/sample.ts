import type { CreditData } from './aggregate'

/**
 * 미리보기·디자인용 샘플 데이터.
 *
 * 실제 시청자 없이도 "이름 10개가 화면에 어떻게 보이는지" 를 확인할 수 있어야
 * 크레딧을 디자인할 수 있다. 실방송 데이터와 절대 섞이지 않도록,
 * 오버레이 상태에서 명시적으로 켰을 때만 쓰이고 UI 에 항상 표시한다.
 */

const NICKS = [
  '밤샘코딩러',
  '고구마먹는곰',
  '치킨은살안쪄',
  '월요일싫어',
  '적당히하자',
  '눈누난나',
  '오늘도평화롭게',
  '커피중독자',
  '조용히보는중',
  '한마디만할게',
  '지나가던행인',
  '새벽감성'
]

const rank = (count: number, base: number, step: number): CreditData['chatRank'] =>
  NICKS.slice(0, count).map((nickname, i) => ({
    userId: `sample${i}`,
    nickname,
    value: Math.max(1, base - i * step)
  }))

export function sampleCreditData(): CreditData {
  const chatRank = rank(10, 247, 21)
  const balloonRank = rank(8, 1000, 110)
  const stickerRank = rank(4, 12, 3)

  const emoticonRank = rank(6, 88, 12)
  const giftRank = rank(3, 5, 2)

  return {
    chatRank,
    emoticonRank,
    giftRank,
    balloonRank,
    stickerRank,
    newSubscribers: [
      { userId: 'sample0', nickname: '밤샘코딩러', giftedBy: null, type: 'MEMBERSHIP_1', tier: 1 },
      { userId: 'sample3', nickname: '월요일싫어', giftedBy: '고구마먹는곰', type: 'GIFT_30', tier: null },
      { userId: 'sample5', nickname: '눈누난나', giftedBy: null, type: 'MEMBERSHIP_3', tier: 2 }
    ],
    renewedSubscribers: [
      { userId: 'sample1', nickname: '고구마먹는곰', months: 12, accMonths: 27 },
      { userId: 'sample2', nickname: '치킨은살안쪄', months: 5, accMonths: 5 }
    ],
    quickviewGifts: [
      { userId: 'sample7', nickname: '커피중독자', type: 'GIFT_PLUS_30' },
      { userId: 'sample9', nickname: '한마디만할게', type: 'GIFT_PLUS_7' }
    ],
    newFans: rank(4, 1, 0),
    newTopFans: rank(2, 1, 0),
    newFollowers: rank(5, 1, 0),
    newSupporters: [],
    firstChatter: { userId: 'sample8', nickname: '조용히보는중', value: 61 },
    topDonation: { userId: 'sample1', nickname: '고구마먹는곰', value: 500 },
    totals: {
      messages: chatRank.reduce((s, u) => s + u.value, 0),
      balloons: balloonRank.reduce((s, u) => s + u.value, 0),
      stickers: stickerRank.reduce((s, u) => s + u.value, 0),
      uniqueChatters: chatRank.length,
      emoticons: emoticonRank.reduce((s, u) => s + u.value, 0),
      subscribers: 3,
      fans: 4,
      durationMs: 3 * 60 * 60 * 1000 + 24 * 60 * 1000
    }
  }
}

import type { CreditData, RankedUser } from './aggregate'

/**
 * 미리보기·디자인용 샘플 데이터.
 *
 * 실제 시청자 없이도 "이름 30개가 화면에 어떻게 보이는지" 를 확인할 수 있어야
 * 크레딧을 디자인할 수 있다. 실방송 데이터와 절대 섞이지 않도록,
 * 오버레이 상태에서 명시적으로 켰을 때만 쓰이고 UI 에 항상 표시한다.
 */

/**
 * TOP 30 짜리 기차·명단을 끝까지 채울 수 있을 만큼 넉넉하게.
 * 길이를 일부러 4~7자로 섞어 뒀다 — 이름이 길 때 글자가 넘치는지도 같이 보여야 한다.
 * 앞의 12개는 순서를 바꾸지 않는다 (아래 구독·팬 목록이 이 자리를 가리킨다).
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
  '새벽감성',
  '라면먹고잘래',
  '침대와한몸',
  '퇴근하고싶다',
  '딸기우유중독',
  '방구석평론가',
  '눈팅만십년째',
  '붕어빵장인',
  '감자칩바스락',
  '배고픈판다',
  '하품하는고양이',
  '겨울잠준비중',
  '물음표살인마',
  '도넛두개',
  '무한스크롤',
  '청소는내일',
  '별빛아래서',
  '삼겹살한판',
  '알람일곱개',
  '우산없는날',
  '노래는못해도',
  '마감요정',
  '심야산책자',
  '오늘도무사히',
  '소리질러',
  '세시반의라면',
  '잠은죽어서',
  '형광펜쟁이',
  '어제의나에게'
]

const who = (i: number, value: number): RankedUser => ({
  userId: `sample${i}`,
  nickname: NICKS[i],
  value
})

/**
 * 순위 목록.
 *
 * 이름은 `step` 만큼 건너뛰며 고른다 — 목록마다 순서가 달라야 한 사람이 채팅 3등·별풍선
 * 11등처럼 실제 데이터답게 흩어진다. 값은 1등이 크고 아래로 완만해지는 곡선(등비 + 작은
 * 흔들림)으로 만든다. 딱 떨어지는 등차수열은 자릿수가 고르게 줄어서, 실제 방송에서 숫자가
 * 얼마나 삐뚤빼뚤해 보일지를 확인할 수 없다.
 */
function rank(count: number, top: number, tail: number, from: number, step: number): RankedUser[] {
  const out: RankedUser[] = []
  let prev = Infinity
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0
    const wobble = 1 + 0.05 * Math.sin(i * 2.4 + from)
    const raw = Math.round(top * Math.pow(tail / top, t) * wobble)
    const value = Math.max(1, Math.min(raw, prev - 1))
    out.push(who((from + i * step) % NICKS.length, value))
    prev = value
  }
  return out
}

/** 수치가 없는 명단 (팬클럽·애청자·승급) — 수치 자리는 1 로 둔다 */
const names = (count: number, from: number, step: number): RankedUser[] =>
  Array.from({ length: count }, (_, i) => who((from + i * step) % NICKS.length, 1))

const sum = (list: RankedUser[]): number => list.reduce((s, u) => s + u.value, 0)

export function sampleCreditData(): CreditData {
  const chatRank = rank(30, 412, 23, 0, 1)
  const balloonRank = rank(30, 3140, 5, 5, 7)
  const emoticonRank = rank(30, 96, 2, 2, 9)
  const stickerRank = rank(30, 22, 1, 8, 11)
  const giftRank = rank(30, 14, 1, 3, 13)

  const newSubscribers: CreditData['newSubscribers'] = [
    { userId: 'sample0', nickname: NICKS[0], giftedBy: null, type: 'MEMBERSHIP_1', tier: 1 },
    { userId: 'sample3', nickname: NICKS[3], giftedBy: NICKS[1], type: 'GIFT_30', tier: null },
    { userId: 'sample5', nickname: NICKS[5], giftedBy: null, type: 'MEMBERSHIP_3', tier: 2 },
    { userId: 'sample14', nickname: NICKS[14], giftedBy: null, type: 'MEMBERSHIP_1', tier: 1 },
    { userId: 'sample21', nickname: NICKS[21], giftedBy: NICKS[1], type: 'GIFT_30', tier: null },
    { userId: 'sample27', nickname: NICKS[27], giftedBy: null, type: 'MEMBERSHIP_1', tier: 1 },
    { userId: 'sample32', nickname: NICKS[32], giftedBy: NICKS[7], type: 'GIFT_30', tier: null },
    { userId: 'sample36', nickname: NICKS[36], giftedBy: null, type: 'MEMBERSHIP_3', tier: 2 }
  ]
  const newFans = names(14, 12, 3)

  return {
    chatRank,
    emoticonRank,
    giftRank,
    balloonRank,
    stickerRank,
    newSubscribers,
    renewedSubscribers: [
      { userId: 'sample1', nickname: NICKS[1], months: 12, accMonths: 27 },
      { userId: 'sample2', nickname: NICKS[2], months: 5, accMonths: 5 },
      { userId: 'sample10', nickname: NICKS[10], months: 3, accMonths: 9 },
      { userId: 'sample18', nickname: NICKS[18], months: 24, accMonths: 41 },
      { userId: 'sample25', nickname: NICKS[25], months: 1, accMonths: 16 },
      { userId: 'sample34', nickname: NICKS[34], months: 7, accMonths: 7 }
    ],
    quickviewGifts: [
      { userId: 'sample7', nickname: NICKS[7], type: 'GIFT_PLUS_30' },
      { userId: 'sample9', nickname: NICKS[9], type: 'GIFT_PLUS_7' },
      { userId: 'sample16', nickname: NICKS[16], type: 'GIFT_PLUS_30' },
      { userId: 'sample29', nickname: NICKS[29], type: 'GIFT_PLUS_7' }
    ],
    newFans,
    newTopFans: names(4, 21, 7),
    newFollowers: names(22, 6, 9),
    newSupporters: names(3, 31, 11),
    firstChatter: chatRank[17] ?? null,
    // 한 번에 쏜 최고 후원 — 별풍선 1등이 그날 가장 크게 쏜 한 방
    topDonation: { ...balloonRank[0], value: Math.round(balloonRank[0].value * 0.4) },
    totals: {
      messages: sum(chatRank),
      balloons: sum(balloonRank),
      stickers: sum(stickerRank),
      uniqueChatters: chatRank.length,
      emoticons: sum(emoticonRank),
      subscribers: newSubscribers.length,
      fans: newFans.length,
      durationMs: 3 * 60 * 60 * 1000 + 24 * 60 * 1000
    }
  }
}

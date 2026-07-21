import { aggregateAll } from '../src/shared/aggregate'
import type { RawEvent } from '../src/shared/events'

/**
 * SDK 소스에서 읽어낸 payload 구조 그대로 가짜 이벤트를 만들어
 * 집계 로직을 검증한다. SOOP 서버가 실제로 이벤트를 보내는지는 여기서 알 수 없다.
 */

let t = 1_700_000_000_000
const ev = (action: string, payload: unknown): RawEvent => ({ t: (t += 1000), action, payload })

const status = (o: Partial<Record<string, boolean>> = {}) => ({
  isBJ: false,
  isManager: false,
  isGuest: false,
  isTopFan: false,
  isFan: false,
  isFollower: false,
  isSupporter: false,
  hasAppliedQuickview: false,
  isTranslatable: false,
  ...o
})

const events: RawEvent[] = [
  // 접속 시 전원 상태 (기준선)
  ev('IN', {
    userList: [
      { userId: 'streamer', userNickname: '스트리머', userStatus: status({ isBJ: true }) },
      { userId: 'alice', userNickname: '앨리스', userStatus: status() },
      { userId: 'bob', userNickname: '밥', userStatus: status({ isFan: true }) }, // 이미 팬
      { userId: 'carol', userNickname: '캐롤', userStatus: status() }
    ]
  }),

  // 채팅 — alice 가 폰/PC 두 곳에서 접속 (userId 접미사)
  ev('MESSAGE', { userId: 'alice', userNickname: '앨리스', userStatus: status(), message: 'ㅎㅇ' }),
  ev('MESSAGE', { userId: 'alice(2)', userNickname: '앨리스', userStatus: status(), message: 'ㅋㅋ' }),
  ev('MESSAGE', { userId: 'alice(2)', userNickname: '앨리스', userStatus: status(), message: 'ㅇㅇ' }),
  ev('MESSAGE', { userId: 'bob', userNickname: '밥', userStatus: status({ isFan: true }), message: 'hi' }),
  ev('MESSAGE', { userId: 'streamer', userNickname: '스트리머', userStatus: status({ isBJ: true }), message: '안녕' }),
  ev('MESSAGE', { userId: 'streamer', userNickname: '스트리머', userStatus: status({ isBJ: true }), message: '반가워' }),

  // 별풍선 — carol 이 두 번 (한 번은 다른 기기), 두 번째에 열혈 승급
  ev('BALLOON_GIFTED', {
    bjId: 'streamer', userId: 'carol', userNickname: '캐롤',
    count: 100, fanNumber: 12, imageUrl: '', becomesTopFan: false, relaysBroad: false, fromVod: false
  }),
  ev('BALLOON_GIFTED', {
    bjId: 'streamer', userId: 'carol(3)', userNickname: '캐롤',
    count: 900, fanNumber: 12, imageUrl: '', becomesTopFan: true, relaysBroad: false, fromVod: false
  }),
  ev('ADBALLOON_GIFTED', {
    bjId: 'streamer', userId: 'alice', userNickname: '앨리스',
    count: 5, imageUrl: '', title: '광고', fromVod: false, fromStation: false
  }),

  // 서포트 스티커
  ev('STICKER_GIFTED', {
    bjId: 'streamer', bjNickname: '스트리머', userId: 'bob', userNickname: '밥',
    imageUrl: '', count: 3, supporterNumber: 7, relaysBroad: false
  }),

  // 구독 — 직접 구독 / 선물 구독
  ev('SUBSCRIBED', {
    bjId: 'streamer', userId: 'alice', userNickname: '앨리스', imageUrl: '', fromVod: false,
    type: 'MEMBERSHIP_1', tier: 1
  }),
  ev('SUBSCRIPTION_GIFTED', {
    userId: 'carol', userNickname: '캐롤', receiverId: 'dave', receiverNickname: '데이브',
    bjId: 'streamer', bjNickname: '스트리머', type: 'GIFT_30'
  }),
  ev('SUBSCRIPTION_RENEWED', {
    bjId: 'streamer', userId: 'bob', userNickname: '밥',
    subscriptionMonths: 7, accSubscriptionMonths: 19, tier: 2
  }),

  // 플러스 구독(퀵뷰) 선물
  ev('QUICKVIEW_GIFTED', {
    userId: 'carol', userNickname: '캐롤', receiverId: 'erin', receiverNickname: '에린',
    imageUrl: '', type: 'GIFT_PLUS_30'
  }),

  // 상태 전이 — alice 가 팬클럽 가입 (false→true 를 실제로 목격)
  ev('USERSTATUS_CHANGED', {
    userId: 'alice', userNickname: '앨리스', userStatus: status({ isFan: true }), subscriptionMonth: 1
  })
]

const d = aggregateAll(events, { excludeBJ: true, excludeManagers: false })

interface Check { name: string; got: unknown; want: unknown }
const checks: Check[] = [
  { name: '채팅: alice 3회로 병합 (alice + alice(2)×2)', got: d.chatRank.find(r => r.userId === 'alice')?.value, want: 3 },
  { name: '채팅: 스트리머 제외됨', got: d.chatRank.some(r => r.userId === 'streamer'), want: false },
  { name: '채팅: 참여자 2명 (alice, bob)', got: d.totals.uniqueChatters, want: 2 },
  { name: '별풍선: carol 1000개로 병합 (100 + 900)', got: d.balloonRank.find(r => r.userId === 'carol')?.value, want: 1000 },
  { name: '별풍선: alice 애드벌룬 5개 합산', got: d.balloonRank.find(r => r.userId === 'alice')?.value, want: 5 },
  { name: '별풍선: 1위가 carol', got: d.balloonRank[0]?.userId, want: 'carol' },
  { name: '스티커: bob 3개', got: d.stickerRank.find(r => r.userId === 'bob')?.value, want: 3 },
  { name: '열혈: becomesTopFan 으로 carol 승급 감지', got: d.newTopFans.map(u => u.userId).join(), want: 'carol' },
  { name: '신규팬: alice 만 (bob 은 처음부터 팬이라 제외)', got: d.newFans.map(u => u.userId).join(), want: 'alice' },
  { name: '구독: alice 직접 구독', got: d.newSubscribers.find(s => s.userId === 'alice')?.type, want: 'MEMBERSHIP_1' },
  { name: '선물구독: 받은 사람(dave)이 등재', got: d.newSubscribers.find(s => s.userId === 'dave')?.nickname, want: '데이브' },
  { name: '선물구독: 선물한 사람 기록', got: d.newSubscribers.find(s => s.userId === 'dave')?.giftedBy, want: '캐롤' },
  { name: '선물구독: 선물한 carol 은 구독자로 안 잡힘', got: d.newSubscribers.some(s => s.userId === 'carol'), want: false },
  { name: '구독갱신: bob 7개월', got: d.renewedSubscribers.find(s => s.userId === 'bob')?.months, want: 7 },
  { name: '플러스구독: 받은 사람(erin) 등재', got: d.quickviewGifts[0]?.nickname, want: '에린' },
  { name: '플러스구독: 타입 보존', got: d.quickviewGifts[0]?.type, want: 'GIFT_PLUS_30' },
  { name: '총 별풍선 1005개', got: d.totals.balloons, want: 1005 }
]

let fail = 0
for (const c of checks) {
  const pass = JSON.stringify(c.got) === JSON.stringify(c.want)
  if (!pass) fail++
  console.log(`${pass ? '✓' : '✗'} ${c.name}`)
  if (!pass) console.log(`    받음: ${JSON.stringify(c.got)}   기대: ${JSON.stringify(c.want)}`)
}

console.log(`\n${checks.length - fail}/${checks.length} 통과${fail ? ` · ${fail}개 실패` : ''}`)
if (fail) process.exitCode = 1

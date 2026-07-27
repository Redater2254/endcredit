import type { Response } from 'express'
import { creditSnapshot } from './credit'
import { defaultDeck, emptyDeck, type Deck } from '@shared/deck'
import { loadCurrentDeck, saveCurrentDeck } from './preset-store'
import { sampleCreditData } from '@shared/sample'
import { OVERLAY_PING_MS, type OverlayState } from '@shared/overlay'

/**
 * OBS 오버레이와 앱 사이의 단방향 채널.
 *
 * WebSocket 대신 SSE 를 쓴다: 의존성이 추가로 필요 없고, 브라우저가 끊김을
 * 자동으로 재연결해준다. 오버레이는 명령을 받기만 하면 되므로 단방향으로 충분하다.
 * OBS 브라우저 소스가 새로고침돼도 알아서 다시 붙는다는 점이 특히 중요하다.
 */

const clients = new Set<Response>()

/**
 * 상태가 바뀌었음을 앱 창에 알리는 통로.
 *
 * 재생을 시키는 곳이 IPC 하나가 아니게 됐다 — 전역 단축키, OBS 리모컨도 같은 상태를
 * 건드린다. 각 호출부가 알림을 잊지 않게 **상태를 바꾸는 지점 한 곳**에서 알린다.
 */
let notifyApp: (() => void) | null = null

export function onOverlayChanged(fn: () => void): void {
  notifyApp = fn
}

/** 지연 초기화 — app.getPath('userData') 는 ready 이후에만 쓸 수 있다. */
let deck: Deck | null = null
let playing = false
let generation = 0
/** 한 장만 내보내는 중이면 그 번호. 멈추면 반드시 지운다 — 다음 재생이 한 장만 나가면 사고다 */
let onlySlide: number | null = null
/** 샘플 데이터 모드 — 실제 시청자 없이 디자인을 확인하기 위한 것. 항상 UI 에 표시된다. */
let useSample = false

function state(): OverlayState {
  return {
    deck: getDeck(),
    data: useSample ? sampleCreditData() : creditSnapshot(),
    playing,
    generation,
    onlySlide,
    sample: useSample
  }
}

export function setSampleMode(on: boolean): void {
  useSample = on
  broadcast()
}

export function isSampleMode(): boolean {
  return useSample
}

function broadcast(): void {
  const payload = `event: state\ndata: ${JSON.stringify(state())}\n\n`
  for (const res of clients) {
    try {
      res.write(payload)
    } catch {
      clients.delete(res)
    }
  }
}

export function addOverlayClient(res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 출처 허용 헤더는 server.ts 의 guard() 가 이미 붙였다.
    // 여기서 '*' 로 덮으면 아무 웹페이지나 시청자 데이터를 읽어간다.
    // OBS 브라우저 소스(CEF)는 프록시가 없지만, 버퍼링 방지용으로 남겨둔다
    'X-Accel-Buffering': 'no'
  })
  res.flushHeaders?.()

  clients.add(res)
  res.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`)

  /*
   * 유휴 연결이 중간 장비에서 끊기지 않게 하고, 동시에 **앱이 살아 있음을 알린다.**
   *
   * 주석(`: ping`)이 아니라 이름 붙은 이벤트라야 오버레이가 받을 수 있다. 오버레이는
   * 이게 한동안 안 오면 화면을 비운다 — 앱이 죽었는데 마지막 장이 방송에 박혀 있으면
   * 안 되기 때문이다.
   */
  const ping = setInterval(() => {
    try {
      res.write('event: ping\ndata: 1\n\n')
    } catch {
      /* 아래 close 에서 정리된다 */
    }
  }, OVERLAY_PING_MS)

  res.on('close', () => {
    clearInterval(ping)
    clients.delete(res)
  })
}

export function overlayClientCount(): number {
  return clients.size
}

/**
 * 재생 시작. `only` 를 주면 그 장 하나만 내보낸다.
 *
 * 안 주면 **반드시 전체로 되돌린다** — 한 장만 틀어본 다음 전역 단축키로 방송에 틀었는데
 * 그 한 장만 나가는 게 최악의 사고다. 그래서 기본값이 '전체'이고, 한 장은 매번 지정해야 한다.
 */
export function playOverlay(only: number | null = null): void {
  playing = true
  onlySlide = only
  generation += 1
  broadcast()
}

export function isPlaying(): boolean {
  return playing
}

/** 한 손가락으로 켜고 끈다 — 전역 단축키·리모컨은 버튼이 하나뿐이다. */
export function togglePlay(): void {
  if (playing) stopOverlay()
  else playOverlay()
}

export function stopOverlay(): void {
  playing = false
  onlySlide = null
  broadcast()
}

/**
 * 크레딧이 끝까지 재생됐다는 보고.
 *
 * 총 길이는 내용 높이에 따라 달라져서 메인 프로세스가 알 수 없다.
 * 그래서 실제로 그린 쪽(오버레이 페이지 / 앱 미리보기)이 끝났을 때 알려준다.
 * 여러 곳에서 중복으로 올 수 있으므로 **세대(generation)로 걸러** 한 번만 처리한다.
 */
export function finishOverlay(gen: number): boolean {
  if (!playing || gen !== generation) return false
  playing = false
  onlySlide = null
  broadcast()
  return true
}

/** 처음부터 다시. 한 장만 틀던 중이면 그 한 장을 다시 튼다 (보고 있던 것이 바뀌면 안 된다) */
export function restartOverlay(): void {
  playing = true
  generation += 1
  broadcast()
}

export function setDeck(next: Deck): void {
  deck = next
  saveCurrentDeck(next)
  broadcast()
}

/** 문서를 기본값으로 되돌린다. 기존 파일은 호출부에서 백업한다. */
export function resetDeck(): Deck {
  deck = defaultDeck()
  saveCurrentDeck(deck)
  broadcast()
  return deck
}

/** 완전히 빈 문서로 시작한다. 기존 파일은 호출부에서 백업한다. */
export function newDeck(): Deck {
  deck = emptyDeck()
  saveCurrentDeck(deck)
  broadcast()
  return deck
}

export function getDeck(): Deck {
  deck ??= loadCurrentDeck()
  return deck
}

export function getOverlayState(): OverlayState {
  return state()
}

/** 집계가 갱신되면 재생 중인 오버레이에도 반영한다. */
export function notifyDataChanged(): void {
  if (clients.size > 0) broadcast()
}

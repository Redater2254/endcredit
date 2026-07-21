/**
 * OBS 안에서 쓰는 리모컨.
 *
 * 크레딧을 트는 순간은 **방송 마지막**이다. 그때 앱 창을 찾아 클릭하려면 게임 화면에서
 * 빠져나와야 하고, 그 자체가 방송 사고 위험이다. OBS `도구 › 사용자 정의 브라우저 독`에
 * 이 주소를 넣어두면 OBS 안에 재생 버튼이 붙는다.
 *
 * 상태는 1초 폴링으로 받는다. SSE 를 쓰면 문서 전체가 실려 와 편집 중에 낭비가 크고,
 * 리모컨이 알아야 할 것은 "지금 재생 중인가" 정도다.
 */
export function remotePage(): string {
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>endcredit 리모컨</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body {
    margin: 0; padding: 10px; min-height: 100vh;
    background: #14151a; color: #e8e8ee;
    font-family: "Malgun Gothic", system-ui, sans-serif;
    display: flex; flex-direction: column; gap: 8px;
  }
  .state {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: #9a9aa8; padding: 2px 2px 0;
  }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #4a4d5c; flex: none }
  .dot.on { background: #47d16c; box-shadow: 0 0 8px #47d16c }
  .dot.off { background: #ff6b6b }
  .spacer { flex: 1 }
  button {
    font: inherit; border: 1px solid #33364a; border-radius: 8px;
    background: #22242e; color: #e8e8ee; padding: 12px 10px; cursor: pointer;
    white-space: nowrap;
  }
  button:hover { background: #2b2e3a }
  button:active { transform: translateY(1px) }
  button:disabled { opacity: .45; cursor: default }
  .big { font-size: 17px; font-weight: 700; padding: 18px 10px }
  .play { background: #2f6df6; border-color: #2f6df6 }
  .play:hover { background: #3d79ff }
  .stop { background: #b8323c; border-color: #b8323c }
  .stop:hover { background: #cc3a45 }
  .row { display: flex; gap: 8px }
  .row > * { flex: 1 }
  .warn {
    font-size: 12px; line-height: 1.5; color: #ffcf8a;
    background: rgba(255,180,80,.09); border: 1px solid rgba(255,180,80,.25);
    border-radius: 8px; padding: 7px 9px;
  }
  .off-note { font-size: 12px; color: #ff9b9b }
</style></head><body>

<div class="state">
  <span class="dot" id="dot"></span>
  <span id="label">연결 중…</span>
  <span class="spacer"></span>
  <span id="obs"></span>
</div>

<button class="big play" id="main">▶ 크레딧 재생</button>

<div class="row">
  <button id="restart">↻ 처음부터</button>
  <button id="sample">샘플 데이터</button>
</div>

<div class="warn" id="sampleWarn" hidden>샘플 데이터가 켜져 있습니다 — 방송에 나가는 값이 실제가 아닙니다.</div>
<div class="off-note" id="down" hidden>endcredit 앱이 꺼져 있습니다.</div>

<script>
  const $ = (id) => document.getElementById(id)
  let playing = false

  async function send(path) {
    try { await fetch(path, { method: 'POST' }) } catch (e) { /* 앱이 꺼진 경우 */ }
    poll()
  }

  $('main').onclick = () => send(playing ? '/remote/stop' : '/remote/play')
  $('restart').onclick = () => send('/remote/restart')
  $('sample').onclick = () => send('/remote/sample')

  async function poll() {
    try {
      const r = await fetch('/remote/status', { cache: 'no-store' })
      const s = await r.json()
      playing = s.playing
      $('down').hidden = true
      $('dot').className = 'dot ' + (s.playing ? 'on' : '')
      $('label').textContent = s.playing ? '재생 중' : '대기'
      $('obs').textContent = s.clients > 0 ? 'OBS ' + s.clients + '개' : 'OBS 없음'
      $('main').textContent = s.playing ? '■ 정지' : '▶ 크레딧 재생'
      $('main').className = 'big ' + (s.playing ? 'stop' : 'play')
      $('sample').textContent = s.sample ? '샘플 데이터 끄기' : '샘플 데이터'
      $('sampleWarn').hidden = !s.sample
      $('restart').disabled = false
    } catch (e) {
      $('dot').className = 'dot off'
      $('label').textContent = '앱에 연결되지 않음'
      $('obs').textContent = ''
      $('down').hidden = false
      $('restart').disabled = true
    }
  }

  poll()
  setInterval(poll, 1000)
</script>
</body></html>`
}

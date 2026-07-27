/**
 * 숨김 렌더러에 로드되는 수집기 페이지.
 *
 * `file://` 이 아니라 `http://127.0.0.1:7396/collector` 로 서빙한다.
 * file:// 은 origin 이 `null` 이라 SOOP 서버의 CORS 검사에서 거절될 가능성이 크고,
 * 이 SDK 는 원래 스트리머의 웹페이지(=일반 http origin)에서 돌도록 만들어졌기 때문이다.
 */

export const CHAT_SDK_URL = 'https://static.sooplive.com/asset/app/chat-sdk/sooplive-chat-sdk.js'

export function collectorPage(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<!--
  connect-src 를 SOOP 도메인으로 좁혔더니 WebSocket 이 CSP 에 막혔다.
  채팅 서버는 sooplive.com 이 아닌 호스트(.co.kr, 포트 포함 주소 등)로 붙기 때문에
  화이트리스트를 정확히 열거할 방법이 없다.
  스크립트 출처는 static.sooplive.com 으로 여전히 잠겨 있고 이 창은 숨김 로컬 창이므로,
  connect-src 는 https:/wss: 전체로 연다.
-->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'self' 'unsafe-inline' https://static.sooplive.com;
  connect-src https: wss: ws://127.0.0.1:*;
  img-src https: data:;
  style-src 'unsafe-inline'">
<title>endcredit collector</title>
</head>
<body>
<script src="${CHAT_SDK_URL}"></script>
<script>
(function () {
  var bridge = window.__collector;
  var sdk = null;

  function log(level, message, detail) {
    bridge.log(level, message, detail === undefined ? null : safe(detail));
  }

  // IPC 는 구조화 복제를 쓰므로 함수/순환참조가 섞이면 전송이 통째로 실패한다.
  // 원본 보존이 목적이므로 JSON 왕복으로 안전하게 만든다.
  function safe(v) {
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { return { __unserializable: String(v) }; }
  }

  /**
   * SDK 는 WebSocket 의 error 이벤트를 그대로 넘겨준다.
   * DOM Event 는 JSON.stringify 하면 {isTrusted:true} 뿐이라 원인 파악이 불가능하므로,
   * 어떤 소켓이 어떤 상태로 죽었는지 직접 캐낸다.
   */
  function describeError(err) {
    if (err && typeof Event !== 'undefined' && err instanceof Event) {
      var t = err.currentTarget || err.target || {};
      var readyState = t.readyState;
      var states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
      return {
        code: 'WS-' + String(err.type || 'error').toUpperCase(),
        message:
          'WebSocket ' + (err.type || 'error') +
          ' · url=' + (t.url || '(unknown)') +
          ' · readyState=' + (states[readyState] !== undefined ? states[readyState] : readyState) +
          (err.code !== undefined ? ' · closeCode=' + err.code : '') +
          (err.reason ? ' · reason=' + err.reason : '')
      };
    }
    return {
      code: (err && (err.code || err.name)) || 'SDK-ERROR',
      message: (err && (err.message || String(err))) || '알 수 없는 SDK 오류'
    };
  }

  function start(token, clientId, clientSecret) {
    if (!window.SOOP || !window.SOOP.ChatSDK) {
      bridge.failed('SDK-LOAD', 'sooplive-chat-sdk.js 를 불러오지 못했습니다. 네트워크를 확인하세요.');
      return;
    }

    try {
      sdk = new window.SOOP.ChatSDK(clientId, clientSecret);

      // 문서 예제엔 init() 이 있으나 이 빌드의 공개 API 목록엔 없다. 있으면 부르고 없으면 넘어간다.
      if (typeof sdk.init === 'function') sdk.init();

      sdk.handleReady(function () {
        log('info', 'handleReady');
        bridge.ready();
      });

      // 문서상 (action, message). 방어적으로 두 형태를 모두 받아낸다.
      sdk.handleMessageReceived(function (a, b) {
        var action, payload;
        if (typeof a === 'string') { action = a; payload = b; }
        else if (a && typeof a === 'object') { action = a.action || 'UNKNOWN'; payload = a.message !== undefined ? a.message : a; }
        else { action = 'UNKNOWN'; payload = a; }
        bridge.event(action, safe(payload));
      });

      sdk.handleChatClosed(function (info) {
        log('warn', 'handleChatClosed', info);
        bridge.closed(safe(info));
      });

      sdk.handleError(function (err) {
        var d = describeError(err);
        log('error', 'handleError → ' + d.code + ' : ' + d.message);
        bridge.failed(d.code, d.message);
      });

      sdk.setAuth(token);

      sdk.connect()
        .then(function (res) { log('info', 'connect() 성공', res); })
        .catch(function (err) {
          var d = describeError(err);
          bridge.failed(d.code === 'SDK-ERROR' ? 'CONNECT-FAILED' : d.code, d.message);
        });
    } catch (err) {
      var d = describeError(err);
      bridge.failed(d.code === 'SDK-ERROR' ? 'INIT-FAILED' : d.code, d.message);
    }
  }

  bridge.onStop(function () {
    try { if (sdk && typeof sdk.destroy === 'function') sdk.destroy(); } catch (e) { /* 종료 중 오류는 무시 */ }
    sdk = null;
  });

  bridge.requestStart().then(function (cfg) {
    start(cfg.accessToken, cfg.clientId, cfg.clientSecret);
  }, function (err) {
    // 여기서 놓치면 아무 일도 안 일어난 채 '연결 중' 에 영영 멈춘다.
    // 자격증명이 없으면 메인이 실제로 던진다 — 사용자에게 이유가 보여야 한다.
    bridge.failed('START-FAILED', (err && err.message) || String(err));
  });
})();
</script>
</body>
</html>`
}

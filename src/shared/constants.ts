/**
 * 앱 버전. `package.json` 의 값이 빌드할 때 그대로 박힌다.
 *
 * **자동 업데이트가 붙은 뒤로 버전은 `package.json` 한 곳이 기준이다.** 앱이 자기 버전을
 * 그 값으로 알리고, 릴리스의 `latest.yml` 에 적힌 값과 비교해 새 버전인지 판단한다.
 * 화면에 보이는 버전을 따로 적어두면 "화면엔 beta 인데 업데이트는 0.3.0 을 말하는" 꼴이
 * 되므로, 손으로 적는 자리를 아예 없앴다.
 */
export const APP_VERSION: string = __APP_VERSION__
export const VERSION_LABEL = `v${APP_VERSION}`

/** 자동 업데이트가 실패했을 때 손으로 받으러 가는 곳 */
export const RELEASES_URL = 'https://github.com/Redater2254/endcredit/releases/latest'

/**
 * Redirect URI(`http://localhost:7396/auth/callback`)에 박혀 있는 포트라 **선택지가 아니다**.
 * 바꾸려면 SOOP Developers 에서 Redirect URI 를 다시 등록해야 한다.
 *
 * 메인·오버레이 양쪽에서 쓰므로 shared 에 둔다.
 */
export const SERVER_PORT = 7396

/**
 * 오버레이 페이지가 붙을 SSE 주소.
 *
 * 패키징 후에는 페이지 자체를 이 서버가 서빙하므로 same-origin 이지만,
 * 개발 중에는 Vite dev 서버(:5173)로 리다이렉트되어 origin 이 달라진다.
 * 상대 경로를 쓰면 그때 Vite 를 찌르게 되므로, origin 이 다르면 절대 주소로 붙는다.
 */
export function overlayStreamUrl(location: Location): string {
  return serverUrl(location, '/overlay/stream')
}

/** 오버레이 페이지가 로컬 서버로 요청할 때 쓰는 주소. origin 이 다르면 절대 주소를 만든다. */
export function serverUrl(location: Location, path: string): string {
  const sameOrigin = location.port === String(SERVER_PORT)
  return sameOrigin ? path : `${location.protocol}//${location.hostname}:${SERVER_PORT}${path}`
}

/**
 * 화면에 보여줄 버전 이름.
 *
 * `package.json` 의 버전은 설치 파일·업데이트가 쓰는 값이라 반드시 숫자(semver)여야 한다.
 * 사람에게 보여줄 이름은 그것과 별개여서 여기서 따로 정한다.
 */
export const VERSION_LABEL = 'v.BETA'

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

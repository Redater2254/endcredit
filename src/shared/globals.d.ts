/**
 * 빌드할 때 박히는 값들 (`electron.vite.config.ts` 의 `define`).
 *
 * `package.json` 의 버전을 메인·렌더러 양쪽에 그대로 넣는다 — 버전을 손으로 적는 자리를
 * 두면 자동 업데이트가 보는 값과 화면에 보이는 값이 반드시 어긋난다.
 */
declare const __APP_VERSION__: string

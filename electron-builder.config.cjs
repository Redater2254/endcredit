const { existsSync, readFileSync } = require('node:fs')

/**
 * 설치 파일 이름에 쓸 버전 이름.
 *
 * 화면에 보이는 버전(`VERSION_LABEL`)과 파일 이름이 어긋나면 어느 게 최신인지 헷갈린다.
 * 한 곳(`src/shared/constants.ts`)만 고치면 둘 다 따라오게 한다.
 *   'v.BETA' → 'beta',  'v.1.0' → '1.0'
 */
function versionLabel() {
  try {
    const src = readFileSync('src/shared/constants.ts', 'utf8')
    const m = /VERSION_LABEL\s*=\s*['"]([^'"]+)['"]/.exec(src)
    if (m) {
      const label = m[1].replace(/^v\.?/i, '').trim().toLowerCase().replace(/\s+/g, '-')
      if (label) return label
    }
  } catch {
    /* 못 읽으면 package.json 의 버전을 쓴다 */
  }
  return null
}

const LABEL = versionLabel()

/**
 * 설치 파일 만들기 설정.
 *
 *   npm run dist          — 자격증명을 **넣어서** 만든다 (받은 사람이 바로 로그인 가능)
 *   npm run dist:nokey    — 넣지 않는다 (각자 SOOP 앱을 등록해야 함)
 *
 * ## 자격증명을 넣는다는 것의 의미
 * `client_secret` 은 스트리머 개인의 것이 아니라 **이 앱 전체의 열쇠**다. 설치 파일에
 * 담으면 받은 사람이 꺼낼 수 있다 — Electron 의 asar 도, resources 폴더도 쉽게 열린다.
 *
 * 그럼에도 넣는 이유: 안 넣으면 받은 사람이 SOOP 개발자 앱을 직접 등록해야 하고,
 * 그건 스트리머에게 사실상 "못 쓰는 앱"이다. 데스크톱 앱이 공개 클라이언트(public client)로
 * 취급되는 것과 같은 타협이다.
 *
 * 남용이 발견되면: SOOP 에서 **시크릿을 재발급**하고, 토큰 교환만 대신하는 작은 프록시를
 * 세운 뒤 앱에서 시크릿을 빼면 된다. 그때 이 설정만 `dist:nokey` 로 바꾸면 된다.
 */

const KEY_FILE = 'my-api-key.txt'
/** 둘 중 하나만 있으면 된다 — `.env` 든 `my-api-key.txt` 든 굽는 쪽은 똑같다 */
const hasKey = existsSync(KEY_FILE) || existsSync('.env')
const bundleKey = process.env.ENDCREDIT_NO_KEY !== '1' && hasKey

if (bundleKey) {
  console.warn(
    '\n  자격증명을 코드에 구워 넣습니다 (설치 폴더에 평문 파일은 남지 않습니다).\n' +
      '  암호화는 아닙니다 — 작정하면 꺼낼 수 있습니다. 빼려면: npm run dist:nokey\n'
  )
} else if (process.env.ENDCREDIT_NO_KEY === '1') {
  console.warn('\n  자격증명 없이 만듭니다 — 받는 사람이 직접 SOOP 앱을 등록해야 합니다.\n')
} else {
  /*
   * 자격증명 없이 만들어진 설치 파일은 **아무도 로그인할 수 없다.**
   * 그걸 모르고 배포하면 받은 사람이 앱을 켜자마자 막히므로 여기서 멈춘다.
   * 일부러 빼고 싶으면 `npm run dist:nokey` 를 쓰면 된다.
   */
  throw new Error(
    '\n\n  자격증명을 찾지 못했습니다 — 이대로 만들면 아무도 로그인할 수 없습니다.\n\n' +
      `  .env 또는 ${KEY_FILE} 을 프로젝트 루트에 두세요.\n` +
      '  일부러 빼고 만들려면:  npm run dist:nokey\n'
  )
}

module.exports = {
  appId: 'com.lazyyushin.endcredit',
  productName: 'endcredit',
  copyright: '© 2026 나태한유신 · MIT License',

  directories: {
    output: 'dist',
    buildResources: 'build'
  },

  // 빌드 결과와 package.json 만 담는다 — src 나 brand 원본까지 들어갈 이유가 없다
  files: ['out/**/*', 'package.json', '!**/*.map'],

  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    // 서명하지 않으면 SmartScreen 이 처음 몇 번 경고를 띄운다 (인증서가 있으면 여기에 넣는다)
    artifactName: LABEL ? '${productName}-' + LABEL + '-setup.${ext}' : '${productName}-${version}-setup.${ext}'
  },

  nsis: {
    // 한 번에 설치되면 어디에 깔렸는지도 모른다 — 화면을 보여준다
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    // 관리자 권한을 요구하지 않는다. 스트리머 PC 에서 권한 창이 뜨면 거기서 멈춘다
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'endcredit',
    // 1042 = 한국어
    installerLanguages: ['ko-KR'],
    language: '1042',
    deleteAppDataOnUninstall: false,
    uninstallDisplayName: 'endcredit'
  }
}

const { createHash } = require('node:crypto')
const { readFileSync, writeFileSync, existsSync, statSync } = require('node:fs')
const { join } = require('node:path')

/**
 * 자동 업데이트가 읽는 `dist/latest.yml` 을 **완성된 설치 파일에서 직접** 만든다.
 *
 * electron-builder 도 이 파일을 만들지만 두 가지를 믿을 수 없었다.
 *
 *  1. **실제 파일과 어긋난다.** 서명 단계(`signing with signtool.exe`)가 해시를 계산한
 *     뒤에 exe 를 건드려서, 크기가 1바이트 다르고 sha512 가 안 맞은 적이 있다. 그대로
 *     올리면 electron-updater 가 대조에서 걸려 **업데이트가 통째로 실패한다.**
 *     첫 빌드는 맞고 다음 빌드는 틀렸다 — 재현이 일정하지 않아 매번 확인해야 했다.
 *  2. `--publish never` 일 때 이 파일이 나오는지가 불확실하다.
 *
 * 빌드가 끝난 뒤 마지막에 한 번 도니까, 여기서 만든 값은 **언제나 올라갈 그 파일의 값**이다.
 * `npm run dist` 의 `postdist` 로 자동 실행된다.
 */

const version = require('../package.json').version
const dist = join(__dirname, '..', 'dist')
const exe = `endcredit-${version}-setup.exe`
const exePath = join(dist, exe)

if (!existsSync(exePath)) {
  console.error(`\n  ${exe} 가 없습니다 — 빌드가 끝나지 않았습니다.\n`)
  process.exit(1)
}

const bytes = readFileSync(exePath)
const size = statSync(exePath).size

// NSIS 는 설치기 안에 내용물을 밀어넣는다. 그 단계가 덜 끝나면 껍데기(수백 KB)만 남는다
if (size < 20 * 1024 * 1024) {
  console.error(`\n  ${exe} 가 ${(size / 1024 / 1024).toFixed(1)}MB 뿐입니다 — 반쪽 빌드입니다.`)
  console.error('  앱(트레이 포함)을 완전히 끄고 다시 빌드하세요.\n')
  process.exit(1)
}

const sha512 = createHash('sha512').update(bytes).digest('base64')

// BOM 을 넣으면 YAML 파싱이 깨진다. 줄바꿈도 LF 로 고정한다
const yml =
  [
    `version: ${version}`,
    'files:',
    `  - url: ${exe}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${exe}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`
  ].join('\n') + '\n'

writeFileSync(join(dist, 'latest.yml'), yml, { encoding: 'utf8' })

console.log(`\n  latest.yml — ${exe} (${(size / 1024 / 1024).toFixed(1)}MB) 기준으로 새로 썼습니다.`)
console.log('  릴리스에 이 두 파일을 올리세요: 설치 파일 + latest.yml\n')

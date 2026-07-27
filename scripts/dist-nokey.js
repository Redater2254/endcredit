/**
 * 자격증명 없이 설치 파일 만들기.
 *
 * 환경 변수를 붙이는 문법이 셸마다 달라(`VAR=1 cmd` vs `set VAR=1&& cmd`) 스크립트로 감싼다.
 * 이러면 어느 셸에서든 `npm run dist:nokey` 한 줄로 같게 동작한다.
 */
const { spawnSync } = require('node:child_process')

const env = { ...process.env, ENDCREDIT_NO_KEY: '1' }
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('npm', ['run', 'build'])
// `--publish never` 가 없으면 토큰이 있는 셸에서 실수로 올라간다
run('npx', [
  'electron-builder',
  '--config',
  'electron-builder.config.cjs',
  '--win',
  '--publish',
  'never'
])
// npm 은 `dist` 의 postdist 만 돌린다 — 여기서는 직접 불러야 latest.yml 이 생긴다
run('node', ['scripts/make-latest-yml.js'])

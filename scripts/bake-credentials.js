/**
 * 자격증명을 **코드 안으로 굽는다.**
 *
 *   .env  또는  my-api-key.txt  →  src/main/credentials-baked.ts
 *
 * ## 왜 필요한가
 * 설치 파일 옆에 `my-api-key.txt` 를 평문으로 두면, 설치 폴더를 연 사람 아무나
 * 메모장으로 시크릿을 읽는다. 코드에 넣으면 asar 안으로 들어가 눈에 띄지 않는다.
 *
 * ## 분명히 해둘 것: 이건 **암호화가 아니다**
 * asar 는 누구나 풀 수 있고, 아래 뒤섞기도 되돌리기 어렵지 않다.
 * 목적은 "지나가다 보이는 것"을 막는 것뿐이다 — 작정하고 뜯는 사람은 어차피 꺼낸다.
 * 데스크톱 앱이 공개 클라이언트(public client)로 취급되는 이유가 이것이다.
 * 남용이 생기면 SOOP 에서 시크릿을 재발급하고, 토큰 교환만 대신하는 프록시를 세워야 한다.
 *
 * ## 저장소에는 올라가지 않는다
 * 결과 파일은 `.gitignore` 에 있다. 자격증명이 없으면 빈 껍데기를 만들어,
 * 클론만 한 사람도 빌드는 되고 앱이 "키를 넣어달라"고 안내한다.
 */

const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const OUT = join(ROOT, 'src', 'main', 'credentials-baked.ts')

/** 뒤섞기 열쇠. 바꾸면 이미 구운 값과 안 맞으므로 앱과 함께 움직여야 한다. */
const MASK = 'endcredit.soop.2026'

function scramble(text) {
  const raw = Buffer.from(text, 'utf8')
  const key = Buffer.from(MASK, 'utf8')
  const out = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ key[i % key.length]
  // 뒤집어 두면 base64 만 풀어봐서는 모양이 안 잡힌다
  return Buffer.from([...out].reverse()).toString('base64')
}

/** `KEY=값` 또는 `Client ID : 값` 둘 다 읽는다. */
function readCreds() {
  // 1) 환경 변수 (CI 나 셸에서 바로 줄 때)
  if (process.env.ENDCREDIT_CLIENT_ID && process.env.ENDCREDIT_CLIENT_SECRET) {
    return {
      clientId: process.env.ENDCREDIT_CLIENT_ID,
      clientSecret: process.env.ENDCREDIT_CLIENT_SECRET,
      from: '환경 변수'
    }
  }

  // 2) .env
  const envPath = join(ROOT, '.env')
  if (existsSync(envPath)) {
    const text = readFileSync(envPath, 'utf8')
    const pick = (name) => {
      const m = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'im').exec(text)
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
    }
    const id = pick('ENDCREDIT_CLIENT_ID')
    const secret = pick('ENDCREDIT_CLIENT_SECRET')
    if (id && secret) return { clientId: id, clientSecret: secret, from: '.env' }
  }

  // 3) my-api-key.txt (SOOP 에서 복사해 붙인 그대로의 모양)
  const keyPath = join(ROOT, 'my-api-key.txt')
  if (existsSync(keyPath)) {
    const text = readFileSync(keyPath, 'utf8')
    const pick = (re) => {
      const m = text.match(re)
      return m ? m[1].trim() : null
    }
    const id = pick(/client\s*id\s*[:=]\s*(.+)/i)
    const secret = pick(/client\s*secret(?:\s*key)?\s*[:=]\s*(.+)/i)
    if (id && secret) return { clientId: id, clientSecret: secret, from: 'my-api-key.txt' }
  }

  return null
}

const header = `// 자동 생성 — scripts/bake-credentials.js 가 만든다. 직접 고치지 말 것.
// 저장소에 올라가지 않는다 (.gitignore).
`

const creds = process.env.ENDCREDIT_NO_KEY === '1' ? null : readCreds()

if (creds) {
  writeFileSync(
    OUT,
    header +
      `export const BAKED = {\n` +
      `  id: '${scramble(creds.clientId)}',\n` +
      `  secret: '${scramble(creds.clientSecret)}'\n` +
      `}\n`,
    'utf8'
  )
  console.log(`  자격증명을 코드에 구웠습니다 (${creds.from})`)
} else {
  writeFileSync(OUT, header + `export const BAKED: { id: string; secret: string } | null = null\n`, 'utf8')
  console.log(
    process.env.ENDCREDIT_NO_KEY === '1'
      ? '  자격증명 없이 만듭니다 (ENDCREDIT_NO_KEY=1)'
      : '  자격증명을 찾지 못했습니다 — .env 또는 my-api-key.txt 를 넣으세요'
  )
}

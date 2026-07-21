import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { app } from 'electron'
import { SERVER_PORT } from '@shared/constants'
import { BAKED } from './credentials-baked'

/**
 * SOOP 앱 자격증명.
 *
 * 주의: client_secret 은 "스트리머 개인"의 것이 아니라 이 **앱 전체**의 열쇠다.
 * 스트리머 각자는 OAuth 로그인으로 자기 access_token 을 따로 받는다.
 */
export interface Credentials {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** 어느 파일에서 읽었는지 — 진단용 */
  source: string
}

/** SOOP Open API 베이스. 세 호스트(.com / .co.kr / afreecatv.com)가 전부 여기로 정규화된다. */
export const SOOP_API_BASE = 'https://openapi.sooplive.com'

export { SERVER_PORT }

/**
 * 자격증명 파일을 찾을 후보 경로들.
 * 하드코딩한 경로 하나에 의존하면 개발 중엔 되고 설치 후엔 조용히 실패한다 —
 * 그래서 실행 시점에 여러 곳을 훑는다.
 */
function candidatePaths(): string[] {
  const paths: string[] = []

  if (process.env.ENDCREDIT_CREDENTIALS) paths.push(process.env.ENDCREDIT_CREDENTIALS)

  // 개발 중: 프로젝트 루트
  paths.push(join(process.cwd(), '.env'))
  paths.push(join(process.cwd(), 'my-api-key.txt'))

  // 패키징 후: exe 옆, 그리고 resources 폴더
  const exeDir = dirname(app.getPath('exe'))
  paths.push(join(exeDir, 'my-api-key.txt'))
  paths.push(join(process.resourcesPath ?? exeDir, 'my-api-key.txt'))

  // 사용자가 직접 넣어둘 수 있는 자리
  paths.push(join(app.getPath('userData'), 'my-api-key.txt'))

  return paths
}

/**
 * `Client ID : xxx` 형태의 평문 파일을 파싱한다.
 * 라벨 표기가 흔들려도(`Client Secret` / `Client Secret Key`) 견디도록 느슨하게 매칭한다.
 */
function parse(text: string): Omit<Credentials, 'source'> | null {
  const pick = (re: RegExp): string | null => {
    const m = text.match(re)
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  }

  // `Client ID : xxx` 와 `ENDCREDIT_CLIENT_ID=xxx` 를 모두 받는다
  const clientId =
    pick(/client\s*id\s*[:=]\s*(.+)/i) ?? pick(/^\s*ENDCREDIT_CLIENT_ID\s*=\s*(.+)$/im)
  const clientSecret =
    pick(/client\s*secret(?:\s*key)?\s*[:=]\s*(.+)/i) ??
    pick(/^\s*ENDCREDIT_CLIENT_SECRET\s*=\s*(.+)$/im)
  const redirectUri = pick(/redirect\s*uri\s*[:=]\s*(.+)/i)

  if (!clientId || !clientSecret) return null

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri ?? `http://localhost:${SERVER_PORT}/auth/callback`
  }
}

let cached: Credentials | null = null
let loadError: string | null = null

/**
 * 코드에 구워둔 값을 되돌린다.
 *
 * **암호화가 아니라 눈에 안 띄게 해둔 것이다.** 설치 폴더에 평문 파일을 두면 아무나
 * 메모장으로 읽지만, 이건 그러지 않는다 — 그 이상은 아니다.
 */
const MASK = 'endcredit.soop.2026'

function unscramble(text: string): string {
  const flipped = Buffer.from(text, 'base64')
  const raw = Buffer.from([...flipped].reverse())
  const key = Buffer.from(MASK, 'utf8')
  const out = Buffer.alloc(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] ^ key[i % key.length]
  return out.toString('utf8')
}

export function loadCredentials(): Credentials | null {
  if (cached) return cached

  // 환경 변수로 직접 준 경우가 가장 우선 — 파일 없이도 돌릴 수 있어야 한다
  if (process.env.ENDCREDIT_CLIENT_ID && process.env.ENDCREDIT_CLIENT_SECRET) {
    cached = {
      clientId: process.env.ENDCREDIT_CLIENT_ID,
      clientSecret: process.env.ENDCREDIT_CLIENT_SECRET,
      redirectUri: `http://localhost:${SERVER_PORT}/auth/callback`,
      source: '환경 변수'
    }
    return cached
  }

  const tried: string[] = []
  for (const p of candidatePaths()) {
    tried.push(p)
    if (!existsSync(p)) continue

    const parsed = parse(readFileSync(p, 'utf8'))
    if (!parsed) {
      loadError = `${p} 를 찾았지만 Client ID / Client Secret 을 읽지 못했습니다.`
      continue
    }

    cached = { ...parsed, source: p }
    loadError = null
    return cached
  }

  // 파일이 없으면 빌드할 때 구워둔 값으로 — 설치본은 이 경로로 동작한다
  if (BAKED) {
    cached = {
      clientId: unscramble(BAKED.id),
      clientSecret: unscramble(BAKED.secret),
      redirectUri: `http://localhost:${SERVER_PORT}/auth/callback`,
      source: '내장'
    }
    loadError = null
    return cached
  }

  loadError ??=
    'SOOP 자격증명을 찾지 못했습니다.\n' +
    '프로젝트 루트에 .env 또는 my-api-key.txt 를 만들어 Client ID / Client Secret 을 넣으세요.\n' +
    `확인한 위치:\n${tried.map((t) => `  · ${t}`).join('\n')}`
  return null
}

export function credentialsError(): string {
  return loadError ?? '알 수 없는 오류'
}

import { SOOP_API_BASE, type Credentials } from './config'
import type { TokenSet } from './tokens'

/**
 * "SOOP 이 우리를 거절했다" — 토큰이 실제로 죽었거나 잘못된 경우.
 * 네트워크 오류(fetch 자체가 실패)와 반드시 구분해야 한다.
 * 이걸 뭉뚱그리면 일시적 인터넷 끊김에 저장된 로그인이 날아간다.
 */
export class AuthRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRejectedError'
  }
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string | null
}

/**
 * 사용자를 보낼 로그인/동의 URL.
 * redirect_uri 는 넘기지 않는다 — SOOP 는 Developers 에 **등록된** Redirect URI 로 되돌려준다.
 */
export function authorizeUrl(creds: Credentials): string {
  const u = new URL('/auth/code', SOOP_API_BASE)
  u.searchParams.set('client_id', creds.clientId)
  return u.toString()
}

async function requestToken(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(new URL('/auth/token', SOOP_API_BASE), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*'
    },
    body
  })

  const text = await res.text()

  // 여기까지 왔다면 서버는 응답했다. 이제부터의 실패는 전부 "거절" 이다.
  let json: Partial<TokenResponse> & { error?: unknown; message?: unknown }
  try {
    json = JSON.parse(text)
  } catch {
    // SOOP 이 에러 시 HTML 을 돌려주는 경우가 있어 원문 일부를 남긴다
    throw new AuthRejectedError(
      `토큰 응답을 파싱하지 못했습니다 (HTTP ${res.status}): ${text.slice(0, 300)}`
    )
  }

  if (!res.ok || !json.access_token) {
    const detail = json.message ?? json.error ?? text.slice(0, 300)
    throw new AuthRejectedError(`토큰 발급 실패 (HTTP ${res.status}): ${JSON.stringify(detail)}`)
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? '',
    expiresAt: Date.now() + (json.expires_in ?? 28800) * 1000
  }
}

/** 인증 코드 → 토큰. 코드는 1회용이라 실패하면 처음부터 다시 로그인해야 한다. */
export function exchangeCode(creds: Credentials, code: string): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      code
    })
  )
}

export function refreshTokens(creds: Credentials, refreshToken: string): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken
    })
  )
}

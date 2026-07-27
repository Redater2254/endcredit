import { shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { credentialsError, loadCredentials } from './config'
import { AuthRejectedError, authorizeUrl, exchangeCode, refreshTokens } from './oauth'
import { clearTokens, loadTokens, saveTokens, type TokenSet } from './tokens'
import { awaitAuthCode } from './server'
import { fetchStationInfo } from './soop-api'
import type { AuthState } from '@shared/types'

/** 만료 5분 전부터는 미리 갱신한다. 방송 도중 토큰이 끊기는 게 최악이라. */
const REFRESH_MARGIN_MS = 5 * 60_000

let tokens: TokenSet | null = null
let state: AuthState = { status: 'logged-out' }
let listener: ((s: AuthState) => void) | null = null

function setState(next: AuthState): void {
  state = next
  listener?.(next)
}

export function getAuthState(): AuthState {
  return state
}

export function onAuthStateChange(fn: (s: AuthState) => void): void {
  listener = fn
}

/** 앱 시작 시 저장된 토큰으로 조용히 복구를 시도한다. */
export async function restoreSession(): Promise<void> {
  if (!loadCredentials()) {
    setState({ status: 'unconfigured', reason: credentialsError() })
    return
  }

  const saved = loadTokens()
  if (!saved) {
    setState({ status: 'logged-out' })
    return
  }

  tokens = saved
  try {
    await refreshIfNeeded()
    await loadStation()
  } catch (err) {
    if (err instanceof AuthRejectedError) {
      // SOOP 이 토큰을 거절했다 — 진짜로 죽은 것이므로 지우고 재로그인시킨다
      console.warn('[auth] 토큰이 거절되어 세션을 폐기합니다:', err.message)
      tokens = null
      clearTokens()
      setState({ status: 'logged-out' })
      return
    }

    // 네트워크 오류 등 — 토큰은 멀쩡할 수 있다. **절대 지우지 않는다.**
    // 인터넷이 잠깐 끊긴 상태로 앱을 켰다고 로그인이 날아가면 안 된다.
    console.warn('[auth] 세션 복구 실패 (토큰은 보존):', err)
    setState({
      status: 'error',
      message:
        `SOOP 서버에 연결하지 못했습니다. 저장된 로그인은 그대로 두었습니다.\n` +
        `인터넷 연결을 확인한 뒤 다시 시도하세요.\n\n${err instanceof Error ? err.message : String(err)}`,
      recoverable: true
    })
  }
}

export async function login(): Promise<void> {
  const creds = loadCredentials()
  if (!creds) {
    setState({ status: 'unconfigured', reason: credentialsError() })
    return
  }

  setState({ status: 'logging-in' })
  try {
    // 이 로그인 시도의 표. 콜백이 같은 값을 들고 와야 우리 것이다
    const state = randomUUID()
    // 코드 대기를 먼저 걸어두고 브라우저를 연다 (반대 순서면 빠른 콜백을 놓칠 수 있다)
    const codePromise = awaitAuthCode(state)
    await shell.openExternal(authorizeUrl(creds, state))

    const code = await codePromise
    tokens = await exchangeCode(creds, code)
    saveTokens(tokens)
    await loadStation()
  } catch (err) {
    setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

/** 네트워크 복구 후 재시도. 저장된 토큰으로 다시 세션 복구를 시도한다. */
export async function retrySession(): Promise<void> {
  await restoreSession()
}

export function logout(): void {
  tokens = null
  clearTokens()
  setState({ status: 'logged-out' })
}

async function loadStation(): Promise<void> {
  if (!tokens) throw new Error('토큰이 없습니다.')
  const station = await fetchStationInfo(tokens.accessToken)
  setState({ status: 'logged-in', station, expiresAt: tokens.expiresAt })
}

async function refreshIfNeeded(): Promise<void> {
  const creds = loadCredentials()
  if (!creds || !tokens) throw new Error('갱신할 수 없는 상태입니다.')
  if (Date.now() < tokens.expiresAt - REFRESH_MARGIN_MS) return

  tokens = await refreshTokens(creds, tokens.refreshToken)
  saveTokens(tokens)
}

/** 수집기·API 호출부가 쓸 유효한 access_token. 필요하면 갱신해서 준다. */
export async function getAccessToken(): Promise<string> {
  if (!tokens) throw new Error('로그인되어 있지 않습니다.')
  await refreshIfNeeded()
  return tokens.accessToken
}

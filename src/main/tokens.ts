import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

export interface TokenSet {
  accessToken: string
  refreshToken: string
  /** epoch ms. access_token 이 만료되는 시각 */
  expiresAt: number
}

function tokenPath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'tokens.enc')
}

/**
 * 토큰을 OS 키체인 기반으로 암호화해 저장한다.
 * safeStorage 를 못 쓰는 환경이면 저장을 포기한다 — 평문으로 떨구느니 매번 재로그인이 낫다.
 */
export function saveTokens(tokens: TokenSet): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[tokens] safeStorage 사용 불가 — 토큰을 저장하지 않습니다 (재시작 시 재로그인 필요)')
    return
  }
  const blob = safeStorage.encryptString(JSON.stringify(tokens))
  writeFileSync(tokenPath(), blob)
}

export function loadTokens(): TokenSet | null {
  const p = tokenPath()
  if (!existsSync(p) || !safeStorage.isEncryptionAvailable()) return null
  try {
    const parsed = JSON.parse(safeStorage.decryptString(readFileSync(p))) as TokenSet
    if (!parsed.accessToken || !parsed.refreshToken) return null
    return parsed
  } catch (err) {
    // 다른 머신/다른 유저로 복사된 파일 등 — 복호화 실패는 정상 시나리오다
    console.warn('[tokens] 복호화 실패, 무시합니다:', err)
    return null
  }
}

export function clearTokens(): void {
  const p = tokenPath()
  if (existsSync(p)) unlinkSync(p)
}

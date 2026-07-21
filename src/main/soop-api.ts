import { SOOP_API_BASE } from './config'
import type { StationInfo } from '@shared/types'

async function postForm(path: string, params: Record<string, string>): Promise<unknown> {
  const res = await fetch(new URL(path, SOOP_API_BASE), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
    body: new URLSearchParams(params)
  })

  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`${path} 응답 파싱 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }
  if (!res.ok) throw new Error(`${path} 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`)

  // SOOP 은 HTTP 200 을 주면서 본문 result 로 실패를 알리는 경우가 있다
  const envelope = json as { result?: number }
  if (typeof envelope.result === 'number' && envelope.result !== 1) {
    throw new Error(`${path} 실패 (result=${envelope.result}): ${text.slice(0, 300)}`)
  }

  return json
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * `https://profile.img.sooplive.com/LOGO/ly/lysrobert/lysrobert.jpg` → `lysrobert`
 *
 * stationinfo 응답에 SOOP 아이디가 없어서 URL 에서 되뽑는다. 공식 계약이 아니므로
 * URL 형태가 바뀌면 조용히 빈 값이 된다 — 그래서 이 값에 기능을 의존시키지 않는다.
 */
function userIdFromProfileImage(url: string): string {
  const m = url.match(/\/LOGO\/[^/]+\/([^/]+)\//i)
  return m ? m[1] : ''
}

export async function fetchStationInfo(accessToken: string): Promise<StationInfo> {
  const json = await postForm('/user/stationinfo', { access_token: accessToken })

  const root = json as { data?: Record<string, unknown> }
  const d = root.data ?? (json as Record<string, unknown>)

  const profileImage = str(d.profile_image)
  const favorite = d.favorite_cnt

  return {
    userId: userIdFromProfileImage(profileImage),
    userNickname: str(d.user_nick),
    stationName: str(d.station_name),
    profileImage,
    favoriteCount: favorite === undefined || favorite === null ? null : Number(favorite),
    latelyBroadDate: str(d.lately_broad_date) || null,
    raw: json
  }
}

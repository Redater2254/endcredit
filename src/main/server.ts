import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import express, { type Request, type Response } from 'express'
import { SERVER_PORT } from './config'
import { collectorPage } from './collector-page'
import {
  addOverlayClient,
  finishOverlay,
  getOverlayState,
  isSampleMode,
  overlayClientCount,
  playOverlay,
  restartOverlay,
  setSampleMode,
  stopOverlay,
  togglePlay
} from './overlay'
import { remotePage } from './remote-page'
import { renderBuiltinAudio } from './audio-synth'
import { assetsDir } from './assets'

/**
 * 로컬 서버는 두 가지 일을 한다.
 *   1) OAuth 콜백 수신 (`/auth/callback`) — Redirect URI 가 이 포트에 등록돼 있어 포트 변경 불가
 *   2) OBS 브라우저 소스에 오버레이 페이지 제공 (`/overlay`)
 *   3) OBS 사용자 정의 독에 넣는 리모컨 (`/remote`)
 */

/**
 * 로컬 서버라고 안전한 것이 아니다.
 *
 * 스트리머가 **아무 웹페이지나 열어도** 그 페이지의 스크립트는 `localhost:7396` 을 부를 수
 * 있다. 아무나 부르게 두면 두 가지가 뚫린다:
 *
 *   1) `/overlay/stream` 을 읽어 **시청자 명단·별풍선 기록을 통째로 가져간다**
 *   2) `POST /remote/play` 로 **방송 중에 엔딩크레딧을 틀어버린다** (CSRF)
 *
 * 그래서 브라우저가 보낸 `Origin` 을 확인한다. 우리 페이지(오버레이·리모컨)는 이 서버가
 * 직접 내보내므로 같은 출처이고, 개발 중에만 Vite 개발 서버가 예외다.
 */
function allowedOrigins(): string[] {
  const list = [`http://localhost:${SERVER_PORT}`, `http://127.0.0.1:${SERVER_PORT}`]
  // 개발 중에는 오버레이 페이지가 Vite 개발 서버에서 뜬다
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) list.push(dev.replace(/\/$/, ''))
  return list
}

type OriginCheck = 'same' | 'allowed' | 'blocked'

/**
 * `Origin` 이 없으면 같은 출처이거나 브라우저가 아니다.
 * 브라우저가 아닌 로컬 프로그램은 어차피 파일을 직접 읽을 수 있으므로 막을 실익이 없다 —
 * 여기서 막고 싶은 것은 **사용자가 연 웹페이지**다.
 */
function checkOrigin(origin: string | undefined): OriginCheck {
  if (!origin) return 'same'
  return allowedOrigins().includes(origin) ? 'allowed' : 'blocked'
}

/** 허용된 출처면 헤더를 달아주고, 아니면 막는다. 통과하면 true. */
function guard(req: Request, res: Response): boolean {
  const origin = req.get('origin')
  const check = checkOrigin(origin)

  if (check === 'blocked') {
    console.warn(`[server] 허용되지 않은 출처의 요청 차단: ${origin} → ${req.method} ${req.path}`)
    res.sendStatus(403)
    return false
  }
  if (check === 'allowed' && origin) {
    res.set('Access-Control-Allow-Origin', origin)
    // 출처마다 응답이 다르므로 캐시가 섞이지 않게 알린다
    res.set('Vary', 'Origin')
  }
  return true
}

type CodeWaiter = { resolve: (code: string) => void; reject: (err: Error) => void }

let httpServer: Server | null = null
let waiter: CodeWaiter | null = null

const app = express()

app.get('/health', (_req, res) => {
  res.json({ ok: true, port: SERVER_PORT })
})

// ── OBS 오버레이 ────────────────────────────────────────────────────────
// OBS 브라우저 소스가 http://localhost:7396/overlay 를 연다.
// 개발 중에는 Vite dev 서버가 페이지를 들고 있으므로 그쪽으로 넘기고,
// 패키징 후에는 빌드 결과를 직접 서빙한다. OBS 쪽 URL 은 두 경우 모두 같다.
app.get('/overlay/stream', (req, res) => {
  // 이 스트림에는 시청자 닉네임·별풍선 기록이 통째로 흐른다. 아무나 읽으면 안 된다.
  if (!guard(req, res)) return
  addOverlayClient(res)
})

// ── OBS 리모컨 ──────────────────────────────────────────────────────────
// OBS 도구 › 사용자 정의 브라우저 독에 http://localhost:7396/remote 를 넣으면
// 방송 화면에서 빠져나오지 않고 크레딧을 틀 수 있다.
app.get('/remote', (_req, res) => {
  res.type('html').send(remotePage())
})

app.get('/remote/status', (req, res) => {
  if (!guard(req, res)) return
  const s = getOverlayState()
  res.set('Cache-Control', 'no-store')
  res.json({ playing: s.playing, sample: s.sample, clients: overlayClientCount() })
})

const REMOTE_ACTIONS: Record<string, () => void> = {
  play: playOverlay,
  stop: stopOverlay,
  toggle: togglePlay,
  restart: restartOverlay,
  sample: () => setSampleMode(!isSampleMode())
}

app.post('/remote/:action', (req, res) => {
  // 이걸 막지 않으면 스트리머가 연 웹페이지가 방송 중에 크레딧을 틀 수 있다
  if (!guard(req, res)) return
  const run = REMOTE_ACTIONS[req.params.action]
  if (!run) return res.status(404).json({ ok: false })
  run()
  const s = getOverlayState()
  res.json({ ok: true, playing: s.playing, sample: s.sample })
})

// 오버레이가 "다 재생했다" 고 알려오는 유일한 역방향 경로
app.post('/overlay/finished', express.json(), (req, res) => {
  if (!guard(req, res)) return
  const gen = Number((req.body as { generation?: unknown })?.generation)
  const stopped = Number.isFinite(gen) ? finishOverlay(gen) : false
  res.json({ stopped })
})

app.options('/overlay/finished', (req, res) => {
  if (!guard(req, res)) return
  res.set({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' })
  res.sendStatus(204)
})

/**
 * 사용자가 넣은 이미지·오디오.
 * OBS 브라우저 소스는 `file://` 을 읽지 못하므로 반드시 http 로 내보내야 한다.
 * (오버레이가 dev 서버 origin 에서 뜨는 경우가 있어 CORS 도 열어둔다)
 */
app.use(
  '/user-assets',
  (req, res, next) => {
    if (!guard(req, res)) return
    next()
  },
  // 경로는 요청 시점에 구한다 — app.getPath('userData') 는 ready 이후에만 신뢰할 수 있다.
  (req, res, next) =>
    express.static(assetsDir(), {
      // 기본값(ignore)은 점으로 시작하는 파일을 404 로 막는다.
      // 사용자가 고른 파일명을 우리가 다 통제할 수 없으므로 명시적으로 허용한다.
      dotfiles: 'allow'
    })(req, res, next)
)

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL

if (rendererDevUrl) {
  app.get('/overlay', (_req, res) => {
    res.redirect(302, `${rendererDevUrl}/overlay.html`)
  })
} else {
  const rendererDir = join(__dirname, '../renderer')
  app.use('/assets', express.static(join(rendererDir, 'assets')))
  app.get('/overlay', (_req, res) => {
    res.sendFile(join(rendererDir, 'overlay.html'))
  })
}

// 숨김 수집기 창이 로드하는 페이지. file:// 대신 http origin 을 주기 위해 서버가 서빙한다.
/**
 * 기본 제공 소리. 파일이 아니라 **만들어서** 내보낸다.
 *
 * 남의 음원을 넣으면 프리셋 공유가 곧 재배포가 되어 쓸 수 없다 (효과음 사이트 대부분이
 * 재배포를 금지한다). 직접 합성하면 그 문제가 사라지고, 프리셋에 담을 필요도 없어진다 —
 * 어느 컴퓨터의 endcredit 이든 같은 주소로 같은 소리가 난다.
 */
app.get('/builtin-audio/:file', (req, res) => {
  if (!guard(req, res)) return
  const id = req.params.file.replace(/\.wav$/i, '')
  const buf = renderBuiltinAudio(id)
  if (!buf) return res.sendStatus(404)
  res.set({
    'Content-Type': 'audio/wav',
    'Content-Length': String(buf.length),
    // 내용이 절대 안 바뀌므로 마음껏 캐시하게 둔다
    'Cache-Control': 'public, max-age=31536000, immutable'
  })
  return res.send(buf)
})

app.get('/collector', (_req, res) => {
  res.type('html').send(collectorPage())
})

app.get('/auth/callback', (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null
  const error = typeof req.query.error === 'string' ? req.query.error : null

  if (code && waiter) {
    waiter.resolve(code)
    waiter = null
  } else if (waiter) {
    waiter.reject(new Error(error ?? '인증 코드가 오지 않았습니다.'))
    waiter = null
  }

  res.type('html').send(page(code ? 'ok' : 'fail', error))
})

function page(kind: 'ok' | 'fail', error: string | null): string {
  const ok = kind === 'ok'
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>endcredit</title>
<style>
  body{margin:0;height:100vh;display:grid;place-items:center;background:#14151a;color:#e8e8ee;
       font-family:"Malgun Gothic",system-ui,sans-serif;text-align:center}
  .m{max-width:26rem;padding:2rem}
  h1{font-size:1.3rem;margin:0 0 .6rem}
  p{margin:0;color:#9a9aa8;line-height:1.6;font-size:.9rem}
  .i{font-size:2.6rem;margin-bottom:1rem}
</style></head><body><div class="m">
<div class="i">${ok ? '✓' : '✕'}</div>
<h1>${ok ? '로그인 완료' : '로그인 실패'}</h1>
<p>${ok ? 'endcredit 앱으로 돌아가세요.<br>이 창은 닫아도 됩니다.' : escapeHtml(error ?? '인증 코드를 받지 못했습니다.')}</p>
</div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** 다음으로 도착할 인증 코드 하나를 기다린다. */
export function awaitAuthCode(timeoutMs = 5 * 60_000): Promise<string> {
  if (waiter) waiter.reject(new Error('새 로그인 시도로 취소되었습니다.'))

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiter = null
      reject(new Error('로그인 대기 시간이 초과되었습니다 (5분).'))
    }, timeoutMs)

    waiter = {
      resolve: (code) => {
        clearTimeout(timer)
        resolve(code)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      }
    }
  })
}

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer = createServer(app)

    httpServer.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // 포트를 못 바꾸는 구조라 이건 치명적 오류다. 원인을 짚어주는 게 중요하다.
        reject(
          new Error(
            `포트 ${SERVER_PORT} 가 이미 사용 중입니다.\n` +
              `이 포트는 SOOP 에 등록된 Redirect URI 에 박혀 있어 바꿀 수 없습니다.\n` +
              `PowerShell 에서 아래로 점유 중인 프로그램을 확인하세요:\n` +
              `  Get-Process -Id (Get-NetTCPConnection -LocalPort ${SERVER_PORT}).OwningProcess`
          )
        )
      } else {
        reject(err)
      }
    })

    // localhost 로만 바인딩 — 같은 네트워크의 남이 접근할 이유가 없다
    httpServer.listen(SERVER_PORT, '127.0.0.1', () => resolve())
  })
}

export function stopServer(): void {
  httpServer?.close()
  httpServer = null
}

/**
 * 브랜드 이미지 한 장 → 앱이 필요로 하는 모든 크기.
 *
 *   npm run icons
 *
 * ## 왜 Electron 으로 도는가
 * PNG 를 줄이려면 디코더·리샘플러가 필요한데, 그 둘을 이미 갖고 있는 게 Electron 이다
 * (`nativeImage`). 이것 하나 때문에 sharp 같은 네이티브 의존성을 더할 이유가 없다.
 *
 * ## 넣는 곳
 *   brand/icon.png   — 정사각형 원본 (1024×1024 권장)
 *   brand/logo.png   — 같은 그림의 **투명 배경** 판 (선택)
 *   brand/mark.svg   — 글자 없는 심볼만 (선택, 있으면 작은 크기에 이걸 쓴다)
 *   brand/author.jpg — 만든 사람 프로필 (선택, 얼굴만 잘라 동그란 사진으로)
 *
 * ## 나오는 것
 *   build/icon.ico                    — 실행 파일·창·설치 파일 (16~256 한 파일에)
 *   build/icons/*.png                 — 크기별 낱장
 *   src/renderer/src/assets/mark.png  — 앱 머리말에 쓸 심볼
 *   src/renderer/src/assets/logo.png  — 여백을 턴 전체 로고
 *   src/renderer/src/assets/author.png — 도움말에 넣을 프로필
 */

const { app, BrowserWindow, nativeImage } = require('electron')
const { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const BRAND = join(ROOT, 'brand')
const OUT = join(ROOT, 'build')
const OUT_PNG = join(OUT, 'icons')
const ASSETS = join(ROOT, 'src', 'renderer', 'src', 'assets')

/** 윈도우가 실제로 쓰는 크기들. 작은 쪽이 빠지면 탐색기가 큰 걸 뭉개서 쓴다. */
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
/** 이 크기 아래로는 글자가 읽히지 않는다 — 심볼만 잘라 쓴다 */
const MARK_ONLY_UPTO = 32

/** `icon.png` 을 찾되, `icon..png` 같은 오타도 받아준다. */
function find(stem, ext = '.png') {
  const exact = join(BRAND, `${stem}${ext}`)
  if (existsSync(exact)) return exact
  const near = readdirSync(BRAND).find(
    (f) => f.toLowerCase().startsWith(stem) && f.toLowerCase().endsWith(ext)
  )
  return near ? join(BRAND, near) : null
}

/**
 * SVG → 그림.
 *
 * nativeImage 는 SVG 를 못 읽는다. 하지만 Electron 안에는 SVG 를 아주 잘 그리는 것이
 * 이미 들어 있다 — 브라우저다. 보이지 않는 투명 창에 띄워 그대로 찍는다.
 * 벡터라서 어느 크기로 뽑아도 가장자리가 깨끗하다.
 */
function renderSvg(file, width, height) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width,
      height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      // 숨긴 창은 그리지 않으므로 capturePage 가 영영 안 돌아온다.
      // 오프스크린 렌더링은 창을 띄우지 않고도 실제로 그려서 paint 로 넘겨준다.
      webPreferences: { offscreen: true }
    })

    let last = null
    let settle = null
    const fail = setTimeout(() => {
      win.destroy()
      reject(new Error(`SVG 를 그리지 못했습니다: ${file}`))
    }, 20_000)

    win.webContents.on('paint', (_e, _dirty, image) => {
      if (image.isEmpty()) return
      last = image
      // 여러 번 그려질 수 있다 — 잠잠해지면 마지막 것을 쓴다
      clearTimeout(settle)
      settle = setTimeout(() => {
        clearTimeout(fail)
        const out = last
        win.destroy()
        resolve(out)
      }, 180)
    })

    const svg = readFileSync(file, 'utf8')
    const html =
      `<!doctype html><meta charset="utf-8"><style>` +
      `html,body{margin:0;padding:0;background:transparent;overflow:hidden}` +
      `svg{display:block;width:${width}px;height:${height}px}</style>` +
      svg
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  })
}

/**
 * `over` 를 `under` 한가운데에 얹는다.
 *
 * Skia 의 비트맵은 **알파가 곱해진** 값이라, 색에 알파를 다시 곱하면 두 번 곱해져
 * 가장자리가 어둡게 눌린다. 곱하지 않고 그대로 더하는 것이 맞다.
 */
function compose(under, over) {
  const { width: W, height: H } = under.getSize()
  const { width: w, height: h } = over.getSize()
  const dst = Buffer.from(under.toBitmap())
  const src = over.toBitmap()
  const offX = Math.round((W - w) / 2)
  const offY = Math.round((H - h) / 2)

  for (let y = 0; y < h; y++) {
    const dy = y + offY
    if (dy < 0 || dy >= H) continue
    for (let x = 0; x < w; x++) {
      const dx = x + offX
      if (dx < 0 || dx >= W) continue
      const si = (y * w + x) * 4
      const di = (dy * W + dx) * 4
      const a = src[si + 3] / 255
      if (a === 0) continue
      for (let c = 0; c < 3; c++) dst[di + c] = Math.min(255, src[si + c] + dst[di + c] * (1 - a))
      dst[di + 3] = Math.min(255, src[si + 3] + dst[di + 3] * (1 - a))
    }
  }
  return nativeImage.createFromBitmap(dst, { width: W, height: H })
}

/** 알파가 있는 픽셀만 남기는 경계 상자 (0~1 비율). 내용이 없으면 null. */
function opaqueRows(img) {
  const { width, height } = img.getSize()
  const px = img.toBitmap() // BGRA
  const rows = new Array(height).fill(false)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 12) {
        rows[y] = true
        break
      }
    }
  }
  return { rows, px, width, height }
}

/** [y0, y1) 구간에서 좌우 경계 */
function xBounds(px, width, y0, y1) {
  let min = width
  let max = 0
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 12) {
        if (x < min) min = x
        if (x > max) max = x
      }
    }
  }
  return max >= min ? { x0: min, x1: max + 1 } : null
}

/**
 * 로고에서 **위쪽 덩어리(심볼)만** 잘라낸다.
 *
 * 로고는 대개 심볼 아래에 글자가 붙어 있고 그 사이에 빈 줄이 있다. 작은 아이콘에서는
 * 그 글자가 읽히지 않고 얼룩으로만 남으므로, 빈 줄을 경계 삼아 심볼만 쓴다.
 */
function markBox(img) {
  const { rows, px, width, height } = opaqueRows(img)
  const top = rows.indexOf(true)
  if (top < 0) return null

  // 높이의 3% 이상 연속으로 비면 "덩어리가 끝났다"고 본다
  const gapNeeded = Math.max(3, Math.round(height * 0.03))
  let y = top
  let gap = 0
  let end = height
  while (y < height) {
    if (rows[y]) gap = 0
    else if (++gap >= gapNeeded) {
      end = y - gap + 1
      break
    }
    y++
  }

  const xs = xBounds(px, width, top, end)
  if (!xs) return null
  return { top, end, ...xs, width, height }
}

/**
 * **밝기로** 내용 범위를 찾는다.
 *
 * 사진은 투명한 부분이 없으므로 알파로는 여백을 못 가른다. 흰 배경에 그린 그림이라면
 * "흰색이 아닌 곳"이 곧 내용이다.
 */
function contentBoxByLuma(img, threshold = 242) {
  const { width, height } = img.getSize()
  const px = img.toBitmap()
  let x0 = width
  let y0 = height
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (px[i] < threshold || px[i + 1] < threshold || px[i + 2] < threshold) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 >= x0 ? { x0, y0, x1: x1 + 1, y1: y1 + 1, width, height } : null
}

/** 투명 여백을 턴 전체 내용의 경계 상자 */
function trimBox(img) {
  const { rows, px, width, height } = opaqueRows(img)
  const top = rows.indexOf(true)
  const bottom = rows.lastIndexOf(true)
  if (top < 0) return null
  const xs = xBounds(px, width, top, bottom + 1)
  return xs ? { top, end: bottom + 1, ...xs, width, height } : null
}

/** 경계 상자를 감싸는 **정사각형** 잘라내기 영역 (여백 포함) */
function squareAround(box, pad = 0.12) {
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.top + box.end) / 2
  const side = Math.max(box.x1 - box.x0, box.end - box.top) * (1 + pad * 2)
  const half = side / 2
  return {
    x: Math.max(0, Math.round(cx - half)),
    y: Math.max(0, Math.round(cy - half)),
    width: Math.min(box.width, Math.round(side)),
    height: Math.min(box.height, Math.round(side))
  }
}

/**
 * PNG 여러 장 → .ico 한 장.
 *
 * ICO 는 아주 단순한 컨테이너다: 헤더 6바이트 + 항목 16바이트씩 + 이미지 데이터.
 * 비스타 이후 윈도우는 안에 PNG 를 그대로 넣어도 읽으므로 BMP 로 바꿀 필요가 없다.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = 아이콘
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length

  entries.forEach((e, i) => {
    const at = i * 16
    // 256 은 0 으로 적는다 (한 바이트라 256 이 안 들어간다)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1)
    dir.writeUInt8(0, at + 2)
    dir.writeUInt8(0, at + 3)
    dir.writeUInt16LE(1, at + 4)
    dir.writeUInt16LE(32, at + 6)
    dir.writeUInt32LE(e.data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += e.data.length
  })

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)])
}

app.whenReady().then(async () => {
  const srcPath = find('icon')
  if (!srcPath) {
    console.error(`\n원본이 없습니다: ${join(BRAND, 'icon.png')}`)
    console.error('정사각형 PNG(1024×1024 권장)를 넣고 다시 실행하세요.\n')
    app.exit(1)
    return
  }

  const source = nativeImage.createFromPath(srcPath)
  const { width, height } = source.getSize()
  console.log(`원본  ${srcPath}  ${width}×${height}`)
  if (width !== height) console.warn(`⚠ 정사각형이 아닙니다 — 찌그러질 수 있습니다.`)
  if (width < 256) console.warn(`⚠ 원본이 작습니다 (${width}px) — 256px 이상을 권합니다.`)

  const logoPath = find('logo')
  const logo = logoPath ? nativeImage.createFromPath(logoPath) : null
  const svgPath = find('mark', '.svg')

  /**
   * 작은 크기에서는 글자가 읽히지 않고 얼룩으로만 남는다. 심볼만 크게 넣는다.
   *
   * 배경은 원본 **맨 위 띠**를 세로로 늘려 만든다 — 그라데이션이 가로 방향이라
   * 세로로 늘려도 색이 그대로 유지되고, 글자가 없는 부분이 확실히 보장된다.
   */
  let smallBg = null
  let markSvgSize = null
  if (svgPath) {
    smallBg = source.crop({ x: 0, y: 0, width, height: Math.max(8, Math.round(height * 0.15)) })
    // SVG 의 원래 비율을 지킨다
    const vb = /viewBox\s*=\s*["']([^"']+)["']/.exec(readFileSync(svgPath, 'utf8'))
    const nums = vb ? vb[1].trim().split(/[\s,]+/).map(Number) : null
    markSvgSize =
      nums && nums.length === 4 && nums[2] > 0 ? { w: nums[2], h: nums[3] } : { w: 1, h: 1 }
    console.log(`심볼 SVG  ${svgPath}  (${markSvgSize.w}×${markSvgSize.h})`)
    console.log(`  → ${MARK_ONLY_UPTO}px 이하는 글자 없이 심볼만 씁니다`)
  }

  /**
   * 심볼은 **한 번만** 크게 그려두고 줄여 쓴다.
   * 크기마다 창을 새로 띄우면 느릴 뿐 아니라 중간에 한 번 막히면 전부 멈춘다.
   */
  let markBig = null
  if (svgPath) {
    const w = 1024
    const h = Math.max(1, Math.round((w * markSvgSize.h) / markSvgSize.w))
    markBig = await renderSvg(svgPath, w, h)
    console.log(`심볼 렌더  ${w}×${h}`)
  }

  // SVG 가 없으면 로고에서 심볼 위치를 추정한다
  const mark = logo ? markBox(logo) : null
  let smallSource = source
  if (!svgPath && mark && logo.getSize().width === width) {
    const crop = squareAround(mark)
    smallSource = source.crop(crop)
    console.log(`심볼 영역(추정)  ${crop.width}×${crop.height} @ (${crop.x}, ${crop.y})`)
  }

  /** 그 크기의 아이콘 한 장. 작은 크기는 심볼만, 큰 크기는 원본 그대로. */
  async function iconAt(size) {
    if (size > MARK_ONLY_UPTO || !svgPath) {
      const from = size <= MARK_ONLY_UPTO ? smallSource : source
      return from.resize({ width: size, height: size, quality: 'best' })
    }
    // 심볼이 가장자리에 닿지 않게 78% 로 — 윈도우가 아이콘을 얹을 때 잘려 보이지 않는다
    const mw = Math.max(4, Math.round(size * 0.78))
    const mh = Math.max(3, Math.round((mw * markSvgSize.h) / markSvgSize.w))
    return compose(
      smallBg.resize({ width: size, height: size, quality: 'best' }),
      markBig.resize({ width: mw, height: mh, quality: 'best' })
    )
  }

  mkdirSync(OUT, { recursive: true })
  mkdirSync(OUT_PNG, { recursive: true })

  const entries = []
  for (const size of SIZES) {
    const png = (await iconAt(size)).toPNG()
    writeFileSync(join(OUT_PNG, `${size}.png`), png)
    entries.push({ size, data: png })
    console.log(
      `  ${String(size).padStart(3)}px  ${(png.length / 1024).toFixed(1).padStart(5)}KB` +
        `${size <= MARK_ONLY_UPTO && svgPath ? '  (심볼만)' : ''}`
    )
  }

  const ico = join(OUT, 'icon.ico')
  writeFileSync(ico, buildIco(entries))

  /*
   * 메인 프로세스가 쓸 아이콘을 **소스로 굽는다.**
   * 파일로 두면 개발 중엔 되지만 패키징한 뒤 경로가 달라져 아이콘이 사라진다.
   * 코드에 담으면 번들러가 알아서 들고 가므로 어디서든 똑같이 나온다.
   */
  const embed = [16, 24, 32, 48, 64, 256]
  const lines = embed.map((n) => {
    const b64 = readFileSync(join(OUT_PNG, `${n}.png`)).toString('base64')
    return `  ${n}: '${b64}'`
  })
  writeFileSync(
    join(ROOT, 'src', 'main', 'icon-data.ts'),
    [
      '// 자동 생성 — `npm run icons` 가 다시 만든다. 직접 고치지 말 것.',
      '// brand/ 의 원본에서 구운 PNG (base64).',
      'export const ICON_PNG: Record<number, string> = {',
      lines.join(',\n'),
      '}',
      ''
    ].join('\n'),
    'utf8'
  )
  console.log(`✓ 아이콘 ${embed.length}종 → src/main/icon-data.ts (코드에 내장)`)
  console.log(`\n✓ ${ico}  (${SIZES.length}개 크기, ${(readFileSync(ico).length / 1024).toFixed(1)}KB)`)

  // ── 앱 화면에 쓸 것 ──────────────────────────────────────
  if (logo || markBig) {
    mkdirSync(ASSETS, { recursive: true })

    // 머리말에는 심볼만 — 글자는 HTML 로 그려야 어느 크기에서도 또렷하다
    if (markBig) {
      const h = 128
      const w = Math.round((markSvgSize.w / markSvgSize.h) * h)
      writeFileSync(
        join(ASSETS, 'mark.png'),
        markBig.resize({ width: w, height: h, quality: 'best' }).toPNG()
      )
      console.log(`✓ 심볼 ${w}×${h} (SVG) → src/renderer/src/assets/mark.png`)
    } else if (mark) {
      const box = squareAround(mark, 0.04)
      writeFileSync(
        join(ASSETS, 'mark.png'),
        logo.crop(box).resize({ width: 96, height: 96, quality: 'best' }).toPNG()
      )
      console.log('✓ 심볼 96×96 → src/renderer/src/assets/mark.png')
    }

    // 여백을 턴 전체 로고 (정보 화면 등에서 쓸 수 있게)
    const t = logo ? trimBox(logo) : null
    if (t) {
      const w = t.x1 - t.x0
      const h = t.end - t.top
      const outH = 256
      const outW = Math.round((w / h) * outH)
      writeFileSync(
        join(ASSETS, 'logo.png'),
        logo
          .crop({ x: t.x0, y: t.top, width: w, height: h })
          .resize({ width: outW, height: outH, quality: 'best' })
          .toPNG()
      )
      console.log(`✓ 로고 ${outW}×${outH} → src/renderer/src/assets/logo.png`)
    }
  }

  // ── 만든 사람 프로필 ─────────────────────────────────────
  const authorPath = find('author', '.jpg') ?? find('author', '.png')
  if (authorPath) {
    mkdirSync(ASSETS, { recursive: true })
    const photo = nativeImage.createFromPath(authorPath)
    const box = contentBoxByLuma(photo)
    let cropped = photo

    if (box) {
      /*
       * 동그란 아바타에 쓸 것이므로 **얼굴만** 남긴다.
       * 세로로 긴 사진을 그대로 동그랗게 자르면 얼굴이 잘리고 몸통만 남는다.
       * 내용의 위쪽에서 폭만큼 정사각형을 떼면 대개 머리·어깨가 잡힌다.
       */
      const w = box.x1 - box.x0
      const side = Math.min(w, box.height - box.y0)
      const pad = Math.round(side * 0.06)
      const x = Math.max(0, box.x0 + Math.round((w - side) / 2) - pad)
      const y = Math.max(0, box.y0 - pad)
      const size = Math.min(side + pad * 2, box.width - x, box.height - y)
      cropped = photo.crop({ x, y, width: size, height: size })
      console.log(`프로필  ${authorPath}  → ${size}×${size} @ (${x}, ${y})`)
    }

    writeFileSync(
      join(ASSETS, 'author.png'),
      cropped.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
    )
    console.log('✓ 프로필 256×256 → src/renderer/src/assets/author.png')
  }

  console.log('')
  app.exit(0)
}).catch((err) => {
  // 조용히 죽으면 왜 안 됐는지 알 길이 없다
  console.error('\n실패:', err instanceof Error ? err.message : err, '\n')
  app.exit(1)
})

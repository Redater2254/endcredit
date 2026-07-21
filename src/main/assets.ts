import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app, dialog } from 'electron'
import { SERVER_PORT } from '@shared/constants'

/**
 * 사용자가 넣은 이미지·오디오.
 *
 * 원본 경로를 그대로 쓰지 않고 앱 폴더로 **복사한다**. 이유가 둘이다.
 *   1) OBS 브라우저 소스는 `file://` 을 못 읽는다 → 로컬 서버로 서빙해야 한다.
 *   2) 프리셋을 남에게 보낼 때(M6) 에셋을 함께 담아야 하는데,
 *      바탕화면 어딘가를 가리키고 있으면 받은 사람 화면에서 전부 깨진다.
 */

export interface Asset {
  /** 파일명 (프리셋에는 이 값만 저장해도 되지만, 지금은 URL 을 통째로 저장한다) */
  file: string
  /** 오버레이·미리보기가 그대로 쓸 수 있는 주소 */
  url: string
  sizeBytes: number
}

export function assetsDir(): string {
  const dir = join(app.getPath('userData'), 'assets')
  mkdirSync(dir, { recursive: true })
  return dir
}

function urlFor(file: string): string {
  return `http://localhost:${SERVER_PORT}/user-assets/${encodeURIComponent(file)}`
}

/** 같은 이름이 있으면 뒤에 숫자를 붙인다 — 기존 프리셋이 가리키는 파일을 덮어쓰면 안 된다. */
export function uniqueName(original: string): string {
  const ext = extname(original)
  const stem =
    basename(original, ext)
      .replace(/[\\/:*?"<>|]/g, '_')
      // 앞의 점·공백은 반드시 제거한다. 점으로 시작하는 파일은 정적 서버가
      // 기본 설정에서 404 로 막아버려, 파일이 있는데도 이미지가 안 뜬다.
      .replace(/^[.\s]+/, '')
      .trim() || 'asset'

  let name = `${stem}${ext}`
  let n = 1
  while (existsSync(join(assetsDir(), name))) {
    name = `${stem}-${n}${ext}`
    n += 1
  }
  return name
}

export function importAssetFile(sourcePath: string): Asset {
  const file = uniqueName(basename(sourcePath))
  const dest = join(assetsDir(), file)
  copyFileSync(sourcePath, dest)
  return { file, url: urlFor(file), sizeBytes: statSync(dest).size }
}

/** 이미 같은 내용의 파일이 있으면 그걸 쓰고, 아니면 새 이름으로 담는다. */
export function storeAssetBytes(preferredName: string, data: Buffer): Asset {
  const asIs = join(assetsDir(), preferredName)
  if (existsSync(asIs) && readFileSync(asIs).equals(data)) {
    return { file: preferredName, url: urlFor(preferredName), sizeBytes: data.length }
  }
  const file = uniqueName(preferredName)
  writeFileSync(join(assetsDir(), file), data)
  return { file, url: urlFor(file), sizeBytes: data.length }
}

export function readAssetBytes(file: string): Buffer | null {
  const p = join(assetsDir(), file)
  return existsSync(p) ? readFileSync(p) : null
}

/**
 * 문서 JSON 안의 에셋 주소를 찾는 패턴.
 *
 * `/g` 정규식은 lastIndex 를 들고 다녀서 재사용하면 결과가 어긋난다 — 매번 새로 만든다.
 */
export function assetUrlPattern(): RegExp {
  return /\/user-assets\/([^"'\s?#]+)/g
}

/** 주소에서 에셋 파일명을 꺼낸다. 우리 서버가 내보낸 주소가 아니면 null. */
export function assetFileFromUrl(url: string): string | null {
  const m = /\/user-assets\/([^"'\s?#]+)/.exec(url)
  return m ? decodeURIComponent(m[1]) : null
}

export async function pickAudio(): Promise<Asset | null> {
  const result = await dialog.showOpenDialog({
    title: '소리 파일 선택',
    properties: ['openFile'],
    filters: [{ name: '오디오', extensions: ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'flac', 'opus', 'webm'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importAssetFile(result.filePaths[0])
}

export async function pickImage(): Promise<Asset | null> {
  const result = await dialog.showOpenDialog({
    title: '이미지 선택',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'apng'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return importAssetFile(result.filePaths[0])
}

export function listAssets(): Asset[] {
  return readdirSync(assetsDir()).map((file) => ({
    file,
    url: urlFor(file),
    sizeBytes: statSync(join(assetsDir(), file)).size
  }))
}

export function deleteAsset(file: string): void {
  const p = join(assetsDir(), file)
  if (existsSync(p)) unlinkSync(p)
}

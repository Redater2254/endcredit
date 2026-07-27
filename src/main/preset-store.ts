import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { writeFileAtomic } from './safe-write'
import { basename, join } from 'node:path'
import { app, dialog } from 'electron'
import { defaultDeck, type Deck } from '@shared/deck'
import { toDeck } from '@shared/migrate'
import { assetUrlPattern, readAssetBytes, storeAssetBytes } from './assets'
import { lastDir, rememberDir } from './settings'
import { unzipSync, zipSync, type ZipEntry } from './zip'

/**
 * 프리셋 저장소.
 *
 * `current.json` — 지금 편집 중인 프리셋. 앱을 껐다 켜도 유지된다.
 * `presets/*.json` — 이름 붙여 저장한 프리셋들.
 * `*.ecpreset` — 남에게 보내는 한 덩어리. JSON 과 **에셋을 함께** 담은 zip 이다.
 *   에셋을 빼면 받은 사람 화면에서 이미지·소리가 전부 깨진다.
 */

function baseDir(): string {
  const dir = join(app.getPath('userData'), 'presets')
  mkdirSync(dir, { recursive: true })
  return dir
}

function currentPath(): string {
  return join(app.getPath('userData'), 'current-preset.json')
}

/** 파일명으로 쓸 수 없는 문자를 걸러낸다. 프리셋 이름은 사용자가 자유롭게 짓는다. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'preset'
}

export function loadCurrentDeck(): Deck {
  const p = currentPath()
  if (!existsSync(p)) return defaultDeck()
  try {
    // 예전 버전(v1)으로 저장돼 있으면 슬라이드 모델로 변환해 이어서 쓴다
    return toDeck(JSON.parse(readFileSync(p, 'utf8')))
  } catch (err) {
    /*
     * 못 읽은 파일을 **그 자리에 두면 안 된다.** 기본 문서로 시작한 뒤 저장이 한 번만
     * 일어나면 원본을 덮어써 영영 사라진다. 먼저 옆으로 치워 두면 나중에 손으로 되살릴 수 있다.
     */
    const kept = `${p}.broken-${Date.now()}`
    try {
      renameSync(p, kept)
      console.warn(`[preset] 문서를 읽지 못해 ${kept} 로 옮기고 기본 문서로 시작합니다:`, err)
    } catch (mvErr) {
      console.error('[preset] 손상된 문서를 옮기지도 못했습니다 — 저장이 덮어쓸 수 있습니다:', mvErr)
    }
    return defaultDeck()
  }
}

/** 지금 문서를 백업본으로 남긴다 (초기화 직전에 부른다). */
export function backupCurrentDeck(): string | null {
  const p = currentPath()
  if (!existsSync(p)) return null
  const dest = join(baseDir(), `backup-${Date.now()}.json`)
  writeFileAtomic(dest, readFileSync(p, 'utf8'))
  return dest
}

export function saveCurrentDeck(preset: Deck): void {
  writeFileAtomic(currentPath(), JSON.stringify(preset, null, 2))
}

export interface SavedDeck {
  file: string
  name: string
}

export function listDecks(): SavedDeck[] {
  return readdirSync(baseDir())
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      try {
        const p = JSON.parse(readFileSync(join(baseDir(), file), 'utf8')) as Deck
        return { file, name: p.name || file.replace(/\.json$/, '') }
      } catch {
        return { file, name: `${file} (읽기 실패)` }
      }
    })
}

export function saveDeckAs(preset: Deck, name: string): SavedDeck {
  const named: Deck = { ...preset, name }
  const file = `${safeName(name)}.json`
  writeFileAtomic(join(baseDir(), file), JSON.stringify(named, null, 2))
  return { file, name }
}

export function loadDeckFile(file: string): Deck {
  return toDeck(JSON.parse(readFileSync(join(baseDir(), file), 'utf8')))
}

export function deleteDeckFile(file: string): void {
  const p = join(baseDir(), file)
  if (existsSync(p)) unlinkSync(p)
}

export function presetsDir(): string {
  return baseDir()
}

// ── .ecpreset — 통째로 주고받기 ─────────────────────────────

const EXPORT_EXT = 'ecpreset'
const DECK_ENTRY = 'deck.json'
const ASSET_DIR = 'assets/'

/** 문서가 실제로 쓰고 있는 에셋 파일명들. */
function referencedAssets(deck: Deck): string[] {
  const found = new Set<string>()
  for (const m of JSON.stringify(deck).matchAll(assetUrlPattern())) {
    try {
      found.add(decodeURIComponent(m[1]))
    } catch {
      found.add(m[1])
    }
  }
  return [...found]
}

/** 에셋 파일명이 바뀌었으면(이름 충돌) 문서 안의 주소도 같이 고친다. */
function rewriteAssetNames(deck: Deck, renamed: Map<string, string>): Deck {
  if (renamed.size === 0) return deck
  const json = JSON.stringify(deck).replace(assetUrlPattern(), (whole, enc: string) => {
    let name = enc
    try {
      name = decodeURIComponent(enc)
    } catch {
      /* 인코딩이 아니면 그대로 */
    }
    const to = renamed.get(name)
    return to ? `/user-assets/${encodeURIComponent(to)}` : whole
  })
  return JSON.parse(json) as Deck
}

export interface ExportResult {
  path: string
  assets: number
  missing: string[]
}

export async function exportPreset(deck: Deck): Promise<ExportResult | null> {
  const suggested = `${safeName(deck.name || '내 프리셋')}.${EXPORT_EXT}`
  const dir = lastDir('preset')
  const picked = await dialog.showSaveDialog({
    title: '프리셋 내보내기',
    // 지난번에 내보낸 폴더에서 시작한다. 파일 이름은 언제나 새로 제안한다
    defaultPath: dir ? join(dir, suggested) : suggested,
    filters: [{ name: 'endcredit 프리셋', extensions: [EXPORT_EXT] }]
  })
  if (picked.canceled || !picked.filePath) return null
  rememberDir('preset', picked.filePath)

  const entries: ZipEntry[] = [
    { name: DECK_ENTRY, data: Buffer.from(JSON.stringify(deck, null, 2), 'utf8') },
    {
      // 사람이 열어봤을 때 뭔지 알 수 있게. 읽을 때는 쓰지 않는다.
      name: 'about.json',
      data: Buffer.from(
        JSON.stringify(
          { app: 'endcredit', format: EXPORT_EXT, formatVersion: 1, name: deck.name },
          null,
          2
        ),
        'utf8'
      )
    }
  ]

  const missing: string[] = []
  for (const file of referencedAssets(deck)) {
    const bytes = readAssetBytes(file)
    if (!bytes) {
      missing.push(file)
      continue
    }
    entries.push({ name: ASSET_DIR + file, data: bytes })
  }

  writeFileAtomic(picked.filePath, zipSync(entries))
  return { path: picked.filePath, assets: entries.length - 2, missing }
}

export interface ImportResult {
  deck: Deck
  assets: number
  name: string
}

export async function importPreset(): Promise<ImportResult | null> {
  const picked = await dialog.showOpenDialog({
    title: '프리셋 가져오기',
    defaultPath: lastDir('preset'),
    properties: ['openFile'],
    filters: [
      { name: 'endcredit 프리셋', extensions: [EXPORT_EXT, 'zip'] },
      { name: '프리셋 JSON', extensions: ['json'] }
    ]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null
  const src = picked.filePaths[0]
  rememberDir('preset', src)

  // JSON 하나만 받은 경우도 받아준다 — 에셋이 없을 뿐 못 읽을 이유가 없다
  if (src.toLowerCase().endsWith('.json')) {
    const deck = toDeck(JSON.parse(readFileSync(src, 'utf8')))
    saveDeckAs(deck, deck.name || basename(src, '.json'))
    return { deck, assets: 0, name: deck.name }
  }

  const entries = unzipSync(readFileSync(src))
  const deckEntry = entries.find((e) => e.name === DECK_ENTRY)
  if (!deckEntry) throw new Error('프리셋 파일 안에 deck.json 이 없습니다.')

  // 에셋을 먼저 들여놓고, 이름이 바뀐 것만 문서에 반영한다
  const renamed = new Map<string, string>()
  let count = 0
  for (const e of entries) {
    if (!e.name.startsWith(ASSET_DIR) || e.name.endsWith('/')) continue
    const original = e.name.slice(ASSET_DIR.length)
    const stored = storeAssetBytes(original, e.data)
    if (stored.file !== original) renamed.set(original, stored.file)
    count += 1
  }

  const deck = rewriteAssetNames(toDeck(JSON.parse(deckEntry.data.toString('utf8'))), renamed)
  saveDeckAs(deck, deck.name || basename(src, `.${EXPORT_EXT}`))
  return { deck, assets: count, name: deck.name }
}

import { deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * 아주 작은 ZIP 읽기/쓰기.
 *
 * `.ecpreset` 은 프리셋 JSON + 참조된 이미지·소리를 담은 zip 이다. 이것 하나 때문에
 * 의존성을 늘리기보다, 필요한 만큼만 직접 쓴다 — 쓰는 기능은 **압축 저장(deflate) 하나**뿐이고
 * zip64·암호화·분할은 다루지 않는다. 프리셋은 그런 크기가 될 수 없다.
 *
 * 결과물은 표준 zip 이라 탐색기에서 그대로 열어 안을 확인할 수 있다.
 */

export interface ZipEntry {
  /** zip 안에서의 경로. 항상 `/` 를 쓴다 */
  name: string
  data: Buffer
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

/** UTF-8 파일명임을 알리는 플래그. 한글 파일명이 깨지지 않게 하려면 필요하다. */
const FLAG_UTF8 = 0x0800
/** 1980-01-01 — 시각을 넣지 않아 같은 입력이면 같은 파일이 나온다 */
const DOS_TIME = 0
const DOS_DATE = 0x0021

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipSync(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const packed = deflateRawSync(raw)
    // 압축이 되레 커지는 파일(이미 압축된 png·mp3)은 그대로 담는다
    const store = packed.length >= raw.length
    const body = store ? raw : packed
    const method = store ? 0 : 8
    const crc = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra
    locals.push(local, name, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(CENTRAL_SIG, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(FLAG_UTF8, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30) // extra
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attrs
    central.writeUInt32LE(0, 38) // external attrs
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + body.length
  }

  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(EOCD_SIG, 0)
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...locals, centralBuf, end])
}

export function unzipSync(buf: Buffer): ZipEntry[] {
  // EOCD 는 끝에 있지만 주석이 뒤에 붙을 수 있어 뒤에서부터 찾는다
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip 형식이 아닙니다 (끝 표시를 찾지 못했습니다).')

  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  const out: ZipEntry[] = []

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== CENTRAL_SIG) throw new Error('zip 목록이 손상되었습니다.')
    const method = buf.readUInt16LE(at + 10)
    const crc = buf.readUInt32LE(at + 16)
    const csize = buf.readUInt32LE(at + 20)
    const usize = buf.readUInt32LE(at + 24)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const localAt = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen

    // 실제 데이터 위치는 로컬 헤더의 이름·extra 길이를 읽어야 알 수 있다
    // (중앙 목록의 extra 길이와 다를 수 있다)
    if (buf.readUInt32LE(localAt) !== LOCAL_SIG) throw new Error('zip 항목이 손상되었습니다.')
    const lNameLen = buf.readUInt16LE(localAt + 26)
    const lExtraLen = buf.readUInt16LE(localAt + 28)
    const start = localAt + 30 + lNameLen + lExtraLen
    const body = buf.subarray(start, start + csize)

    const data = method === 0 ? Buffer.from(body) : inflateRawSync(body)
    if (data.length !== usize || crc32(data) !== crc) {
      throw new Error(`'${name}' 의 내용이 손상되었습니다.`)
    }
    out.push({ name, data })
  }

  return out
}

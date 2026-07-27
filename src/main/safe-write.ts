import { renameSync, unlinkSync, writeFileSync } from 'node:fs'

/**
 * 덮어쓰다 죽어도 원본이 남게 쓴다.
 *
 * `writeFileSync` 는 대상 파일을 **먼저 비우고** 채운다. 그 사이에 앱이 죽거나 디스크가
 * 차면 파일이 반쪽으로 남고, 다음 실행에서 JSON 파싱이 실패해 기본 문서로 되돌아간다 —
 * **크레딧 전부를 잃는 경로가 실제로 여기서 시작한다.**
 *
 * 임시 파일에 다 쓴 뒤 이름만 바꾸면, 어느 시점에 죽든 파일은 옛것이거나 새것이다.
 * (윈도우의 `rename` 도 기존 파일을 덮어쓴다)
 */
export function writeFileAtomic(path: string, data: string | Buffer): void {
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, data)
    renameSync(tmp, path)
  } catch (err) {
    // 임시 파일을 남기면 다음 저장 때 또 걸리적거린다
    try {
      unlinkSync(tmp)
    } catch {
      /* 이미 없으면 그걸로 됐다 */
    }
    throw err
  }
}

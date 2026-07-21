import { contextBridge, ipcRenderer } from 'electron'

/**
 * 숨김 수집기 창 전용 브리지.
 * 메인 창의 preload(index.ts) 와 완전히 분리한다 — 수집기에 에디터 API 를 줄 이유가 없다.
 */
contextBridge.exposeInMainWorld('__collector', {
  /** 메인에게 시작 설정(토큰·클라이언트 키)을 요청한다. */
  requestStart: (): Promise<{ accessToken: string; clientId: string; clientSecret: string }> =>
    ipcRenderer.invoke('collector:request-start'),

  ready: (): void => ipcRenderer.send('collector:ready'),
  event: (action: string, payload: unknown): void =>
    ipcRenderer.send('collector:event', action, payload),
  closed: (info: unknown): void => ipcRenderer.send('collector:closed', info),
  failed: (code: string, message: string): void =>
    ipcRenderer.send('collector:failed', code, message),
  log: (level: string, message: string, detail: unknown): void =>
    ipcRenderer.send('collector:log', level, message, detail),

  onStop: (fn: () => void): void => {
    ipcRenderer.on('collector:stop', () => fn())
  }
})

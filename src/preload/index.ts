import { contextBridge, ipcRenderer } from 'electron'
import type { AuthState, ServerStatus } from '@shared/types'
import type { CollectorStatus, RawEvent, SessionStats } from '@shared/events'
import type { CreditData } from '@shared/aggregate'
import type { Deck } from '@shared/deck'
import type { OverlayInfo } from '@shared/overlay'
import type { CustomEffect } from '@shared/custom-effect'

/** 효과 편집기 창이 돌려주는 답 */
export type FxResult =
  | { action: 'save'; effect: CustomEffect }
  | { action: 'delete'; effect: CustomEffect }
  | { action: 'cancel' }

const api = {
  auth: {
    get: (): Promise<AuthState> => ipcRenderer.invoke('auth:get'),
    login: (): Promise<void> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
    retry: (): Promise<void> => ipcRenderer.invoke('auth:retry'),
    onChange: (fn: (s: AuthState) => void): (() => void) => {
      const handler = (_e: unknown, s: AuthState): void => fn(s)
      ipcRenderer.on('auth:changed', handler)
      return () => ipcRenderer.off('auth:changed', handler)
    }
  },
  server: {
    status: (): Promise<ServerStatus> => ipcRenderer.invoke('server:status')
  },
  collector: {
    get: (): Promise<{ status: CollectorStatus; stats: SessionStats | null }> =>
      ipcRenderer.invoke('collector:get'),
    start: (): Promise<void> => ipcRenderer.invoke('collector:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('collector:stop'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('collector:open-folder'),
    onStatus: (fn: (s: CollectorStatus, stats: SessionStats | null) => void): (() => void) => {
      const handler = (_e: unknown, s: CollectorStatus, st: SessionStats | null): void => fn(s, st)
      ipcRenderer.on('collector:status', handler)
      return () => ipcRenderer.off('collector:status', handler)
    },
    onEvent: (fn: (e: RawEvent) => void): (() => void) => {
      const handler = (_e: unknown, ev: RawEvent): void => fn(ev)
      ipcRenderer.on('collector:tap', handler)
      return () => ipcRenderer.off('collector:tap', handler)
    }
  },
  credit: {
    get: (): Promise<CreditData> => ipcRenderer.invoke('credit:get'),
    replay: (sessionId: string): Promise<CreditData> =>
      ipcRenderer.invoke('credit:replay', sessionId),
    onChange: (fn: (d: CreditData) => void): (() => void) => {
      const handler = (_e: unknown, d: CreditData): void => fn(d)
      ipcRenderer.on('credit:changed', handler)
      return () => ipcRenderer.off('credit:changed', handler)
    }
  },
  overlay: {
    state: (): Promise<OverlayInfo> => ipcRenderer.invoke('overlay:state'),
    play: (): Promise<void> => ipcRenderer.invoke('overlay:play'),
    stop: (): Promise<void> => ipcRenderer.invoke('overlay:stop'),
    restart: (): Promise<void> => ipcRenderer.invoke('overlay:restart'),
    setSample: (on: boolean): Promise<void> => ipcRenderer.invoke('overlay:sample', on),
    /** 미리보기가 끝까지 재생했음을 알린다 (세대가 어긋나면 메인이 무시한다) */
    finished: (generation: number): Promise<void> =>
      ipcRenderer.invoke('overlay:finished', generation),
    getDeck: (): Promise<Deck> => ipcRenderer.invoke('overlay:deck:get'),
    setDeck: (d: Deck): Promise<void> => ipcRenderer.invoke('overlay:deck:set', d),
    resetDeck: (): Promise<{ deck: Deck; backup: string | null }> =>
      ipcRenderer.invoke('overlay:deck:reset'),
    /** 완전히 빈 문서로 시작 */
    newDeck: (): Promise<{ deck: Deck; backup: string | null }> =>
      ipcRenderer.invoke('overlay:deck:new'),
    onChange: (fn: (s: OverlayInfo) => void): (() => void) => {
      const handler = (_e: unknown, s: OverlayInfo): void => fn(s)
      ipcRenderer.on('overlay:changed', handler)
      return () => ipcRenderer.off('overlay:changed', handler)
    }
  },
  presets: {
    list: (): Promise<{ file: string; name: string }[]> => ipcRenderer.invoke('presets:list'),
    saveAs: (name: string): Promise<{ file: string; name: string }> =>
      ipcRenderer.invoke('presets:save-as', name),
    load: (file: string): Promise<Deck> => ipcRenderer.invoke('presets:load', file),
    remove: (file: string): Promise<void> => ipcRenderer.invoke('presets:remove', file),
    openFolder: (): Promise<void> => ipcRenderer.invoke('presets:open-folder'),
    /** 에셋까지 한 덩어리로 내보낸다 (.ecpreset). 취소하면 null. */
    exportFile: (): Promise<{ path: string; assets: number; missing: string[] } | null> =>
      ipcRenderer.invoke('presets:export'),
    importFile: (): Promise<{ deck: Deck; assets: number; name: string } | null> =>
      ipcRenderer.invoke('presets:import')
  },
  app: {
    info: (): Promise<{
      remoteUrl: string
      overlayUrl: string
      hotkeys: { accelerator: string; label: string; registered: boolean }[]
    }> => ipcRenderer.invoke('app:info'),
    /** 기본 브라우저로 연다 (소리 받는 사이트 등) */
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('app:open-url', url)
  },
  /**
   * 효과 편집기 창.
   *
   * 편집 화면 쪽은 `open()` 하나만 쓰면 되고, 편집기 창 쪽은 `ready`·`onLoad`·`done` 을 쓴다.
   * 같은 preload 를 두 창이 공유하므로 한자리에 모아둔다.
   */
  fx: {
    /** 창을 띄우고 사용자가 닫을 때까지 기다린다 */
    open: (effect: CustomEffect, fresh: boolean): Promise<FxResult> =>
      ipcRenderer.invoke('fx:open', effect, fresh),
    /** (편집기 창) 다 그렸으니 편집할 효과를 달라 */
    ready: (): void => ipcRenderer.send('fx:ready'),
    onLoad: (fn: (effect: never, fresh: boolean) => void): (() => void) => {
      const h = (_e: unknown, p: { effect: never; fresh: boolean }): void => fn(p.effect, p.fresh)
      ipcRenderer.on('fx:load', h)
      return () => ipcRenderer.off('fx:load', h)
    },
    /** (편집기 창) 저장·삭제·취소 — 부른 쪽의 기다림이 여기서 풀린다 */
    done: (r: FxResult): void => ipcRenderer.send('fx:done', r)
  },
  assets: {
    pickImage: (): Promise<{ file: string; url: string; sizeBytes: number } | null> =>
      ipcRenderer.invoke('assets:pick-image'),
    pickAudio: (): Promise<{ file: string; url: string; sizeBytes: number } | null> =>
      ipcRenderer.invoke('assets:pick-audio'),
    list: (): Promise<{ file: string; url: string; sizeBytes: number }[]> =>
      ipcRenderer.invoke('assets:list')
  }
}

contextBridge.exposeInMainWorld('endcredit', api)

export type EndcreditApi = typeof api

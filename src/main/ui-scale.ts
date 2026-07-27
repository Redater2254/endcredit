import { BrowserWindow, screen } from 'electron'
import { getSettings, patchSettings } from './settings'

/**
 * 화면 배율에 맞춰 앱 UI 크기를 정한다.
 *
 * 이 앱의 껍데기는 전부 고정 px 다 — 글자 14px, 도구 버튼 34px, 도크 330px.
 * 그래서 **화면이 넓어질수록 물리적으로 작아진다.** 4K 를 175% 로 쓰면 14px 이
 * 실제 24.5px 이라 읽을 만하지만, 같은 4K 를 100% 로 내리면 14px 그대로라
 * 깨알같이 작아진다. 반대로 1366 노트북에서는 껍데기가 자리를 다 먹어
 * 정작 캔버스가 남지 않는다.
 *
 * CSS 로는 못 고친다. `rem` 은 루트 16px 에 묶여 있고 화면 크기를 모르기 때문이다.
 * Chromium 의 줌(`setZoomFactor`)을 쓰면 **CSS px 자체가 늘어난다** — 즉
 * `getBoundingClientRect` 같은 좌표 계산이 전부 같은 자에 맞춰 따라오므로,
 * 캔버스 위에서 요소를 집는 자리가 어긋나지 않는다. (`document.zoom` 이나
 * `transform: scale` 로 하면 좌표계가 갈라져서 정확히 그 사고가 난다)
 *
 * 기준을 **창이 아니라 화면 크기**로 잡는 것이 중요하다. 창 크기로 잡으면
 * 창을 줄일 때마다 글자가 출렁여서 못 쓴다.
 */

/** `'auto'` 면 화면에 맞춰 앱이 정한다. 숫자면 사용자가 고른 값. */
export type UiScale = 'auto' | number

/** 고를 수 있는 값 — 화면에 그대로 보여준다 */
export const UI_SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const

/**
 * 화면 폭(CSS px)에 따른 자동 배율.
 *
 * 계단식인 이유는 **예측 가능해야** 하기 때문이다. 연속 함수로 하면 모니터마다
 * 1.03 · 0.97 처럼 어중간한 값이 나와서, 같은 앱이 화면마다 미묘하게 달라 보인다.
 * 1800~2559 를 1.0 으로 둔 것은 1920 과 2194(4K@175%) 를 **둘 다 지금 그대로**
 * 두기 위해서다 — 잘 쓰고 있던 화면이 업데이트 한 번에 바뀌면 그게 더 나쁘다.
 */
export function autoScaleFor(widthCss: number): number {
  if (widthCss >= 3200) return 1.5
  if (widthCss >= 2560) return 1.25
  if (widthCss >= 1800) return 1
  if (widthCss >= 1400) return 0.9
  return 0.8
}

/** 그 창이 **지금 놓여 있는** 화면의 CSS px 크기 */
function displayWidth(win: BrowserWindow): number {
  try {
    // getBounds 는 DIP(=CSS px) 이므로 앱 줌이 섞이지 않는다. 줌 값으로 줌을
    // 정하면 되먹임이 생겨 배율이 계속 기어간다 — 그래서 렌더러가 아니라 여기서 잰다
    return screen.getDisplayMatching(win.getBounds()).size.width
  } catch {
    return 1920
  }
}

export function getUiScaleSetting(): UiScale {
  const v = getSettings().uiScale
  if (v === 'auto' || v === undefined) return 'auto'
  return typeof v === 'number' && v >= 0.5 && v <= 2 ? v : 'auto'
}

/** 지금 창에 실제로 걸려 있어야 할 배율 */
export function resolveUiScale(win: BrowserWindow): number {
  const set = getUiScaleSetting()
  return set === 'auto' ? autoScaleFor(displayWidth(win)) : set
}

export function applyUiScale(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const z = resolveUiScale(win)
  if (win.webContents.getZoomFactor() !== z) win.webContents.setZoomFactor(z)
}

export function setUiScale(win: BrowserWindow, v: UiScale): void {
  patchSettings({ uiScale: v })
  applyUiScale(win)
}

/**
 * 창이 다른 모니터로 옮겨지면 다시 맞춘다.
 *
 * 사용자가 겪는 상황이 정확히 이것이다 — 4K 주 모니터에서 편집하다가 보조
 * 모니터로 창을 끌고 가면, 자동 배율이 안 따라올 경우 그 순간 화면이 무너진다.
 */
export function watchUiScale(win: BrowserWindow): void {
  const sync = (): void => applyUiScale(win)
  win.on('moved', sync)
  // 줌은 페이지를 새로 읽으면 초기화된다 (개발 중 새로고침 포함)
  win.webContents.on('did-finish-load', sync)
  screen.on('display-metrics-changed', sync)
  screen.on('display-added', sync)
  screen.on('display-removed', sync)

  /*
   * `screen` 은 앱과 수명이 같으므로 여기 건 것을 **반드시 떼야 한다.**
   * 효과 편집기처럼 여닫는 창이면 닫힌 창을 붙든 콜백이 계속 쌓이고,
   * 모니터를 하나 뽑는 순간 죽은 창에 접근해 예외가 난다.
   */
  win.on('closed', () => {
    screen.off('display-metrics-changed', sync)
    screen.off('display-added', sync)
    screen.off('display-removed', sync)
  })

  sync()
}

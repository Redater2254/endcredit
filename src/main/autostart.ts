import { app } from 'electron'
import type { AutoStartState } from '@shared/types'

/**
 * 윈도우를 켤 때 endcredit 을 함께 띄운다.
 *
 * 이 앱은 **켜져 있어야만 쓸모가 있다** — 수집기도 오버레이도 전역 단축키도 전부
 * 앱이 살아 있는 동안에만 돈다. 컴퓨터를 켠 날 앱을 켜는 걸 잊으면 그날 채팅은
 * 통째로 사라지고, 방송이 끝난 뒤에야 알게 된다. 되돌릴 방법이 없다.
 */

/** 자동 실행으로 켜졌다는 표시. 이때는 창을 띄우지 않고 트레이에서 시작한다. */
export const HIDDEN_ARG = '--hidden'

export function startedHidden(): boolean {
  return process.argv.includes(HIDDEN_ARG)
}

/**
 * 지금 켜져 있는가.
 *
 * **`openAtLogin` 을 쓰면 안 된다.** 윈도우에서 그 값은 등록된 명령줄이 `args` 와
 * 글자까지 같을 때만 참이다 — 우리는 `--hidden` 을 붙여 등록하므로, 인자 없이 물어보면
 * 켜 놓고도 항상 거짓이 나온다. 실제로 트레이 체크가 늘 꺼져 보이던 이유였다.
 * `executableWillLaunchAtLogin` 은 인자를 무시하고 "이 실행 파일이 로그인 때 뜨는가" 만 본다.
 */
function isEnabled(): boolean {
  return app.getLoginItemSettings().executableWillLaunchAtLogin
}

export function autoStartState(): AutoStartState {
  if (process.platform !== 'win32') {
    return { enabled: false, available: false, reason: '윈도우에서만 되는 기능입니다.' }
  }
  /*
   * 개발 중에는 `process.execPath` 가 `node_modules/electron/dist/electron.exe` 다.
   * 그대로 등록하면 컴퓨터를 켤 때마다 **빈 Electron 창**이 뜬다. 켜지 못하게 막는다.
   */
  if (!app.isPackaged) {
    return {
      enabled: false,
      available: false,
      reason: '개발 모드에서는 설정할 수 없습니다 — 설치한 endcredit 에서 켜세요.'
    }
  }
  return { enabled: isEnabled(), available: true }
}

export function setAutoStart(on: boolean): AutoStartState {
  const before = autoStartState()
  if (!before.available) return before

  try {
    // 로그인하자마자 트레이에 들어가 있게 한다 — 창이 튀어나오면 매일 아침 성가시다
    app.setLoginItemSettings({ openAtLogin: on, args: [HIDDEN_ARG] })
  } catch (err) {
    console.warn('[autostart] 설정 실패:', err)
    return {
      enabled: isEnabled(),
      available: true,
      reason: err instanceof Error ? err.message : String(err)
    }
  }

  /*
   * **읽어서 확인한다.** `setLoginItemSettings` 는 조용히 실패한다 — 보안 프로그램이
   * 시작 프로그램 등록을 막거나, 회사 정책이 걸려 있으면 예외 없이 그냥 안 걸린다.
   * 화면에는 켜졌다고 뜨는데 다음 부팅 때 안 뜨는 것이 제일 나쁘다.
   */
  const after = autoStartState()
  if (after.enabled !== on) {
    return {
      ...after,
      reason:
        '윈도우가 이 설정을 받지 않았습니다 — 보안 프로그램이나 회사 정책이 ' +
        '시작 프로그램 등록을 막고 있을 수 있습니다.'
    }
  }
  return after
}

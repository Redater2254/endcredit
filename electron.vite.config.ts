import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

/**
 * 앱 버전은 `package.json` **한 곳**에만 적는다.
 *
 * 자동 업데이트가 이 값으로 새 버전을 판단하므로, 화면에 보이는 버전이 여기서 어긋나면
 * "화면엔 beta 인데 업데이트는 0.3.0 을 말하는" 꼴이 된다. 빌드할 때 박아 넣어서
 * 어긋날 여지를 없앤다.
 */
const define = { __APP_VERSION__: JSON.stringify(pkg.version) }

export default defineConfig({
  main: {
    define,
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    // main·renderer 와 같은 것을 준다. 지금은 전부 `import type` 이라 지워져서 통과하지만,
    // 값 하나만 가져오는 순간 빌드가 깨진다 — 그때 원인을 찾느니 미리 맞춰 둔다.
    define,
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          collector: resolve(__dirname, 'src/preload/collector.ts')
        }
      }
    }
  },
  renderer: {
    define,
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // OBS 브라우저 소스가 여는 페이지. Express 가 /overlay 로 서빙한다.
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
          // 효과 편집기 — 키보드 다툼을 피하려고 아예 별도 창이다
          fx: resolve(__dirname, 'src/renderer/fx.html')
        }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    plugins: [react()]
  }
})

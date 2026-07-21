import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          // OBS 브라우저 소스가 여는 페이지. Express 가 /overlay 로 서빙한다.
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    plugins: [react()]
  }
})

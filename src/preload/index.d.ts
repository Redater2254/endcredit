import type { EndcreditApi } from './index'

declare global {
  interface Window {
    endcredit: EndcreditApi
  }
}

export {}

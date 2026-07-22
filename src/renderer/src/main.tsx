import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { MOTION_KEYFRAMES } from '@shared/DeckRenderer'

// 테마는 **그리기 전에** 정해야 한다. useEffect 로 미루면 밝은 테마를 쓰는 사람이
// 앱을 열 때마다 어두운 화면이 한 프레임 번쩍이고 지나간다.
document.documentElement.dataset.theme = localStorage.getItem('ui:theme') || 'dark'

// 모션 키프레임은 오버레이와 미리보기가 같은 정의를 쓴다
const style = document.createElement('style')
style.textContent = MOTION_KEYFRAMES
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

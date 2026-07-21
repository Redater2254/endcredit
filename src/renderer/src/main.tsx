import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { MOTION_KEYFRAMES } from '@shared/DeckRenderer'

// 모션 키프레임은 오버레이와 미리보기가 같은 정의를 쓴다
const style = document.createElement('style')
style.textContent = MOTION_KEYFRAMES
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

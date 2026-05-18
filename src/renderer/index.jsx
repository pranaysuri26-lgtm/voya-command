import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App'
import { installWebAPI } from './webAPI'

// In Electron, preload.js injects window.vondrerAPI via contextBridge before this
// script runs. In a browser there's no preload, so install the browser-native
// HTTP/WS implementation instead.
if (typeof window !== 'undefined' && !window.vondrerAPI) {
  installWebAPI()
}

// Add 'electron' class to <html> before first render so CSS can apply
// macOS traffic-light padding only in Electron, not in the browser.
if (typeof window !== 'undefined' && !window.__VONDRER_WEB__) {
  document.documentElement.classList.add('electron')
}

const root = createRoot(document.getElementById('root'))
root.render(<App />)

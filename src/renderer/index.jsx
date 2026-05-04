import { createRoot } from 'react-dom/client'
import './styles/app.css'
import App from './App'
import { installWebAPI } from './webAPI'

// In Electron, preload.js injects window.voyaAPI via contextBridge before this
// script runs. In a browser there's no preload, so install the browser-native
// HTTP/WS implementation instead.
if (typeof window !== 'undefined' && !window.voyaAPI) {
  installWebAPI()
}

const root = createRoot(document.getElementById('root'))
root.render(<App />)

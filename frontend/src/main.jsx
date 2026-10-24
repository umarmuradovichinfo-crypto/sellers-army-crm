import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import CrmApp from './CrmApp'
import { AuthProvider } from './context/AuthContext'
import { DialogHost } from './components/Dialog'
import './styles.css'
import './responsive.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CrmApp />
        <DialogHost />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// PWA service worker — telefonga o'rnatish va offline uchun
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

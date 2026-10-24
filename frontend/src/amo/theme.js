// amoCRM mavzusi: data-color-scheme="dark" (amoCRM "amo" skin) yoki yorug'.
import './palette.css'
import './base.css'
import './shell.css'

const KEY = 'amo_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' }
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'dark') root.setAttribute('data-color-scheme', 'dark')
  else root.removeAttribute('data-color-scheme')
  try { localStorage.setItem(KEY, theme) } catch { /* */ }
}

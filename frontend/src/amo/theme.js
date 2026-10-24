// amoCRM mavzusi: data-color-scheme="dark" (amoCRM "amo" skin) yoki yorug'.
import './palette.css'
import './base.css'
import './shell.css'

const KEY = 'amo_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' }
}

// 'auto' — tizim mavzusi (prefers-color-scheme) bo'yicha, o'zgarsa darhol almashadi (amoCRM "auto")
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
let current = null
function paint(theme) {
  const dark = theme === 'dark' || (theme === 'auto' && (!mq || mq.matches))
  const root = document.documentElement
  if (dark) root.setAttribute('data-color-scheme', 'dark')
  else root.removeAttribute('data-color-scheme')
}
if (mq) mq.addEventListener?.('change', () => { if (current === 'auto') paint('auto') })

export function applyTheme(theme) {
  current = theme
  paint(theme)
  try { localStorage.setItem(KEY, theme) } catch { /* */ }
}

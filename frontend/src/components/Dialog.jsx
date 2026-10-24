// ====== Modal dialog tizimi (native confirm/prompt/alert o'rniga) ======
// Foydalanish: import { dialog } from '../components/Dialog'
//   if (await dialog.confirm('O`chirilsinmi?', { danger: true })) { ... }
//   const name = await dialog.prompt('Nom:', 'standart')   // null = bekor
//   await dialog.alert('Xabar')
import React, { useEffect, useState } from 'react'

let listener = null
let resolver = null

function open(cfg) {
  return new Promise((resolve) => {
    resolver = resolve
    if (listener) listener(cfg)
    else resolve(cfg.type === 'confirm' ? false : cfg.type === 'prompt' ? null : undefined)
  })
}

export const dialog = {
  confirm: (message, opts = {}) => open({ type: 'confirm', message, ...opts }),
  prompt: (message, defaultValue = '', opts = {}) => open({ type: 'prompt', message, defaultValue, ...opts }),
  alert: (message, opts = {}) => open({ type: 'alert', message, ...opts }),
}

// Dizayn tokenlari — dialog .app'dan tashqarida render bo'lgani uchun
// CSS o'zgaruvchilarini shu yerda belgilaymiz (aks holda fon shaffof bo'ladi).
const TOKENS = {
  '--lime': '#D7F904', '--ink': '#373435', '--ink2': '#2B2A28', '--ink3': '#1E1D1B',
  '--canvas': '#F3F4EF', '--card': '#fff', '--bd': '#E6E8E0', '--bd2': '#EFF0EA',
  '--mut': '#8B8E84', '--mut2': '#B6B9AE', '--ok': '#46B17B', '--warn': '#D9952E',
  '--dang': '#DE5147', '--info': '#3F77DD',
}

export function DialogHost() {
  const [state, setState] = useState(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    listener = (cfg) => { setValue(cfg.defaultValue || ''); setState(cfg) }
    return () => { listener = null }
  }, [])

  if (!state) return null

  const finish = (result) => {
    setState(null)
    if (resolver) { resolver(result); resolver = null }
  }
  const onCancel = () => finish(state.type === 'confirm' ? false : state.type === 'prompt' ? null : undefined)
  const onOk = () => finish(state.type === 'confirm' ? true : state.type === 'prompt' ? value : undefined)

  const isDanger = state.danger ?? (state.type === 'confirm' && /o.?chir/i.test(state.message || ''))
  const title = state.title || (state.type === 'confirm' ? 'Tasdiqlang' : state.type === 'prompt' ? 'Kiriting' : 'Eslatma')
  const okText = state.okText || (state.type === 'confirm' ? (isDanger ? "O'chirish" : 'Ha') : 'OK')

  const overlay = {
    ...TOKENS,
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
    background: 'rgba(15,15,18,.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, fontFamily: "'Manrope', system-ui, sans-serif",
  }
  const box = {
    width: '100%', maxWidth: 400, background: '#fff', color: '#373435',
    borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.35)', overflow: 'hidden',
  }
  const okBtn = isDanger
    ? { background: '#DE5147', borderColor: '#DE5147', color: '#fff' }
    : { background: '#D7F904', borderColor: '#D7F904', color: '#1E1D1B' }

  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={box} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '18px 22px 0', font: "700 16px 'Space Grotesk', sans-serif" }}>
          <span>{title}</span>
          <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 0, fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#8B8E84' }}>×</button>
        </div>
        <div style={{ padding: '12px 22px 6px', fontSize: 14, lineHeight: 1.55, color: '#373435', whiteSpace: 'pre-wrap' }}>
          {state.message}
          {state.type === 'prompt' && (
            <input
              className="hr-input"
              autoFocus
              value={value}
              placeholder={state.placeholder || ''}
              style={{ marginTop: 12 }}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel() }}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 22px 20px' }}>
          {state.type !== 'alert' && (
            <button className="btn" style={{ background: '#fff', border: '1px solid #E6E8E0', color: '#373435' }} onClick={onCancel}>{state.cancelText || 'Bekor'}</button>
          )}
          <button className="btn" style={okBtn} onClick={onOk}>{okText}</button>
        </div>
      </div>
    </div>
  )
}

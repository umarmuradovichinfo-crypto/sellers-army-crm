// Mavjud bo'lmagan manzil: jim yo'naltirish o'rniga 404 sahifasi (qaytish havolalari bilan)
import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useT } from './i18n'

export default function NotFound() {
  const t = useT()
  const { pathname } = useLocation()
  return (
    <div style={{ padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, fontWeight: 700, color: '#92989b' }}>404</div>
      <h2 style={{ margin: '8px 0' }}>{t('nf§Sahifa topilmadi')}</h2>
      <p style={{ color: '#92989b' }}>{t('nf§Bunday manzil mavjud emas')}: <code>{pathname}</code></p>
      <p><Link to="/dashboard">{t('nf§Ish stoliga qaytish')}</Link></p>
    </div>
  )
}

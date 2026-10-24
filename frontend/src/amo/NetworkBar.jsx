// Tarmoq nazoratchisi bannerи: ekran tepasida yupqa chiziq (offline / server-unreachable / tiklandi).
import React, { useEffect, useRef, useState } from 'react'
import { getState, subscribe } from '../lib/network'
import { pendingQueue } from '../lib/apiClient'
import { useT } from './i18n'
import './i18n/network.ru'
import './network.css'

export default function NetworkBar() {
  const t = useT()
  const [net, setNet] = useState(getState())
  const [q, setQ] = useState(pendingQueue.status())
  const [mode, setMode] = useState(null) // 'offline' | 'server' | 'restored' | null
  const [shown, setShown] = useState(false)
  const hideT = useRef(null)
  const wasBad = useRef(getState() !== 'online')

  useEffect(() => subscribe(setNet), [])
  useEffect(() => pendingQueue.subscribe(setQ), [])

  useEffect(() => {
    clearTimeout(hideT.current)
    if (net === 'offline' || net === 'server-unreachable') {
      wasBad.current = true
      setMode(net === 'offline' ? 'offline' : 'server')
      setTimeout(() => setShown(true), 20)
    } else if (wasBad.current) {
      wasBad.current = false
      setMode('restored')
      setShown(true)
      hideT.current = setTimeout(() => { setShown(false); hideT.current = setTimeout(() => setMode(null), 300) }, 3000)
    }
    return () => clearTimeout(hideT.current)
  }, [net])

  if (!mode) return null
  let text
  if (mode === 'offline') {
    text = t("Internet aloqasi yo'q. O'zgarishlar saqlanib turadi va aloqa qaytganda yuboriladi") + ` (${q.size} ` + t('ta kutilmoqda') + ')'
  } else if (mode === 'server') {
    text = t('Server bilan aloqa yo\'q, qayta urinilmoqda…')
  } else if (q.sending) {
    text = t('Kutilayotgan o\'zgarishlar yuborilmoqda') + ` ${q.done}/${q.total}`
  } else {
    text = t('Aloqa tiklandi')
  }
  const pct = q.sending && q.total ? Math.round((q.done / q.total) * 100) : 0

  return (
    <div className={`ac-net ac-net--${q.sending && mode === 'restored' ? 'sending' : mode} ${shown ? 'ac-net--show' : ''}`} role="status">
      {mode === 'server' && <span className="ac-spinner ac-net__spin" />}
      <span className="ac-net__text">{text}</span>
      {q.sending && <span className="ac-net__progress" style={{ width: pct + '%' }} />}
    </div>
  )
}

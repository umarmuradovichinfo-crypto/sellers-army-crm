import React, { useState, useEffect } from 'react'
import { Loading } from '../ui'
import { useCachedState } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'

function ago(iso) {
  const d = new Date(iso); if (isNaN(d)) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'hozir'
  if (s < 3600) return `${Math.floor(s / 60)} daq`
  if (s < 86400) return `${Math.floor(s / 3600)} soat`
  return `${Math.floor(s / 86400)} kun`
}

export default function ConversationsView({ onOpen }) {
  const [items, setItems] = useCachedState('crm:conversations', null)
  const [status, setStatus] = useState({ telegram: false })
  useEffect(() => {
    crmService.conversations().then((r) => setItems(r.conversations || [])).catch(() => setItems([]))
    crmService.chatStatus().then(setStatus).catch(() => {})
  }, [])

  if (items === null) return <Loading />
  return (
    <div style={{ maxWidth: 720 }}>
      {!status.telegram && (
        <div className="card mb16" style={{ fontSize: 13, color: 'var(--mut)' }}>
          ℹ️ Telegram hali sozlanmagan. <b style={{ color: 'var(--ink)' }}>TELEGRAM_BOT_TOKEN</b> qo'shilгach mijozlar bilan shu yerda yozishasiz.
        </div>
      )}
      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Hali suhbat yo'q</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((c) => (
          <div className="card fx ac gap10" key={c.leadId} style={{ cursor: 'pointer' }} onClick={() => onOpen(c.leadId)}>
            <span style={{ fontSize: 22 }}>{c.source === 'Telegram' ? '✈️' : '💬'}</span>
            <div className="f1" style={{ minWidth: 0 }}>
              <div className="fx jb ac"><b style={{ fontSize: 13.5 }}>{c.name}</b><span className="sub2" style={{ fontSize: 11 }}>{ago(c.at)}</span></div>
              <div className="sub2" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.direction === 'out' ? 'Siz: ' : ''}{c.last}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading } from '../ui'
import { useCachedState } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'

function fmtDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return ''
  const M = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
  return `${d.getDate()} ${M[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function UnsortedInbox({ stages = [], members = [], onChanged }) {
  const [items, setItems] = useCachedState('crm:unsorted', null)
  const load = () => crmService.listUnsorted().then((r) => setItems(r.leads || []))
  useEffect(() => { load() }, [])

  const accept = async (l, assigneeId) => {
    try { await crmService.acceptUnsorted(l.id, { assigneeId: assigneeId || undefined, stageKey: l.stage }) ; setItems((xs) => xs.filter((x) => x.id !== l.id)); onChanged && onChanged() }
    catch (e) { await dialog.alert(e.message || 'Xatolik') }
  }
  const reject = async (l) => {
    if (!await dialog.confirm(`"${l.n}" rad etilsinmi (o'chiriladi)?`)) return
    try { await crmService.deleteLead(l.id); setItems((xs) => xs.filter((x) => x.id !== l.id)) }
    catch (e) { await dialog.alert(e.message) }
  }

  if (items === null) return <Loading />

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="sub2 mb16" style={{ fontSize: 13 }}>Formalardan/integratsiyalardan kelgan yangi lidlar. Qabul qiling (mas'ul biriktiring) yoki rad eting.</div>
      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Saralanmagan lid yo'q 🎉</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((l) => (
          <div className="card" key={l.id}>
            <div className="fx jb ac" style={{ marginBottom: 8 }}>
              <div className="f1">
                <b style={{ fontSize: 14 }}>{l.n}</b>
                <div className="sub2" style={{ fontSize: 12, marginTop: 3 }}>
                  {l.phone || '—'}{l.email ? ` · ${l.email}` : ''}{l.formName ? ` · 📝 ${l.formName}` : ''} · {fmtDate(l.createdAt)}
                </div>
              </div>
              <span className="tag">{l.source || 'forma'}</span>
            </div>
            <div className="fx ac gap8">
              <select className="hr-select" style={{ flex: 1 }} defaultValue="" id={`asg-${l.id}`}>
                <option value="">Mas'ulsiz qabul qilish</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="btn sm primary" onClick={() => accept(l, document.getElementById(`asg-${l.id}`)?.value)}><Icon name="check" size={13} />Qabul</button>
              <button className="btn sm" onClick={() => reject(l)} style={{ color: 'var(--dang)' }}>Rad etish</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

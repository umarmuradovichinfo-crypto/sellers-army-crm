import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading } from '../ui'
import { useCachedState } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'

// Kompaniyalar va Kontaktlar (amoCRM kabi lidlardan alohida entitilar)
export default function ContactsView() {
  const [tab, setTab] = useState('companies')
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="fx ac gap8 mb16" style={{ background: 'var(--canvas)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
        <button className={`btn sm ${tab === 'companies' ? 'primary' : ''}`} onClick={() => setTab('companies')}>Kompaniyalar</button>
        <button className={`btn sm ${tab === 'contacts' ? 'primary' : ''}`} onClick={() => setTab('contacts')}>Kontaktlar</button>
      </div>
      {tab === 'companies' ? <Companies /> : <Contacts />}
    </div>
  )
}

function Companies() {
  const [items, setItems] = useCachedState('crm:companies', null)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const load = () => crmService.listCompanies(q).then((r) => setItems(r.companies || []))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q])

  const save = async (f) => {
    try {
      if (f.id) await crmService.updateCompany(f.id, f); else await crmService.createCompany(f)
      setEdit(null); load()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi') }
  }
  const remove = async (c) => { if (!await dialog.confirm(`"${c.name}" o'chirilsinmi?`)) return; await crmService.deleteCompany(c.id); load() }

  return (
    <div>
      <div className="fx ac gap8 mb16">
        <input className="hr-input" style={{ flex: 1 }} placeholder="Kompaniya qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit({ name: '', phone: '', email: '', website: '' })}><Icon name="plus" size={15} />Kompaniya</button>
      </div>
      {items === null ? <Loading /> : (
        <div className="card" style={{ padding: 0 }}>
          {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--mut)' }}>Kompaniya yo'q</div>}
          {items.map((c) => (
            <div key={c.id} className="fx ac gap8" style={{ padding: '10px 14px', borderBottom: '1px solid var(--bd)' }}>
              <div className="f1"><b style={{ fontSize: 13.5 }}>{c.name}</b><div className="sub2" style={{ fontSize: 12 }}>{[c.phone, c.email, c.website].filter(Boolean).join(' · ') || '—'}</div></div>
              <button className="btn sm" onClick={() => setEdit(c)}><Icon name="edit" size={13} /></button>
              <button className="hr-x" onClick={() => remove(c)}>×</button>
            </div>
          ))}
        </div>
      )}
      {edit && <EntityEditor title="Kompaniya" initial={edit} fields={[['name', 'Nomi *'], ['phone', 'Telefon'], ['email', 'Email'], ['website', 'Veb-sayt']]} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function Contacts() {
  const [items, setItems] = useCachedState('crm:contacts', null)
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const load = () => crmService.listContacts(q).then((r) => setItems(r.contacts || []))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [q])

  const save = async (f) => {
    try {
      if (f.id) await crmService.updateContact(f.id, f); else await crmService.createContact(f)
      setEdit(null); load()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi') }
  }
  const remove = async (c) => { if (!await dialog.confirm(`"${c.name}" o'chirilsinmi?`)) return; await crmService.deleteContact(c.id); load() }

  return (
    <div>
      <div className="fx ac gap8 mb16">
        <input className="hr-input" style={{ flex: 1 }} placeholder="Kontakt qidirish…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primary" onClick={() => setEdit({ name: '', phone: '', email: '', position: '' })}><Icon name="plus" size={15} />Kontakt</button>
      </div>
      {items === null ? <Loading /> : (
        <div className="card" style={{ padding: 0 }}>
          {items.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--mut)' }}>Kontakt yo'q</div>}
          {items.map((c) => (
            <div key={c.id} className="fx ac gap8" style={{ padding: '10px 14px', borderBottom: '1px solid var(--bd)' }}>
              <div className="f1"><b style={{ fontSize: 13.5 }}>{c.name}</b><div className="sub2" style={{ fontSize: 12 }}>{[c.position, c.phone, c.email].filter(Boolean).join(' · ') || '—'}</div></div>
              <button className="btn sm" onClick={() => setEdit(c)}><Icon name="edit" size={13} /></button>
              <button className="hr-x" onClick={() => remove(c)}>×</button>
            </div>
          ))}
        </div>
      )}
      {edit && <EntityEditor title="Kontakt" initial={edit} fields={[['name', 'Ism *'], ['position', 'Lavozim'], ['phone', 'Telefon'], ['email', 'Email']]} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function EntityEditor({ title, initial, fields, onClose, onSave }) {
  const [f, setF] = useState(initial)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    if (!f.name?.trim()) { await dialog.alert('Nom majburiy'); return }
    setSaving(true); await onSave(f); setSaving(false)
  }
  return (
    <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer" style={{ maxWidth: 460 }}>
        <div className="hr-dh"><div className="f1"><b style={{ fontSize: 15 }}>{initial.id ? `${title}ni tahrirlash` : `Yangi ${title.toLowerCase()}`}</b></div><button className="hr-x" onClick={onClose}>×</button></div>
        <div className="hr-db">
          {fields.map(([k, label]) => (
            <div className="hr-field" key={k}><label>{label}</label><input className="hr-input" value={f[k] || ''} onChange={(e) => set(k, e.target.value)} /></div>
          ))}
          <div className="fx ac gap10" style={{ paddingTop: 14 }}>
            <button className="btn primary f1" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
            <button className="btn" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  )
}

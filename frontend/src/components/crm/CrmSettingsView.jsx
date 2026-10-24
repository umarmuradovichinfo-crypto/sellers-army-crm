import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading } from '../ui'
import { crmService } from '../../services/crm.service'

const FIELD_TYPES = [
  { v: 'text', l: 'Matn' }, { v: 'textarea', l: 'Uzun matn' }, { v: 'number', l: 'Raqam' },
  { v: 'select', l: 'Ro\'yxat (bitta)' }, { v: 'multiselect', l: 'Ro\'yxat (ko\'p)' },
  { v: 'date', l: 'Sana' }, { v: 'url', l: 'Havola' }, { v: 'checkbox', l: 'Belgi (ha/yo\'q)' },
  { v: 'phone', l: 'Telefon' }, { v: 'email', l: 'Email' },
]

export default function CrmSettingsView({ onChanged }) {
  return (
    <div style={{ maxWidth: 760, display: 'grid', gap: 18 }}>
      <FieldsSection onChanged={onChanged} />
      <ProductsSection />
      <PipelinesSection onChanged={onChanged} />
      <LostReasonsSection />
      <TagsSection />
    </div>
  )
}

function Section({ title, sub, children }) {
  return (
    <div className="card">
      <div style={{ marginBottom: 12 }}><b style={{ fontSize: 14 }}>{title}</b>{sub && <div className="sub2" style={{ fontSize: 12 }}>{sub}</div>}</div>
      {children}
    </div>
  )
}

const FIELD_ENTITIES = [{ v: 'lead', l: 'Bitim' }, { v: 'contact', l: 'Kontakt' }, { v: 'company', l: 'Kompaniya' }]

function FieldsSection({ onChanged }) {
  const [entity, setEntity] = useState('lead')
  const [fields, setFields] = useState(null)
  const [nf, setNf] = useState({ label: '', type: 'text', options: '' })
  const load = () => crmService.listFields(entity).then((r) => setFields(r.fields || []))
  useEffect(() => { setFields(null); load() }, [entity])

  const add = async () => {
    if (!nf.label.trim()) return
    const payload = { entity, label: nf.label.trim(), type: nf.type, options: nf.options ? nf.options.split(',').map((s) => s.trim()).filter(Boolean) : [] }
    try { await crmService.createField(payload); setNf({ label: '', type: 'text', options: '' }); load(); onChanged && onChanged() }
    catch (e) { await dialog.alert(e.message || 'Qo\'shilmadi') }
  }
  const remove = async (f) => {
    if (!await dialog.confirm(`"${f.label}" maydoni o'chirilsinmi?`)) return
    try { await crmService.deleteField(f.id); load(); onChanged && onChanged() } catch (e) { await dialog.alert(e.message) }
  }

  const hasOptions = nf.type === 'select' || nf.type === 'multiselect'
  return (
    <Section title="Maxsus maydonlar" sub="Bitim / Kontakt / Kompaniya kartochkasiga qo'shimcha maydonlar (amoCRM kabi)">
      <div className="fx ac gap8" style={{ background: 'var(--canvas)', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 12 }}>
        {FIELD_ENTITIES.map((e) => <button key={e.v} className={`btn sm ${entity === e.v ? 'primary' : ''}`} onClick={() => setEntity(e.v)}>{e.l}</button>)}
      </div>
      {fields === null ? <Loading /> : <>
      {fields.length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Hali maxsus maydon yo'q</div>}
      {fields.map((f) => (
        <div className="fx ac gap8" key={f.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--bd)' }}>
          <b style={{ flex: 1, fontSize: 13 }}>{f.label}</b>
          <span className="tag">{FIELD_TYPES.find((t) => t.v === f.type)?.l || f.type}</span>
          {f.options?.length > 0 && <span className="sub2" style={{ fontSize: 11 }}>{f.options.join(', ')}</span>}
          <button className="hr-x" onClick={() => remove(f)}>×</button>
        </div>
      ))}
      <div className="fx ac gap8" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <input className="hr-input" style={{ flex: 1, minWidth: 140 }} value={nf.label} placeholder="Maydon nomi" onChange={(e) => setNf((p) => ({ ...p, label: e.target.value }))} />
        <select className="hr-select" style={{ width: 130, flex: 'none' }} value={nf.type} onChange={(e) => setNf((p) => ({ ...p, type: e.target.value }))}>
          {FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        {hasOptions && <input className="hr-input" style={{ flex: 1, minWidth: 140 }} value={nf.options} placeholder="variant1, variant2" onChange={(e) => setNf((p) => ({ ...p, options: e.target.value }))} />}
        <button className="btn primary sm" onClick={add}><Icon name="plus" size={13} />Qo'shish</button>
      </div>
      </>}
    </Section>
  )
}

function fmtSum(v) {
  v = Number(v) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' mlrd'
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' mln'
  if (v >= 1e3) return Math.round(v / 1e3) + ' ming'
  return String(v)
}

function ProductsSection() {
  const [items, setItems] = useState(null)
  const [np, setNp] = useState({ name: '', price: '' })
  const load = () => crmService.listProducts().then((r) => setItems(r.products || []))
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!np.name.trim()) return
    try { await crmService.createProduct({ name: np.name.trim(), price: Number(np.price) || 0 }); setNp({ name: '', price: '' }); load() } catch (e) { await dialog.alert(e.message) }
  }
  const remove = async (p) => { if (!await dialog.confirm(`"${p.name}" o'chirilsinmi?`)) return; try { await crmService.deleteProduct(p.id); load() } catch (e) { await dialog.alert(e.message) } }
  if (items === null) return <Section title="Mahsulotlar"><Loading /></Section>
  return (
    <Section title="Mahsulotlar / kurslar katalogi" sub="Lidga pozitsiya sifatida qo'shiladi, byudjet avto-hisoblanadi">
      {items.length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Hali mahsulot yo'q</div>}
      {items.map((p) => (
        <div className="fx ac gap8" key={p.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--bd)' }}>
          <b style={{ flex: 1, fontSize: 13 }}>{p.name}</b>
          <span className="num" style={{ fontWeight: 700 }}>{fmtSum(p.price)} so'm</span>
          <button className="hr-x" onClick={() => remove(p)}>×</button>
        </div>
      ))}
      <div className="fx ac gap8" style={{ marginTop: 10 }}>
        <input className="hr-input" style={{ flex: 1 }} value={np.name} placeholder="Mahsulot / kurs nomi" onChange={(e) => setNp((p) => ({ ...p, name: e.target.value }))} />
        <input className="hr-input" style={{ width: 130, flex: 'none' }} type="number" value={np.price} placeholder="Narx" onChange={(e) => setNp((p) => ({ ...p, price: e.target.value }))} />
        <button className="btn primary sm" onClick={add}><Icon name="plus" size={13} />Qo'shish</button>
      </div>
    </Section>
  )
}

function PipelinesSection({ onChanged }) {
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const load = () => crmService.listPipelines().then((r) => setItems(r.pipelines || []))
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!name.trim()) return
    try { await crmService.createPipeline(name.trim()); setName(''); load(); onChanged && onChanged() } catch (e) { await dialog.alert(e.message) }
  }
  const remove = async (p) => {
    if (!await dialog.confirm(`"${p.name}" voronkasi o'chirilsinmi? (bosqichlar standartga qaytadi)`)) return
    try { await crmService.deletePipeline(p.id); load(); onChanged && onChanged() } catch (e) { await dialog.alert(e.message) }
  }
  if (items === null) return <Section title="Voronkalar"><Loading /></Section>
  return (
    <Section title="Voronkalar (pipelines)" sub="Bir nechta sotuv voronkasi — masalan, Yangi sotuv va Qayta sotuv">
      <div className="fx ac gap8" style={{ padding: '6px 0', borderBottom: '1px dashed var(--bd)' }}>
        <b style={{ flex: 1, fontSize: 13 }}>Standart voronka</b><span className="sub2" style={{ fontSize: 11 }}>(asosiy)</span>
      </div>
      {items.map((p) => (
        <div className="fx ac gap8" key={p.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--bd)' }}>
          <b style={{ flex: 1, fontSize: 13 }}>{p.name}</b>
          <button className="hr-x" onClick={() => remove(p)}>×</button>
        </div>
      ))}
      <div className="fx ac gap8" style={{ marginTop: 10 }}>
        <input className="hr-input" style={{ flex: 1 }} value={name} placeholder="Yangi voronka nomi" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" onClick={add}><Icon name="plus" size={13} />Qo'shish</button>
      </div>
    </Section>
  )
}

function LostReasonsSection() {
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const load = () => crmService.listLostReasons().then((r) => setItems(r.reasons || []))
  useEffect(() => { load() }, [])
  const add = async () => { if (!name.trim()) return; try { await crmService.createLostReason(name.trim()); setName(''); load() } catch (e) { await dialog.alert(e.message) } }
  const remove = async (r) => { try { await crmService.deleteLostReason(r.id); load() } catch (e) { await dialog.alert(e.message) } }
  if (items === null) return <Section title="Yo'qotish sabablari"><Loading /></Section>
  return (
    <Section title="Yo'qotish sabablari" sub="Lid 'Yo'qotildi' bosqichiga o'tganda tanlanadi">
      {items.length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Hali sabab yo'q</div>}
      {items.map((r) => (
        <div className="fx ac gap8" key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--bd)' }}>
          <span style={{ flex: 1, fontSize: 13 }}>{r.name}</span>
          <button className="hr-x" onClick={() => remove(r)}>×</button>
        </div>
      ))}
      <div className="fx ac gap8" style={{ marginTop: 10 }}>
        <input className="hr-input" style={{ flex: 1 }} value={name} placeholder="Masalan: Qimmat narx" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" onClick={add}><Icon name="plus" size={13} />Qo'shish</button>
      </div>
    </Section>
  )
}

function TagsSection() {
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3F77DD')
  const load = () => crmService.listTags().then((r) => setItems(r.tags || []))
  useEffect(() => { load() }, [])
  const add = async () => { if (!name.trim()) return; try { await crmService.upsertTag(name.trim(), color); setName(''); load() } catch (e) { await dialog.alert(e.message) } }
  const remove = async (t) => { try { await crmService.deleteTag(t.id); load() } catch (e) { await dialog.alert(e.message) } }
  if (items === null) return <Section title="Teglar"><Loading /></Section>
  return (
    <Section title="Teglar katalogi" sub="Lidlarni belgilash uchun teglar">
      <div className="fx ac gap8" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {items.map((t) => (
          <span key={t.id} className="tag" style={{ background: t.color + '22', color: t.color, borderColor: t.color }}>
            {t.name}<button className="hr-x" style={{ marginLeft: 4 }} onClick={() => remove(t)}>×</button>
          </span>
        ))}
        {items.length === 0 && <span className="sub2" style={{ fontSize: 12 }}>Hali teg yo'q</span>}
      </div>
      <div className="fx ac gap8">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 36, height: 32, border: 'none', background: 'none', cursor: 'pointer' }} />
        <input className="hr-input" style={{ flex: 1 }} value={name} placeholder="Teg nomi" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn primary sm" onClick={add}><Icon name="plus" size={13} />Qo'shish</button>
      </div>
    </Section>
  )
}

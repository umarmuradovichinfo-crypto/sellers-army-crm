// amoCRM «Списки → Товары»: mahsulotlar katalogi (nom, artikul, narx). Bitim kartochkasida pozitsiya sifatida
// qo'shiladi va byudjet avtomatik hisoblanadi. Tahrirlash — faqat sozlamalar huquqi bor foydalanuvchiga.
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { money } from '../format'
import { useT } from '../i18n'
import { PresetTitle } from './ListsPage'
import '../i18n/lists.ru'
import '../leads.css'
import '../lists.css'

function Row({ p, canEdit, onSaved, onRemove }) {
  const t = useT()
  const [d, setD] = useState({ name: p.name, sku: p.sku || '', price: p.price })
  const dirty = d.name !== p.name || d.sku !== (p.sku || '') || Number(d.price) !== p.price
  const save = async () => {
    try { await crmService.updateProduct(p.id, { name: d.name, sku: d.sku, price: Number(d.price) || 0 }); onSaved() }
    catch (e) { window.alert(e?.message || t('Xatolik')) }
  }
  if (!canEdit) return <tr><td className="name">{p.name}</td><td>{p.sku}</td><td className="num">{money(p.price)}</td><td /></tr>
  return (
    <tr>
      <td className="name"><input className="ac-input ac-prod__in" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></td>
      <td><input className="ac-input ac-prod__in" value={d.sku} placeholder="—" onChange={(e) => setD({ ...d, sku: e.target.value })} /></td>
      <td className="num"><input className="ac-input ac-prod__in num" type="number" min="0" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} /></td>
      <td className="ac-prod__acts">
        {dirty && <button className="ac-btn ac-btn--blue" onClick={save}>{t('Saqlash')}</button>}
        <button className="ac-prod__del" title={t("O'chirish")} onClick={() => onRemove(p)}><Ico name="trash" size={14} /></button>
      </td>
    </tr>
  )
}

export default function ProductsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { can } = useAuth()
  const canEdit = !can || can('crm.settings')
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [np, setNp] = useState({ name: '', sku: '', price: '' })
  const load = () => crmService.listProducts().then((r) => setItems(r.products || [])).catch(() => setItems([]))
  useEffect(() => { load() }, [])
  const addBusy = useRef(false) // ikki marta bosish dublikat mahsulot yaratmasin
  const add = async () => {
    if (!np.name.trim() || addBusy.current) return
    addBusy.current = true
    try { await crmService.createProduct({ name: np.name.trim(), sku: np.sku.trim(), price: Number(np.price) || 0 }); setNp({ name: '', sku: '', price: '' }); load() }
    catch (e) { window.alert(e?.message || t('Xatolik')) }
    finally { addBusy.current = false }
  }
  const remove = async (p) => {
    if (!window.confirm(`${t("O'chirilsinmi?")} «${p.name}»`)) return
    try { await crmService.deleteProduct(p.id); load() } catch (e) { window.alert(e?.message || t('Xatolik')) }
  }
  const shown = (items || []).filter((p) => !q || `${p.name} ${p.sku || ''}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="ac-lists">
      <TopBar
        title={<PresetTitle entity="products" onPick={(k) => navigate(k === 'companies' ? '/companies' : k === 'all' ? '/contacts?view=all' : k === 'products' ? '/products' : '/contacts')} />}
        search={q}
        onSearch={setQ}
        count={items ? `${shown.length}` : ''}
      />
      <div className="ac-lists-wrap">
        <table className="ac-table ac-lists-table ac-prod">
          <thead><tr><th>{t('Nomlanish')}</th><th>{t('Artikul')}</th><th className="num">{t('Narx')}</th><th /></tr></thead>
          <tbody>
            {canEdit && (
              <tr className="ac-prod__new">
                <td className="name"><input className="ac-input ac-prod__in" value={np.name} placeholder={t("Mahsulot nomi")} onChange={(e) => setNp({ ...np, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
                <td><input className="ac-input ac-prod__in" value={np.sku} placeholder={t('Artikul')} onChange={(e) => setNp({ ...np, sku: e.target.value })} /></td>
                <td className="num"><input className="ac-input ac-prod__in num" type="number" min="0" value={np.price} placeholder="0" onChange={(e) => setNp({ ...np, price: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} /></td>
                <td className="ac-prod__acts"><button className="ac-btn ac-btn--blue" disabled={!np.name.trim()} onClick={add}><span className="ac-btn__plus">+</span>{t("Qo'shish")}</button></td>
              </tr>
            )}
            {shown.map((p) => <Row key={`${p.id}:${p.name}:${p.price}:${p.sku}`} p={p} canEdit={canEdit} onSaved={load} onRemove={remove} />)}
          </tbody>
        </table>
        {items === null && <div className="ac-lists-empty"><span className="ac-spinner" /></div>}
        {items && shown.length === 0 && <div className="ac-lists-empty">{t("Mahsulotlar yo'q")}</div>}
      </div>
    </div>
  )
}

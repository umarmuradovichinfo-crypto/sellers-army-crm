import { dialog } from '../components/Dialog'
import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { PageHead, Switch, Loading, ErrorState } from '../components/ui'
import { useApi } from '../lib/useApi'
import { useAuth } from '../context/AuthContext'
import { settingsService } from '../services/settings.service'

const TABS = ['Foydalanuvchilar', 'Rollar va ruxsatlar', 'Umumiy', 'Bildirishnomalar']
const TAB_SLUG = { 'Foydalanuvchilar': 'foydalanuvchilar', 'Rollar va ruxsatlar': 'rollar', 'Umumiy': 'umumiy', 'Bildirishnomalar': 'bildirishnomalar' }
const SLUG_TAB = { foydalanuvchilar: 'Foydalanuvchilar', rollar: 'Rollar va ruxsatlar', umumiy: 'Umumiy', bildirishnomalar: 'Bildirishnomalar' }

export default function Settings() {
  const { user } = useAuth()
  const canManage = user?.role === 'super_admin'
  const location = useLocation(); const navigate = useNavigate()
  const seg = location.pathname.replace(/^\/settings\/?/, '').split('/')[0]
  const tab = SLUG_TAB[seg] || 'Foydalanuvchilar'
  const setTab = (k) => navigate('/settings' + (k === 'Foydalanuvchilar' ? '' : '/' + TAB_SLUG[k]))
  const { data, loading, error, reload, setData } = useApi(() => settingsService.getAccess(), [], 'settings:access', 600000)
  const [msg, setMsg] = useState(null)

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const { permissions = [], roles = [] } = data || {}

  const has = (role, key) => role.permissions.includes(key)

  const toggle = async (roleKey, permKey) => {
    if (!canManage) return
    if (roleKey === 'super_admin') { setMsg('Super admin barcha ruxsatlarga ega — o\'zgartirilmaydi'); return }
    setMsg(null)
    const role = roles.find((r) => r.key === roleKey)
    const allowed = !has(role, permKey)
    // optimistik
    setData((d) => ({
      ...d,
      roles: d.roles.map((r) => r.key === roleKey
        ? { ...r, permissions: allowed ? [...r.permissions, permKey] : r.permissions.filter((k) => k !== permKey) }
        : r),
    }))
    try { await settingsService.setPermission(roleKey, permKey, allowed) } catch (e) { setMsg(e.message); reload() }
  }

  const addRole = async () => {
    const name = await dialog.prompt('Yangi rol nomi:')
    if (!name || !name.trim()) return
    try { const res = await settingsService.createRole(name.trim()); setData((d) => ({ ...d, roles: [...d.roles, res.role] })) }
    catch (e) { setMsg(e.message || 'Rol qo`shilmadi') }
  }

  return (
    <>
      <PageHead title="Sozlamalar" sub="Rollar, ruxsatlar va tizim sozlamalari" />

      <div className="flow mb16">
        {TABS.map((t) => <span className={'chip' + (tab === t ? ' on' : '')} key={t} onClick={() => setTab(t)}>{t}</span>)}
      </div>

      {tab === 'Foydalanuvchilar' && <UsersTab roles={roles} canManage={canManage} currentUserId={user?.id} />}

      {tab === 'Rollar va ruxsatlar' && (
        <>
          {msg && <div style={{ marginBottom: 12, color: 'var(--dang)', fontSize: 13, fontWeight: 600 }}>{msg}</div>}

          <div className="card mb16">
            <div className="fx jb ac mb16">
              <div>
                <h3 className="ch">Ruxsatlar matritsasi</h3>
                <div className="chsub">Har bir rol uchun bo'limlarga kirishni boshqaring{!canManage ? ' (faqat super admin o\'zgartira oladi)' : ''}</div>
              </div>
              {canManage && <button className="btn sm primary" onClick={addRole}><Icon name="plus" size={15} />Rol yaratish</button>}
            </div>
            <div className="scrollx">
              <table className="tbl matrix">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', minWidth: 180 }}>Ruxsat / bo'lim</th>
                    {roles.map((r) => (
                      <th key={r.key} style={{ textAlign: 'center' }}>
                        <div>{r.name}</div>
                        <div className="sub2" style={{ fontSize: 10, fontWeight: 500 }}>{r.users} foyd.</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((p) => (
                    <tr key={p.key}>
                      <td className="lead" style={{ textAlign: 'left' }}>{p.label}</td>
                      {roles.map((r) => {
                        const on = has(r, p.key)
                        const locked = r.key === 'super_admin' || !canManage
                        return (
                          <td key={r.key} style={{ textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', opacity: locked ? 0.55 : 1 }}>
                              <Switch on={on} onClick={() => !locked && toggle(r.key, p.key)} />
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'Umumiy' && (
        <div className="card">
          <h3 className="ch mb16">Umumiy</h3>
          <div className="grid" style={{ gap: 14 }}>
            <Row title="Tashkilot nomi" sub="Sellers Army CRM" />
            <div className="divh" />
            <Row title="Til" sub="O'zbekcha"><span className="pill mut">UZ</span></Row>
            <div className="divh" />
            <Row title="Valyuta" sub="So'm (UZS)"><span className="pill mut">UZS</span></Row>
            <div className="divh" />
            <Row title="Vaqt mintaqasi" sub="Toshkent (GMT+5)" />
          </div>
        </div>
      )}

      {tab === 'Bildirishnomalar' && (
        <div className="card">
          <h3 className="ch mb16">Bildirishnomalar</h3>
          <div className="grid" style={{ gap: 14 }}>
            <ToggleRow title="Yangi lid" sub="CRM'ga lid kelganda" def />
            <div className="divh" />
            <ToggleRow title="Yangi vazifa (zadacha)" sub="Sotuvchiga vazifa biriktirilganda" def />
            <div className="divh" />
            <ToggleRow title="AI haftalik hisobot" sub="Dushanba ertalab" />
          </div>
        </div>
      )}
    </>
  )
}

function Row({ title, sub, children }) {
  return (
    <div className="fx jb ac">
      <div><b style={{ fontSize: 13.5 }}>{title}</b><div className="sub2">{sub}</div></div>
      {children}
    </div>
  )
}
function ToggleRow({ title, sub, def = false }) {
  const [on, setOn] = useState(def)
  return <Row title={title} sub={sub}><Switch on={on} onClick={() => setOn(!on)} /></Row>
}

/* ── Foydalanuvchilar (login/parol berish) ── */
function UsersTab({ roles, canManage, currentUserId }) {
  const { data, loading, error, reload, setData } = useApi(() => settingsService.listUsers(), [], 'settings:users', 600000)
  const [modal, setModal] = useState(null) // { create:true } | { user }
  const [msg, setMsg] = useState(null)

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const users = data.users || []

  const save = async (c) => {
    setMsg(null)
    try {
      if (modal.create) {
        const res = await settingsService.createUser({ name: c.name, email: c.email, password: c.password, roleKey: c.roleKey, extension: c.extension })
        setData((d) => ({ ...d, users: [...d.users, res.user] }))
      } else {
        const res = await settingsService.updateUser(modal.user.id, { name: c.name, email: c.email, roleKey: c.roleKey, isActive: c.isActive, extension: c.extension })
        if (c.password) await settingsService.resetUserPassword(modal.user.id, c.password)
        setData((d) => ({ ...d, users: d.users.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)) }))
      }
      setModal(null)
    } catch (e) { setMsg(e.message || 'Xatolik') }
  }

  return (
    <div className="card">
      <div className="fx jb ac mb16">
        <div>
          <h3 className="ch">Foydalanuvchilar</h3>
          <div className="chsub">Yangi hodimga login (email) va parol bering, rol biriktiring</div>
        </div>
        {canManage && <button className="btn sm primary" onClick={() => setModal({ create: true })}><Icon name="plus" size={15} />Foydalanuvchi qo'shish</button>}
      </div>
      {msg && <div style={{ marginBottom: 12, color: 'var(--dang)', fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      {!canManage && <div className="sub2" style={{ marginBottom: 10 }}>Faqat super admin foydalanuvchilarni boshqara oladi.</div>}
      <div className="scrollx">
        <table className="tbl">
          <thead><tr>
            <th style={{ textAlign: 'left' }}>Ism</th>
            <th style={{ textAlign: 'left' }}>Login (email)</th>
            <th style={{ textAlign: 'left' }}>Rol</th>
            <th>Ichki raqam</th>
            <th>Holat</th>
            <th></th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ textAlign: 'left', fontWeight: 600 }}>{u.name}</td>
                <td style={{ textAlign: 'left' }}>{u.email}</td>
                <td style={{ textAlign: 'left' }}><span className="pill mut">{u.roleName || u.roleKey}</span></td>
                <td>{u.extension || '—'}</td>
                <td><span className={'pill ' + (u.isActive ? 'ok' : 'dang')}>{u.isActive ? 'Faol' : 'Nofaol'}</span></td>
                <td>{canManage && <button className="btn sm" onClick={() => setModal({ user: u })}><Icon name="edit" size={13} />Tahrirlash</button>}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} className="sub2">Foydalanuvchi yo'q</td></tr>}
          </tbody>
        </table>
      </div>
      {modal && <UserModal initial={modal.user} roles={roles} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function UserModal({ initial, roles, onClose, onSave }) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [password, setPassword] = useState('')
  const [roleKey, setRoleKey] = useState(initial?.roleKey || roles[0]?.key || '')
  const [extension, setExtension] = useState(initial?.extension || '')
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true)
  const [busy, setBusy] = useState(false)
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const passOk = editing ? (password === '' || password.length >= 6) : password.length >= 6
  const invalid = !name.trim() || !emailOk || !passOk || !roleKey

  const submit = async () => {
    if (invalid) return
    setBusy(true)
    try { await onSave({ name: name.trim(), email: email.trim(), password, roleKey, extension: extension.trim(), isActive }) }
    finally { setBusy(false) }
  }

  return (
    <div className="cl-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="cl-modal sm">
        <div className="cl-mh"><b>{editing ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi'}</b><button className="hr-x" style={{ marginLeft: 'auto' }} onClick={onClose}>×</button></div>
        <div className="cl-mb">
          <div className="hr-field"><label>To'liq ism</label>
            <input className="hr-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ism Familiya" />
          </div>
          <div className="hr-field"><label>Login (email)</label>
            <input className="hr-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hodim@example.com" />
            {email && !emailOk && <div style={{ fontSize: 12, color: 'var(--dang)', marginTop: 4 }}>Email noto'g'ri</div>}
          </div>
          <div className="hr-field"><label>{editing ? "Yangi parol (bo'sh qoldirsangiz o'zgarmaydi)" : 'Parol'}</label>
            <input className="hr-input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? '••••••' : 'Kamida 6 belgi'} />
            {password && password.length < 6 && <div style={{ fontSize: 12, color: 'var(--dang)', marginTop: 4 }}>Kamida 6 belgi bo'lsin</div>}
          </div>
          <div className="hr-field"><label>Rol</label>
            <select className="hr-select" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
              {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          </div>
          <div className="hr-field"><label>Ichki raqam (OnlinePBX, ixtiyoriy)</label>
            <input className="hr-input" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="101" />
          </div>
          {editing && <label className="apply-opt"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Faol (tizimga kira oladi)</label>}
        </div>
        <div className="cl-mf">
          <button className="btn" onClick={onClose}>Bekor qilish</button>
          <button className="btn primary" disabled={busy || invalid} onClick={submit}>{busy ? 'Saqlanmoqda…' : (editing ? 'Saqlash' : 'Yaratish')}</button>
        </div>
      </div>
    </div>
  )
}

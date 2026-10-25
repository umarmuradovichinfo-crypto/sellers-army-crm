// amoCRM "Настройки → Пользователи": qidiruv + "…" + "+ Foydalanuvchi qo'shish", jadval, o'ngdan tahrirlash paneli.
import React, { useMemo, useState } from 'react'
import { settingsService } from '../../services/settings.service'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../context/AuthContext'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { dmy } from '../format'
import { useT } from '../i18n'
import '../settings.css'

// Ustunlar bo'yicha huquq nuqtalari: ko'rish / tahrirlash / qo'shish / o'chirish / eksport.
// Bizdagi ruxsatlar (crm.view, crm.settings, crm.export) shu 5 ta nuqtaga xaritalanadi.
const DOT_KINDS = ['v', 'e', 'a', 'd', 'x']
const DOT_TITLES = ["perm§Ko'rish", 'perm§Tahrirlash', "perm§Qo'shish", "perm§O'chirish", 'perm§Eksport']
function rightsOf(perms, col) {
  const has = (k) => perms.includes(k)
  if (col === 'stages') return [has('crm.view'), has('crm.settings'), has('crm.settings'), has('crm.settings'), false]
  return [has('crm.view'), has('crm.view'), has('crm.view'), has('crm.settings'), has('crm.export')]
}
function Dots({ flags, t }) {
  return (
    <span className="ac-set-dots">
      {flags.map((on, i) => <i key={i} className={`${on ? 'on' : ''} ${DOT_KINDS[i]}`} title={t(DOT_TITLES[i])} />)}
    </span>
  )
}

// "Лог авторизаций": kim, qachon, qaysi IP va brauzerdan kirgan (muvaffaqiyatsiz urinishlar ham)
function AuthLogModal({ onClose }) {
  const t = useT()
  const { data, error } = useApi(() => settingsService.authLog(), [])
  const browser = (ua) => (/Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua ? ua.slice(0, 30) : '—')
  const os = (ua) => (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '')
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal" style={{ maxWidth: 860 }}>
        <h2 className="ac-set-block__title" style={{ marginTop: 0 }}>{t('Avtorizatsiya jurnali')}</h2>
        {!data && !error && <div className="ac-spinner" />}
        {error && <div className="ac-set-err">{error.message}</div>}
        {data && (
          <div className="ac-table-wrap" style={{ maxHeight: '60vh', overflow: 'auto' }}>
            <table className="ac-table">
              <thead><tr><th>{t('Sana')}</th><th>{t('Foydalanuvchi')}</th><th>IP</th><th>{t('Brauzer')}</th><th>{t('Natija')}</th></tr></thead>
              <tbody>
                {(data.items || []).map((r, i) => (
                  <tr key={i}>
                    <td>{dmy(r.at)} {new Date(r.at).toTimeString().slice(0, 5)}</td>
                    <td>{r.name || r.email}</td>
                    <td>{r.ip || '—'}</td>
                    <td>{browser(r.ua)}{os(r.ua) ? `, ${os(r.ua)}` : ''}</td>
                    <td className={r.ok ? 'ac-set-saved' : 'ac-set-err'}>{t(r.ok ? 'Kirdi' : "Noto'g'ri parol")}</td>
                  </tr>
                ))}
                {(data.items || []).length === 0 && <tr><td colSpan={5} className="ac-muted">{t("Yozuvlar yo'q")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16, textAlign: 'right' }}><button className="ac-btn" onClick={onClose}>{t('Yopish')}</button></div>
      </div>
    </div>
  )
}

// amoCRM «Настройка групп»: foydalanuvchilar guruhlari (otdellar) — qo'shish, nomini o'zgartirish, o'chirish
function GroupsModal({ groups, onClose, onChanged }) {
  const t = useT()
  const [name, setName] = useState('')
  const [edit, setEdit] = useState(null) // { id, name }
  const [err, setErr] = useState('')
  const run = async (fn) => { setErr(''); try { await fn(); onChanged() } catch (e) { setErr(e.message || t('Xatolik')) } }
  const add = () => name.trim() && run(async () => { await settingsService.createGroup(name.trim()); setName('') })
  const rename = () => edit?.name.trim() && run(async () => { await settingsService.renameGroup(edit.id, edit.name.trim()); setEdit(null) })
  const remove = (g) => {
    if (g.users && !window.confirm(t("Guruhdagi foydalanuvchilar guruhsiz qoladi. O'chirilsinmi?"))) return
    run(() => settingsService.deleteGroup(g.id))
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal">
        <h2 className="ac-set-block__title" style={{ marginTop: 0 }}>{t('Guruhlarni sozlash')}</h2>
        <div className="ac-set-groups">
          {groups.map((g) => (
            <div key={g.id} className="ac-set-group">
              {edit?.id === g.id
                ? <input className="ac-input" style={{ flex: 1 }} autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') setEdit(null) }} onBlur={rename} />
                : <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => setEdit({ id: g.id, name: g.name })}>{g.name}</span>}
              <span className="ac-muted">{g.users || ''}</span>
              <button className="ac-top__dots" title={t("O'chirish")} onClick={() => remove(g)}><Ico name="trash" size={13} /></button>
            </div>
          ))}
          {groups.length === 0 && <div className="ac-muted">{t("Guruhlar yo'q")}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input className="ac-input" style={{ flex: 1 }} placeholder={t('Yangi guruh nomi')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="ac-btn ac-btn--blue" disabled={!name.trim()} onClick={add}>{t("set§Qo'shish")}</button>
        </div>
        {err && <div className="ac-set-err" style={{ marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 16, textAlign: 'right' }}><button className="ac-btn" onClick={onClose}>{t('Yopish')}</button></div>
      </div>
    </div>
  )
}

export default function SettingsUsers() {
  const t = useT()
  const { user, can } = useAuth()
  const canManage = can('settings.roles.manage')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [modal, setModal] = useState(null) // { create:true } | { user }
  const users = useApi(() => settingsService.listUsers(), [], 'settings:users', 600000)
  const access = useApi(() => settingsService.getAccess(), [], 'settings:access', 600000)
  const grp = useApi(() => settingsService.listGroups(), [], 'settings:groups', 600000)
  const groups = grp.data?.groups || []

  const roles = access.data?.roles || []
  const list = users.data?.users || []
  const roleByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? list.filter((u) => `${u.name} ${u.email} ${u.roleName || ''} ${u.groupName || ''}`.toLowerCase().includes(s)) : list
  }, [list, q])

  const toggleAll = () => setSel(sel.size === shown.length ? new Set() : new Set(shown.map((u) => u.id)))
  const toggleOne = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const rightsCell = (u, col) => {
    const r = roleByKey[u.roleKey]
    if (!r) return null
    if (u.roleKey === 'super_admin') return col === 'deals' ? <span className="ac-set-admin">{t('Administrator')}</span> : null
    if (col === 'deals') return r.name
    return <Dots t={t} flags={rightsOf(r.permissions, col)} />
  }

  return (
    <>
      <TopBar
        search={q} onSearch={setQ}
        menu={canManage ? [
          { label: t('Avtorizatsiya jurnali'), icon: 'external', onClick: () => setModal({ log: true }) },
          { label: t('Guruhlarni sozlash'), icon: 'gear', onClick: () => setModal({ groups: true }) },
        ] : null}
        actions={canManage && (
          <button className="ac-btn ac-btn--blue" onClick={() => setModal({ create: true })}><span className="ac-btn__plus">+</span> {t("Foydalanuvchi qo'shish")}</button>
        )}
      />
      <div className="ac-table-wrap ac-set-users">
        {users.loading && !users.data ? <div className="ac-spinner" style={{ margin: '40px auto' }} /> : users.error && !users.data ? (
          <div className="ac-muted" style={{ textAlign: 'center', padding: 40 }}>{users.error.message || t('Xatolik')}</div>
        ) : (
          <table className="ac-table">
            <thead>
              <tr>
                <th className="ac-chk"><input type="checkbox" className="ac-check" checked={shown.length > 0 && sel.size === shown.length} onChange={toggleAll} /></th>
                <th>{t('Ism')}</th><th>{t('Guruh')}</th><th>E-mail</th><th>{t("Qo'shilgan sana")}</th>
                <th>{t('Bitimlar / Xaridorlar')}</th><th>{t('Kontaktlar')}</th><th>{t('Kompaniyalar')}</th><th>{t('Vazifalar')}</th><th>{t('set§Bosqichlar')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className={`${sel.has(u.id) ? 'selected' : ''} ${u.isActive ? '' : 'ac-set-inactive'}`}>
                  <td className="ac-chk"><input type="checkbox" className="ac-check" checked={sel.has(u.id)} onChange={() => toggleOne(u.id)} /></td>
                  <td><span className="name" onClick={() => setModal({ user: u })}>{u.name}</span></td>
                  <td>{u.groupName || <span className="ac-muted">—</span>}</td>
                  <td>{u.email}</td>
                  <td>{dmy(u.createdAt)}</td>
                  <td>{rightsCell(u, 'deals')}</td>
                  <td>{rightsCell(u, 'contacts')}</td>
                  <td>{rightsCell(u, 'companies')}</td>
                  <td>{rightsCell(u, 'tasks')}</td>
                  <td>{rightsCell(u, 'stages')}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={10} className="ac-muted" style={{ textAlign: 'center', height: 60 }}>{t("Foydalanuvchi yo'q")}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {modal?.log && <AuthLogModal onClose={() => setModal(null)} />}
      {modal?.groups && <GroupsModal groups={groups} onClose={() => setModal(null)} onChanged={() => { grp.reload(); users.reload() }} />}
      {modal && (modal.create || modal.user) && (
        <UserDrawer
          initial={modal.user} roles={roles} groups={groups} canManage={canManage} selfId={user?.id}
          onClose={() => setModal(null)}
          onChanged={() => { users.reload(); access.reload() }}
        />
      )}
    </>
  )
}

function UserDrawer({ initial, roles, groups, canManage, selfId, onClose, onChanged }) {
  const t = useT()
  const editing = !!initial
  const [name, setName] = useState(initial?.name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [password, setPassword] = useState('')
  const [roleKey, setRoleKey] = useState(initial?.roleKey || roles.find((r) => r.key !== 'super_admin')?.key || roles[0]?.key || '')
  const [extension, setExtension] = useState(initial?.extension || '')
  const [groupId, setGroupId] = useState(initial ? initial.groupId || '' : groups[0]?.id || '')
  const [isActive, setIsActive] = useState(initial ? initial.isActive : true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [localRoles, setLocalRoles] = useState(roles)
  const [perms, setPerms] = useState(null)

  const accessApi = useApi(() => settingsService.getAccess(), [], 'settings:access', 600000)
  const permList = accessApi.data?.permissions || []
  const allRoles = accessApi.data?.roles || localRoles
  const role = allRoles.find((r) => r.key === roleKey)
  const rolePerms = perms || role?.permissions || []

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const passOk = editing ? (password === '' || password.length >= 6) : password.length >= 6
  const invalid = !name.trim() || !emailOk || !passOk || !roleKey

  const togglePerm = async (key) => {
    if (!canManage || !role || role.key === 'super_admin') return
    const allowed = !rolePerms.includes(key)
    const next = allowed ? [...rolePerms, key] : rolePerms.filter((k) => k !== key)
    setPerms(next)
    try { await settingsService.setPermission(role.key, key, allowed); accessApi.reload(); onChanged() }
    catch (e) { setPerms(rolePerms); setErr(e.message || t('Xatolik')) }
  }
  const addRole = async () => {
    const nm = window.prompt(t('Yangi huquq profili nomi'))
    if (!nm || !nm.trim()) return
    try {
      const r = await settingsService.createRole(nm.trim())
      setLocalRoles((rs) => [...rs, r.role]); setRoleKey(r.role.key); setPerms(null)
      accessApi.reload(); onChanged()
    } catch (e) { setErr(e.message || t('Xatolik')) }
  }

  const submit = async () => {
    if (invalid || busy) return
    setBusy(true); setErr(null)
    try {
      if (editing) {
        await settingsService.updateUser(initial.id, { name: name.trim(), email: email.trim(), roleKey, isActive, extension: extension.trim(), groupId: groupId || null })
        if (password) await settingsService.resetUserPassword(initial.id, password)
      } else {
        await settingsService.createUser({ name: name.trim(), email: email.trim(), password, roleKey, extension: extension.trim(), groupId: groupId || null })
      }
      onChanged(); onClose()
    } catch (e) { setErr(e.message || t('Xatolik')); setBusy(false) }
  }

  return (
    <div className="ac-set-drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-set-drawer">
        <div className="ac-set-drawer__head">
          <span>{editing ? t('Foydalanuvchini tahrirlash') : t('Yangi foydalanuvchi')}</span>
          <button className="ac-top__dots" onClick={onClose}><Ico name="close" /></button>
        </div>
        <div className="ac-set-drawer__body">
          {editing && (
            <label className="ac-set-checkrow">
              <span className={`ac-switch ${isActive ? 'on' : ''}`} style={{ opacity: !canManage || initial.id === selfId ? 0.5 : 1 }} onClick={(e) => { e.preventDefault(); if (canManage && initial.id !== selfId) setIsActive((v) => !v) }} />
              {t('Faollik')}
            </label>
          )}
          <div className="ac-set-field"><label>{t("To'liq ism")}</label>
            <input className="ac-input" value={name} autoFocus onChange={(e) => setName(e.target.value)} disabled={!canManage} />
          </div>
          <div className="ac-set-field"><label>E-mail</label>
            <input className="ac-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} />
            {email && !emailOk && <div className="ac-set-err">{t("Email noto'g'ri")}</div>}
          </div>
          <div className="ac-set-field"><label>{editing ? t("Yangi parol (bo'sh qoldirsangiz o'zgarmaydi)") : t('Parol')}</label>
            <input className="ac-input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editing ? '••••••' : t('Kamida 6 belgi')} disabled={!canManage} />
            {password && password.length < 6 && <div className="ac-set-err">{t("Kamida 6 belgi bo'lsin")}</div>}
          </div>
          <div className="ac-set-field"><label>{t('Guruh')}</label>
            <select className="ac-select" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!canManage}>
              <option value="">{t('Guruhsiz')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="ac-set-field"><label>{t("Ichki raqam (OnlinePBX, ixtiyoriy)")}</label>
            <input className="ac-input" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="101" disabled={!canManage} />
          </div>

          {/* amoCRM: huquq profillari tablari (Администратор, …) + «Настроить права» */}
          <div className="ac-set-sub">{t('Huquqlar')}</div>
          <div className="ac-set-proftabs">
            {allRoles.map((r) => (
              <button key={r.key} className={r.key === roleKey ? 'on' : ''} disabled={!canManage || (editing && initial.id === selfId)} onClick={() => { setRoleKey(r.key); setPerms(null) }}>
                {r.key === 'super_admin' && <Ico name="star" size={11} />} {r.key === 'super_admin' ? t('Administrator') : r.name}
              </button>
            ))}
            {canManage && <button className="add" onClick={addRole}>{t('Huquqlarni sozlash')}</button>}
          </div>
          <div className="ac-muted" style={{ fontSize: 12, margin: '6px 0 8px' }}>{t("Huquq profili o'zgarsa, shu profildagi barcha foydalanuvchilarga ta'sir qiladi")}</div>
          <table className="ac-set-matrix">
            <tbody>
              {permList.map((p) => {
                const on = role?.key === 'super_admin' || rolePerms.includes(p.key)
                const locked = !canManage || role?.key === 'super_admin'
                return (
                  <tr key={p.key}>
                    <td>{t(p.label)}</td>
                    <td><span className={`ac-switch ${on ? 'on' : ''}`} style={{ opacity: locked ? 0.5 : 1, cursor: locked ? 'default' : 'pointer' }} onClick={() => togglePerm(p.key)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Dots t={t} flags={rightsOf(role?.key === 'super_admin' ? ['crm.view', 'crm.settings', 'crm.export'] : rolePerms, 'deals')} />
            <span className="ac-muted" style={{ fontSize: 12 }}>{DOT_TITLES.map((x) => t(x)).join(' · ')}</span>
          </div>
          {err && <div className="ac-set-err">{err}</div>}
        </div>
        {canManage && (
          <div className="ac-set-drawer__foot">
            <button className="ac-btn ac-btn--blue" disabled={busy || invalid} onClick={submit}>{busy ? t('Saqlanmoqda…') : t('Saqlash')}</button>
            <button className="ac-btn" onClick={onClose}>{t('Bekor qilish')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

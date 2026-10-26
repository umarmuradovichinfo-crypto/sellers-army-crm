// «Настройка АТС» (o'z stansiyamiz, PLAN 45): modulli qo'ng'iroq oqimi — chapda «Modul qo'shish», o'rtada ro'yxat, o'ngda forma.
// Tablar: Kiruvchi · Chiquvchi · Qora ro'yxat · Musiqa · Diagnostika. OnlinePBX paneli bilan 1:1 (docs/amo-clone/PBX-CLONE.md).
import React, { useEffect, useMemo, useState } from 'react'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { dialog } from '../../components/Dialog'
import { pbxService } from '../../services/pbx.service'
import { settingsService } from '../../services/settings.service'
import { ACCESS, DAYS, FIELDS, NOTIFS, SECTION_LABEL, TYPE_LABEL, TYPE_ORDER, fromForm, toForm } from '../pbxFields'
import '../i18n/pbx.ru'

export function Field({ label, children, hint }) {
  return <label className="ac-pbx__row"><span className="ac-pbx__lab">{label}</span><span className="ac-pbx__val">{children}</span>{hint && <small className="ac-pbx__hint">{hint}</small>}</label>
}

export function Incoming() {
  const t = useT()
  const { data, reload } = useApi(() => pbxService.modules(), [], 'pbx:modules')
  const audio = useApi(() => pbxService.audioList().catch(() => ({ files: [] })), [], 'pbx:audio')
  const users = useApi(() => settingsService.listUsers().catch(() => ({ users: [] })), [], 'pbx:crm-users')
  const [sel, setSel] = useState(null) // { id? , type, number, name, enabled, config }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const allMods = data?.modules || []
  const mods = q.trim() ? allMods.filter((m) => `${m.number} ${m.name || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : allMods
  const grouped = useMemo(() => Object.fromEntries(TYPE_ORDER.map((ty) => [ty, mods.filter((m) => m.type === ty)])), [mods])
  const targetOptions = useMemo(() => allMods.map((m) => ({ number: m.number, label: `${m.number}${m.name ? ` — ${m.name}` : ''} (${t(TYPE_LABEL[m.type] || m.type)})` })), [mods, t])

  const startNew = async (type) => {
    setErr('')
    const { number } = await pbxService.nextNumber(type)
    setSel({ type, number, name: '', enabled: true, config: toForm(type, {}), isNew: true })
  }
  const open = (m) => { setErr(''); setSel({ ...m, config: toForm(m.type, m.config), isNew: false }) }
  const setCfg = (k, v) => setSel((s) => ({ ...s, config: { ...s.config, [k]: v } }))

  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = { number: sel.number, name: sel.name, enabled: sel.enabled, config: fromForm(sel.type, sel.config) }
      const r = sel.isNew ? await pbxService.create({ type: sel.type, ...body }) : await pbxService.update(sel.id, body)
      await reload()
      setSel({ ...r.module, config: toForm(r.module.type, r.module.config), isNew: false })
    } catch (e) { setErr(e?.message || t('pbx§Saqlab bo\'lmadi')) } finally { setBusy(false) }
  }
  const toggle = async (m) => { try { await pbxService.update(m.id, { enabled: !m.enabled }); await reload() } catch (e) { setErr(e?.message || '') } }
  const remove = async () => {
    if (!(await dialog.confirm(t("pbx§Modul o'chirilsinmi?")))) return
    setBusy(true); setErr('')
    try { await pbxService.remove(sel.id); setSel(null); await reload() } catch (e) { setErr(e?.message || t('pbx§O\'chirib bo\'lmadi')) } finally { setBusy(false) }
  }

  return (
    <div className="ac-pbx__grid">
      <aside className="ac-pbx__add">
        <b>{t('pbx§Modul qo\'shish')}</b>
        {TYPE_ORDER.map((ty) => <button key={ty} type="button" onClick={() => startNew(ty)}>{t(TYPE_LABEL[ty])}</button>)}
      </aside>
      <section className="ac-pbx__list">
        <div className="ac-pbx__head"><span>{t('pbx§Kiruvchi qo\'ng\'iroqlar sozlamasi')}</span><input className="ac-input" value={q} placeholder={t('pbx§Qidirish')} onChange={(e) => setQ(e.target.value)} /></div>
        {TYPE_ORDER.map((ty) => (grouped[ty].length > 0 || ty === 'trunk') && (
          <div key={ty}>
            <h4>{t(SECTION_LABEL[ty])}</h4>
            {grouped[ty].length === 0 && <div className="ac-pbx__empty">{t('pbx§Hali yo\'q')}</div>}
            {grouped[ty].map((m) => (
              <div key={m.id} role="button" tabIndex={0} data-type={m.type} className={`ac-pbx__item ${sel?.id === m.id ? 'on' : ''} ${m.enabled ? '' : 'off'}`} onClick={() => open(m)} onKeyDown={(e) => { if (e.key === 'Enter') open(m) }}>
                <span className={`ac-pbx__dot ${m.enabled ? 'on' : ''}`} />
                <span className="n">{m.number}</span><span className="nm">{m.name || ''}</span>
                <span className="to">{m.config.forwardTo || m.config.workTo || ''}</span>
                <span role="switch" aria-checked={m.enabled} className={`pbxx__switch ${m.enabled ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); toggle(m) }}><i /></span>
              </div>
            ))}
          </div>
        ))}
        {mods.length === 0 && <div className="ac-pbx__empty">{t('pbx§Chapdan modul qo\'shing: avval raqam (trunk), keyin vaqt qoidasi, guruh va foydalanuvchilar.')}</div>}
      </section>
      <section className="ac-pbx__form">
        {!sel && <div className="ac-pbx__empty">{t('pbx§Modulni tanlang yoki yangisini qo\'shing')}</div>}
        {sel && (
          <>
            <h3>{t(TYPE_LABEL[sel.type])}{sel.isNew ? ` — ${t('pbx§yangi')}` : ''}</h3>
            <Field label={t('pbx§Raqam')}><input className="ac-input" value={sel.number} onChange={(e) => setSel({ ...sel, number: e.target.value })} /></Field>
            <Field label={t('pbx§Nomi')}><input className="ac-input" value={sel.name || ''} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></Field>
            {sel.type === 'user' && <UserForm sel={sel} setCfg={setCfg} crmUsers={users.data?.users || []} targetOptions={targetOptions} />}
            {(FIELDS[sel.type] || []).map((f) => (
              <Field key={f.key} label={t(f.label)}>
                <Control f={f} value={sel.config[f.key]} onChange={(v) => setCfg(f.key, v)} targetOptions={targetOptions.filter((o) => o.number !== sel.number)} passwordSet={sel.passwordSet} audio={audio.data?.files || []} />
              </Field>
            ))}
            <Field label={t('pbx§Yoqilgan')}><input type="checkbox" checked={sel.enabled !== false} onChange={(e) => setSel({ ...sel, enabled: e.target.checked })} /></Field>
            {err && <div className="ac-pbx__err">{err}</div>}
            <div className="ac-pbx__actions">
              <button type="button" className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{sel.isNew ? t("pbx§Qo'shish") : t('pbx§Saqlash')}</button>
              <button type="button" className="ac-btn" onClick={() => { setSel(null); setErr('') }}>{t('pbx§Bekor qilish')}</button>
              {!sel.isNew && <button type="button" className="ac-btn ac-pbx__del" disabled={busy} onClick={remove}>{t("pbx§O'chirish")}</button>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Control({ f, value, onChange, targetOptions, passwordSet, audio = [] }) {
  const t = useT()
  switch (f.kind) {
    case 'bool': return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
    case 'int': return <input className="ac-input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    case 'password': return <input className="ac-input" type="password" autoComplete="new-password" value={value || ''} placeholder={passwordSet ? '••••••••' : ''} onChange={(e) => onChange(e.target.value)} />
    case 'textarea': return <textarea className="ac-input" rows={2} value={value || ''} onChange={(e) => onChange(e.target.value)} />
    case 'select': return <select className="ac-select" value={value ?? f.options[0][0]} onChange={(e) => onChange(e.target.value)}>{f.options.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
    case 'target': return (
      <select className="ac-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("pbx§Qo'ng'iroq tugaydi")}</option>
        {targetOptions.map((o) => <option key={o.number} value={o.number}>{o.label}</option>)}
      </select>
    )
    case 'audio': return <AudioSelect value={value} onChange={onChange} files={audio} />
    case 'schedule': return <Schedule value={value || {}} onChange={onChange} />
    default: return <input className="ac-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  }
}

export function AudioSelect({ value, onChange, files }) {
  const t = useT()
  const [url, setUrl] = useState(null)
  const play = async () => { try { const b = await pbxService.audioBlob(value); setUrl(URL.createObjectURL(b)) } catch { setUrl(null) } }
  return (
    <span className="ac-pbx__audio">
      <select className="ac-select" value={value || ''} onChange={(e) => { setUrl(null); onChange(e.target.value) }}>
        <option value="">{t('pbx§Standart')}</option>
        {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      {value && <button type="button" className="ac-pbx__play" title={t('pbx§Tinglash')} onClick={play}>▶</button>}
      {url && <audio controls autoPlay src={url} />}
    </span>
  )
}

function Schedule({ value, onChange }) {
  const t = useT()
  const set = (d, patch) => onChange({ ...value, [d]: { on: true, from: '09:00', to: '18:00', ...(value[d] || {}), ...patch } })
  return (
    <div className="ac-pbx__sched">
      {DAYS.map(([d, l]) => {
        const x = { on: true, from: '09:00', to: '18:00', ...(value[d] || {}) }
        return (
          <div key={d}>
            <span>{t(l)}</span>
            <input className="ac-input" type="time" value={x.from} onChange={(e) => set(d, { from: e.target.value })} />
            <em>–</em>
            <input className="ac-input" type="time" value={x.to} onChange={(e) => set(d, { to: e.target.value })} />
            <input type="checkbox" checked={x.on} onChange={(e) => set(d, { on: e.target.checked })} />
          </div>
        )
      })}
    </div>
  )
}

function UserForm({ sel, setCfg, crmUsers, targetOptions }) {
  const t = useT()
  const [tab, setTab] = useState('main')
  const c = sel.config
  const fwd = c.forward || [{}, {}, {}]
  const setFwd = (i, patch) => setCfg('forward', fwd.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const acc = c.access || {}
  const notify = c.notify || {}
  const setNotify = (k, ch, v) => setCfg('notify', { ...notify, [k]: { ...(notify[k] || {}), [ch]: v } })
  const tabs = [['main', 'pbx§Asosiy'], ['fwd', "pbx§Qayta yo'naltirish"], ['acc', 'pbx§Ruxsatlar'], ['not', 'pbx§Bildirishnomalar']]
  return (
    <>
      <div className="ac-pbx__ftabs">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
      {tab === 'main' && <>
      <Field label={t('pbx§CRM foydalanuvchisi')}>
        <select className="ac-select" value={c.crmUserId || ''} onChange={(e) => setCfg('crmUserId', e.target.value)}>
          <option value="">—</option>
          {crmUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </Field>
      <Field label="SIP-id"><span className="ac-pbx__ro">{sel.number}@{window.location.hostname}</span></Field>
      <Field label="E-mail"><input className="ac-input" value={c.email || ''} onChange={(e) => setCfg('email', e.target.value)} /></Field>
      <Field label={t("pbx§SIP orqali qo'ng'iroq qabul qilish")}><input type="checkbox" checked={c.acceptSip !== false} onChange={(e) => setCfg('acceptSip', e.target.checked)} /></Field>
      </>}
      {tab === 'fwd' && [0, 1, 2].map((i) => (
        <div key={i} className="ac-pbx__fwd">
          <span>{i + 1}</span>
          <input className="ac-input" type="number" value={fwd[i]?.afterSec ?? 15} onChange={(e) => setFwd(i, { afterSec: e.target.value })} />
          <select className="ac-select" value={fwd[i]?.to || ''} onChange={(e) => setFwd(i, { to: e.target.value })}>
            <option value="">{t("pbx§Qo'ng'iroq tugaydi")}</option>
            {targetOptions.filter((o) => o.number !== sel.number).map((o) => <option key={o.number} value={o.number}>{o.label}</option>)}
          </select>
        </div>
      ))}
      {tab === 'acc' && <div className="ac-pbx__checks">
        {ACCESS.map(([k, l]) => <label key={k}><input type="checkbox" checked={acc[k] ?? (k === 'clients')} onChange={(e) => setCfg('access', { ...acc, [k]: e.target.checked })} />{t(l)}</label>)}
      </div>}
      {tab === 'not' && <table className="ac-pbx__notify"><thead><tr><th /><th>E-mail</th><th>Push</th></tr></thead>
        <tbody>{NOTIFS.map(([k, l]) => (
          <tr key={k}><td>{t(l)}</td>
            <td><input type="checkbox" checked={!!notify[k]?.email} onChange={(e) => setNotify(k, 'email', e.target.checked)} /></td>
            <td><input type="checkbox" checked={!!notify[k]?.push} onChange={(e) => setNotify(k, 'push', e.target.checked)} /></td></tr>
        ))}</tbody></table>}
    </>
  )
}

export function Outgoing() {
  const t = useT()
  const { data } = useApi(() => pbxService.outgoing(), [], 'pbx:outgoing')
  const trunks = useApi(() => pbxService.modules('trunk'), [], 'pbx:trunks')
  const [rules, setRules] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (data && rules === null) setRules((data.rules || []).map((r) => ({ ...r, users: (r.users || []).join(';') }))) }, [data]) // eslint-disable-line
  if (rules === null) return <div className="ac-pbx__empty">{t('Yuklanmoqda…')}</div>
  const set = (i, p) => setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const save = async () => {
    setMsg(null)
    try { await pbxService.saveOutgoing(rules.map((r) => ({ ...r, users: String(r.users || '').split(/[;,\s]+/).filter(Boolean) }))); setMsg({ ok: true, text: t('pbx§Saqlandi') }) }
    catch (e) { setMsg({ ok: false, text: e?.message || t('pbx§Saqlab bo\'lmadi') }) }
  }
  return (
    <div className="ac-pbx__page">
      <h3>{t('pbx§CHIQUVCHI QOIDALAR')}</h3>
      <table className="ac-pbx__table">
        <thead><tr><th>№</th><th>{t('pbx§Nomi')}</th><th>{t('pbx§Maska')}</th><th>{t('pbx§Chiqish raqami')}</th><th>{t('pbx§Foydalanuvchilar')}</th><th /></tr></thead>
        <tbody>{rules.map((r, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td><input className="ac-input" value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
            <td><input className="ac-input" value={r.mask} placeholder={t('pbx§Istalgan')} onChange={(e) => set(i, { mask: e.target.value })} /></td>
            <td><select className="ac-select" value={r.trunk} onChange={(e) => set(i, { trunk: e.target.value, externalNumber: e.target.value })}>
              <option value="">—</option>
              {(trunks.data?.modules || []).map((m) => <option key={m.id} value={m.number}>{m.number}</option>)}
            </select></td>
            <td><input className="ac-input" value={r.users} placeholder="100;101" onChange={(e) => set(i, { users: e.target.value })} /></td>
            <td><button type="button" className="ac-btn" onClick={() => setRules(rules.filter((_, j) => j !== i))}>×</button></td>
          </tr>
        ))}</tbody>
      </table>
      <div className="ac-pbx__actions">
        <button type="button" className="ac-btn" onClick={() => setRules([...rules, { name: '', mask: '', trunk: '', externalNumber: '', users: '' }])}>+ {t("pbx§Qoida qo'shish")}</button>
        <button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button>
      </div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
    </div>
  )
}

export function Blacklist() {
  const t = useT()
  const { data, reload } = useApi(() => pbxService.blacklist(), [], 'pbx:blacklist')
  const [num, setNum] = useState('')
  const [err, setErr] = useState('')
  const add = async () => { setErr(''); try { await pbxService.blacklistAdd(num.trim()); setNum(''); reload() } catch (e) { setErr(e?.message || '') } }
  return (
    <div className="ac-pbx__page">
      <h3>{t("pbx§QORA RO'YXAT")}</h3>
      <p className="ac-pbx__muted">{t("pbx§Ro'yxatdagi raqamlardan kelgan qo'ng'iroqlar avtomatik rad etiladi. Blokirovka faqat ko'rsatilgan formatdagi raqamga ishlaydi (+998… va 998… alohida qo'shiladi). Bloklangan qo'ng'iroqlar hisobotlarda ko'rinmaydi va CRM'ga yuklanmaydi.")}</p>
      <div className="ac-pbx__actions">
        <input className="ac-input" value={num} placeholder="+998901234567" onChange={(e) => setNum(e.target.value)} />
        <button type="button" className="ac-btn ac-btn--blue" disabled={!num.trim()} onClick={add}>+ {t("pbx§Raqam qo'shish")}</button>
      </div>
      {err && <div className="ac-pbx__err">{err}</div>}
      {(data?.numbers || []).length === 0 ? <div className="ac-pbx__empty">{t("pbx§Ro'yxatda raqam yo'q.")}</div> : (
        <table className="ac-pbx__table"><tbody>{data.numbers.map((b) => (
          <tr key={b.id}><td>{b.number}</td><td>{b.note || ''}</td><td><button type="button" className="ac-btn" onClick={async () => { await pbxService.blacklistRemove(b.id); reload() }}>×</button></td></tr>
        ))}</tbody></table>
      )}
    </div>
  )
}

export function Music() {
  const t = useT()
  const { data } = useApi(() => pbxService.music(), [], 'pbx:music')
  const audio = useApi(() => pbxService.audioList().catch(() => ({ files: [] })), [], 'pbx:audio')
  const [m, setM] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (data && !m) setM(data) }, [data]) // eslint-disable-line
  if (!m) return <div className="ac-pbx__empty">{t('Yuklanmoqda…')}</div>
  const save = async () => { try { await pbxService.saveMusic(m); setMsg({ ok: true, text: t('pbx§Saqlandi') }) } catch (e) { setMsg({ ok: false, text: e?.message || '' }) } }
  return (
    <div className="ac-pbx__page">
      <h3>{t('pbx§MUSIQA')}</h3>
      <Field label={t('pbx§Qo\'ng\'iroq paytida (gudok o\'rniga)')}><AudioSelect value={m.ringback === 'default' ? '' : m.ringback} files={audio.data?.files || []} onChange={(v) => setM({ ...m, ringback: v || 'default' })} /></Field>
      <Field label={t('pbx§Kutish (hold)')}><AudioSelect value={m.hold === 'default' ? '' : m.hold} files={audio.data?.files || []} onChange={(v) => setM({ ...m, hold: v || 'default' })} /></Field>
      <div className="ac-pbx__actions"><button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button></div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
    </div>
  )
}

export function Diagnostic() {
  const t = useT()
  const { data, reload } = useApi(() => pbxService.validate(), [], 'pbx:validate')
  return (
    <div className="ac-pbx__page">
      <h3>{t('pbx§MARSHRUT DIAGNOSTIKASI')}</h3>
      <button type="button" className="ac-btn" onClick={reload}>{t('pbx§Qayta tekshirish')}</button>
      {data && data.issues.length === 0 && <div className="ac-pbx__ok">{t('pbx§Marshrutda muammo topilmadi')}</div>}
      {data && data.issues.length > 0 && (
        <ul className="ac-pbx__issues">{data.issues.map((i, k) => <li key={k} className={i.level}><b>{i.number}</b> — {i.message}</li>)}</ul>
      )}
      <AsteriskPreview />
      <p className="ac-pbx__muted">{t("pbx§SIP-ro'yxatdan o'tish holati (raqam va foydalanuvchilar) stansiya serverga ulangach shu yerda ko'rinadi.")}</p>
    </div>
  )
}

function AsteriskPreview() {
  const t = useT()
  const [cfg, setCfg] = useState(null)
  const [tab, setTab] = useState('extensions')
  const load = async () => { try { setCfg(await pbxService.asterisk()) } catch { setCfg({ extensions: '', pjsip: '', queues: '' }) } }
  return (
    <div style={{ marginTop: 18 }}>
      <button type="button" className="ac-btn" onClick={load}>{t("pbx§Stansiya sozlamasini ko'rish (Asterisk)")}</button>
      {cfg && (
        <>
          <div className="ac-pbx__tabs" style={{ marginTop: 10 }}>
            {['extensions', 'pjsip', 'queues'].map((k) => <a key={k} href="#" className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k) }}>{k}.conf</a>)}
          </div>
          <pre className="ac-pbx__pre">{cfg[tab] || ''}</pre>
          <p className="ac-pbx__muted">{t("pbx§Parollar yashirilgan. Bu sozlama stansiya serveri ulangach avtomatik qo'llanadi.")}</p>
        </>
      )}
    </div>
  )
}

export function CallbackSettings() {
  const t = useT()
  const { data } = useApi(() => pbxService.callback(), [], 'pbx:callback')
  const [c, setC] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (data && !c) setC(data) }, [data]) // eslint-disable-line
  if (!c) return <div className="ac-pbx__empty">{t('Yuklanmoqda…')}</div>
  const set = (k, v) => setC({ ...c, [k]: v })
  const save = async () => {
    try { const r = await pbxService.saveCallback(c); setC(r); setMsg({ ok: true, text: t('pbx§Saqlandi') }) } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) }
  }
  const snippet = c.key ? `<script src="${window.location.origin}/api/v1/callback/${c.key}/widget.js" async></script>` : ''
  return (
    <div className="ac-pbx__page" style={{ maxWidth: 640 }}>
      <h3>{t('pbx§CALLBACK VIDJETI')}</h3>
      <p className="ac-pbx__muted">{t("pbx§Saytda tugma paydo bo'ladi: mehmon raqamini qoldiradi — CRM'da bitim va qayta qo'ng'iroq vazifasi yaratiladi. Ichki raqam ko'rsatilsa va stansiya ulangan bo'lsa, xodim telefoni avtomatik jiringlaydi.")}</p>
      <Field label={t('pbx§Yoqilgan')}><input type="checkbox" checked={!!c.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Field>
      <Field label={t('pbx§Sarlavha')}><input className="ac-input" value={c.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label={t('pbx§Matn')}><input className="ac-input" value={c.text} onChange={(e) => set('text', e.target.value)} /></Field>
      <Field label={t('pbx§Rang')}><input type="color" value={c.color} onChange={(e) => set('color', e.target.value)} /></Field>
      <Field label={t('pbx§Qo\'ng\'iroq qiladigan ichki raqam')}><input className="ac-input" value={c.ext} placeholder="100" onChange={(e) => set('ext', e.target.value)} /></Field>
      <Field label={t("pbx§Qayta qo'ng'iroq vazifasini yaratish")}><input type="checkbox" checked={!!c.createTask} onChange={(e) => set('createTask', e.target.checked)} /></Field>
      <div className="ac-pbx__actions"><button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button></div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      {snippet && (<><h4 style={{ marginTop: 18 }}>{t('pbx§Saytga qo\'yiladigan kod')}</h4><pre className="ac-pbx__pre">{snippet}</pre></>)}
    </div>
  )
}

export function AutoRecallSettings() {
  const t = useT()
  const { data } = useApi(() => pbxService.autorecall(), [], 'pbx:autorecall')
  const [c, setC] = useState(null)
  const [msg, setMsg] = useState(null)
  useEffect(() => { if (data && !c) setC(data) }, [data]) // eslint-disable-line
  if (!c) return <div className="ac-pbx__empty">{t('Yuklanmoqda…')}</div>
  const set = (k, v) => setC({ ...c, [k]: v })
  const save = async () => {
    setMsg(null)
    try { const r = await pbxService.saveAutorecall({ ...c, delayMin: Number(c.delayMin), attempts: Number(c.attempts), retryMin: Number(c.retryMin), fromHour: Number(c.fromHour), toHour: Number(c.toHour), withinHours: Number(c.withinHours) }); setC(r); setMsg({ ok: true, text: t('pbx§Saqlandi') }) }
    catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) }
  }
  const num = (k, label) => <Field label={t(label)}><input className="ac-input" type="number" value={c[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  return (
    <div className="ac-pbx__page" style={{ maxWidth: 640 }}>
      <h3>{t("pbx§O'TKAZIB YUBORILGANLARGA AVTO-QAYTA QO'NG'IROQ")}</h3>
      <p className="ac-pbx__muted">{t("pbx§Kiruvchi qo'ng'iroq o'tkazib yuborilsa, tizim ko'rsatilgan ichki raqamni jiringlatadi va xodim javob bergach mijozga ulaydi. Faqat ish soatlarida, mijozga keyin qo'ng'iroq qilinmagan bo'lsa.")}</p>
      <Field label={t('pbx§Yoqilgan')}><input type="checkbox" checked={!!c.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Field>
      <Field label={t("pbx§Qo'ng'iroq boshlanadigan ichki raqam")}><input className="ac-input" value={c.ext} placeholder="100" onChange={(e) => set('ext', e.target.value)} /></Field>
      {num('delayMin', "pbx§Birinchi urinishgacha kechikish (daqiqa)")}
      {num('attempts', 'pbx§Urinishlar soni')}
      {num('retryMin', "pbx§Urinishlar orasidagi vaqt (daqiqa)")}
      {num('fromHour', 'pbx§Ish vaqti boshlanishi (soat)')}
      {num('toHour', 'pbx§Ish vaqti tugashi (soat)')}
      {num('withinHours', "pbx§Necha soat ichidagi o'tkazib yuborilganlar")}
      <div className="ac-pbx__actions"><button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button></div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
    </div>
  )
}

export function AudioLibrary() {
  const t = useT()
  const { data, reload } = useApi(() => pbxService.audioList(), [], 'pbx:audio')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [play, setPlay] = useState({})
  const upload = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file) })
      await pbxService.audioAdd({ name: file.name, mime: file.type || 'audio/mpeg', data: b64 })
      await reload()
    } catch (er) { setErr(er?.message || t("pbx§Yuklab bo'lmadi")) } finally { setBusy(false) }
  }
  const listen = async (id) => { try { const b = await pbxService.audioBlob(id); setPlay((p) => ({ ...p, [id]: URL.createObjectURL(b) })) } catch { setErr(t("pbx§Yuklab bo'lmadi")) } }
  const del = async (f) => {
    if (!(await dialog.confirm(t("pbx§Audio o'chirilsinmi?")))) return
    try { await pbxService.audioRemove(f.id); await reload() } catch (er) { setErr(er?.message || '') }
  }
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
  return (
    <div className="ac-pbx__page">
      <h3>{t('pbx§AUDIO FAYLLAR')}</h3>
      <p className="ac-pbx__muted">{t("pbx§Salomlashish, navbat, ovozli pochta va musiqa uchun MP3/WAV/OGG fayllar (har biri 5 MB gacha).")}</p>
      <label className="ac-btn ac-btn--blue" style={{ display: 'inline-flex', alignItems: 'center' }}>{busy ? t('Yuklanmoqda…') : `+ ${t('pbx§Fayl yuklash')}`}<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" hidden onChange={upload} disabled={busy} /></label>
      {err && <div className="ac-pbx__err">{err}</div>}
      {(data?.files || []).length === 0 ? <div className="ac-pbx__empty">{t("pbx§Hali audio fayl yo'q.")}</div> : (
        <table className="ac-pbx__table"><tbody>{data.files.map((f) => (
          <React.Fragment key={f.id}>
            <tr><td>{f.name}</td><td>{kb(f.size)}</td><td>{new Date(f.createdAt).toLocaleDateString('ru-RU')}</td>
              <td><button type="button" className="ac-pbx__play" onClick={() => listen(f.id)}>▶</button></td>
              <td><button type="button" className="ac-btn" onClick={() => del(f)}>×</button></td></tr>
            {play[f.id] && <tr><td colSpan={5}><audio controls autoPlay src={play[f.id]} style={{ width: '100%' }} /></td></tr>}
          </React.Fragment>
        ))}</tbody></table>
      )}
    </div>
  )
}

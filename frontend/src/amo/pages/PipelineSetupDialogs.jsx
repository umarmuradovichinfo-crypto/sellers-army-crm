// Voronka sozlash — modallar: bosqich tavsiflari, dublikat qoidalari (2 tab), manbalar katalogi, tasdiqlash.
import React, { useMemo, useRef, useState } from 'react'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useT } from '../i18n'

function Wrap({ children, onClose, className = '', style }) {
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`ac-modal ${className}`} style={style}>{children}</div>
    </div>
  )
}

// ── Tasdiqlash ("Chiqish" — saqlanmagan o'zgarishlar) ──
export function ConfirmModal({ title, text, yes, no, onYes, onNo }) {
  const t = useT()
  return (
    <Wrap onClose={onNo} style={{ maxWidth: 440 }}>
      <h3 className="ac-modal__title">{title}</h3>
      <div className="ac-ps-hint" style={{ fontSize: 14, marginBottom: 4 }}>{text}</div>
      <div className="ac-modal__foot">
        <button className="ac-btn ac-btn--blue" onClick={onYes}>{yes}</button>
        <button className="ac-btn" onClick={onNo}>{no || t('Bekor qilish')}</button>
      </div>
    </Wrap>
  )
}

// ── Bosqich tavsiflari (Yangi boshlovchi / Tajribali foydalanuvchi / Usta) ──
const LEVELS = [
  { k: 'novice', l: 'Yangi boshlovchi', d: "Yangi foydalanuvchilar uchun bosqichning qo'shimcha tavsifini kiriting" },
  { k: 'experienced', l: 'Tajribali foydalanuvchi', d: "Ozgina tajribaga ega foydalanuvchilar uchun bosqichning qo'shimcha tavsifini kiriting" },
  { k: 'master', l: 'Usta', d: "Qolgan barcha foydalanuvchilar uchun bosqichning qo'shimcha tavsifini kiriting" },
]
export function HintsModal({ stageName, hints, onSave, onClose }) {
  const t = useT()
  const [h, setH] = useState({ novice: hints?.novice || '', experienced: hints?.experienced || '', master: hints?.master || '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { await onSave(h) } catch (e) { setErr(e?.message || t('Saqlanmadi')); setBusy(false) }
  }
  return (
    <Wrap onClose={onClose} className="ac-ps-hints">
      <div className="ac-ps-mhead">
        <h3 className="ac-modal__title" style={{ margin: 0 }}>{t('«{name}» bosqichi uchun tavsiflar').replace('{name}', stageName)}</h3>
        <span className="grow" />
        <button className="ac-ps-link" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="ac-btn" disabled={busy} onClick={save}>{t('Saqlash')}</button>
      </div>
      {LEVELS.map((lv) => (
        <div key={lv.k} className="ac-ps-hint-blk">
          <div className="ac-ps-hint-blk__t">{t(lv.l)}</div>
          <div className="ac-ps-hint-blk__d">{t(lv.d)}</div>
          <textarea className="ac-input ac-ps-ta" placeholder={t('Tavsif')} maxLength={1000} value={h[lv.k]} onChange={(e) => setH((x) => ({ ...x, [lv.k]: e.target.value }))} />
        </div>
      ))}
      {err && <div className="ac-ps-err">{err}</div>}
    </Wrap>
  )
}

// ── Manba ikonkasi ──
export function SrcIco({ kind, size = 18 }) {
  const map = { telegram: ['tg', 'telegram'], facebook: ['fb', 'facebook'], form: ['fm', 'form'], instagram: ['ig', 'instagram'], site: ['st', 'external'] }
  const [cls, ico] = map[kind] || ['fm', 'form']
  return <span className={`ac-ps-conn__ico ${cls}`}><Ico name={ico} size={size} /></span>
}

// ── Dublikat qoidalari: ikki tab ──
function StageTree({ pipes, selected, onChange }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const all = pipes.flatMap((p) => p.stages.map((s) => s.key))
  const sel = selected === null ? new Set(all) : new Set(selected)
  const commit = (set) => onChange(set.size === all.length ? null : [...set])
  const toggleStage = (k) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); commit(n) }
  const togglePipe = (p) => {
    const keys = p.stages.map((s) => s.key)
    const n = new Set(sel)
    const every = keys.every((k) => n.has(k))
    keys.forEach((k) => (every ? n.delete(k) : n.add(k)))
    commit(n)
  }
  const label = selected === null ? `${t('Barcha voronkalar')}, ${t('Barcha bosqichlar')}` : `${sel.size} ${t('bosqich')}`
  return (
    <div className="ac-ps-tree" ref={ref}>
      <button type="button" className="ac-ps-tree__box" onClick={() => setOpen((v) => !v)}>{label}</button>
      {open && (
        <div className="ac-ps-tree__pop">
          <label className="ac-ps-dd__opt"><input type="checkbox" className="ac-check" checked={selected === null} onChange={() => onChange(selected === null ? [] : null)} /><b>{t('Barcha voronkalar')}</b></label>
          {pipes.map((p) => (
            <div key={p.id}>
              <label className="ac-ps-dd__opt"><input type="checkbox" className="ac-check" checked={p.stages.length > 0 && p.stages.every((s) => sel.has(s.key))} onChange={() => togglePipe(p)} /><b>{p.id === 'main' ? t('Asosiy voronka') : p.name}</b></label>
              {p.stages.map((s) => (
                <label key={s.key} className="ac-ps-dd__opt sub"><input type="checkbox" className="ac-check" checked={sel.has(s.key)} onChange={() => toggleStage(s.key)} /><span>{s.name}</span></label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DupModal({ settings, sources, fields, pipes, members, onSave, onClose }) {
  const t = useT()
  const [tab, setTab] = useState('sources')
  const [d, setD] = useState(() => ({ ...settings.dups, afterTask: { ...settings.dups.afterTask } }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p) => setD((x) => ({ ...x, ...p }))
  const pickedFields = d.fields || []
  const addable = fields.filter((f) => f.active !== false && !pickedFields.includes(f.key))
  const stagesSel = useMemo(() => {
    // saqlangan (pipelines + stages) → faqat bosqichlar ro'yxati
    if (d.stages === null || d.stages === undefined) {
      if (d.pipelines === null || d.pipelines === undefined) return null
      return pipes.filter((p) => d.pipelines.includes(p.id)).flatMap((p) => p.stages.map((s) => s.key))
    }
    return d.stages
  }, [d.stages, d.pipelines, pipes])
  const setStages = (sel) => {
    if (sel === null) { set({ stages: null, pipelines: null }); return }
    const pl = pipes.filter((p) => p.stages.some((s) => sel.includes(s.key))).map((p) => p.id)
    set({ stages: sel, pipelines: pl })
  }
  const save = async () => {
    setBusy(true); setErr('')
    try { await onSave(d) } catch (e) { setErr(e?.message || t('Saqlanmadi')); setBusy(false) }
  }
  return (
    <Wrap onClose={onClose} className="ac-ps-dup">
      <div className="ac-ps-tabs">
        <button className={tab === 'sources' ? 'on' : ''} onClick={() => setTab('sources')}>{t('Manbalar')}</button>
        <button className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>{t('Qoidalarni sozlash')}</button>
        <span className="grow" />
        <button className="ac-ps-link" onClick={onClose}>{t('Bekor qilish')}</button>
        <button className="ac-btn" disabled={busy} onClick={save}>{t('Saqlash')}</button>
      </div>
      {tab === 'sources' && (
        <div className="ac-ps-dup__body">
          <p className="ac-ps-dup__intro">{t("Kiruvchi so'rovlarni dublikatga tekshirish qoidalari ishlaydigan manbalarni tanlang.")}<br />{t("Standart holatda, so'rov dublikat bo'lsa ham yangi bitimlar yaratiladi.")}</p>
          {sources.length === 0 && <div className="ac-ps-hint">{t("Ulangan manbalar yo'q")}</div>}
          {sources.map((s) => (
            <div key={s.key} className="ac-ps-dsrc">
              <SrcIco kind={s.kind} />
              <div className="ac-ps-conn__t"><div className="ac-ps-dsrc__name">{s.name}</div><div className="ac-ps-conn__sub">{s.sub}</div></div>
              <span className="grow" />
              <span className={`ac-switch ${d.sources?.[s.key] ? 'on' : ''}`} onClick={() => set({ sources: { ...d.sources, [s.key]: !d.sources?.[s.key] } })} />
            </div>
          ))}
        </div>
      )}
      {tab === 'rules' && (
        <div className="ac-ps-dup__body">
          <div className="ac-ps-sec">{t('Parametrlarni tanlash')}</div>
          <div className="ac-ps-hint">{t("Kiruvchi so'rovni dublikatga tekshirish parametrlarini tanlang")}</div>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={!!d.matchEmail} onChange={(e) => set({ matchEmail: e.target.checked })} />{t('Voronkangizdagi bitimlarda email manzillari mos kelishi')}</label>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={!!d.matchPhone} onChange={(e) => set({ matchPhone: e.target.checked })} />{t('Voronkangizdagi bitimlarda telefon raqamlari mos kelishi')}</label>
          {pickedFields.map((k) => (
            <label key={k} className="ac-ps-chk"><input type="checkbox" className="ac-check" checked onChange={() => set({ fields: pickedFields.filter((x) => x !== k) })} />{fields.find((f) => f.key === k)?.label || k} {t('mos kelishi')}</label>
          ))}
          <select className="ac-select ac-ps-addfield" value="" disabled={!addable.length} onChange={(e) => e.target.value && set({ fields: [...pickedFields, e.target.value] })}>
            <option value="">{t("Maydon qo'shish")}</option>
            {addable.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>

          <div className="ac-ps-sec" style={{ marginTop: 22 }}>{t('Dublikat qidiriladigan voronka va bosqichlar')}:</div>
          <StageTree pipes={pipes} selected={stagesSel} onChange={setStages} />

          <div className="ac-ps-sep" />
          <div className="ac-ps-sec">{t("Bitim va kiruvchi so'rov ma'lumotlari to'qnashganda")}:</div>
          <label className="ac-ps-chk"><input type="radio" checked={d.onConflict !== 'keep'} onChange={() => set({ onConflict: 'update' })} />{t("Kiruvchi so'rov ma'lumotlari bilan yangilash")}</label>
          <label className="ac-ps-chk"><input type="radio" checked={d.onConflict === 'keep'} onChange={() => set({ onConflict: 'keep' })} />{t("Joriy bitim ma'lumotlarini qoldirish")}</label>

          <div className="ac-ps-sec" style={{ marginTop: 20 }}>{t("Kiruvchi so'rov bo'yicha bir nechta dublikat topilganda")}:</div>
          <div className="ac-ps-hint">{t("3 tadan ortiq dublikat topilsa, birlashtirish amalga oshmaydi")}</div>
          <select className="ac-select" style={{ maxWidth: 290, marginTop: 8 }} value={d.onMultiple || 'newest'} onChange={(e) => set({ onMultiple: e.target.value })}>
            <option value="newest">{t('Eng yangi bitimni yangilash')}</option>
            <option value="oldest">{t('Eng eski bitimni yangilash')}</option>
          </select>

          <div className="ac-ps-sep" />
          <div className="ac-ps-sec">{t('Birlashtirgandan keyin')}:</div>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={!!d.afterTask?.enabled} onChange={(e) => set({ afterTask: { ...d.afterTask, enabled: e.target.checked } })} />{t('Vazifa yaratish')}</label>
          {d.afterTask?.enabled && (
            <div className="ac-ps-after">
              <select className="ac-select" value={d.afterTask.assignee || 'lead'} onChange={(e) => set({ afterTask: { ...d.afterTask, assignee: e.target.value } })}>
                <option value="lead">{t("Joriy mas'ul")}</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input className="ac-input" value={d.afterTask.text || ''} placeholder={t('Vazifa matni')} onChange={(e) => set({ afterTask: { ...d.afterTask, text: e.target.value } })} />
            </div>
          )}
        </div>
      )}
      {err && <div className="ac-ps-err" style={{ padding: '0 20px 14px' }}>{err}</div>}
    </Wrap>
  )
}

// ── Bitim manbalari katalogi ──
export function SourcesCatalog({ metaOn, tgOn, onGo, onClose }) {
  const t = useT()
  const tiles = [
    { k: 'instagram', cls: 'ig', name: 'Instagram', ico: 'instagram', btn: metaOn ? "Qo'shish" : 'Ulash' },
    { k: 'telegram', cls: 'tg', name: 'Telegram', ico: 'telegram', btn: tgOn ? 'Tanlash' : "Qo'shish" },
    { k: 'facebook', cls: 'fb', name: 'Facebook', ico: 'facebook', btn: metaOn ? "Qo'shish" : 'Ulash' },
    { k: 'forms', cls: 'fm', name: 'Forma konstruktori', ico: 'form', btn: "Qo'shish" },
    { k: 'site', cls: 'st', name: 'Sayt formasi', ico: 'external', btn: "Qo'shish" },
  ]
  return (
    <Wrap onClose={onClose} className="ac-ps-catalog">
      <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
      <h3 className="ac-modal__title" style={{ fontSize: 18 }}>{t('Bitim manbalari')}</h3>
      <div className="ac-ps-tiles">
        {tiles.map((x) => (
          <div key={x.k} className={`ac-ps-src-tile ${x.cls}`}>
            <span className="ac-ps-src-tile__ico"><Ico name={x.ico} size={34} /></span>
            <span className="ac-ps-src-tile__name">{t(x.name)}</span>
            <button type="button" onClick={() => onGo(x.k)}>{x.btn === "Qo'shish" ? <Ico name="plus" size={11} /> : null}{t(x.btn)}</button>
          </div>
        ))}
      </div>
    </Wrap>
  )
}

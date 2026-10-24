// amoCRM filtr paneli (.filter-search): chapda presetlar + saqlangan filtrlar, o'rtada bitim xususiyatlari (FILTERS-SPEC tartibida), o'ngda teglar.
import React, { useEffect, useMemo, useState } from 'react'
import { Ico } from './AmoIcons'
import { useOutside } from './TopBar'
import { useT } from './i18n'
import MultiSelect from './MultiSelect'
import { crmService } from '../services/crm.service'
import { useApi } from '../lib/useApi'
import {
  EMPTY_FILTER, PRESETS, DATE_PRESETS, TASK_OPTIONS, UNSORTED_OPTIONS, UTM_KEYS, stageToken,
} from './filterState'
import './i18n/leadsfilter.ru.js'

export { EMPTY_FILTER, PRESETS }

function Range({ from, to, onFrom, onTo, ph, type = 'text', raw }) {
  const t = useT()
  return (
    <div className="ac-filter__range">
      <input className="ac-input" type={type} placeholder={ph ? t(ph) : ''} value={from ?? ''} onChange={(e) => onFrom(type === 'text' ? e.target.value.replace(/[^\d.\-]/g, '') : e.target.value)} />
      <span>-</span>
      <input className="ac-input" type={type} value={to ?? ''} onChange={(e) => onTo(type === 'text' ? e.target.value.replace(/[^\d.\-]/g, '') : e.target.value)} />
    </div>
  )
}

// Maxsus maydon (turiga qarab), amoCRM ixcham ko'rinishida
export function CustomField({ field, value, onChange }) {
  const t = useT()
  const ty = field.type
  if (ty === 'select' || ty === 'multiselect') {
    const opts = [...(field.options || []).map((o) => ({ value: o, label: o })), { value: 'empty', label: t("Bo'sh") }]
    return <MultiSelect options={opts} value={value || []} onChange={onChange} label={field.label} />
  }
  if (ty === 'number') return <Range from={value?.from} to={value?.to} onFrom={(v) => onChange({ ...value, from: v })} onTo={(v) => onChange({ ...value, to: v })} ph={field.label} raw />
  if (ty === 'date') {
    const v = value || {}
    return <DateControl label={field.label} f={{ datePreset: v.preset || '', from: v.from || '', to: v.to || '' }}
      setF={(fn) => { const n = fn({ datePreset: v.preset || '', from: v.from || '', to: v.to || '' }); onChange({ preset: n.datePreset || undefined, from: n.from || undefined, to: n.to || undefined }) }} />
  }
  if (ty === 'checkbox') {
    return <MultiSelect single search={false} chevron options={[{ value: '', label: t('Hisobga olinmasin') }, { value: 'yes', label: t('Ha') }, { value: 'no', label: t("Yo'q") }]} value={value || ''} onChange={onChange} label={field.label} emptyText="Hisobga olinmasin" />
  }
  return <input className="ac-input" placeholder={field.label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
}

// Sana boshqaruvi (amoCRM: "📅 За все время" — ochilganda sana turi, davrlar va oraliq)
function DateControl({ f, setF, dateFields = [], label }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const preset = DATE_PRESETS.find((d) => d.key === f.datePreset)
  const range = f.from || f.to ? `${f.from || '…'} — ${f.to || '…'}` : ''
  const kind = f.dateField && f.dateField !== 'created' ? (f.dateField === 'closed' ? t('Yopilgan') : dateFields.find((d) => d.key === f.dateField)?.label) : ''
  const text = preset ? t(preset.label) : range || t('Butun vaqt uchun')
  return (
    <div className={`ac-ms ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="ac-ms__btn ac-ms__btn--amo" onClick={() => setOpen((v) => !v)}>
        <Ico name="calendar" size={12} />
        <span className={preset || range ? '' : 'ph'}>{label ? `${label}: ` : ''}{kind ? `${kind}: ` : ''}{text}</span>
      </button>
      {open && (
        <div className="ac-ms__pop ac-datepop">
          {!label && (
            <div className="ac-filter__seg">
              <button className={f.dateField === 'created' || !f.dateField ? 'on' : ''} onClick={() => setF((p) => ({ ...p, dateField: 'created' }))}>{t('Yaratilgan')}</button>
              <button className={f.dateField === 'closed' ? 'on' : ''} onClick={() => setF((p) => ({ ...p, dateField: 'closed' }))}>{t('Yopilgan')}</button>
              {dateFields.map((d) => <button key={d.key} className={f.dateField === d.key ? 'on' : ''} onClick={() => setF((p) => ({ ...p, dateField: d.key }))}>{d.label}</button>)}
            </div>
          )}
          <div className="ac-ms__list">
            {DATE_PRESETS.map((d) => (
              <label key={d.key} className={`ac-ms__item ${f.datePreset === d.key ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); setF((p) => ({ ...p, datePreset: d.key, from: '', to: '' })); setOpen(false) }}>
                <span className={`ac-ms__radio ${f.datePreset === d.key ? 'on' : ''}`} /><span className="lbl">{t(d.label)}</span>
              </label>
            ))}
          </div>
          <Range type="date" from={f.from} to={f.to} onFrom={(v) => setF((p) => ({ ...p, from: v, datePreset: '' }))} onTo={(v) => setF((p) => ({ ...p, to: v, datePreset: '' }))} />
        </div>
      )}
    </div>
  )
}

export default function LeadsFilter({ value, meta, onApply }) {
  const [f, setF] = useState(value)
  const [tagQ, setTagQ] = useState('')
  const [saveName, setSaveName] = useState('')
  const [allTags, setAllTags] = useState(false)
  const t = useT()
  useEffect(() => setF(value), [value])
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleTag = (name) => set('tags', f.tags.includes(name) ? f.tags.filter((x) => x !== name) : [...f.tags, name])
  const saved = useApi(() => crmService.listFilters(), [], 'amo-saved-filters')

  const pipeName = useMemo(() => {
    const m = new Map((meta.pipelines || []).map((p) => [p.id, p.name]))
    return (pid) => (pid ? m.get(pid) || t('Voronka') : t('Asosiy voronka'))
  }, [meta.pipelines]) // eslint-disable-line
  const pipeOrder = (pid) => (pid ? 1 + (meta.pipelines || []).findIndex((p) => p.id === pid) : 0)
  const stageOpts = useMemo(() => [
    { value: 'unsorted', label: t('Saralanmagan'), group: '', kind: 'unsorted', color: '#c1c1c1' },
    ...[...(meta.stages || [])].sort((a, b) => pipeOrder(a.pipelineId) - pipeOrder(b.pipelineId) || a.order - b.order)
      .map((s) => ({ value: stageToken(s), label: s.name, group: pipeName(s.pipelineId), kind: s.kind, color: s.color })),
  ], [meta.stages, meta.pipelines]) // eslint-disable-line
  const mem = (meta.members || []).map((m) => ({ value: m.id, label: m.name }))
  const memNone = [{ value: 'none', label: t("Mas'ulsiz") }, ...mem]
  const dateFields = (meta.fields || []).filter((x) => x.type === 'date')
  const customDateOn = f.dateField && f.dateField !== 'created' && f.dateField !== 'closed'
  const srcOpts = [{ value: 'none', label: t("Ko'rsatilmagan") }, ...(meta.sources || []).map((s) => ({ value: s.name, label: s.name, note: s.count || '' }))]
  const reasonOpts = [{ value: 'none', label: t('Sababsiz') }, ...(meta.reasons || []).map((r) => ({ value: r.name, label: r.name }))]
  const fields = meta.fields || []
  const setCf = (key, v) => setF((p) => ({ ...p, cf: { ...p.cf, [key]: v } }))
  const apply = (nf) => onApply(nf)

  const savedList = saved.data?.filters || []
  const saveCurrent = async () => {
    const name = saveName.trim()
    if (!name) return
    await crmService.createFilter(name, f)
    setSaveName('')
    saved.reload()
  }

  return (
    <>
      <div className="ac-filter__presets">
        {PRESETS.map((p) => (
          <div key={p.key} className={`ac-filter__preset ${f.preset === p.key ? 'on' : ''}`} onClick={() => apply({ ...EMPTY_FILTER, preset: p.key })}>
            {p.dot && <span className="ac-dot" style={{ background: p.dot }} />}
            {p.star && <span className="ac-filter__star" style={{ color: p.star }}><Ico name="star" size={12} /></span>}
            <span className="lbl">{t(p.label)}</span>
            <span className="edit" title={t('Tahrirlash')} onClick={(e) => { e.stopPropagation(); setF({ ...EMPTY_FILTER, preset: p.key }) }}><Ico name="edit" size={13} /></span>
          </div>
        ))}
        {savedList.length > 0 && <div className="ac-filter__cap" style={{ marginTop: 14 }}>{t('Saqlangan filtrlar')}</div>}
        {savedList.map((s) => {
          let params = {}
          try { params = JSON.parse(s.paramsJson || '{}') } catch { /* */ }
          return (
            <div key={s.id} className="ac-filter__preset" onClick={() => apply({ ...EMPTY_FILTER, ...params })}>
              <span className="lbl">{s.name}</span>
              <span className="edit" title={t('Tahrirlash')} onClick={(e) => { e.stopPropagation(); setF({ ...EMPTY_FILTER, ...params }); setSaveName(s.name) }}><Ico name="edit" size={13} /></span>
              <span className="edit" title={t("O'chirish")} onClick={async (e) => { e.stopPropagation(); await crmService.deleteFilter(s.id); saved.reload() }}><Ico name="trash" size={13} /></span>
            </div>
          )
        })}
        {JSON.stringify(f) !== JSON.stringify(value) && <div className="ac-filter__save">
          <input className="ac-input" placeholder={t('Filtr nomi')} value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrent()} />
          <button className="ac-btn ac-btn--sm" disabled={!saveName.trim()} onClick={saveCurrent}>{t('Saqlash')}</button>
        </div>}
      </div>

      <div className="ac-filter__col ac-filter__col--fields">
        {/* amoCRM: sarlavhasiz ixcham qatorlar — "Nom: Все значения" yoki placeholder = nom */}
        <input className="ac-input" placeholder={t('Bitim nomi')} value={f.name} onChange={(e) => set('name', e.target.value)} />
        <DateControl f={f} setF={setF} dateFields={dateFields} />
        <MultiSelect options={stageOpts} groups value={f.stages} onChange={(v) => set('stages', v)} label="" emptyText="Faol bosqichlar"
          quick={[{ label: 'Faol bosqichlar', pick: (o) => o.filter((x) => x.kind === 'open').map((x) => x.value) }]} />
        <MultiSelect options={reasonOpts} value={f.lostReasons} onChange={(v) => set('lostReasons', v)} label={t('Rad etish sabablari')} />
        <MultiSelect search={false} options={UNSORTED_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={f.unsortedCategory} onChange={(v) => set('unsortedCategory', v)} label={t('Saralanmagan turi')} />
        <MultiSelect options={srcOpts} value={f.sources} onChange={(v) => set('sources', v)} label={t('Bitim manbasi')} />
        <MultiSelect options={memNone} value={f.assigneeIds} onChange={(v) => set('assigneeIds', v)} label={t('Menejerlar')} />
        <MultiSelect options={mem} value={f.createdByIds} onChange={(v) => set('createdByIds', v)} label={t('Kim yaratgan')} />
        <MultiSelect options={mem} value={f.updatedByIds} onChange={(v) => set('updatedByIds', v)} label={t("Kim o'zgartirgan")} />
        <MultiSelect search={false} options={TASK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={f.tasks} onChange={(v) => set('tasks', v)} label={t('Vazifalar')} />
        <Range from={f.budgetFrom} to={f.budgetTo} onFrom={(v) => set('budgetFrom', v.replace(/\D/g, ''))} onTo={(v) => set('budgetTo', v.replace(/\D/g, ''))} ph="Byudjet" />
        <MultiSelect single search={false} chevron options={[['', 'Hisobga olinmasin'], ['no', "Yo'q"], ['yes', 'Bor']].map(([k, l]) => ({ value: k, label: t(l) }))}
          value={f.attention} onChange={(v) => set('attention', v)} label={t("E'tibor talab")} emptyText="Hisobga olinmasin" />

        {fields.map((fd) => <CustomField key={fd.key} field={fd} value={f.cf[fd.key]} onChange={(v) => setCf(fd.key, v)} />)}

        {UTM_KEYS.map((k) => (
          <input key={k} className="ac-input" placeholder={k} value={f.utm[k] || ''}
            onChange={(e) => { const u = { ...f.utm, [k]: e.target.value }; if (!e.target.value) delete u[k]; set('utm', u) }} />
        ))}

        <input className="ac-input" placeholder={t('Kontakt: F.I.Sh.')} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        <input className="ac-input" placeholder={t('Kontakt: telefon')} value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
        <input className="ac-input" placeholder="Email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        <input className="ac-input" placeholder={t('Lavozim')} value={f.contactPosition} onChange={(e) => set('contactPosition', e.target.value)} />
        <input className="ac-input" placeholder={t('Kompaniya nomi')} value={f.companyName} onChange={(e) => set('companyName', e.target.value)} />

        <div className="ac-filter__foot">
          <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => apply(f)}>{t("Qo'llash")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => apply(EMPTY_FILTER)}>{t('Tozalash')}</button>
        </div>
      </div>

      <div className="ac-filter__col">
        <div className="ac-filter__label">{t('Teglar')} <a href="/settings/tags" onClick={(e) => e.stopPropagation()}>{t('Boshqarish')}</a></div>
        <input className="ac-input" style={{ width: 235 }} placeholder={t('Teg topish')} value={tagQ} onChange={(e) => setTagQ(e.target.value)} />
        <div className="ac-filter__tags">
          {(meta.tags || []).filter((x) => !tagQ || x.name.toLowerCase().includes(tagQ.toLowerCase())).slice(0, allTags || tagQ ? undefined : 40).map((x) => (
            <span key={x.id || x.name} className="ac-filter__tagrow">
              <span className={`ac-tag ${x.color ? 'ac-tag--c' : ''} ${f.tags.includes(x.name) ? 'on' : ''}`} style={x.color ? { '--tag': x.color } : undefined} onClick={() => toggleTag(x.name)}>{x.name}</span>
              {x.usage != null && x.usage}
            </span>
          ))}
        </div>
        {!allTags && !tagQ && (meta.tags || []).length > 40 && <a className="ac-filter__more" onClick={() => setAllTags(true)}>{t('Boshqa teglar')}</a>}
      </div>
    </>
  )
}

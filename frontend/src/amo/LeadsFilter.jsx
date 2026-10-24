// amoCRM filtr paneli (.filter-search): chapda presetlar + saqlangan filtrlar, o'rtada bitim xususiyatlari (FILTERS-SPEC tartibida), o'ngda teglar.
import React, { useEffect, useMemo, useState } from 'react'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import MultiSelect from './MultiSelect'
import { crmService } from '../services/crm.service'
import { useApi } from '../lib/useApi'
import {
  EMPTY_FILTER, PRESETS, DATE_PRESETS, TASK_OPTIONS, UNSORTED_OPTIONS, UTM_KEYS, stageToken,
} from './filterState'
import './i18n/leadsfilter.ru.js'

export { EMPTY_FILTER, PRESETS }

function Block({ label, children }) {
  const t = useT()
  return <div className="ac-filter__block"><div className="ac-filter__cap">{t(label)}</div>{children}</div>
}

function Range({ from, to, onFrom, onTo, ph, type = 'text' }) {
  const t = useT()
  return (
    <div className="ac-filter__range">
      <input className="ac-input" type={type} placeholder={ph ? t(ph) : ''} value={from ?? ''} onChange={(e) => onFrom(type === 'text' ? e.target.value.replace(/[^\d.\-]/g, '') : e.target.value)} />
      <span>-</span>
      <input className="ac-input" type={type} value={to ?? ''} onChange={(e) => onTo(type === 'text' ? e.target.value.replace(/[^\d.\-]/g, '') : e.target.value)} />
    </div>
  )
}

// Maxsus maydon (turiga qarab)
function CustomField({ field, value, onChange }) {
  const t = useT()
  const ty = field.type
  if (ty === 'select' || ty === 'multiselect') {
    const opts = [...(field.options || []).map((o) => ({ value: o, label: o })), { value: 'empty', label: t("Bo'sh") }]
    return <MultiSelect options={opts} value={value || []} onChange={onChange} placeholder={field.label} />
  }
  if (ty === 'number') return <div><div className="ac-filter__sub">{field.label}</div><Range from={value?.from} to={value?.to} onFrom={(v) => onChange({ ...value, from: v })} onTo={(v) => onChange({ ...value, to: v })} ph={t('dan')} /></div>
  if (ty === 'date') {
    const v = value || {}
    return (
      <div>
        <div className="ac-filter__sub">{field.label}</div>
        <MultiSelect single search={false} options={DATE_PRESETS.map((d) => ({ value: d.key, label: t(d.label) }))} value={v.preset || ''} onChange={(p) => onChange({ preset: p })} placeholder={t('Butun vaqt uchun')} />
        <Range type="date" from={v.from} to={v.to} onFrom={(x) => onChange({ from: x, to: v.to })} onTo={(x) => onChange({ from: v.from, to: x })} />
      </div>
    )
  }
  if (ty === 'checkbox') {
    return (
      <MultiSelect single search={false} options={[{ value: '', label: t(field.label) }, { value: 'yes', label: t('Ha') }, { value: 'no', label: t("Yo'q") }]} value={value || ''} onChange={onChange} placeholder={field.label} />
    )
  }
  return <input className="ac-input" placeholder={field.label} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
}

export default function LeadsFilter({ value, meta, onApply }) {
  const [f, setF] = useState(value)
  const [tagQ, setTagQ] = useState('')
  const [saveName, setSaveName] = useState('')
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
        <div className="ac-filter__save">
          <input className="ac-input" placeholder={t('Filtr nomi')} value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrent()} />
          <button className="ac-btn ac-btn--sm" disabled={!saveName.trim()} onClick={saveCurrent}>{t('Saqlash')}</button>
        </div>
      </div>

      <div className="ac-filter__col ac-filter__col--fields">
        <div className="ac-filter__label">{t('Bitim xususiyatlari')}</div>
        <input className="ac-input" placeholder={t('Bitim nomi')} value={f.name} onChange={(e) => set('name', e.target.value)} />

        <Block label="Sana">
          <div className="ac-filter__seg">
            <button className={f.dateField === 'created' || !f.dateField ? 'on' : ''} onClick={() => set('dateField', 'created')}>{t('Yaratilgan')}</button>
            <button className={f.dateField === 'closed' ? 'on' : ''} onClick={() => set('dateField', 'closed')}>{t('Yopilgan')}</button>
          </div>
          {dateFields.length > 0 && (
            <MultiSelect single search={false} options={dateFields.map((d) => ({ value: d.key, label: d.label }))} value={customDateOn ? f.dateField : ''} onChange={(v) => set('dateField', v || 'created')} placeholder={t('Boshqa sana maydoni')} />
          )}
          <MultiSelect single search={false} options={DATE_PRESETS.map((d) => ({ value: d.key, label: t(d.label) }))} value={f.datePreset} onChange={(v) => setF((p) => ({ ...p, datePreset: v, from: '', to: '' }))} placeholder={t('Butun vaqt uchun')} />
          <Range type="date" from={f.from} to={f.to} onFrom={(v) => setF((p) => ({ ...p, from: v, datePreset: '' }))} onTo={(v) => setF((p) => ({ ...p, to: v, datePreset: '' }))} />
        </Block>

        <Block label="Bosqichlar">
          <MultiSelect options={stageOpts} groups value={f.stages} onChange={(v) => set('stages', v)} placeholder={t('Bosqichlarni tanlang')}
            quick={[{ label: 'Faol bosqichlar', pick: (o) => o.filter((x) => x.kind === 'open').map((x) => x.value) }]} />
        </Block>
        <Block label="Rad etish sababi"><MultiSelect options={reasonOpts} value={f.lostReasons} onChange={(v) => set('lostReasons', v)} placeholder={t('Sababni tanlang')} /></Block>
        <Block label="Saralanmagan turi"><MultiSelect search={false} options={UNSORTED_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={f.unsortedCategory} onChange={(v) => set('unsortedCategory', v)} placeholder={t('Turini tanlang')} /></Block>
        <Block label="Manba"><MultiSelect options={srcOpts} value={f.sources} onChange={(v) => set('sources', v)} placeholder={t('Manbani tanlang')} /></Block>
        <Block label="Menejerlar"><MultiSelect options={memNone} value={f.assigneeIds} onChange={(v) => set('assigneeIds', v)} placeholder={t('Menejerni tanlang')} /></Block>
        <Block label="Kim yaratgan"><MultiSelect options={mem} value={f.createdByIds} onChange={(v) => set('createdByIds', v)} placeholder={t('Foydalanuvchini tanlang')} /></Block>
        <Block label="Kim o'zgartirgan"><MultiSelect options={mem} value={f.updatedByIds} onChange={(v) => set('updatedByIds', v)} placeholder={t('Foydalanuvchini tanlang')} /></Block>
        <Block label="Vazifalar"><MultiSelect search={false} options={TASK_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} value={f.tasks} onChange={(v) => set('tasks', v)} placeholder={t('Barcha qiymatlar')} /></Block>
        <Block label="Byudjet"><Range from={f.budgetFrom} to={f.budgetTo} onFrom={(v) => set('budgetFrom', v.replace(/\D/g, ''))} onTo={(v) => set('budgetTo', v.replace(/\D/g, ''))} ph="dan" /></Block>
        <Block label="E'tibor talab">
          <div className="ac-filter__seg">
            {[['', 'Hisobga olinmasin'], ['no', "Yo'q"], ['yes', 'Bor']].map(([k, l]) => <button key={k} className={f.attention === k ? 'on' : ''} onClick={() => set('attention', k)}>{t(l)}</button>)}
          </div>
        </Block>

        {fields.map((fd) => (
          <Block key={fd.key} label={fd.label}>
            <CustomField field={fd} value={f.cf[fd.key]} onChange={(v) => setCf(fd.key, v)} />
          </Block>
        ))}

        <Block label="UTM">
          <MultiSelect single search={false} options={UTM_KEYS.filter((k) => !(k in f.utm)).map((k) => ({ value: k, label: k }))} value="" onChange={(k) => k && set('utm', { ...f.utm, [k]: '' })} placeholder={t('Maydonni tanlang')} />
          {Object.keys(f.utm).map((k) => (
            <div key={k} className="ac-filter__utm">
              <input className="ac-input" placeholder={k} value={f.utm[k]} onChange={(e) => set('utm', { ...f.utm, [k]: e.target.value })} />
              <button className="ac-top__dots" style={{ width: 24, height: 24 }} onClick={() => { const u = { ...f.utm }; delete u[k]; set('utm', u) }}><Ico name="close" size={11} /></button>
            </div>
          ))}
        </Block>

        <div className="ac-filter__label" style={{ marginTop: 8 }}>{t('Kontakt xususiyatlari')}</div>
        <input className="ac-input" placeholder={t('Kontakt: F.I.Sh.')} value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
        <input className="ac-input" placeholder={t('Kontakt: telefon')} value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
        <input className="ac-input" placeholder="Email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        <input className="ac-input" placeholder={t('Lavozim')} value={f.contactPosition} onChange={(e) => set('contactPosition', e.target.value)} />
        <div className="ac-filter__label" style={{ marginTop: 8 }}>{t('Kompaniya xususiyatlari')}</div>
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
          {(meta.tags || []).filter((x) => !tagQ || x.name.toLowerCase().includes(tagQ.toLowerCase())).map((x) => (
            <span key={x.id || x.name} className="ac-filter__tagrow">
              <span className={`ac-tag ${f.tags.includes(x.name) ? 'on' : ''}`} style={x.color ? { borderColor: x.color } : undefined} onClick={() => toggleTag(x.name)}>{x.name}</span>
              {x.usage != null && x.usage}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

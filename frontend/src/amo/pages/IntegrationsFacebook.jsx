// Facebook / Instagram Lead Ads — OAuth, sahifa → forma → maydonlarni moslash → yo'nalish (mantiq: eski FacebookSettingsView).
import React, { useEffect, useState } from 'react'
import { facebookService } from '../../services/facebook.service'
import { crmService } from '../../services/crm.service'
import { useT } from '../i18n'

const STEPS = ['Sahifa', 'Forma', 'Maydonlar', "Yo'nalish"]

function guessTarget(f) {
  const k = String(f.key || '').toLowerCase()
  const ty = String(f.type || '').toUpperCase()
  if (ty.includes('PHONE') || k.includes('phone')) return 'phone'
  if (ty.includes('EMAIL') || k.includes('email')) return 'email'
  if (ty.includes('NAME') || ['full_name', 'first_name', 'last_name', 'name'].includes(k)) return 'name'
  return f.label || f.key
}
function safeParse(s) { try { return JSON.parse(s || '{}') } catch { return {} } }

export default function IntegrationsFacebook({ stages = [], members = [], pipelines = [], onStatus }) {
  const t = useT()
  const [cfg, setCfg] = useState(null)
  const [mappings, setMappings] = useState([])
  const [msg, setMsg] = useState(null)
  const [wiz, setWiz] = useState(null)

  const load = async () => {
    const c = await facebookService.getConfig()
    setCfg(c); onStatus?.(c.enabled && c.pages.length > 0)
    try { const m = await facebookService.listMappings(); setMappings(m.mappings || []) } catch { /* */ }
  }
  useEffect(() => { load().catch((e) => setMsg({ ok: false, m: e.message || t('Xatolik') })) }, []) // eslint-disable-line

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('fb')) {
      setMsg(p.get('fb') === 'ok' ? { ok: true, m: `${t('Facebook ulandi')} — ${p.get('pages') || 0}` } : { ok: false, m: t('Facebook ulanmadi') + ': ' + (p.get('msg') || '') })
      ;['fb', 'pages', 'msg'].forEach((k) => p.delete(k))
      window.history.replaceState({}, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''))
    }
  }, []) // eslint-disable-line

  const oauth = async () => {
    try { const r = await facebookService.oauthUrl(); window.location.href = r.url }
    catch { setMsg({ ok: false, m: t("Facebook ilova hali sozlanmagan. Administrator serverda Meta ilovani (App ID/Secret) bir marta ulashi kerak.") }) }
  }
  const remove = async (m) => {
    if (!window.confirm(`"${m.formName}" — ${t('uzilsinmi?')}`)) return
    try {
      await facebookService.deleteMapping(m.id)
      setMappings((ms) => ms.filter((x) => x.id !== m.id))
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
  }
  const toggle = async (m) => {
    try {
      const r = await facebookService.saveMapping({ ...m, fieldMap: safeParse(m.fieldMapJson), active: !(m.active !== false) })
      setMappings((ms) => ms.map((x) => (x.id === m.id ? r.mapping : x)))
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
  }

  if (cfg === null) return msg ? <div className="ac-int-msg err">{msg.m}</div> : <div className="ac-spinner" />
  const connected = cfg.enabled && cfg.pages.length > 0

  if (wiz) {
    return (
      <Wizard cfg={cfg} existing={mappings} stages={stages} members={members} pipelines={pipelines}
        initial={wiz === true ? null : wiz} onCancel={() => setWiz(null)}
        onSaved={(m) => { setMappings((ms) => [m, ...ms.filter((x) => x.formId !== m.formId)]); setWiz(null); setMsg({ ok: true, m: t('Forma ulandi — yangi lidlar Saralanmaganga tushadi') }) }} />
    )
  }
  return (
    <>
      <div className="ac-int-lead">{t("Facebook / Instagram Lead Ads formalaridan yangi lidlar avtomatik CRM'ga, «Saralanmagan» bo'limiga tushadi.")}</div>
      {msg && <div className={`ac-int-msg ${msg.ok ? 'ok' : 'err'}`} style={{ marginBottom: 12 }}>{msg.m}</div>}
      {!connected ? (
        <div className="ac-int-actions" style={{ marginTop: 0 }}>
          <button className="ac-btn ac-btn--blue" onClick={oauth}>{t('Facebook bilan ulash')}</button>
        </div>
      ) : (
        <>
          <div className="ac-int-actions" style={{ marginTop: 0, justifyContent: 'space-between' }}>
            <span className="ac-set-status ok">{t('Ulangan')} · {cfg.pages.length} {t('sahifa')}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="ac-btn" onClick={oauth}>{t('Qayta ulash')}</button>
              <button className="ac-btn ac-btn--blue" onClick={() => setWiz(true)}><span className="ac-btn__plus">+</span> {t("Forma qo'shish")}</button>
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            {mappings.length === 0 && <div className="ac-muted" style={{ padding: '20px 0' }}>{t("Hali forma ulanmagan.")}</div>}
            {mappings.map((m) => {
              const mapped = Object.values(safeParse(m.fieldMapJson)).filter(Boolean).length
              return (
                <div key={m.id} className="ac-int-list-item">
                  <div className="grow">
                    <div className="nm">{m.formName}</div>
                    <div className="ac-int-sub">{m.pageName || '—'} · {mapped} {t('maydon moslangan')}{m.source ? ` · ${m.source}` : ''}</div>
                  </div>
                  <span className={`ac-switch ${m.active !== false ? 'on' : ''}`} onClick={() => toggle(m)} />
                  <button className="ac-btn ac-btn--sm" onClick={() => setWiz({ ...m, fieldMap: safeParse(m.fieldMapJson) })}>{t('Tahrirlash')}</button>
                  <button className="ac-int-x" title={t('Uzish')} onClick={() => remove(m)}>×</button>
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

function Wizard({ cfg, existing, stages, members, pipelines, initial, onCancel, onSaved }) {
  const t = useT()
  const editing = !!initial
  const [step, setStep] = useState(editing ? 2 : 0)
  const [pageId, setPageId] = useState(initial?.pageId || cfg.pages[0]?.id || '')
  const [form, setForm] = useState(initial ? { id: initial.formId, name: initial.formName } : null)
  const [forms, setForms] = useState(null)
  const [fields, setFields] = useState(null)
  const [fieldMap, setFieldMap] = useState(initial?.fieldMap || {})
  const [pipelineId, setPipelineId] = useState(initial?.pipelineId || '')
  const [stageKey, setStageKey] = useState(initial?.stageKey || '')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId || '')
  const [source, setSource] = useState(initial?.source || 'Facebook')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const [pStages, setPStages] = useState(stages)
  useEffect(() => {
    // tanlangan voronkaning bosqichlari (asosiy voronkaniki emas)
    let alive = true
    crmService.getPipeline(pipelineId || undefined).then((r) => {
      if (!alive) return
      const list = (r.stages || []).filter((x) => x.kind === 'open').map((x) => ({ id: x.id ?? x.key, name: x.name }))
      setPStages(list)
      setStageKey((k) => (k && !list.some((x) => x.id === k) ? '' : k))
    }).catch(() => { if (alive) setPStages(pipelineId ? [] : stages) })
    return () => { alive = false }
  }, [pipelineId]) // eslint-disable-line

  const page = cfg.pages.find((p) => p.id === pageId) || cfg.pages[0]
  const used = new Set(existing.filter((m) => !initial || m.formId !== initial.formId).map((m) => m.formId))

  useEffect(() => {
    if (step !== 1) return
    setForms(null)
    facebookService.listForms(pageId).then((r) => setForms(r.forms || [])).catch(() => setForms([]))
  }, [step, pageId])
  useEffect(() => {
    if (step !== 2 || !form) return
    setFields(null)
    facebookService.formFields(pageId, form.id).then((r) => {
      const fs = r.fields || []
      setFields(fs)
      if (!editing && Object.keys(fieldMap).length === 0) setFieldMap(Object.fromEntries(fs.map((f) => [f.key, guessTarget(f)])))
    }).catch(() => setFields([]))
  }, [step, form && form.id]) // eslint-disable-line

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await facebookService.saveMapping({
        formId: form.id, formName: form.name, pageId, pageName: page?.name || '', destination: 'crm', source: source || 'Facebook',
        pipelineId: pipelineId || null, stageKey: stageKey || null, assigneeId: assigneeId || null, fieldMap, active: initial?.active !== false,
      })
      onSaved(r.mapping)
    } catch (e) { setErr(e.message || t('Saqlanmadi')); setBusy(false) }
  }
  const canNext = (step === 0 && pageId) || (step === 1 && form) || step === 2
  const back = () => (step === 0 || (editing && step === 2) ? onCancel() : setStep((s) => s - 1))

  return (
    <>
      <div className="ac-int-steps">
        {STEPS.map((s, i) => <React.Fragment key={s}><span className={i === step ? 'on' : ''}>{i + 1}. {t(s)}</span>{i < 3 && <span>›</span>}</React.Fragment>)}
      </div>
      {step === 0 && cfg.pages.map((p) => (
        <div key={p.id} className={`ac-int-radio ${pageId === p.id ? 'on' : ''}`} onClick={() => setPageId(p.id)}>
          <input type="radio" readOnly checked={pageId === p.id} /><b>{p.name}</b>
        </div>
      ))}
      {step === 1 && (forms === null ? <div className="ac-spinner" /> : (
        <>
          {forms.length === 0 && <div className="ac-muted">{t('Bu sahifada lead forma topilmadi.')}</div>}
          {forms.map((f) => (
            <div key={f.id} className={`ac-int-radio ${form?.id === f.id ? 'on' : ''}`} style={{ opacity: used.has(f.id) ? 0.5 : 1 }}
              onClick={() => !used.has(f.id) && setForm({ id: f.id, name: f.name })}>
              <input type="radio" readOnly checked={form?.id === f.id} /><b style={{ flex: 1 }}>{f.name}</b>
              {used.has(f.id) && <span className="ac-muted" style={{ fontSize: 12 }}>{t('allaqachon ulangan')}</span>}
            </div>
          ))}
        </>
      ))}
      {step === 2 && (fields === null ? <div className="ac-spinner" /> : (
        <>
          <div className="ac-int-lead">{t('Facebook forma maydonini CRM maydoniga moslang:')}</div>
          {fields.map((f) => {
            const cur = fieldMap[f.key]
            const sel = ['name', 'phone', 'email'].includes(cur) ? cur : (cur === '' || cur === undefined ? '__skip__' : '__custom__')
            return (
              <div key={f.key} className="ac-int-list-item">
                <div className="grow"><div className="nm">{f.label}</div><div className="ac-int-sub">{f.key}</div></div>
                <select className="ac-select" style={{ width: 210 }} value={sel}
                  onChange={(e) => setFieldMap((m) => ({ ...m, [f.key]: e.target.value === '__custom__' ? (f.label || f.key) : e.target.value === '__skip__' ? '' : e.target.value }))}>
                  <option value="name">{t('Ism (lid nomi)')}</option>
                  <option value="phone">{t('Telefon')}</option>
                  <option value="email">Email</option>
                  <option value="__custom__">{t("Qo'shimcha maydon")}</option>
                  <option value="__skip__">{t("— o'tkazib yuborish")}</option>
                </select>
              </div>
            )
          })}
        </>
      ))}
      {step === 3 && (
        <>
          <div className="ac-int-grid2">
            {pipelines.length > 0 && (
              <div className="ac-int-field"><label>{t('Voronka')}</label>
                <select className="ac-select" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                  <option value="">{t('Asosiy voronka')}</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            )}
            <div className="ac-int-field"><label>{t('Bosqich')}</label>
              <select className="ac-select" value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
                <option value="">{t('Saralanmagan')}</option>{pStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="ac-int-field"><label>{t("Mas'ul")}</label>
              <select className="ac-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select></div>
            <div className="ac-int-field"><label>{t('Manba belgisi')}</label>
              <input className="ac-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Facebook" /></div>
          </div>
        </>
      )}
      {err && <div className="ac-int-msg err">{err}</div>}
      <div className="ac-int-actions">
        <button className="ac-btn" onClick={back} disabled={busy}>{step === 0 || (editing && step === 2) ? t('Bekor qilish') : t('Orqaga')}</button>
        {step < 3
          ? <button className="ac-btn ac-btn--blue" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{t('Keyingi')}</button>
          : <button className="ac-btn ac-btn--blue" onClick={save} disabled={busy || !form}>{busy ? t('Saqlanmoqda…') : editing ? t('Saqlash') : t('Ulash')}</button>}
      </div>
    </>
  )
}

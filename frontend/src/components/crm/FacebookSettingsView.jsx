import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading, Pill, Switch } from '../ui'
import { facebookService } from '../../services/facebook.service'

// CRM → Facebook Lead Ads. amoCRM oqimini AYNAN takrorlaydi:
//   1) Facebook akkountni ulash (OAuth)  2) Sahifani tanlash  3) Formani tanlash
//   4) FB forma maydonlarini CRM maydonlariga MOSLASH  5) Voronka/bosqich/mas'ul.
// Yangi lidlar "Saralanmagan" (Incoming leads)ga tushadi — qabul/rad qilinadi.
// Meta ilova (App ID/Secret) — administrator bir marta env'da sozlaydi.

const STEPS = ['Sahifa', 'Forma', 'Maydonlar', 'Yoʻnalish']

// FB maydon turiga qarab CRM maydonini avto taxmin qilish (amoCRM ham shunday qiladi)
function guessTarget(f) {
  const k = String(f.key || '').toLowerCase()
  const t = String(f.type || '').toUpperCase()
  if (t.includes('PHONE') || k.includes('phone')) return 'phone'
  if (t.includes('EMAIL') || k.includes('email')) return 'email'
  if (t.includes('NAME') || k === 'full_name' || k === 'first_name' || k === 'last_name' || k === 'name') return 'name'
  return f.label || f.key // maxsus maydon — nomi bilan saqlanadi
}

export default function FacebookSettingsView({ stages = [], members = [], pipelines = [] }) {
  const [cfg, setCfg] = useState(null)
  const [mappings, setMappings] = useState([])
  const [msg, setMsg] = useState(null)
  const [wiz, setWiz] = useState(null) // sozlash sehrgari (wizard) yoki null

  const load = async () => {
    const c = await facebookService.getConfig()
    setCfg(c)
    try { const m = await facebookService.listMappings(); setMappings(m.mappings || []) } catch { /* */ }
  }
  useEffect(() => { load() }, [])

  // OAuth qaytishi (?fb=ok/error)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('fb')) {
      setMsg(p.get('fb') === 'ok'
        ? { t: 'ok', m: `Facebook ulandi — ${p.get('pages') || 0} sahifa` }
        : { t: 'err', m: 'Facebook ulanmadi: ' + (p.get('msg') || 'xato') })
      p.delete('fb'); p.delete('pages'); p.delete('msg')
      window.history.replaceState({}, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''))
    }
  }, [])

  const oauth = async () => {
    try { const r = await facebookService.oauthUrl(); window.location.href = r.url }
    catch { setMsg({ t: 'err', m: 'Facebook ilova hali sozlanmagan. Administrator server sozlamalarida Meta ilovani (App ID/Secret) bir marta ulashi kerak.' }) }
  }

  const removeMapping = async (m) => {
    if (!await dialog.confirm(`"${m.formName}" formasi uzilsinmi?`)) return
    await facebookService.deleteMapping(m.id)
    setMappings((ms) => ms.filter((x) => x.id !== m.id))
  }
  const toggleMapping = async (m) => {
    const r = await facebookService.saveMapping({ ...m, fieldMap: safeParse(m.fieldMapJson), active: !(m.active !== false) })
    setMappings((ms) => ms.map((x) => (x.id === m.id ? r.mapping : x)))
  }
  const onWizardSaved = (mapping) => {
    setMappings((ms) => [mapping, ...ms.filter((x) => x.formId !== mapping.formId)])
    setWiz(null)
    setMsg({ t: 'ok', m: `"${mapping.formName}" ulandi — yangi lidlar Saralanmaganga tushadi` })
  }

  if (cfg === null) return <Loading />
  const connected = cfg.enabled && cfg.pages.length > 0

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="fx ac gap10 mb16">
        <b style={{ fontSize: 15 }}>Facebook / Instagram Lead Ads</b>
        {connected ? <Pill kind="ok">Ulangan · {cfg.pages.length} sahifa</Pill> : <Pill kind="mut">Ulanmagan</Pill>}
      </div>
      {msg && <div style={{ marginBottom: 12, color: `var(--${msg.t === 'err' ? 'dang' : 'ok'})`, fontSize: 13, fontWeight: 600 }}>{msg.m}</div>}

      {!connected ? (
        <div className="card" style={{ textAlign: 'center', padding: '26px 20px' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📘</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Facebook akkountingizni ulang</div>
          <div className="sub2" style={{ fontSize: 13, maxWidth: 440, margin: '0 auto 16px' }}>
            Instagram ulangan Facebook akkountingizni avtorizatsiya qiling — mavjud Lead Ads formalaringiz shu yerda chiqadi va yangi lidlar avtomatik CRM'ga tushadi. Hech qanday token yoki webhook kerak emas.
          </div>
          <button className="btn" style={{ background: '#1877F2', color: '#fff', borderColor: '#1877F2', fontSize: 14, padding: '10px 20px' }} onClick={oauth}>
            <Icon name="send" size={16} /> Facebook bilan ulash
          </button>
        </div>
      ) : wiz ? (
        <FormWizard cfg={cfg} existing={mappings} stages={stages} members={members} pipelines={pipelines}
          initial={wiz === true ? null : wiz} onCancel={() => setWiz(null)} onSaved={onWizardSaved} />
      ) : (
        <>
          <div className="fx ac gap10 mb16" style={{ flexWrap: 'wrap' }}>
            <span className="sub2" style={{ fontSize: 13 }}>Boshqa akkount yoki sahifalarni qayta ulash:</span>
            <button className="btn sm" style={{ background: '#1877F2', color: '#fff', borderColor: '#1877F2' }} onClick={oauth}>
              <Icon name="send" size={13} /> Qayta ulash
            </button>
          </div>

          <div className="fx ac jsb mb10" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <b style={{ fontSize: 13.5 }}>Ulangan formalar</b>
              <div className="sub2" style={{ fontSize: 12 }}>Har bir forma CRM (lid) ga yoʻnaltiriladi.</div>
            </div>
            <button className="btn sm primary" onClick={() => setWiz(true)}><Icon name="plus" size={14} /> Forma qoʻshish</button>
          </div>

          {mappings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '22px', color: 'var(--mut)', fontSize: 13 }}>
              Hali forma ulanmagan. <b>Forma qoʻshish</b> tugmasini bosing.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {mappings.map((m) => {
                const fm = safeParse(m.fieldMapJson)
                const mapped = Object.values(fm).filter((v) => v && v !== '').length
                return (
                  <div key={m.id} className="card" style={{ padding: 12 }}>
                    <div className="fx ac gap8">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="fx ac gap6"><b style={{ fontSize: 13 }}>{m.formName}</b>
                          <Pill kind="ok">CRM · lid</Pill>
                        </div>
                        <div className="sub2" style={{ fontSize: 11.5, marginTop: 2 }}>
                          {m.pageName || '—'} · {mapped} maydon moslangan{m.source ? ` · manba: ${m.source}` : ''}
                        </div>
                      </div>
                      <Switch checked={m.active !== false} onChange={() => toggleMapping(m)} />
                      <button className="btn sm" onClick={() => setWiz({ ...m, fieldMap: fm })}>Tahrir</button>
                      <button className="hr-x" onClick={() => removeMapping(m)} title="Uzish">×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sozlash sehrgari (amoCRM: sahifa → forma → maydonlar → yoʻnalish) ──
function FormWizard({ cfg, existing, stages, members, pipelines, initial, onCancel, onSaved }) {
  const editing = !!initial
  const [step, setStep] = useState(editing ? 2 : 0)
  const [pageId, setPageId] = useState(initial?.pageId || (cfg.pages[0]?.id || ''))
  const [form, setForm] = useState(initial ? { id: initial.formId, name: initial.formName } : null)
  const [forms, setForms] = useState(null)
  const [fields, setFields] = useState(null)
  const [fieldMap, setFieldMap] = useState(initial?.fieldMap || {})
  const [pipelineId, setPipelineId] = useState(initial?.pipelineId || '')
  const [stageKey, setStageKey] = useState(initial?.stageKey || '')
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId || '')
  const [source, setSource] = useState(initial?.source || 'Facebook')
  const [busy, setBusy] = useState(false)

  const page = cfg.pages.find((p) => p.id === pageId) || cfg.pages[0]
  const usedFormIds = new Set(existing.filter((m) => !initial || m.formId !== initial.formId).map((m) => m.formId))

  // Step 2 (Forma): sahifadagi formalarni yuklash
  useEffect(() => {
    if (step !== 1) return
    setForms(null)
    facebookService.listForms(pageId).then((r) => setForms(r.forms || [])).catch(() => setForms([]))
  }, [step, pageId])

  // Step 3 (Maydonlar): forma savollarini yuklab, avto-mapping taxmin qilish
  useEffect(() => {
    if (step !== 2 || !form) return
    setFields(null)
    facebookService.formFields(pageId, form.id).then((r) => {
      const fs = r.fields || []
      setFields(fs)
      if (!editing && Object.keys(fieldMap).length === 0) {
        const guess = {}
        for (const f of fs) guess[f.key] = guessTarget(f)
        setFieldMap(guess)
      }
    }).catch(() => setFields([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form && form.id])

  const setTarget = (key, val) => setFieldMap((m) => ({ ...m, [key]: val }))

  const save = async () => {
    setBusy(true)
    try {
      const dto = {
        formId: form.id, formName: form.name, pageId, pageName: page?.name || '',
        destination: 'crm', source: source || 'Facebook',
        pipelineId: pipelineId || null,
        stageKey: stageKey || null,
        assigneeId: assigneeId || null,
        fieldMap, active: initial?.active !== false,
      }
      const r = await facebookService.saveMapping(dto)
      onSaved(r.mapping)
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi'); setBusy(false) }
  }

  const canNext = (step === 0 && pageId) || (step === 1 && form) || step === 2
  const next = () => setStep((s) => Math.min(3, s + 1))
  const back = () => (step === 0 || (editing && step === 2) ? onCancel() : setStep((s) => s - 1))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Stepper */}
      <div className="fx ac gap6" style={{ padding: '12px 14px', borderBottom: '1px solid var(--bd)', flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <span className="fx ac gap6" style={{ opacity: i === step ? 1 : 0.5 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                background: i <= step ? '#1877F2' : 'var(--bd)', color: i <= step ? '#fff' : 'var(--mut)' }}>{i + 1}</span>
              <b style={{ fontSize: 12.5 }}>{s}</b>
            </span>
            {i < STEPS.length - 1 && <span style={{ flex: '0 0 16px', height: 1, background: 'var(--bd)' }} />}
          </React.Fragment>
        ))}
      </div>

      <div style={{ padding: 16, minHeight: 180 }}>
        {/* 1 — Sahifa */}
        {step === 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="sub2" style={{ fontSize: 12.5, marginBottom: 2 }}>Qaysi Facebook sahifasidan lid olamiz?</div>
            {cfg.pages.map((p) => (
              <label key={p.id} className="fx ac gap8" style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                borderColor: pageId === p.id ? '#1877F2' : 'var(--bd)' }}>
                <input type="radio" name="fbpage" checked={pageId === p.id} onChange={() => setPageId(p.id)} />
                <span style={{ fontSize: 20 }}>📘</span>
                <b style={{ fontSize: 13 }}>{p.name}</b>
              </label>
            ))}
          </div>
        )}

        {/* 2 — Forma */}
        {step === 1 && (forms === null ? <Loading /> : (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="sub2" style={{ fontSize: 12.5, marginBottom: 2 }}>Qaysi Lead Ads formasidan lid keladi?</div>
            {forms.length === 0 && <div className="sub2" style={{ fontSize: 12 }}>Bu sahifada lead forma topilmadi.</div>}
            {forms.map((f) => {
              const used = usedFormIds.has(f.id)
              return (
                <label key={f.id} className="fx ac gap8" style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 12px',
                  cursor: used ? 'not-allowed' : 'pointer', opacity: used ? 0.5 : 1, borderColor: form?.id === f.id ? '#1877F2' : 'var(--bd)' }}>
                  <input type="radio" name="fbform" disabled={used} checked={form?.id === f.id} onChange={() => setForm({ id: f.id, name: f.name })} />
                  <b style={{ flex: 1, fontSize: 13 }}>{f.name}</b>
                  {used && <span className="sub2" style={{ fontSize: 11 }}>allaqachon ulangan</span>}
                </label>
              )
            })}
          </div>
        ))}

        {/* 3 — Maydonlarni moslash (amoCRM imzo qadami) */}
        {step === 2 && (fields === null ? <Loading /> : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="sub2" style={{ fontSize: 12.5, marginBottom: 4 }}>Facebook forma maydonini CRM maydoniga moslang:</div>
            <div className="fx ac gap8" style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 700, padding: '0 2px' }}>
              <span style={{ flex: 1 }}>Facebook maydoni</span><span style={{ width: 200 }}>CRM maydoni</span>
            </div>
            {fields.length === 0 && <div className="sub2" style={{ fontSize: 12 }}>Forma maydonlari topilmadi.</div>}
            {fields.map((f) => {
              const cur = fieldMap[f.key]
              const sel = cur === 'name' || cur === 'phone' || cur === 'email' ? cur : (cur === '' || cur === undefined ? '__skip__' : '__custom__')
              return (
                <div key={f.key} className="fx ac gap8" style={{ padding: '5px 2px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</div>
                    <div className="sub2" style={{ fontSize: 11 }}>{f.key}</div>
                  </div>
                  <span className="sub2" style={{ fontSize: 12 }}>→</span>
                  <select className="hr-select" style={{ width: 200 }} value={sel}
                    onChange={(e) => setTarget(f.key, e.target.value === '__custom__' ? (f.label || f.key) : e.target.value === '__skip__' ? '' : e.target.value)}>
                    <option value="name">Ism (lid nomi)</option>
                    <option value="phone">Telefon</option>
                    <option value="email">Email</option>
                    <option value="__custom__">Qoʻshimcha maydon</option>
                    <option value="__skip__">— oʻtkazib yuborish</option>
                  </select>
                </div>
              )
            })}
          </div>
        ))}

        {/* 4 — Yoʻnalish (voronka/bosqich/masʼul) */}
        {step === 3 && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="sub2" style={{ fontSize: 12.5 }}>Lidlar CRM'ga tushadi. Voronka, bosqich va masʼulni tanlang:</div>
            {(
              <div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>
                {pipelines.length > 0 && (
                  <select className="hr-select" style={{ width: 170 }} value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                    <option value="">Standart voronka</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <select className="hr-select" style={{ width: 170 }} value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
                  <option value="">Saralanmagan (Incoming)</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select className="hr-select" style={{ width: 170 }} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">Masʼul — yoʻq</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            )}
            <div className="hr-field" style={{ maxWidth: 260 }}>
              <label style={{ fontSize: 12 }}>Manba belgisi</label>
              <input className="hr-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Facebook" />
            </div>
            <div className="sub2" style={{ fontSize: 12 }}>Yangi lidlar avval <b>Saralanmagan</b> boʻlimiga tushadi — u yerda qabul yoki rad qilasiz.</div>
          </div>
        )}
      </div>

      {/* Footer tugmalar */}
      <div className="fx ac jsb" style={{ padding: '12px 14px', borderTop: '1px solid var(--bd)', gap: 8 }}>
        <button className="btn sm" onClick={back} disabled={busy}>{step === 0 || (editing && step === 2) ? 'Bekor' : 'Orqaga'}</button>
        {step < 3
          ? <button className="btn sm primary" onClick={next} disabled={!canNext}>Keyingi</button>
          : <button className="btn sm primary" onClick={save} disabled={busy || !form}>{busy ? 'Saqlanmoqda…' : editing ? 'Saqlash' : 'Ulash'}</button>}
      </div>
    </div>
  )
}

function safeParse(s) { try { return JSON.parse(s || '{}') } catch { return {} } }

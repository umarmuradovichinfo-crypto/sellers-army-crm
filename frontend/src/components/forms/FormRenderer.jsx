import React, { useMemo, useState } from 'react'
import { inputTypeFor, validateField, toPages, maybeShuffle } from './formTypes'

// Google Forms uslubidagi ommaviy forma ko'rinishi. CRM (/lead/:slug) ishlatadi.
//   form = { title, description, fields, settings }
//   idKey = 'key' (CRM) | 'id' (HR)
//   onSubmit(answers) -> Promise
export default function FormRenderer({ form, idKey = 'id', onSubmit, brand = 'Sellers Army CRM' }) {
  const settings = form.settings || {}
  const theme = settings.themeColor || '#8CD211'
  const pages = useMemo(() => toPages(form.fields || []), [form.fields])
  const multi = pages.length > 1

  const [answers, setAnswers] = useState({})
  const [otherOn, setOtherOn] = useState({})
  const [otherText, setOtherText] = useState({})
  const [page, setPage] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)

  const kof = (f) => f[idKey]
  const set = (f, v) => setAnswers((p) => ({ ...p, [kof(f)]: v }))
  const toggleMulti = (f, o) => setAnswers((p) => {
    const cur = Array.isArray(p[kof(f)]) ? p[kof(f)] : []
    return { ...p, [kof(f)]: cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o] }
  })

  // "Boshqa" ni hisobga olib yakuniy javobni yig'ish
  const finalValue = (f) => {
    const id = kof(f)
    if (f.type === 'single_choice') return otherOn[id] ? (otherText[id] || '') : answers[id]
    if (f.type === 'multi_choice') {
      const base = Array.isArray(answers[id]) ? answers[id] : []
      return otherOn[id] && otherText[id] ? [...base, otherText[id]] : base
    }
    return answers[id]
  }

  const validatePage = (pi) => {
    for (const f of pages[pi].fields) {
      const msg = validateField(f, finalValue(f))
      if (msg) { setErr(msg); return false }
    }
    setErr(null); return true
  }

  const next = () => { if (validatePage(page)) setPage((p) => Math.min(p + 1, pages.length - 1)) }
  const back = () => { setErr(null); setPage((p) => Math.max(p - 1, 0)) }

  const submit = async (e) => {
    e.preventDefault()
    for (let pi = 0; pi < pages.length; pi++) {
      if (!validatePage(pi)) { setPage(pi); return }
    }
    // yakuniy javoblar (Boshqa qo'shilgan holda)
    const out = {}
    for (const p of pages) for (const f of p.fields) {
      const v = finalValue(f)
      if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) out[kof(f)] = v
    }
    setSubmitting(true); setErr(null)
    try { await onSubmit(out); setDone(true) }
    catch (e2) { setErr(e2.message || 'Yuborishda xatolik') }
    finally { setSubmitting(false) }
  }

  if (done) return (
    <div className="apply-wrap">
      <div className="apply-card apply-done" style={{ borderTop: `6px solid ${theme}` }}>
        <div className="apply-check" style={{ background: theme }}>✓</div>
        <h2>Rahmat!</h2>
        <p className="sub2">{settings.confirmationMessage || 'So‘rovingiz qabul qilindi. Tez orada siz bilan bog‘lanamiz.'}</p>
      </div>
    </div>
  )

  const cur = pages[page]

  return (
    <div className="apply-wrap">
      <form className="apply-card gf-render" onSubmit={submit} style={{ '--gf-theme': theme }}>
        {settings.headerImage
          ? <div className="gf-render-banner"><img src={settings.headerImage} alt="" /></div>
          : <div className="gf-render-top" style={{ background: theme }} />}
        {page === 0 && (
          <div className="apply-head">
            <h2>{form.title}</h2>
            {form.description && <p className="sub2">{form.description}</p>}
          </div>
        )}

        {multi && settings.progressBar !== false && (
          <div className="gf-progress"><div className="gf-progress-bar" style={{ width: `${((page + 1) / pages.length) * 100}%`, background: theme }} /></div>
        )}

        {cur.section && (
          <div className="gf-render-section">
            <h3>{cur.section.label}</h3>
            {cur.section.description && <p className="sub2">{cur.section.description}</p>}
          </div>
        )}

        {cur.fields.map((f) => (
          <FieldView key={kof(f)} f={f} id={kof(f)} theme={theme}
            answers={answers} set={set} toggleMulti={toggleMulti}
            otherOn={otherOn} setOtherOn={setOtherOn} otherText={otherText} setOtherText={setOtherText} />
        ))}

        {err && <div className="apply-err">{err}</div>}

        <div className="gf-nav">
          {multi && page > 0 && <button type="button" className="btn" onClick={back}>← Orqaga</button>}
          <div className="f1" />
          {multi && page < pages.length - 1
            ? <button type="button" className="btn primary" style={{ background: theme, borderColor: theme }} onClick={next}>Keyingi →</button>
            : <button className="btn primary apply-submit" style={{ background: theme, borderColor: theme }} disabled={submitting}>{submitting ? 'Yuborilmoqda…' : 'Yuborish'}</button>}
        </div>
      </form>
      <div className="apply-foot">{brand}</div>
    </div>
  )
}

function FieldView({ f, id, theme, answers, set, toggleMulti, otherOn, setOtherOn, otherText, setOtherText, }) {
  const opts = useMemo(() => maybeShuffle(f.options || [], f.shuffle), [f.options, f.shuffle])

  return (
    <div className="apply-field">
      <label>{f.label}{f.required && <span className="apply-req"> *</span>}</label>
      {f.description && <div className="gf-fhelp">{f.description}</div>}

      {f.type === 'long_text' || f.type === 'textarea' ? (
        <textarea className="hr-area" value={answers[id] || ''} onChange={(e) => set(f, e.target.value)} />
      ) : f.type === 'single_choice' ? (
        <div className="apply-opts">
          {opts.map((o) => (
            <label className="apply-opt" key={o}>
              <input type="radio" name={id} checked={!otherOn[id] && answers[id] === o}
                onChange={() => { setOtherOn((p) => ({ ...p, [id]: false })); set(f, o) }} /> {o}
            </label>
          ))}
          {f.hasOther && (
            <label className="apply-opt gf-other-in">
              <input type="radio" name={id} checked={!!otherOn[id]} onChange={() => setOtherOn((p) => ({ ...p, [id]: true }))} />
              <span>Boshqa:</span>
              <input className="hr-input" style={{ height: 30 }} value={otherText[id] || ''}
                onFocus={() => setOtherOn((p) => ({ ...p, [id]: true }))}
                onChange={(e) => setOtherText((p) => ({ ...p, [id]: e.target.value }))} />
            </label>
          )}
        </div>
      ) : f.type === 'multi_choice' ? (
        <div className="apply-opts">
          {opts.map((o) => (
            <label className="apply-opt" key={o}>
              <input type="checkbox" checked={(answers[id] || []).includes(o)} onChange={() => toggleMulti(f, o)} /> {o}
            </label>
          ))}
          {f.hasOther && (
            <label className="apply-opt gf-other-in">
              <input type="checkbox" checked={!!otherOn[id]} onChange={(e) => setOtherOn((p) => ({ ...p, [id]: e.target.checked }))} />
              <span>Boshqa:</span>
              <input className="hr-input" style={{ height: 30 }} value={otherText[id] || ''}
                onFocus={() => setOtherOn((p) => ({ ...p, [id]: true }))}
                onChange={(e) => setOtherText((p) => ({ ...p, [id]: e.target.value }))} />
            </label>
          )}
        </div>
      ) : f.type === 'dropdown' ? (
        <select className="hr-select" value={answers[id] || ''} onChange={(e) => set(f, e.target.value)}>
          <option value="">— tanlang —</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === 'linear_scale' ? (
        <ScaleView f={f} id={id} theme={theme} value={answers[id]} onPick={(n) => set(f, n)} />
      ) : f.type === 'rating' ? (
        <RatingView max={f.ratingMax || 5} value={Number(answers[id]) || 0} onPick={(n) => set(f, n)} />
      ) : (
        <input className="hr-input" type={inputTypeFor(f.type)} value={answers[id] || ''} onChange={(e) => set(f, e.target.value)} />
      )}
    </div>
  )
}

function ScaleView({ f, id, theme, value, onPick }) {
  const min = f.scaleMin ?? 1
  const max = f.scaleMax ?? 5
  const nums = []
  for (let n = min; n <= max; n++) nums.push(n)
  return (
    <div className="gf-scale">
      {f.scaleMinLabel && <span className="gf-scale-lbl">{f.scaleMinLabel}</span>}
      <div className="gf-scale-nums">
        {nums.map((n) => (
          <label key={n} className="gf-scale-num">
            <span>{n}</span>
            <input type="radio" name={id} checked={String(value) === String(n)} onChange={() => onPick(n)}
              style={{ accentColor: theme }} />
          </label>
        ))}
      </div>
      {f.scaleMaxLabel && <span className="gf-scale-lbl">{f.scaleMaxLabel}</span>}
    </div>
  )
}

function RatingView({ max, value, onPick }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="gf-rating" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <span key={n} className="gf-star" style={{ color: (hover || value) >= n ? '#F5A623' : 'var(--bd)' }}
          onMouseEnter={() => setHover(n)} onClick={() => onPick(n)}>★</span>
      ))}
      {value > 0 && <span className="sub2" style={{ fontSize: 12, marginLeft: 6 }}>{value}/{max}</span>}
    </div>
  )
}

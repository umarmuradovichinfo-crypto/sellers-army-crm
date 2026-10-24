import React, { useState } from 'react'
import Icon from '../Icon'
import { FIELD_TYPES, CHOICE_TYPES } from './formTypes'
import FormImagePicker from './FormImagePicker'

// Google Forms uslubidagi savol-tuzuvchi. Controlled: value = {title, description, fields, settings}.
//   makeField() — adapter yangi maydon yaratadi (to'g'ri id/key bilan)
//   idKey — 'id' (HR) yoki 'key' (CRM)
//   mapOptions/mapLabel — har savolni ustunga bog'lash (ixtiyoriy)
export default function FormBuilder({ value, onChange, makeField, idKey = 'id', mapOptions = null, mapLabel = "Bog'lash", extraHeader = null }) {
  const form = value
  const fields = form.fields || []
  const settings = form.settings || {}
  const [imgPicker, setImgPicker] = useState(false)
  const patch = (p) => onChange({ ...form, ...p })
  const setFields = (fn) => patch({ fields: fn(fields) })
  const setField = (i, p) => setFields((xs) => xs.map((x, j) => (j === i ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)))
  const addField = (afterIndex = fields.length - 1) => {
    const nf = makeField()
    setFields((xs) => { const a = [...xs]; a.splice(afterIndex + 1, 0, nf); return a })
  }
  const addSection = () => {
    const nf = { ...makeField(), type: 'section', label: 'Yangi bo\'lim', description: '' }
    setFields((xs) => [...xs, nf])
  }
  const dupField = (i) => setFields((xs) => { const a = [...xs]; const c = { ...a[i], [idKey]: (makeField()[idKey]) }; a.splice(i + 1, 0, c); return a })
  const rmField = (i) => setFields((xs) => xs.filter((_, j) => j !== i))
  const move = (i, dir) => setFields((xs) => { const a = [...xs]; const j = i + dir; if (j < 0 || j >= a.length) return xs; [a[i], a[j]] = [a[j], a[i]]; return a })

  return (
    <div className="gf-build">
      {/* Sarlavha kartasi */}
      <div className="gf-card gf-head" style={{ borderTopColor: settings.themeColor || 'var(--lime)', paddingTop: settings.headerImage ? 0 : undefined, overflow: 'hidden' }}>
        {settings.headerImage && (
          <div className="gf-head-banner">
            <img src={settings.headerImage} alt="" />
            <div className="gf-head-banner-acts">
              <button type="button" className="btn sm" onClick={() => setImgPicker(true)}><Icon name="edit" size={12} />O'zgartirish</button>
              <button type="button" className="btn sm" onClick={() => patch({ settings: { ...settings, headerImage: '' } })}>×</button>
            </div>
          </div>
        )}
        <div style={{ padding: settings.headerImage ? '14px 0 0' : 0 }}>
        <input className="gf-title-input" value={form.title || ''} placeholder="Forma nomi"
          onChange={(e) => patch({ title: e.target.value })} />
        <input className="gf-desc-input" value={form.description || ''} placeholder="Forma tavsifi (ixtiyoriy)"
          onChange={(e) => patch({ description: e.target.value })} />
        {extraHeader}
        </div>
      </div>

      {/* Savollar */}
      {fields.map((fd, i) => (
        <FieldCard key={fd[idKey] || i} field={fd} idKey={idKey} mapOptions={mapOptions} mapLabel={mapLabel}
          onChange={(p) => setField(i, p)} onDup={() => dupField(i)} onRemove={() => rmField(i)}
          onUp={() => move(i, -1)} onDown={() => move(i, 1)} />
      ))}

      {/* Qo'shish tugmalari */}
      <div className="gf-addbar">
        <button type="button" className="btn" onClick={() => addField()}><Icon name="plus" size={15} />Savol qo'shish</button>
        <button type="button" className="btn" onClick={addSection}><Icon name="checklist" size={15} />Bo'lim qo'shish</button>
      </div>

      {/* Forma sozlamalari (Google Forms uslubi) */}
      <div className="gf-card gf-settings">
        <div className="gf-set-title">Forma sozlamalari</div>
        <div className="hr-field" style={{ marginBottom: 12 }}>
          <label>Banner rasm (forma tepasida)</label>
          {settings.headerImage
            ? <div className="fx ac gap10">
                <img src={settings.headerImage} alt="" className="gf-set-thumb" />
                <button type="button" className="btn sm" onClick={() => setImgPicker(true)}>O'zgartirish</button>
                <button type="button" className="btn sm" style={{ color: 'var(--dang)' }} onClick={() => patch({ settings: { ...settings, headerImage: '' } })}>O'chirish</button>
              </div>
            : <button type="button" className="btn" onClick={() => setImgPicker(true)}><Icon name="plus" size={15} />Rasm qo'shish (AI / standart / yuklash / havola)</button>}
        </div>
        <div className="hr-grid2">
          <div className="hr-field" style={{ margin: 0 }}>
            <label>Rang (mavzu)</label>
            <div className="fx ac gap8">
              {['#8CD211', '#3F77DD', '#7C5CFC', '#E0574B', '#F5A623', '#20B486', '#111827'].map((c) => (
                <button type="button" key={c} onClick={() => patch({ settings: { ...settings, themeColor: c } })}
                  className="gf-swatch" style={{ background: c, outline: (settings.themeColor || '#8CD211') === c ? '2px solid var(--ink)' : 'none' }} title={c} />
              ))}
            </div>
          </div>
          <label className="apply-opt" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={settings.progressBar !== false} onChange={(e) => patch({ settings: { ...settings, progressBar: e.target.checked } })} />
            Bo'limlarda progress ko'rsatilsin
          </label>
        </div>
        <div className="hr-field" style={{ marginBottom: 0, marginTop: 10 }}>
          <label>Yuborilgandan keyingi xabar</label>
          <textarea className="hr-input" rows={2} value={settings.confirmationMessage || ''}
            placeholder="Rahmat! So'rovingiz qabul qilindi."
            onChange={(e) => patch({ settings: { ...settings, confirmationMessage: e.target.value } })} />
        </div>
      </div>

      {imgPicker && <FormImagePicker onPick={(img) => patch({ settings: { ...settings, headerImage: img } })} onClose={() => setImgPicker(false)} />}
    </div>
  )
}

function FieldCard({ field, idKey, mapOptions, mapLabel, onChange, onDup, onRemove, onUp, onDown }) {
  const [showDesc, setShowDesc] = useState(!!field.description)
  const [showValid, setShowValid] = useState(false)
  const isChoice = CHOICE_TYPES.includes(field.type)
  const isSection = field.type === 'section'
  const canValidate = ['short_text', 'long_text', 'text', 'number', 'phone', 'email', 'name'].includes(field.type)

  if (isSection) {
    return (
      <div className="gf-card gf-section">
        <div className="gf-section-tag">BO'LIM</div>
        <input className="gf-title-input" value={field.label || ''} placeholder="Bo'lim nomi" onChange={(e) => onChange({ label: e.target.value })} />
        <input className="gf-desc-input" value={field.description || ''} placeholder="Bo'lim tavsifi (ixtiyoriy)" onChange={(e) => onChange({ description: e.target.value })} />
        <div className="gf-foot">
          <div className="f1" />
          <button type="button" className="gf-iconbtn" title="Yuqoriga" onClick={onUp}>↑</button>
          <button type="button" className="gf-iconbtn" title="Pastga" onClick={onDown}>↓</button>
          <button type="button" className="gf-iconbtn gf-del" title="O'chirish" onClick={onRemove}>×</button>
        </div>
      </div>
    )
  }

  return (
    <div className="gf-card gf-q">
      <div className="gf-q-top">
        <input className="gf-q-label" value={field.label || ''} placeholder="Savol matni" onChange={(e) => onChange({ label: e.target.value })} />
        <select className="hr-select gf-type" value={field.type} onChange={(e) => onChange({ type: e.target.value })}>
          {FIELD_TYPES.filter((t) => t.v !== 'section').map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
      </div>

      {showDesc && (
        <input className="gf-desc-input" value={field.description || ''} placeholder="Savol tavsifi / ko'rsatma"
          onChange={(e) => onChange({ description: e.target.value })} />
      )}

      {/* Tur bo'yicha tana */}
      {isChoice && <OptionsEditor field={field} onChange={onChange} />}
      {field.type === 'linear_scale' && <ScaleEditor field={field} onChange={onChange} />}
      {field.type === 'rating' && <RatingEditor field={field} onChange={onChange} />}
      {['short_text', 'name', 'phone', 'email', 'number'].includes(field.type) && (
        <input className="hr-input gf-preview" disabled placeholder={field.type === 'number' ? 'Raqamli javob' : 'Qisqa javob matni'} />
      )}
      {field.type === 'long_text' && <textarea className="hr-input gf-preview" disabled rows={2} placeholder="Uzun javob matni" />}
      {field.type === 'date' && <input className="hr-input gf-preview" disabled type="date" style={{ maxWidth: 200 }} />}
      {field.type === 'time' && <input className="hr-input gf-preview" disabled type="time" style={{ maxWidth: 160 }} />}

      {/* Validation paneli */}
      {canValidate && showValid && <ValidationEditor field={field} onChange={onChange} />}

      {/* Footer: bog'lash + amallar + majburiy */}
      <div className="gf-foot">
        {mapOptions && (
          <select className="hr-select gf-map" value={field.map || ''} onChange={(e) => onChange({ map: e.target.value })} title={mapLabel}>
            {mapOptions.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        )}
        <div className="f1" />
        <button type="button" className="gf-iconbtn" title="Tavsif" onClick={() => setShowDesc((v) => !v)} style={{ color: showDesc ? 'var(--info)' : '' }}><Icon name="edit" size={14} /></button>
        {canValidate && <button type="button" className="gf-iconbtn" title="Javob tekshiruvi" onClick={() => setShowValid((v) => !v)} style={{ color: showValid ? 'var(--info)' : '' }}>✓</button>}
        <button type="button" className="gf-iconbtn" title="Nusxalash" onClick={onDup}><Icon name="copy" size={14} /></button>
        <button type="button" className="gf-iconbtn" title="Yuqoriga" onClick={onUp}>↑</button>
        <button type="button" className="gf-iconbtn" title="Pastga" onClick={onDown}>↓</button>
        <button type="button" className="gf-iconbtn gf-del" title="O'chirish" onClick={onRemove}>×</button>
        <span className="gf-sep" />
        <label className="gf-req"><span>Majburiy</span>
          <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ required: e.target.checked })} />
        </label>
      </div>
    </div>
  )
}

function OptionsEditor({ field, onChange }) {
  const opts = field.options && field.options.length ? field.options : ['Variant 1']
  const setOpt = (i, v) => onChange({ options: opts.map((o, j) => (j === i ? v : o)) })
  const addOpt = () => onChange({ options: [...opts, `Variant ${opts.length + 1}`] })
  const rmOpt = (i) => onChange({ options: opts.filter((_, j) => j !== i) })
  const bullet = field.type === 'multi_choice' ? '☐' : field.type === 'dropdown' ? '▾' : '○'
  return (
    <div className="gf-opts">
      {opts.map((o, i) => (
        <div className="gf-opt-row" key={i}>
          <span className="gf-bullet">{field.type === 'dropdown' ? (i + 1) + '.' : bullet}</span>
          <input className="gf-opt-input" value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Variant ${i + 1}`} />
          {opts.length > 1 && <button type="button" className="gf-iconbtn gf-del" onClick={() => rmOpt(i)}>×</button>}
        </div>
      ))}
      {field.hasOther && (
        <div className="gf-opt-row gf-opt-other">
          <span className="gf-bullet">{bullet}</span>
          <span className="gf-other-label">"Boshqa…" (respondent yozadi)</span>
          <button type="button" className="gf-iconbtn gf-del" onClick={() => onChange({ hasOther: false })}>×</button>
        </div>
      )}
      <div className="gf-opt-actions">
        <button type="button" className="gf-linkbtn" onClick={addOpt}>+ Variant qo'shish</button>
        {!field.hasOther && field.type !== 'dropdown' && <button type="button" className="gf-linkbtn" onClick={() => onChange({ hasOther: true })}>+ "Boshqa"</button>}
        <label className="apply-opt gf-shuffle"><input type="checkbox" checked={!!field.shuffle} onChange={(e) => onChange({ shuffle: e.target.checked })} /> Aralashtirish</label>
      </div>
    </div>
  )
}

function ScaleEditor({ field, onChange }) {
  const min = field.scaleMin ?? 1
  const max = field.scaleMax ?? 5
  return (
    <div className="gf-scale-edit">
      <div className="fx ac gap10" style={{ flexWrap: 'wrap' }}>
        <select className="hr-select" style={{ width: 70 }} value={min} onChange={(e) => onChange({ scaleMin: Number(e.target.value) })}>
          {[0, 1].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span>—</span>
        <select className="hr-select" style={{ width: 70 }} value={max} onChange={(e) => onChange({ scaleMax: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="hr-grid2" style={{ marginTop: 8 }}>
        <div className="hr-field" style={{ margin: 0 }}><label>{min}-belgi (past)</label><input className="hr-input" value={field.scaleMinLabel || ''} placeholder="masalan: Yomon" onChange={(e) => onChange({ scaleMinLabel: e.target.value })} /></div>
        <div className="hr-field" style={{ margin: 0 }}><label>{max}-belgi (yuqori)</label><input className="hr-input" value={field.scaleMaxLabel || ''} placeholder="masalan: Zo'r" onChange={(e) => onChange({ scaleMaxLabel: e.target.value })} /></div>
      </div>
    </div>
  )
}

function RatingEditor({ field, onChange }) {
  const max = field.ratingMax || 5
  return (
    <div className="fx ac gap10" style={{ marginTop: 6 }}>
      <span className="sub2" style={{ fontSize: 12.5 }}>Yulduzchalar soni:</span>
      <select className="hr-select" style={{ width: 80 }} value={max} onChange={(e) => onChange({ ratingMax: Number(e.target.value) })}>
        {[3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span style={{ color: '#F5A623', fontSize: 18, letterSpacing: 2 }}>{'★'.repeat(Math.min(max, 5))}</span>
    </div>
  )
}

function ValidationEditor({ field, onChange }) {
  const v = field.validation || { kind: 'none' }
  const setV = (p) => onChange({ validation: { ...v, ...p } })
  const kinds = field.type === 'number'
    ? [['none', 'Yo\'q'], ['number', 'Son oralig\'i']]
    : [['none', 'Yo\'q'], ['length', 'Belgi uzunligi'], ['regex', 'Shablon (regex)']]
  return (
    <div className="gf-valid">
      <div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>
        <span className="sub2" style={{ fontSize: 12 }}>Javob tekshiruvi:</span>
        <select className="hr-select" style={{ width: 160 }} value={v.kind || 'none'} onChange={(e) => setV({ kind: e.target.value })}>
          {kinds.map(([kv, kl]) => <option key={kv} value={kv}>{kl}</option>)}
        </select>
        {(v.kind === 'number' || v.kind === 'length') && (
          <>
            <input className="hr-input" style={{ width: 90 }} type="number" placeholder="min" value={v.min ?? ''} onChange={(e) => setV({ min: e.target.value })} />
            <input className="hr-input" style={{ width: 90 }} type="number" placeholder="max" value={v.max ?? ''} onChange={(e) => setV({ max: e.target.value })} />
          </>
        )}
        {v.kind === 'regex' && (
          <input className="hr-input" style={{ flex: 1, minWidth: 140 }} placeholder="^[0-9]{9}$" value={v.pattern || ''} onChange={(e) => setV({ pattern: e.target.value })} />
        )}
      </div>
      {v.kind && v.kind !== 'none' && (
        <input className="hr-input" style={{ marginTop: 6 }} placeholder="Xato xabari (ixtiyoriy)" value={v.message || ''} onChange={(e) => setV({ message: e.target.value })} />
      )}
    </div>
  )
}

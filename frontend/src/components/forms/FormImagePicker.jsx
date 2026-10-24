import React, { useState, useRef } from 'react'
import Icon from '../Icon'

// ── Standart banner rasmlar (o'z ichida — SVG gradient, doim ishlaydi) ──
const PRESET_COLORS = [
  ['#8CD211', '#20B486'], ['#3F77DD', '#7C5CFC'], ['#F5A623', '#E0574B'],
  ['#20B486', '#3F77DD'], ['#7C5CFC', '#E0574B'], ['#111827', '#3F77DD'],
  ['#E0574B', '#F5A623'], ['#0EA5A4', '#111827'], ['#F472B6', '#7C5CFC'],
]
function svgBanner(c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='300'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>` +
    `<rect width='1200' height='300' fill='url(#g)'/>` +
    `<circle cx='980' cy='40' r='150' fill='rgba(255,255,255,.13)'/>` +
    `<circle cx='1130' cy='250' r='95' fill='rgba(255,255,255,.10)'/>` +
    `<circle cx='120' cy='270' r='70' fill='rgba(255,255,255,.09)'/>` +
    `<circle cx='300' cy='30' r='40' fill='rgba(255,255,255,.08)'/></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
const PRESETS = PRESET_COLORS.map(([a, b]) => svgBanner(a, b))

// Faylni kichraytirib data URI (JPEG) qiladi — katta rasm bazani shishirmasin.
function fileToDataUri(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Fayl o‘qilmadi'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        try { resolve(cv.toDataURL('image/jpeg', quality)) } catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('Rasm formati qo‘llab-quvvatlanmaydi'))
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export default function FormImagePicker({ onPick, onClose }) {
  const [tab, setTab] = useState('preset')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const fileRef = useRef(null)

  const pick = (img) => { onPick(img); onClose() }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 12 * 1024 * 1024) { setErr('Rasm 12MB dan katta — kichikroq tanlang'); return }
    setErr(null); setBusy(true)
    try { pick(await fileToDataUri(file)) }
    catch (ex) { setErr(ex.message || 'Yuklashda xatolik'); setBusy(false) }
  }

  const applyUrl = () => {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) { setErr('To‘g‘ri havola kiriting (http…)'); return }
    pick(u)
  }

  return (
    <div className="gf-imgmodal-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="gf-imgmodal">
        <div className="gf-imgmodal-head">
          <b>Banner rasm tanlash</b>
          <button className="hr-x" onClick={onClose}>×</button>
        </div>
        <div className="gf-imgtabs">
          {[['preset', 'Standart'], ['upload', 'Yuklash'], ['url', 'Havola']].map(([k, l]) => (
            <button key={k} className={`gf-imgtab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setErr(null) }}>{l}</button>
          ))}
        </div>

        <div className="gf-imgbody">
          {err && <div className="apply-err" style={{ marginBottom: 10 }}>{err}</div>}

          {tab === 'preset' && (
            <div className="gf-preset-grid">
              {PRESETS.map((p, i) => (
                <button key={i} className="gf-preset" style={{ backgroundImage: `url("${p}")` }} onClick={() => pick(p)} title="Tanlash" />
              ))}
            </div>
          )}

          {tab === 'upload' && (
            <div className="gf-drop" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              <Icon name="download" size={26} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>{busy ? 'Yuklanmoqda…' : 'Kompyuterdan rasm tanlash'}</div>
              <div className="sub2" style={{ fontSize: 12 }}>PNG, JPG · avtomatik kichraytiriladi</div>
            </div>
          )}

          {tab === 'url' && (
            <div>
              <div className="sub2" style={{ fontSize: 12.5, marginBottom: 8 }}>Rasm havolasini qo‘ying — o‘sha rasm banner bo‘ladi.</div>
              <div className="fx ac gap8">
                <input className="hr-input f1" placeholder="https://…/rasm.jpg" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyUrl()} />
                <button className="btn primary" onClick={applyUrl}>Qo‘yish</button>
              </div>
              {url && /^https?:\/\//i.test(url) && <img src={url} alt="" className="gf-url-preview" onError={(e) => { e.currentTarget.style.display = 'none' }} onLoad={(e) => { e.currentTarget.style.display = 'block' }} />}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

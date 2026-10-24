// Google Forms uslubidagi umumiy forma modeli — CRM va Ishga olish (recruiting) uchun bir xil.
// Maydon (savol) shakli:
//   { <idKey>, type, label, description?, required?, options?, hasOther?, shuffle?,
//     scaleMin?, scaleMax?, scaleMinLabel?, scaleMaxLabel?, ratingMax?,
//     validation?: { kind:'none'|'number'|'length'|'regex', min?, max?, pattern?, message? }, map? }
// Bo'lim (section) — sahifa bo'luvchi: { type:'section', label, description }

export const FIELD_TYPES = [
  { v: 'short_text', l: 'Qisqa javob', group: 'Matn' },
  { v: 'long_text', l: 'Paragraf', group: 'Matn' },
  { v: 'single_choice', l: 'Bitta tanlov', group: 'Tanlov' },
  { v: 'multi_choice', l: 'Belgilash (checkbox)', group: 'Tanlov' },
  { v: 'dropdown', l: "Ochiluvchi ro'yxat", group: 'Tanlov' },
  { v: 'linear_scale', l: 'Chiziqli shkala', group: 'Shkala' },
  { v: 'rating', l: 'Baho (yulduzcha)', group: 'Shkala' },
  { v: 'date', l: 'Sana', group: 'Sana/Vaqt' },
  { v: 'time', l: 'Vaqt', group: 'Sana/Vaqt' },
  { v: 'name', l: 'Ism', group: 'Maxsus' },
  { v: 'phone', l: 'Telefon', group: 'Maxsus' },
  { v: 'email', l: 'Email', group: 'Maxsus' },
  { v: 'number', l: 'Raqam', group: 'Maxsus' },
  { v: 'section', l: 'Bo\'lim (sahifa)', group: 'Tuzilma' },
]

// Backend sanitize uchun ham ishlatiladi
export const ALL_TYPES = FIELD_TYPES.map((t) => t.v)
export const CHOICE_TYPES = ['single_choice', 'multi_choice', 'dropdown']
export const TEXTUAL_TYPES = ['short_text', 'long_text', 'text', 'name', 'phone', 'email', 'number']
export const typeLabel = (v) => (FIELD_TYPES.find((t) => t.v === v)?.l || v)

export function inputTypeFor(t) {
  if (t === 'phone') return 'tel'
  if (t === 'number') return 'number'
  if (t === 'email') return 'email'
  if (t === 'date') return 'date'
  if (t === 'time') return 'time'
  return 'text'
}

// Bir savolni tekshirish — bo'sh javob + validation qoidalari.
export function validateField(field, value) {
  const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
  if (field.required && isEmpty) return `"${field.label || 'Savol'}" majburiy`
  if (isEmpty) return null

  const s = Array.isArray(value) ? value.join(', ') : String(value)
  if (field.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return `"${field.label}" — email noto'g'ri`

  const v = field.validation
  if (v && v.kind && v.kind !== 'none') {
    const num = (x) => (x === '' || x == null ? null : Number(x))
    if (v.kind === 'number') {
      const n = Number(s.replace(',', '.'))
      if (Number.isNaN(n)) return v.message || `"${field.label}" — raqam kiriting`
      const mn = num(v.min), mx = num(v.max)
      if (mn != null && n < mn) return v.message || `"${field.label}" — kamida ${mn}`
      if (mx != null && n > mx) return v.message || `"${field.label}" — ko'pi bilan ${mx}`
    } else if (v.kind === 'length') {
      const mn = num(v.min), mx = num(v.max)
      if (mn != null && s.length < mn) return v.message || `"${field.label}" — kamida ${mn} belgi`
      if (mx != null && s.length > mx) return v.message || `"${field.label}" — ko'pi bilan ${mx} belgi`
    } else if (v.kind === 'regex' && v.pattern) {
      try { if (!new RegExp(v.pattern).test(s)) return v.message || `"${field.label}" — format noto'g'ri` } catch { /* noto'g'ri regex — o'tkazamiz */ }
    }
  }
  return null
}

// Maydonlarni bo'limlar bo'yicha sahifalarga bo'lish (Google Forms sections).
export function toPages(fields = []) {
  const pages = []
  let cur = { section: null, fields: [] }
  for (const f of fields) {
    if (f.type === 'section') {
      if (cur.fields.length || cur.section) pages.push(cur)
      cur = { section: f, fields: [] }
    } else {
      cur.fields.push(f)
    }
  }
  pages.push(cur)
  return pages.length ? pages : [{ section: null, fields: [] }]
}

// Variantlarni aralashtirish (shuffle) — har ko'rishda tasodifiy (renderer'da useMemo bilan bir marta).
export function maybeShuffle(options, doShuffle) {
  if (!doShuffle) return options
  const a = [...options]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

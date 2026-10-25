// Bitimlar filtri holati: model, API parametrlariga o'girish, URL query (ulashish/yangilashda saqlanadi), chip'lar, meta yuklash.
// Barcha parametr nomlari backend/src/crm/list-query.ts (LeadFilter) bilan bir xil.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { crmService } from '../services/crm.service'
import { useApi } from '../lib/useApi'

// amoCRM: Bitimlar ochilganda filtr yo'q («Поиск и фильтр», ?skip_filter=Y) — hamma bitimlar
export const EMPTY_FILTER = {
  preset: '', name: '',
  dateField: 'created', datePreset: '', from: '', to: '',
  stages: [], lostReasons: [], unsortedCategory: [], sources: [],
  assigneeIds: [], createdByIds: [], updatedByIds: [],
  tasks: [], budgetFrom: '', budgetTo: '', attention: '',
  cf: {}, utm: {},
  contactName: '', contactPhone: '', contactEmail: '', contactPosition: '', companyName: '',
  tags: [],
}

const LISTS = ['stages', 'lostReasons', 'unsortedCategory', 'sources', 'assigneeIds', 'createdByIds', 'updatedByIds', 'tasks', 'tags']
const SCALARS = ['preset', 'name', 'dateField', 'datePreset', 'from', 'to', 'budgetFrom', 'budgetTo', 'attention', 'contactName', 'contactPhone', 'contactEmail', 'contactPosition', 'companyName']
const OBJS = ['cf', 'utm']
export const FILTER_KEYS = [...LISTS, ...SCALARS, ...OBJS]

export const PRESETS = [
  { key: 'open', label: 'Ochiq bitimlar' },
  { key: 'mine', label: 'Faqat mening bitimlarim' },
  { key: 'won', label: 'Muvaffaqiyatli yakunlangan' },
  { key: 'lost', label: 'Amalga oshmagan bitimlar' },
  { key: 'notask', label: 'Vazifasiz bitimlar', dot: '#e4b248' },
  { key: 'overdue', label: "Vazifasi muddati o'tgan bitimlar", dot: '#f37575' },
  { key: 'attention', label: "E'tibor talab qiladigan", star: '#8e6ad8' },
]

export const DATE_PRESETS = [
  { key: '', label: 'Butun vaqt uchun' },
  { key: 'today', label: 'Bugun uchun' },
  { key: 'yesterday', label: 'Kecha uchun' },
  { key: 'this_week', label: 'Shu hafta uchun' },
  { key: 'last_week', label: "O'tgan hafta uchun" },
  { key: 'this_month', label: 'Shu oy uchun' },
  { key: 'last_month', label: "O'tgan oy uchun" },
  { key: 'quarter', label: 'Chorak uchun' },
  { key: 'this_year', label: 'Shu yil uchun' },
]

export const TASK_OPTIONS = [
  { value: 'today', label: 'Bugun' },
  { value: 'tomorrow', label: 'Ertaga' },
  { value: 'week', label: 'Shu hafta' },
  { value: 'month', label: 'Shu oy' },
  { value: 'quarter', label: 'Chorak' },
  { value: 'no_tasks', label: 'Vazifasiz' },
  { value: 'failed_tasks', label: "Muddati o'tgan" },
]

export const UNSORTED_OPTIONS = [
  { value: 'phone', label: 'Telefon' },
  { value: 'chat', label: 'Chat' },
  { value: 'form', label: 'Forma' },
  { value: 'import', label: 'Import' },
]

export const UTM_KEYS = ['utm_content', 'utm_medium', 'utm_campaign', 'utm_source', 'utm_term', 'utm_referrer', 'roistat', 'referrer', 'from', 'gclientid', '_ym_uid', '_ym_counter', 'gclid', 'yclid', 'fbclid']

export const SORT_OPTIONS = [
  { key: 'last_message', label: "Oxirgi xabar bo'yicha" },
  { key: 'last_event', label: "Oxirgi voqea bo'yicha" },
  { key: 'createdAt', label: "Yaratilgan sana bo'yicha" },
  { key: 'name', label: "Nomi bo'yicha" },
  { key: 'value', label: "Byudjet bo'yicha" },
]

const emptyVal = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => !emptyVal(x)))

/** Bo'sh qiymatlarsiz cf/utm obyekti. */
function clean(o) {
  const out = {}
  for (const [k, v] of Object.entries(o || {})) {
    if (emptyVal(v)) continue
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => !emptyVal(x))) : v
  }
  return out
}

/** Filtr -> API parametrlari (GET /crm/leads, /crm/pipeline, bulk filter, analitika bilan bir xil). */
export function toParams(f) {
  const out = {}
  for (const k of SCALARS) if (f[k] !== '' && f[k] != null) out[k] = f[k]
  for (const k of LISTS) if (f[k]?.length) out[k] = f[k].join(',')
  for (const k of OBJS) { const c = clean(f[k]); if (Object.keys(c).length) out[k] = JSON.stringify(c) }
  if (!out.datePreset && !out.from && !out.to) delete out.dateField
  return out
}

/** Filtr -> URL query (filtrsiz holat — bo'sh query). */
export function filterToQuery(f) {
  const p = toParams(f)
  if (!p.preset) delete p.preset
  return p
}

export function queryToFilter(sp) {
  if (!FILTER_KEYS.some((k) => sp.has(k))) return EMPTY_FILTER
  const f = { ...EMPTY_FILTER, preset: sp.has('preset') ? sp.get('preset') : '' }
  for (const k of SCALARS) if (k !== 'preset' && sp.has(k)) f[k] = sp.get(k)
  if (!f.dateField) f.dateField = 'created'
  for (const k of LISTS) if (sp.get(k)) f[k] = sp.get(k).split(',').filter(Boolean)
  for (const k of OBJS) if (sp.get(k)) { try { f[k] = JSON.parse(sp.get(k)) || {} } catch { /* */ } }
  return f
}

export function isDefaultFilter(f) { return Object.keys(filterToQuery(f)).length === 0 }

/** Filtr + qidiruv + saralash holati URL query'da (react-router useSearchParams). */
export function useLeadsQuery({ defaultSort = null } = {}) {
  const [sp, setSp] = useSearchParams()
  const spKey = sp.toString()
  const filter = useMemo(() => queryToFilter(sp), [spKey]) // eslint-disable-line
  const sort = { key: sp.get('sort') || defaultSort?.key || '', dir: sp.get('dir') || defaultSort?.dir || 'desc' }
  const [search, setSearch] = useState(sp.get('q') || '')
  const [q, setQ] = useState((sp.get('q') || '').trim())
  useEffect(() => { const id = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(id) }, [search])

  const write = useCallback((next) => {
    const cur = new URLSearchParams(window.location.search)
    const f = next.filter ?? queryToFilter(cur)
    const p = new URLSearchParams(filterToQuery(f))
    const qq = next.q ?? (cur.get('q') || '')
    if (qq) p.set('q', qq)
    const s = next.sort ?? { key: cur.get('sort') || '', dir: cur.get('dir') || '' }
    if (s.key) { p.set('sort', s.key); if (s.dir) p.set('dir', s.dir) }
    setSp(p, { replace: true })
  }, [setSp])

  useEffect(() => { if ((new URLSearchParams(window.location.search).get('q') || '') !== q) write({ q }) }, [q]) // eslint-disable-line

  const params = useMemo(() => ({ ...toParams(filter), search: q }), [filter, q])
  const sortParams = sort.key ? { sort: sort.key, dir: sort.dir } : {}
  return {
    filter, params, q, search, setSearch, sort, sortParams,
    applyFilter: (f) => write({ filter: f }),
    setSort: (key, dir) => write({ sort: { key, dir } }),
    // filtr va saralashni bir yo'la (ustun oynachasi)
    apply: ({ filter: f, sort: s }) => write({ ...(f ? { filter: f } : {}), ...(s ? { sort: s } : {}) }),
    removeChip: (updater) => write({ filter: updater(filter) }),
    clearSearch: () => { setSearch(''); setQ(''); write({ q: '' }) },
    isFiltered: !isDefaultFilter(filter) || !!q,
  }
}

/** Filtr paneli uchun ma'lumotlar: teglar, menejerlar, voronkalar+bosqichlar, yo'qotish sabablari, maxsus maydonlar, manbalar. */
export function useFilterMeta() {
  const { data } = useApi(async () => {
    const [tags, mem, pipes, stages, reasons, fields, sources] = await Promise.all([
      crmService.listTags(), crmService.listMembers(), crmService.listPipelines(), crmService.listStages(),
      crmService.listLostReasons(), crmService.listFields('lead'), crmService.listSources(),
    ])
    return {
      tags: tags.tags || [], members: mem.members || [], pipelines: pipes.pipelines || [], stages: stages.stages || [],
      reasons: reasons.reasons || [], fields: (fields.fields || []).filter((x) => x.active !== false), sources: sources.sources || [],
    }
  }, [], 'amo-leads-filter-meta', 60000)
  return data || { tags: [], members: [], pipelines: [], stages: [], reasons: [], fields: [], sources: [] }
}

/** Stage tokeni (`pipelineId:key`, asosiy voronka — `main:key`). */
export const stageToken = (s) => `${s.pipelineId || 'main'}:${s.key || s.id}`

/** Filtrdagi har bir qo'llangan shart uchun chip: { id, label, clear(filter) -> yangi filtr }. */
export function filterChips(f, meta, t) {
  const chips = []
  const join = (arr, max = 2) => (arr.length > max ? `${arr.slice(0, max).join(', ')} +${arr.length - max}` : arr.join(', '))
  const names = (vals, opts) => vals.map((v) => opts.find((o) => String(o.value) === String(v))?.label ?? v)
  const add = (id, label, clear) => chips.push({ id, label, clear })
  const pr = PRESETS.find((p) => p.key === f.preset)
  if (pr) add('preset', t(pr.label), (x) => ({ ...x, preset: '' }))
  if (f.name) add('name', `${t('Nomi')}: ${f.name}`, (x) => ({ ...x, name: '' }))
  if (f.datePreset || f.from || f.to) {
    const fld = f.dateField === 'closed' ? t('Yopilgan') : f.dateField === 'created' || !f.dateField ? t('Yaratilgan') : (meta.fields.find((m) => m.key === f.dateField)?.label || f.dateField)
    const range = f.from || f.to ? `${f.from || '…'} – ${f.to || '…'}` : t(DATE_PRESETS.find((d) => d.key === f.datePreset)?.label || f.datePreset)
    add('date', `${fld}: ${range}`, (x) => ({ ...x, datePreset: '', from: '', to: '', dateField: 'created' }))
  }
  if (f.stages.length) {
    const opts = meta.stages.map((s) => ({ value: stageToken(s), label: s.name }))
    const nm = names(f.stages, [...opts, { value: 'unsorted', label: t('Saralanmagan') }])
    add('stages', `${t('Bosqichlar')}: ${join(nm)}`, (x) => ({ ...x, stages: [] }))
  }
  if (f.lostReasons.length) add('lostReasons', `${t('Rad etish sababi')}: ${join(names(f.lostReasons, [{ value: 'none', label: t('Sababsiz') }]))}`, (x) => ({ ...x, lostReasons: [] }))
  if (f.unsortedCategory.length) add('unsortedCategory', `${t('Saralanmagan turi')}: ${join(names(f.unsortedCategory, UNSORTED_OPTIONS).map(t))}`, (x) => ({ ...x, unsortedCategory: [] }))
  if (f.sources.length) add('sources', `${t('Manba')}: ${join(f.sources.map((s) => (s === 'none' ? t("Ko'rsatilmagan") : s)))}`, (x) => ({ ...x, sources: [] }))
  const mem = meta.members.map((m) => ({ value: m.id, label: m.name })).concat([{ value: 'none', label: t('Mas\'ulsiz') }])
  if (f.assigneeIds.length) add('assigneeIds', `${t('Menejerlar')}: ${join(names(f.assigneeIds, mem))}`, (x) => ({ ...x, assigneeIds: [] }))
  if (f.createdByIds.length) add('createdByIds', `${t('Kim yaratgan')}: ${join(names(f.createdByIds, mem))}`, (x) => ({ ...x, createdByIds: [] }))
  if (f.updatedByIds.length) add('updatedByIds', `${t("Kim o'zgartirgan")}: ${join(names(f.updatedByIds, mem))}`, (x) => ({ ...x, updatedByIds: [] }))
  if (f.tasks.length) add('tasks', `${t('Vazifalar')}: ${join(names(f.tasks, TASK_OPTIONS).map(t))}`, (x) => ({ ...x, tasks: [] }))
  if (f.budgetFrom || f.budgetTo) add('budget', `${t('Byudjet')}: ${f.budgetFrom || '0'} – ${f.budgetTo || '∞'}`, (x) => ({ ...x, budgetFrom: '', budgetTo: '' }))
  if (f.attention) add('attention', `${t("E'tibor talab")}: ${f.attention === 'yes' ? t('Bor') : t("Yo'q")}`, (x) => ({ ...x, attention: '' }))
  for (const [k, v] of Object.entries(clean(f.cf))) {
    const fd = meta.fields.find((m) => m.key === k)
    let val = Array.isArray(v) ? join(v.map((z) => (z === 'empty' ? t("Bo'sh") : z))) : typeof v === 'object' ? `${v.preset ? t(DATE_PRESETS.find((d) => d.key === v.preset)?.label || v.preset) : `${v.from ?? '…'} – ${v.to ?? '…'}`}` : v === 'yes' ? t('Ha') : v === 'no' ? t("Yo'q") : String(v)
    add(`cf:${k}`, `${fd?.label || k}: ${val}`, (x) => { const c = { ...x.cf }; delete c[k]; return { ...x, cf: c } })
  }
  for (const [k, v] of Object.entries(clean(f.utm))) add(`utm:${k}`, `${k}: ${v}`, (x) => { const c = { ...x.utm }; delete c[k]; return { ...x, utm: c } })
  const contact = [['contactName', 'Kontakt'], ['contactPhone', 'Telefon'], ['contactEmail', 'Email'], ['contactPosition', 'Lavozim'], ['companyName', 'Kompaniya']]
  for (const [k, lab] of contact) if (f[k]) add(k, `${t(lab)}: ${f[k]}`, (x) => ({ ...x, [k]: '' }))
  for (const tg of f.tags) add(`tag:${tg}`, `# ${tg}`, (x) => ({ ...x, tags: x.tags.filter((z) => z !== tg) }))
  return chips
}

// ── "…" menyu: Saralash submenyusi (5 variant, asc/desc) ──
export const defaultDir = (key) => (key === 'name' ? 'asc' : 'desc')
export function sortMenuItem(t, sort, setSort) {
  return {
    label: t('Saralash'), icon: 'list',
    children: SORT_OPTIONS.map((o) => {
      const on = sort.key === o.key
      return {
        label: t(o.label), checked: on, keepOpen: true, suffix: on ? (sort.dir === 'asc' ? '↑' : '↓') : '',
        onClick: () => setSort(o.key, on ? (sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir(o.key)),
      }
    }),
  }
}

/** Filtr bo'yicha CSV'ni auth bilan yuklab olish (eksport filtrni qabul qiladi). */
export async function downloadLeadsCsv(params) {
  const blob = await crmService.exportCsv(params)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'leads.csv'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

// ── Karta ko'rinishi (voronka) va ro'yxat ustunlari katalogi ──
export const CARD_FIELDS = [
  { key: 'avatar', label: 'Avatar' }, { key: 'contact', label: 'Kontakt' }, { key: 'company', label: 'Kompaniya' },
  { key: 'phone', label: 'Telefon' }, { key: 'email', label: 'Email' }, { key: 'date', label: 'Sana' },
  { key: 'budget', label: 'Byudjet' }, { key: 'tags', label: 'Teglar' }, { key: 'source', label: 'Manba' },
  { key: 'task', label: 'Vazifa' }, { key: 'assignee', label: "Mas'ul" },
]
export const CARD_DEFAULT = ['avatar', 'contact', 'date', 'assignee', 'budget', 'phone', 'tags', 'task']

export const LIST_COLUMNS = [
  { key: 'name', label: 'Bitim nomi', sort: 'name' }, { key: 'contact', label: 'Asosiy kontakt', sort: 'contact' },
  { key: 'company', label: 'Kompaniya', sort: 'company' }, { key: 'phone', label: 'Telefon (kontakt)', sort: 'phone' },
  { key: 'email', label: 'Email', sort: 'email' }, { key: 'stage', label: 'Bosqich', sort: 'stage' },
  { key: 'budget', label: 'Byudjet', sort: 'value' }, { key: 'assignee', label: "Mas'ul", sort: 'assignee' },
  { key: 'createdAt', label: 'Yaratilgan', sort: 'createdAt' }, { key: 'updatedAt', label: "O'zgartirilgan", sort: 'updatedAt' },
  { key: 'closedAt', label: 'Yopilgan', sort: 'closedAt' }, { key: 'source', label: 'Manba', sort: 'source' },
  { key: 'tags', label: 'Teglar', sort: 'tags' },
]
export const LIST_DEFAULT = ['name', 'contact', 'phone', 'stage', 'budget', 'assignee', 'createdAt']

/** Katalog + bitimning maxsus maydonlari (cf:<kalit>). */
export const withCustomFields = (base, fields) => [...base, ...(fields || []).map((f) => ({ key: `cf:${f.key}`, label: f.label, sort: `cf:${f.key}` }))]

/** Foydalanuvchining saqlangan sozlamasi (backend /crm/card-layout) yoki standart. */
export function useLayout(kind, defaults) {
  const { data, setData } = useApi(() => crmService.getLayout(kind), [kind], `amo-layout-${kind}`)
  const fields = data?.fields && data.fields.length ? data.fields : defaults
  const save = async (next) => { const r = await crmService.saveLayout(kind, next); setData(r) }
  return { fields, save }
}

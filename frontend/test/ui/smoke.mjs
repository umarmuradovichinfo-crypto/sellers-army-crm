// UI tutun testi: kompyuterdagi Chrome bilan barcha sahifalar (UZ/RU, kompyuter va telefon o'lchami) ochiladi.
// Tutiladi: JS xatolari (pageerror), console.error, API 5xx, oq ekran (bo'sh sahifa), telefonda gorizontal siljish,
// RU rejimida tarjima qilinmagan matnlar (ogohlantirish). Bir nechta asosiy amallar ham bosib ko'riladi.
// backend/test/e2e/run.sh E2E_UI=1 orqali ishga tushiriladi (UI_BASE, E2E_BASE, E2E_EMAIL, E2E_PASSWORD).
import { chromium } from 'playwright-core'
import { tmpdir } from 'node:os'

const UI = process.env.UI_BASE || 'http://localhost:5199'
const API = process.env.E2E_BASE || 'http://localhost:8010/api/v1'
const errors = []
const warns = []

async function api(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(d)}`)
  return d
}

const login = await api('POST', '/auth/login', { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD })
const token = login.token || login.accessToken
// sahifalar bo'sh bo'lmasin: bitim (vazifa, izoh bilan), kontakt, kompaniya
const lead = (await api('POST', '/crm/leads', { name: 'UI test bitim', value: 250000, tags: ['ui'] }, token)).lead
await api('POST', `/crm/leads/${lead.id}/tasks`, { title: 'UI vazifa', dueDate: new Date(Date.now() + 3600e3).toISOString() }, token)
const contact = (await api('POST', '/crm/contacts', { name: 'UI Kontakt', phone: '+998901234567' }, token)).contact
const company = (await api('POST', '/crm/companies', { name: 'UI MChJ' }, token)).company

const ROUTES = [
  '/dashboard', '/leads/pipeline', '/leads/list', `/leads/${lead.id}`, '/leads/new', '/leads/duplicates', '/leads/import',
  '/contacts', `/contacts/${contact.id}`, '/companies', `/companies/${company.id}`, '/contacts/import',
  '/inbox', `/inbox/${lead.id}`, '/tasks', '/tasks/calendar', '/events', '/stats', '/stats/consolidated', '/stats/activities',
  '/stats/calls', '/stats/goals', '/stats/pipeline', '/analitika', '/bots', '/integrations',
  '/settings/profile', '/products', '/settings/general', '/settings/users', '/settings/security', '/settings/billing', '/pbx/home', '/pbx/calls', '/pbx/ats/incoming', '/pbx/ats/outgoing', '/pbx/ats/diagnostic', '/pbx/ats/configurator', '/pbx/ats/blacklist', '/pbx/ats/music', '/pbx/chats', '/pbx/statistic', '/pbx/reports', '/pbx/reports/group', '/pbx/reports/missed', '/pbx/services/autorecall', '/pbx/services/callback', '/pbx/services/quality', '/pbx/integration', '/pbx/license', '/settings/chats', '/settings/tags', '/settings/fields/lead', '/settings/pipelines/main',
]

// RU rejimida ko'rinib qolgan o'zbekcha so'zlar (foydalanuvchi ma'lumotlari emas — interfeys matnlari uchun evristika)
const UZ_RE = /\b(qo'shish|o'chirish|saqlash|bekor qilish|yopish|tanlang|vazifalar|bitimlar|sozlamalar|foydalanuvchi|bosqich|mas'ul|kiriting|yuborish|qidiruv|hammasi|bugun|ertaga|kecha|ro'yxat|bildirishnoma\w*|hisobot\w*|mijoz\w*|qo'ng'iroq\w*|xabar\w*|saqlandi|ulangan|zaxira|suhbat\w*|seans\w*|havola\w*|kalit so'z\w*|tayyor)\b/i

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function visit(lang, viewport) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addInitScript(([t, r, l]) => { localStorage.setItem('sa_token', t); if (r) localStorage.setItem('sa_refresh', r); localStorage.setItem('amo_lang', l) }, [token, login.refreshToken, lang])
  const page = await ctx.newPage()
  const tag = `[${lang} ${viewport.width}px]`
  let route = ''
  page.on('pageerror', (e) => errors.push(`${tag} ${route} JS xato: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const txt = m.text()
    if (/Failed to load resource.*(40[134]|503)|favicon|ERR_CONNECTION_REFUSED.*:9\//.test(txt)) return
    errors.push(`${tag} ${route} console.error: ${txt.slice(0, 200)}`)
  })
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500 && !(r.status() === 503 && r.url().includes('/crm/dono/'))) errors.push(`${tag} ${route} API ${r.status()}: ${r.url().replace(/^.*\/api\/v1/, '')}`) })
  // Eski manzillar yangisiga yo'naltirilishi, query saqlanishi va noma'lum manzil 404 berishi
  const REDIRECTS = [['/todo/line', '/tasks/line'], ['/imbox', '/inbox'], ['/amo-market?foo=1', '/integrations?foo=1'], ['/contacts/list', '/contacts'], ['/calls', '/pbx/calls'], ['/settings/pbx/incoming', '/pbx/ats/incoming'], ['/settings/pbx/callback', '/pbx/services/callback'],
    ['/catalogs/products', '/products'], ['/events/list', '/events'], ['/stats/by_activities', '/stats/activities'], ['/agents-and-bots', '/bots']]
  for (const [from, to] of REDIRECTS) {
    await page.goto(UI + from, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)
    const at = await page.evaluate(() => location.pathname + location.search)
    if (at !== to && !(to === '/inbox' && at.startsWith('/inbox'))) errors.push(`${tag} yo'naltirish: ${from} → ${at} (kutilgan ${to})`)
  }
  await page.goto(UI + '/yoq-sahifa-xyz', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  if (!/404/.test(await page.evaluate(() => document.body.innerText))) errors.push(`${tag} noma'lum manzil 404 bermadi`)
  for (route of ROUTES) {
    await page.goto(UI + route, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(300)
    const info = await page.evaluate(() => ({
      text: (document.body.innerText || '').trim().length,
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      // gorizontal siljishga sabab bo'lgan eng tashqi elementlar (ota-onasi ekranga sig'adi, o'zi chiqib ketadi)
      culprits: (() => {
        if (document.scrollingElement.scrollWidth - window.innerWidth <= 4) return []
        const W = window.innerWidth + 4
        const out = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.right <= W || r.width === 0) continue
          const pr = el.parentElement?.getBoundingClientRect()
          if (pr && pr.right > W) continue
          const cs = getComputedStyle(el)
          if (cs.position === 'fixed') continue
          out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')} (${Math.round(r.right)}px)`)
          if (out.length >= 3) break
        }
        if (!out.length) {
          // ko'rinadigan element topilmasa — ichidan toshayotgan (overflow: visible) eng chuqur bloklar
          for (const el of document.querySelectorAll('body *')) {
            if (el.scrollWidth > el.clientWidth + 4 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth > 0)
              out.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')} (sw ${el.scrollWidth}/${el.clientWidth})`)
          }
          return out.slice(-3)
        }
        return out
      })(),
      path: location.pathname,
      body: document.body.innerText.slice(0, 20000),
    }))
    if (info.path === '/login') { errors.push(`${tag} ${route}: login sahifasiga qaytarib yuborildi`); continue }
    if (info.text < 20) errors.push(`${tag} ${route}: oq (bo'sh) ekran`)
    if (viewport.width < 500 && info.overflow > 4) warns.push(`${tag} ${route}: telefonda gorizontal siljish ${info.overflow}px ← ${info.culprits.join(', ')}`)
    if (lang === 'ru') {
      // har bir topilmani atrofidagi matni bilan (qaysi joy ekanini tez topish uchun)
      const hits = [...new Set([...info.body.matchAll(new RegExp(`.{0,25}${UZ_RE.source}.{0,25}`, 'gi'))].map((m) => m[0].replace(/\s+/g, ' ').trim()))]
      if (hits.length) warns.push(`${tag} ${route}: tarjima qilinmagan bo'lishi mumkin: «${hits.slice(0, 4).join('», «')}»`)
    }
  }
  return { ctx, page }
}

async function flows() {
  const { ctx, page } = await visit('uz', { width: 1366, height: 820 })
  let step = ''
  try {
    // bitim kartochkasi: izoh yozish → lentada paydo bo'ladi
    step = 'izoh'
    await page.goto(`${UI}/leads/${lead.id}`, { waitUntil: 'networkidle' })
    await page.locator('.ac-compose').first().click()
    const note = `UI izoh ${Date.now()}`
    await page.locator('.ac-compose__text').first().fill(note)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await page.waitForTimeout(400)
    const sendBtn = page.locator('.ac-compose button', { hasText: /Yuborish|Saqlash|Отправить/ }).first()
    if (!(await page.getByText(note).count()) && (await sendBtn.count())) await sendBtn.click()
    await page.getByText(note).first().waitFor({ timeout: 5000 })
    // voronka: ustunlar ko'rinadi
    step = 'voronka'
    await page.goto(`${UI}/leads/pipeline`, { waitUntil: 'networkidle' })
    if (!(await page.getByText('UI test bitim').count())) errors.push('voronka: yaratilgan bitim ko`rinmaydi')
    // Dono: panel ochiladi, kalitsiz holatda tushunarli xabar
    step = 'dono'
    await page.goto(`${UI}/leads/list`, { waitUntil: 'networkidle' })
    await page.locator('.ac-dono-fab').click()
    await page.locator('.ac-dono-panel textarea').fill('Salom')
    await page.keyboard.press('Enter')
    await page.locator('.ac-dono-msg.err').waitFor({ timeout: 5000 })
  } catch (e) {
    errors.push(`amal «${step}» bajarilmadi: ${e.message.split('\n')[0]}`)
    await page.screenshot({ path: `${tmpdir()}/ui-fail-${step}.png` }).catch(() => {})
  }
  await ctx.close()
}

for (const [lang, vp] of [['uz', { width: 1366, height: 820 }], ['ru', { width: 1366, height: 820 }], ['uz', { width: 375, height: 812 }]]) {
  const { ctx } = await visit(lang, vp)
  await ctx.close()
}
await flows()
await browser.close()

const uniq = (a) => [...new Set(a)]
console.log(`\nUI: ${ROUTES.length} sahifa × 3 rejim tekshirildi`)
for (const w of uniq(warns)) console.log(`⚠ ${w}`)
for (const e of uniq(errors)) console.log(`✖ ${e}`)
console.log(errors.length ? `\nUI xatolari: ${uniq(errors).length}` : '\nUI: xato topilmadi ✔')
process.exitCode = errors.length ? 1 : 0

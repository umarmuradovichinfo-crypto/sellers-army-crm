// Markaziy Meta Connector.
// CRM nusxalari (self-hosted) bu xizmat orqali Facebook'ga ulanadi: bitta Meta ilovasi, bitta Redirect URI, bitta webhook.
// Mijoz lid ma'lumotlari SAQLANMAYDI — faqat {pageId, leadgenId, formId} imzolangan holda tegishli CRM'ga forward qilinadi.
// Nol bog'liqlik: faqat Node ichki modullari (http, crypto, node:sqlite).
import http from 'node:http'
import { createHash, createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const env = (k, d = '') => (process.env[k] ?? d).trim()
const cfg = () => ({
  appId: env('FB_APP_ID'),
  appSecret: env('FB_APP_SECRET'),
  // Railway o'z domenini RAILWAY_PUBLIC_DOMAIN orqali beradi — alohida domen shart emas
  publicUrl: (env('CONNECTOR_PUBLIC_URL') || (env('RAILWAY_PUBLIC_DOMAIN') ? `https://${env('RAILWAY_PUBLIC_DOMAIN')}` : '')).replace(/\/+$/, ''),
  graph: env('FB_GRAPH_BASE') || `https://graph.facebook.com/${env('FB_GRAPH_VERSION', 'v26.0')}`,
  dialog: env('FB_DIALOG_BASE') || `https://www.facebook.com/${env('FB_GRAPH_VERSION', 'v26.0')}/dialog/oauth`,
  fields: env('FB_SUBSCRIBED_FIELDS', 'leadgen,messages,messaging_postbacks,message_reads,feed'),
  // Instagram obunasi (ilova darajasida object=instagram va sahifa orqali subscribed_fields)
  igFields: env('FB_IG_FIELDS', 'messages,comments'),
  insecure: env('ALLOW_INSECURE') === '1',
  retryBase: Number(env('RETRY_BASE_MS', '1000')),
})
// Lead Ads + Messenger + Instagram (Direct va izohlar). FB_SCOPE env bilan o'zgartiriladi.
const DEFAULT_SCOPE = 'leads_retrieval,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management,pages_messaging,instagram_basic,instagram_manage_messages,instagram_manage_comments'
const SCOPE = env('FB_SCOPE') || DEFAULT_SCOPE
const START_TTL_MS = 10 * 60 * 1000
const STATE_TTL_MS = 10 * 60 * 1000

// ── Shifrlash (AES-256-GCM) ──
// TOKEN_ENC_KEY berilmasa — birinchi ishga tushishda tasodifiy kalit yaratilib, ma'lumotlar bazasi yonidagi
// (Railway Volume) enc.key faylida saqlanadi. Shunda deploy'da qo'lda kalit kiritish shart emas.
const dbPath = env('DATABASE_PATH', './data/connector.db')
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true })
function loadKey() {
  const fromEnv = env('TOKEN_ENC_KEY')
  if (fromEnv) return fromEnv
  if (dbPath === ':memory:') return randomBytes(32).toString('hex')
  const f = `${dirname(dbPath)}/enc.key`
  if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  const k = randomBytes(32).toString('hex')
  writeFileSync(f, k, { mode: 0o600 })
  console.warn('[connector] yangi shifrlash kaliti yaratildi:', f)
  return k
}
const KEY = createHash('sha256').update(loadKey()).digest()
function enc(text) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')
}
function dec(b64) {
  const b = Buffer.from(b64, 'base64')
  const d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex')
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

// ── DB ──
const db = new DatabaseSync(dbPath)
db.exec(`
CREATE TABLE IF NOT EXISTS instances (id TEXT PRIMARY KEY, url TEXT NOT NULL, secret_enc TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pages (page_id TEXT NOT NULL, instance_id TEXT NOT NULL, name TEXT NOT NULL, token_enc TEXT NOT NULL, created_at INTEGER NOT NULL, ig_id TEXT, ig_username TEXT, PRIMARY KEY (page_id, instance_id));
CREATE TABLE IF NOT EXISTS states (state TEXT PRIMARY KEY, instance_id TEXT NOT NULL, ret TEXT NOT NULL, exp INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, instance_id TEXT NOT NULL, ret TEXT NOT NULL, pages_enc TEXT NOT NULL, exp INTEGER NOT NULL);
`)
// Eski bazalar uchun ustunlar (Instagram akkaunt)
for (const col of ['ig_id', 'ig_username']) {
  try { db.exec(`ALTER TABLE pages ADD COLUMN ${col} TEXT`) } catch { /* mavjud */ }
}
db.exec('CREATE INDEX IF NOT EXISTS pages_ig_idx ON pages (ig_id)')
const q = {
  getInstance: db.prepare('SELECT * FROM instances WHERE id = ?'),
  addInstance: db.prepare('INSERT INTO instances (id, url, secret_enc, created_at) VALUES (?,?,?,?)'),
  addState: db.prepare('INSERT INTO states (state, instance_id, ret, exp) VALUES (?,?,?,?)'),
  getState: db.prepare('SELECT * FROM states WHERE state = ?'),
  delState: db.prepare('DELETE FROM states WHERE state = ?'),
  addSession: db.prepare('INSERT INTO sessions (sid, instance_id, ret, pages_enc, exp) VALUES (?,?,?,?,?)'),
  getSession: db.prepare('SELECT * FROM sessions WHERE sid = ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE sid = ?'),
  gc: [db.prepare('DELETE FROM states WHERE exp < ?'), db.prepare('DELETE FROM sessions WHERE exp < ?')],
  upsertPage: db.prepare('INSERT INTO pages (page_id, instance_id, name, token_enc, created_at, ig_id, ig_username) VALUES (?,?,?,?,?,?,?) ON CONFLICT(page_id, instance_id) DO UPDATE SET name=excluded.name, token_enc=excluded.token_enc, ig_id=excluded.ig_id, ig_username=excluded.ig_username'),
  pagesByPage: db.prepare('SELECT * FROM pages WHERE page_id = ?'),
  pagesByIg: db.prepare('SELECT * FROM pages WHERE ig_id = ?'),
  getPage: db.prepare('SELECT * FROM pages WHERE page_id = ? AND instance_id = ?'),
  delPage: db.prepare('DELETE FROM pages WHERE page_id = ? AND instance_id = ?'),
}
const instanceSecret = (inst) => dec(inst.secret_enc)

// ── Yordamchilar ──
const rid = (n = 24) => randomBytes(n).toString('hex')
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const log = (...a) => console.log('[connector]', ...a)

async function readBody(req, limit = 1_000_000) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body)
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(isObj ? JSON.stringify(body) : body)
}

async function graph(method, path, params) {
  const c = cfg()
  const opt = { method, signal: AbortSignal.timeout(20000) }
  let url = `${c.graph}${path}`
  if (method === 'GET') url += '?' + new URLSearchParams(params).toString()
  else { opt.headers = { 'Content-Type': 'application/x-www-form-urlencoded' }; opt.body = new URLSearchParams(params).toString() }
  const res = await fetch(url, opt)
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.error) throw new Error(json?.error?.message || `Facebook API xato (${res.status})`)
  return json
}

function isAllowedInstanceUrl(u) {
  let p
  try { p = new URL(u) } catch { return false }
  if (p.protocol === 'https:') return true
  return cfg().insecure && p.protocol === 'http:'
}

// ── Rate limit (xotirada, IP bo'yicha) ──
const hits = new Map()
function rateLimited(ip, max = 10, windowMs = 60 * 60 * 1000) {
  const now = Date.now()
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  arr.push(now)
  hits.set(ip, arr)
  return arr.length > max
}
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()

// ── CRM'ga imzolangan so'rov (retry bilan) ──
async function signedPost(inst, path, payload, { retries = 3 } = {}) {
  const body = JSON.stringify({ ...payload, ts: Date.now() })
  const sig = hmac(instanceSecret(inst), body)
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(inst.url.replace(/\/+$/, '') + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Connector-Signature': sig, 'X-Connector-Instance': inst.id },
        body, signal: AbortSignal.timeout(20000),
      })
      if (res.ok) return true
      lastErr = new Error('HTTP ' + res.status)
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break // qayta urinish befoyda
    } catch (e) { lastErr = e }
    if (i < retries) await new Promise((r) => setTimeout(r, cfg().retryBase * 2 ** i))
  }
  throw lastErr
}

// ── Sahifa HTML'lari ──
function finishPage({ ok, pages = [], error = '', ret }) {
  let origin = ''
  try { origin = new URL(ret).origin } catch { /* */ }
  const data = JSON.stringify({ type: 'fb-connect', ok, pages, error }).replace(/</g, '\\u003c')
  let fb = ''
  try {
    const u = new URL(ret)
    u.searchParams.set('fb', ok ? 'ok' : 'error')
    if (ok) u.searchParams.set('pages', String(pages.length)); else u.searchParams.set('msg', error)
    fb = u.toString()
  } catch { /* */ }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Facebook</title></head><body style="font-family:sans-serif;text-align:center;padding-top:40px"><p>${ok ? 'OK' : esc(error)}</p>` +
    `<script>(function(){var d=${data},o=${JSON.stringify(origin)},f=${JSON.stringify(fb)};` +
    `if(window.opener&&!window.opener.closed&&o){try{window.opener.postMessage(d,o);}catch(e){}window.close();}else if(f){location.replace(f);}})();</script></body></html>`
}
function selectPage(sid, pages) {
  const rows = pages.map((p) => `<label class="r"><input type="checkbox" name="page" value="${esc(p.id)}" checked> <b>${esc(p.name)}${p.igUsername ? ` · @${esc(p.igUsername)}` : ''}</b></label>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facebook</title>
<style>body{font-family:-apple-system,Segoe UI,sans-serif;margin:0;background:#f4f5f7}.box{max-width:520px;margin:30px auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 4px #0002}
h1{font-size:18px;margin:0 0 14px}.r{display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #eee;cursor:pointer}button{margin-top:18px;background:#1877f2;color:#fff;border:0;border-radius:6px;padding:10px 22px;font-size:15px;cursor:pointer}</style></head>
<body><form class="box" method="post" action="/fb/select"><h1>Ulanadigan sahifalarni tanlang</h1><input type="hidden" name="sid" value="${esc(sid)}">${rows || '<p>Sahifa topilmadi.</p>'}<button type="submit">Davom etish</button></form></body></html>`
}

// ── Marshrutlar ──
async function register(req, res) {
  if (rateLimited(clientIp(req))) return send(res, 429, { error: 'RATE_LIMIT' })
  let b
  try { b = JSON.parse((await readBody(req, 10_000)).toString() || '{}') } catch { return send(res, 400, { error: 'BAD_JSON' }) }
  const url = String(b.instanceUrl || '').trim().replace(/\/+$/, '')
  if (!isAllowedInstanceUrl(url)) return send(res, 400, { error: 'BAD_URL', message: 'instanceUrl https bo\'lishi shart' })
  const id = 'inst_' + rid(10), secret = rid(32)
  q.addInstance.run(id, url, enc(secret), Date.now())
  log('instance ro\'yxatdan o\'tdi', id, url)
  send(res, 200, { instanceId: id, instanceSecret: secret })
}

function start(req, res, url) {
  const p = url.searchParams
  const instanceId = p.get('instanceId') || '', ret = p.get('return') || '', ts = p.get('ts') || '', sig = p.get('sig') || ''
  const inst = q.getInstance.get(instanceId)
  if (!inst) return send(res, 400, finishPage({ ok: false, error: 'Instance topilmadi', ret: '' }))
  if (!safeEq(hmac(instanceSecret(inst), `${instanceId}|${ret}|${ts}`), sig)) return send(res, 403, finishPage({ ok: false, error: 'Imzo noto\'g\'ri', ret: '' }))
  const age = Date.now() - Number(ts)
  if (!Number.isFinite(age) || age > START_TTL_MS || age < -60_000) return send(res, 403, finishPage({ ok: false, error: 'Havola eskirgan', ret: '' }))
  let retUrl
  try { retUrl = new URL(ret) } catch { return send(res, 400, finishPage({ ok: false, error: 'return noto\'g\'ri', ret: '' })) }
  if (retUrl.origin !== new URL(inst.url).origin) return send(res, 400, finishPage({ ok: false, error: 'return origin instance manzili bilan mos emas', ret: '' }))
  const c = cfg()
  if (!c.appId || !c.appSecret || !c.publicUrl) return send(res, 500, finishPage({ ok: false, error: 'Connector sozlanmagan', ret }))
  q.gc.forEach((s) => s.run(Date.now()))
  const state = rid(24)
  q.addState.run(state, instanceId, ret, Date.now() + STATE_TTL_MS)
  const dest = `${c.dialog}?client_id=${encodeURIComponent(c.appId)}&redirect_uri=${encodeURIComponent(c.publicUrl + '/fb/callback')}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPE)}&state=${state}`
  res.writeHead(302, { Location: dest, 'Cache-Control': 'no-store' }); res.end()
}

async function callback(req, res, url) {
  const state = url.searchParams.get('state') || '', code = url.searchParams.get('code') || '', fbErr = url.searchParams.get('error')
  const st = /^[a-f0-9]{48}$/.test(state) ? q.getState.get(state) : null
  if (!st) return send(res, 400, finishPage({ ok: false, error: 'Havola eskirgan yoki noto\'g\'ri', ret: '' }))
  q.delState.run(state) // bir martalik
  if (st.exp < Date.now()) return send(res, 400, finishPage({ ok: false, error: 'Havola eskirgan', ret: st.ret }))
  if (fbErr || !code) return send(res, 200, finishPage({ ok: false, error: 'Facebook ruxsat berilmadi', ret: st.ret }))
  const c = cfg()
  try {
    const short = (await graph('GET', '/oauth/access_token', { client_id: c.appId, client_secret: c.appSecret, redirect_uri: c.publicUrl + '/fb/callback', code })).access_token
    const long = await graph('GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short }).then((j) => j.access_token).catch(() => short)
    const j = await graph('GET', '/me/accounts', { access_token: long, fields: 'id,name,access_token', limit: '100' })
    const pages = (Array.isArray(j.data) ? j.data : []).map((p) => ({ id: String(p.id), name: String(p.name), token: p.access_token, igId: '', igUsername: '' }))
    // Har sahifaga ulangan Instagram biznes akkaunt (bo'lsa)
    await Promise.all(pages.map(async (p) => {
      try {
        const r = await graph('GET', `/${p.id}`, { fields: 'instagram_business_account{id,username}', access_token: p.token })
        const ig = r?.instagram_business_account
        if (ig?.id) { p.igId = String(ig.id); p.igUsername = String(ig.username || '') }
      } catch (e) { log('instagram akkaunt so\'rovi xato', p.id, e.message) }
    }))
    if (!pages.length) return send(res, 200, finishPage({ ok: false, error: 'Facebook sahifa topilmadi', ret: st.ret }))
    const sid = rid(24)
    q.addSession.run(sid, st.instance_id, st.ret, enc(JSON.stringify(pages)), Date.now() + STATE_TTL_MS)
    send(res, 200, selectPage(sid, pages))
  } catch (e) {
    log('callback xato', e.message)
    send(res, 200, finishPage({ ok: false, error: e.message, ret: st.ret }))
  }
}

// Sahifani obuna qilish: Instagram ulangan bo'lsa Instagram maydonlari ham qo'shiladi.
// Qo'shimcha maydonlar (ruxsat/versiya sababli) rad etilsa — asosiy maydonlar bilan qayta uriniladi.
async function subscribePage(p) {
  const c = cfg()
  const base = c.fields.split(',').map((x) => x.trim()).filter(Boolean)
  const withIg = p.igId ? [...new Set([...base, ...c.igFields.split(',').map((x) => x.trim()).filter(Boolean)])] : base
  try {
    await graph('POST', `/${p.id}/subscribed_apps`, { subscribed_fields: withIg.join(','), access_token: p.token })
  } catch (e) {
    if (withIg.length === base.length) throw e
    log('instagram maydonlari bilan obuna xato, asosiy maydonlar bilan qayta uriniladi:', e.message)
    await graph('POST', `/${p.id}/subscribed_apps`, { subscribed_fields: base.join(','), access_token: p.token })
  }
}

async function select(req, res) {
  const form = new URLSearchParams((await readBody(req, 100_000)).toString())
  const sid = form.get('sid') || ''
  const ses = q.getSession.get(sid)
  if (!ses) return send(res, 400, finishPage({ ok: false, error: 'Sessiya eskirgan — qaytadan boshlang', ret: '' }))
  q.delSession.run(sid) // bir martalik
  if (ses.exp < Date.now()) return send(res, 400, finishPage({ ok: false, error: 'Sessiya eskirgan', ret: ses.ret }))
  const inst = q.getInstance.get(ses.instance_id)
  const chosen = new Set(form.getAll('page'))
  const all = JSON.parse(dec(ses.pages_enc))
  const pages = all.filter((p) => chosen.has(p.id))
  if (!inst || !pages.length) return send(res, 200, finishPage({ ok: false, error: 'Sahifa tanlanmadi', ret: ses.ret }))
  const done = []
  const errors = []
  for (const p of pages) {
    try {
      await subscribePage(p)
      q.upsertPage.run(p.id, inst.id, p.name, enc(p.token), Date.now(), p.igId || null, p.igUsername || null)
      done.push(p)
    } catch (e) { errors.push(`${p.name}: ${e.message}`); log('subscribe xato', p.id, e.message) }
  }
  if (!done.length) return send(res, 200, finishPage({ ok: false, error: errors.join('; '), ret: ses.ret }))
  try {
    await signedPost(inst, '/api/v1/facebook/connector/pages', { pages: done.map((p) => ({ id: p.id, name: p.name, accessToken: p.token, igId: p.igId || '', igUsername: p.igUsername || '' })) })
  } catch (e) {
    return send(res, 200, finishPage({ ok: false, error: 'CRM sahifalarni qabul qilmadi: ' + e.message, ret: ses.ret }))
  }
  send(res, 200, finishPage({ ok: true, pages: done.map((p) => ({ id: p.id, name: p.name, igUsername: p.igUsername || '' })), ret: ses.ret }))
}

async function disconnect(req, res) {
  const raw = await readBody(req, 10_000)
  const inst = q.getInstance.get(String(req.headers['x-connector-instance'] || ''))
  if (!inst || !safeEq(hmac(instanceSecret(inst), raw), String(req.headers['x-connector-signature'] || ''))) return send(res, 403, { error: 'BAD_SIGNATURE' })
  let b
  try { b = JSON.parse(raw.toString()) } catch { return send(res, 400, { error: 'BAD_JSON' }) }
  if (!Number.isFinite(Date.now() - b.ts) || Math.abs(Date.now() - b.ts) > START_TTL_MS) return send(res, 403, { error: 'EXPIRED' })
  const pageId = String(b.pageId || '')
  const row = q.getPage.get(pageId, inst.id)
  if (row) {
    q.delPage.run(pageId, inst.id)
    if (!q.pagesByPage.all(pageId).length) { // boshqa CRM ishlatmasa — Facebook obunasini ham bekor qilamiz
      await graph('DELETE', `/${pageId}/subscribed_apps`, { access_token: dec(row.token_enc) }).catch((e) => log('unsubscribe xato', e.message))
    }
  }
  send(res, 200, { ok: true })
}

function webhookVerify(res, url) {
  const p = url.searchParams
  const token = hmac(cfg().appSecret, 'verify').slice(0, 32)
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === token) return send(res, 200, p.get('hub.challenge') || '', { 'Content-Type': 'text/plain' })
  send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain' })
}
async function webhookPost(req, res) {
  const raw = await readBody(req)
  const c = cfg()
  const expected = 'sha256=' + hmac(c.appSecret || '\0', raw)
  if (!c.appSecret || !safeEq(expected, String(req.headers['x-hub-signature-256'] || ''))) return send(res, 403, { error: 'BAD_SIGNATURE' })
  send(res, 200, { ok: true }) // darhol javob — forward fonda (Facebook timeout bermasligi uchun)
  let body
  try { body = JSON.parse(raw.toString()) } catch { return }
  const fwd = (rows, event) => {
    for (const row of rows) {
      const inst = q.getInstance.get(row.instance_id)
      if (!inst) continue
      const ev = { ...event, pageId: row.page_id }
      signedPost(inst, '/api/v1/facebook/connector/event', ev)
        .catch((e) => log('event forward xato', inst.id, e.message))
    }
  }
  const isIg = body?.object === 'instagram'
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    const entryId = String(entry?.id || '')
    const rows = () => (isIg ? q.pagesByIg.all(entryId) : q.pagesByPage.all(entryId))
    const base = isIg ? { channel: 'instagram', igId: entryId } : { channel: 'facebook' }
    // Messenger / Instagram Direct: entry.messaging[]
    for (const m of Array.isArray(entry?.messaging) ? entry.messaging : []) {
      if (!m || (!m.message && !m.postback)) continue // delivery/read va boshqalar — hozircha e'tiborsiz
      if (m.message?.is_echo) continue // sahifaning o'z xabarlari (CRM'dan yuborilgan) takrorlanmasin
      fwd(rows(), { kind: 'message', ...base, igId: base.igId || '', payload: m })
    }
    for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = ch?.value || {}
      if (!isIg && ch?.field === 'leadgen') {
        const leadgenId = String(v.leadgen_id || '')
        const pageId = String(v.page_id || entryId)
        if (!pageId || !leadgenId) continue
        const formId = String(v.form_id || '')
        // leadgenId/formId yuqori darajada ham — eski CRM nusxalari bilan moslik uchun
        fwd(q.pagesByPage.all(pageId), { kind: 'lead', channel: 'facebook', igId: '', leadgenId, formId, payload: { leadgenId, formId } })
      } else if (!isIg && ch?.field === 'feed') {
        if (v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) continue
        if (String(v.from?.id || '') === entryId) continue // sahifaning o'z izohi
        fwd(rows(), { kind: 'comment', channel: 'facebook', igId: '', payload: v })
      } else if (isIg && ch?.field === 'comments') {
        if (!v.id) continue
        fwd(rows(), { kind: 'comment', ...base, payload: v })
      }
    }
  }
}

// Ilova darajasidagi webhook obunasini o'zi o'rnatadi; holati /health'da ko'rinadi (diagnostika)
const webhookState = { status: 'pending', at: null, objects: [] }
export async function ensureAppSubscription() {
  const c = cfg()
  webhookState.at = new Date().toISOString()
  webhookState.objects = []
  if (!c.appId || !c.appSecret || !c.publicUrl.startsWith('https://')) { webhookState.status = 'skipped'; log('webhook obunasi o\'tkazib yuborildi (https/kalit yo\'q)'); return }
  try {
    const common = { callback_url: c.publicUrl + '/fb/webhook', verify_token: hmac(c.appSecret, 'verify').slice(0, 32), access_token: `${c.appId}|${c.appSecret}` }
    for (const [object, fields] of [['page', c.fields], ['instagram', c.igFields]]) {
      try {
        // Meta callback'ni darhol tekshiradi; konteyner yangi ishga tushganda (#2200 timeout) bo'lishi mumkin — qayta urinamiz
        for (let attempt = 0; ; attempt++) {
          try { await graph('POST', `/${c.appId}/subscriptions`, { object, fields, ...common }); break }
          catch (e) {
            if (attempt >= 2 || !/#2200|timed out/i.test(e.message)) throw e
            await new Promise((r) => setTimeout(r, attempt === 0 ? 10000 : 30000))
          }
        }
        log(`ilova webhook obunasi o'rnatildi: ${object}`)
        webhookState.objects.push({ object, ok: true })
      } catch (e) {
        log(`ilova webhook obunasi xato (${object}):`, e.message)
        webhookState.objects.push({ object, ok: false, error: e.message })
      }
    }
  } catch (e) { log('ilova webhook obunasi xato:', e.message) }
  webhookState.status = webhookState.objects.length && webhookState.objects.every((o) => o.ok) ? 'ok' : 'error'
}

// Meta talabi: maxfiylik siyosati va ma'lumotlarni o'chirish yo'riqnomasi sahifalari
const page = (res, html) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) }
const wrap = (title, body) => `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px/1.6 -apple-system,Segoe UI,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#222}h1{font-size:26px}h2{font-size:18px;margin-top:28px}</style></head><body>${body}</body></html>`
const PRIVACY_HTML = wrap('Sellers Army CRM — Maxfiylik siyosati', `
<h1>Sellers Army CRM — Maxfiylik siyosati</h1>
<p>Sellers Army CRM Meta Connector xizmati CRM foydalanuvchilariga o'z Facebook sahifalari, lid formalari va Instagram/Messenger
akkauntlarini o'z CRM tizimiga ulash imkonini beradi.</p>
<h2>Qanday ma'lumot olinadi</h2>
<p>Foydalanuvchi ruxsat bergan Facebook sahifalari ro'yxati va sahifa kirish tokenlari; sahifadagi lid formalari orqali yuborilgan
so'rovlar (ism, telefon, email va forma savollariga javoblar) faqat shu sahifa egasining CRM tizimiga uzatish uchun.</p>
<h2>Saqlash</h2>
<p>Sahifa tokenlari shifrlangan (AES-256-GCM) holda saqlanadi. Lid ma'lumotlari connector'da saqlanmaydi — ular faqat sahifa egasining
CRM serveriga uzatiladi. Ma'lumotlar uchinchi shaxslarga sotilmaydi va berilmaydi.</p>
<h2>O'chirish</h2>
<p>Foydalanuvchi istalgan vaqtda CRM'dagi "Uzish" tugmasi orqali yoki Facebook sozlamalari → Business Integrations bo'limida ilovani
o'chirib, barcha tokenlarni o'chirishi mumkin. Batafsil: <a href="/data-deletion">ma'lumotlarni o'chirish</a>.</p>
<h2>Aloqa</h2><p>umarmuradovich.info@gmail.com</p>`)
const DELETION_HTML = wrap('Sellers Army CRM — Ma\'lumotlarni o\'chirish', `
<h1>Ma'lumotlarni o'chirish</h1>
<ol><li>CRM → Market → Facebook Lead Ads → ulangan sahifa yonidagi "Uzish" tugmasini bosing — sahifa tokeni connector'dan darhol o'chiriladi.</li>
<li>Yoki Facebook → Sozlamalar → Business Integrations → "Sellers Army CRM" → O'chirish.</li>
<li>Qo'shimcha so'rov uchun: umarmuradovich.info@gmail.com — 30 kun ichida barcha ma'lumotlar o'chiriladi.</li></ol>`)

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    const k = `${req.method} ${url.pathname}`
    if (k === 'GET /health') return send(res, 200, { ok: true, webhook: webhookState, graph: env('FB_GRAPH_VERSION', 'v26.0') })
    if (k === 'GET /privacy') return page(res, PRIVACY_HTML)
    if (k === 'GET /data-deletion') return page(res, DELETION_HTML)
    if (k === 'POST /instances/register') return await register(req, res)
    if (k === 'GET /fb/start') return start(req, res, url)
    if (k === 'GET /fb/callback') return await callback(req, res, url)
    if (k === 'POST /fb/select') return await select(req, res)
    if (k === 'POST /fb/disconnect') return await disconnect(req, res)
    if (k === 'GET /fb/webhook') return webhookVerify(res, url)
    if (k === 'POST /fb/webhook') return await webhookPost(req, res)
    send(res, 404, { error: 'NOT_FOUND' })
  } catch (e) {
    log('xato', e.message)
    if (!res.headersSent) send(res, e.status || 500, { error: 'SERVER' })
  }
})
const port = Number(env('PORT', '8100'))
server.listen(port, () => {
  log(`ishlamoqda: :${port}`)
  // Server so'rov qabul qila boshlaganidan keyin obuna (Meta callback'ni tekshiradi), so'ng har 6 soatda tekshirib turadi
  setTimeout(() => void ensureAppSubscription(), 5000)
  setInterval(() => void ensureAppSubscription(), 6 * 3600 * 1000).unref()
})

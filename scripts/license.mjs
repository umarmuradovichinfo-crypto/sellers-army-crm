#!/usr/bin/env node
// Litsenziya kodi yaratish (mijoz to'lovini tasdiqlagach qo'lda beriladi).
// Ishlatish:  LICENSE_SECRET=<sir> node scripts/license.mjs --plan pro --users 10 --months 12 --customer "DECOPOL" --install <installId> [--type renew|new|addon]
// --type (standart renew): renew — shu tarifdagi eng kech litsenziya oxiridan davom etadi (oldindan to'langan kelajak davr, vaqti kelganda o'zi faollashadi);
//   new — bugundan to'liq davr (boshqa tarif / qo'shimcha litsenziya); addon — foydalanuvchi qo'shish: bugundan joriy faol muddat oxirigacha
//   (narx = foydalanuvchi × kunlik narx × qolgan kun; --months kerak emas). Narx: sahifadagi «Foydalanuvchi qo'shish» summasi.
// --install: mijozning «Hisob va to'lov» sahifasidagi «O'rnatish ID» si. Kod faqat shu o'rnatishda ishlaydi (boshqa mijozga ko'chirib bo'lmaydi). Majburiy.
// plan: basic | advanced | pro | cost (cost = eksklyuziv mijoz uchun yashirin «xarajat» tarifi, narx menyuda yo'q);  months: 3 | 6 | 9 | 12 | 24 (sovg'a oylar bilan berilgan davr).
// Sir macOS Keychain'da («crm-license-secret») saqlangan — o'zgaruvchi berish shart emas. Sirni chatga yozmang va commitga qo'shmang — u serverlarda (Railway/VPS o'zgaruvchilari) bir xil bo'lishi kerak.
import { createHmac, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []))
// Sir: LICENSE_SECRET o'zgaruvchisi, bo'lmasa macOS Keychain'dagi «crm-license-secret» (sirni terminalga yozmaslik uchun)
let secret = process.env.LICENSE_SECRET
if (!secret && process.platform === 'darwin') {
  try { secret = execFileSync('security', ['find-generic-password', '-s', 'crm-license-secret', '-w'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* */ }
}
if (!secret) { console.error('LICENSE_SECRET topilmadi (o\'zgaruvchi yoki Keychain «crm-license-secret»)'); process.exit(1) }
if (!['basic', 'advanced', 'pro', 'cost'].includes(a.plan)) { console.error('--plan basic|advanced|pro|cost'); process.exit(1) }
const type = a.type || 'renew'
if (!['renew', 'new', 'addon'].includes(type)) { console.error('--type renew|new|addon'); process.exit(1) }
const users = Number(a.users), months = type === 'addon' ? 0 : Number(a.months)
if (!Number.isInteger(users) || users < 1 || users > 1000) { console.error('--users butun son 1..1000'); process.exit(1) }
if (type !== 'addon' && ![3, 6, 9, 12, 24].includes(months)) { console.error('--months 3|6|9|12|24'); process.exit(1) }
if (!a.install || !/^[0-9a-f]{6,32}$/i.test(a.install)) { console.error("--install <O'rnatish ID> kerak (mijoz «Hisob va to'lov» sahifasidan oladi)"); process.exit(1) }
// t faqat renew'dan farqli bo'lsa yoziladi (renew kodlari eski formatdagidek)
const payload = { i: randomBytes(6).toString('hex'), p: a.plan, u: users, m: months, d: a.install, ...(type !== 'renew' ? { t: type } : {}), ...(a.customer ? { c: a.customer } : {}) }
const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
const sig = createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url')
console.log(`SA1.${body}.${sig}`)

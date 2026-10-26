#!/usr/bin/env node
// Litsenziya kodi yaratish (mijoz to'lovini tasdiqlagach qo'lda beriladi).
// Ishlatish:  LICENSE_SECRET=<sir> node scripts/license.mjs --plan pro --users 10 --months 12 --customer "DECOPOL"
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
const users = Number(a.users), months = Number(a.months)
if (!Number.isInteger(users) || users < 1) { console.error('--users butun son >= 1'); process.exit(1) }
if (![3, 6, 9, 12, 24].includes(months)) { console.error('--months 3|6|9|12|24'); process.exit(1) }
const payload = { i: randomBytes(6).toString('hex'), p: a.plan, u: users, m: months, ...(a.customer ? { c: a.customer } : {}) }
const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
const sig = createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url')
console.log(`SA1.${body}.${sig}`)

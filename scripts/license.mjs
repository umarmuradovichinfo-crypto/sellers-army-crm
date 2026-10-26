#!/usr/bin/env node
// Litsenziya kodi yaratish (mijoz to'lovini tasdiqlagach qo'lda beriladi).
// Ishlatish:  LICENSE_SECRET=<sir> node scripts/license.mjs --plan pro --users 10 --months 12 --customer "DECOPOL"
// plan: basic | advanced | pro;  months: 3 | 6 | 9 | 12 | 24 (sovg'a oylar bilan berilgan davr).
// Sirni (LICENSE_SECRET) chatga yozmang va commitga qo'shmang — u serverlarda (Railway/VPS o'zgaruvchilari) bir xil bo'lishi kerak.
import { createHmac, randomBytes } from 'node:crypto'

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []))
const secret = process.env.LICENSE_SECRET
if (!secret) { console.error('LICENSE_SECRET o\'zgaruvchisi kerak'); process.exit(1) }
if (!['basic', 'advanced', 'pro'].includes(a.plan)) { console.error('--plan basic|advanced|pro'); process.exit(1) }
const users = Number(a.users), months = Number(a.months)
if (!Number.isInteger(users) || users < 1) { console.error('--users butun son >= 1'); process.exit(1) }
if (![3, 6, 9, 12, 24].includes(months)) { console.error('--months 3|6|9|12|24'); process.exit(1) }
const payload = { i: randomBytes(6).toString('hex'), p: a.plan, u: users, m: months, ...(a.customer ? { c: a.customer } : {}) }
const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
const sig = createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url')
console.log(`SA1.${body}.${sig}`)

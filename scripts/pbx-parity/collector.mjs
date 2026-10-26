// Dizayn solishtirish yordamchisi: brauzerdagi sahifalardan o'lchov (snapshot) qabul qilib /tmp/pbx-parity/<nom>.json ga yozadi.
// Ishlatish: node scripts/pbx-parity/collector.mjs   (port 9911, faqat lokal)
import http from 'node:http'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
mkdirSync('/tmp/pbx-parity', { recursive: true })
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Private-Network': 'true' }
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end() }
  const u = new URL(req.url, 'http://x')
  if (req.method === 'GET' && u.pathname === '/snap.js') { res.writeHead(200, { ...H, 'Content-Type': 'text/javascript' }); return res.end(readFileSync(join(here, 'snap.js'), 'utf8')) }
  const name = (u.searchParams.get('name') || 'x').replace(/[^\w.-]/g, '_')
  let body = ''
  req.on('data', (d) => { body += d })
  req.on('end', () => { writeFileSync(`/tmp/pbx-parity/${name}.txt`, body); res.writeHead(200, H); res.end('ok') })
}).listen(9911, '127.0.0.1', () => console.log('collector :9911'))

// node scripts/pbx-parity/diff.mjs <asl> <bizning> [--tol=2]   (fayllar: /tmp/pbx-parity/<nom>.txt)
import { readFileSync } from 'node:fs'
const [a, b] = process.argv.slice(2, 4)
const tol = Number((process.argv.find((x) => x.startsWith('--tol=')) || '--tol=2').slice(6))
const parse = (f) => {
  const T = [], B = []; let H = null
  for (const line of readFileSync(`/tmp/pbx-parity/${f}.txt`, 'utf8').split('\n')) {
    const p = line.replace('|R|', '|Roboto|').replace('|W|', '|#ffffff|').split('|')
    if (p[0] === 'H') H = { vw: +p[1], vh: +p[2], w: +p[3], h: +p[4] }
    else if (p[0] === 'T') T.push({ t: p[1], x: +p[2], y: +p[3], w: +p[4], h: +p[5], rx: +p[6], c: p[7], bg: p[8], f: p[9], fs: p[10], fw: p[11], ls: p[12], tt: p[13] || 'none' })
    else if (p[0] === 'B') B.push({ k: p[1], x: +p[2], y: +p[3], w: +p[4], h: +p[5], rx: +p[6], bg: p[7], bd: p[8], r: p[9] })
  }
  return { H, T, B }
}
const A = parse(a), B = parse(b)
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const group = (list) => { const m = new Map(); for (const t of list) { const k = norm(t.t); if (!m.has(k)) m.set(k, []); m.get(k).push(t) } return m }
const ga = group(A.T), gb = group(B.T)
console.log(`oyna asl ${A.H.vw}x${A.H.vh} / biz ${B.H.vw}x${B.H.vh}; konteyner asl ${A.H.w}x${A.H.h} / biz ${B.H.w}x${B.H.h}`)
let ok = 0; const miss = [], diffs = []
for (const [k, la] of ga) {
  const lb = gb.get(k)
  if (!lb) { miss.push(la[0].t); continue }
  la.forEach((x, i) => {
    const y = lb[i]; if (!y) return
    const d = []
    if (Math.abs(x.x - y.x) > tol && Math.abs(x.rx - y.rx) > tol) d.push(`x ${x.x}→${y.x}`)
    if (Math.abs(x.y - y.y) > tol) d.push(`y ${x.y}→${y.y}`)
    if (Math.abs(x.w - y.w) > Math.max(tol, x.w * 0.06)) d.push(`w ${x.w}→${y.w}`)
    if (x.fs !== y.fs) d.push(`size ${x.fs}→${y.fs}`)
    if (x.fw !== y.fw) d.push(`weight ${x.fw}→${y.fw}`)
    if (x.f !== y.f) d.push(`font ${x.f}→${y.f}`)
    if (x.c !== y.c) d.push(`color ${x.c}→${y.c}`)
    if (x.bg !== y.bg) d.push(`bg ${x.bg}→${y.bg}`)
    if (x.tt !== y.tt) d.push(`transform ${x.tt}→${y.tt}`)
    if (x.ls !== y.ls) d.push(`letter ${x.ls}→${y.ls}`)
    if (d.length) diffs.push(`«${x.t}» ${d.join(', ')}`); else ok++
  })
}
const extra = [...gb.keys()].filter((k) => !ga.has(k)).map((k) => gb.get(k)[0].t)
console.log(`MOS: ${ok} | FARQ: ${diffs.length} | aslda bor-bizda yo'q: ${miss.length} | bizda ortiqcha: ${extra.length}`)
console.log('\n--- FARQLAR ---\n' + diffs.slice(0, +(process.env.MAX || 50)).join('\n'))
console.log('\n--- ASLDA BOR, BIZDA YO\'Q ---\n' + miss.slice(0, 40).join(' | '))
console.log('\n--- BIZDA ORTIQCHA ---\n' + extra.slice(0, 40).join(' | '))
const bd = []
for (const x of A.B) {
  const y = B.B.find((q) => Math.abs(q.w - x.w) <= 4 && Math.abs(q.h - x.h) <= 4 && Math.abs(q.y - x.y) <= 8)
  if (!y) { bd.push(`QUTI ${x.k} ${x.w}x${x.h}@${x.x},${x.y} bg=${x.bg} bd=${x.bd}: bizda o'xshash quti yo'q`); continue }
  const d = []
  if (Math.abs(x.x - y.x) > tol * 2 && Math.abs(x.rx - y.rx) > tol * 2) d.push(`joy x ${x.x}→${y.x}`)
  if (x.bg !== y.bg) d.push(`fon ${x.bg}→${y.bg}`)
  if (x.bd !== y.bd) d.push(`chegara ${x.bd}→${y.bd}`)
  if (x.r !== y.r) d.push(`radius ${x.r}→${y.r}`)
  if (d.length) bd.push(`QUTI ${x.k} ${x.w}x${x.h}@${x.y}: ${d.join(', ')}`)
}
console.log('\n--- QUTILAR ---\n' + bd.slice(0, 40).join('\n'))

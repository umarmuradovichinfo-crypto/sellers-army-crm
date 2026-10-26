import fs from 'fs'
import path from 'path'
const dir = process.argv[2]
const seen = new Map()
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ru.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8')
  const re = /(?:^|[\s,{])("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g
  let m
  while ((m = re.exec(src))) {
    const k = m[1].slice(1, -1), v = m[2].slice(1, -1)
    if (!seen.has(k)) seen.set(k, new Map())
    const vs = seen.get(k); if (!vs.has(v)) vs.set(v, []); vs.get(v).push(f)
  }
}
for (const [k, vs] of seen) if (vs.size > 1) console.log(JSON.stringify(k), '=>', [...vs].map(([v, fs]) => `${v} (${fs.join(',')})`).join(' | '))

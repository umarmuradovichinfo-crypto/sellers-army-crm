(async (NAME, ROOTSEL, XMIN) => {
  const root = (ROOTSEL && document.querySelector(ROOTSEL)) || document.body;
  const rb = root.getBoundingClientRect();
  const hex = (c) => { const m = String(c).match(/[\d.]+/g); if (!m) return '-'; const [r, g, b, a] = m.map(Number); if (a === 0) return '-'; return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (a !== undefined && a < 1 ? '@' + a : ''); };
  const eff = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return hex(c); e = e.parentElement; } return '#ffffff'; };
  const L = [`H|${innerWidth}|${innerHeight}|${Math.round(rb.width)}|${Math.round(rb.height)}`];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = n.textContent.replace(/\s+/g, ' ').trim().replace(/\|/g, '/');
    if (!t) continue;
    const el = n.parentElement; if (!el) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (XMIN && r.left - rb.left < XMIN) continue;
    L.push(['T', t.slice(0, 40), Math.round(r.left - rb.left), Math.round(r.top - rb.top), Math.round(r.width), Math.round(r.height), Math.round(rb.right - r.right), hex(s.color), eff(el), s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), s.fontSize, s.fontWeight, s.letterSpacing === 'normal' ? '0' : s.letterSpacing, s.textTransform].join('|'));
  }
  for (const el of root.querySelectorAll('*')) {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || s.display === 'none') continue;
    if (XMIN && r.left - rb.left < XMIN) continue;
    const bw = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
    const hasBg = s.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (!bw && !hasBg) continue;
    if (r.width > rb.width * 0.98 && r.height > 600) continue;
    const b = (side) => parseFloat(s['border' + side + 'Width']) ? parseFloat(s['border' + side + 'Width']) + hex(s['border' + side + 'Color']) : '0';
    L.push(['B', (String(el.className).split(' ')[0] || el.tagName).slice(0, 30), Math.round(r.left - rb.left), Math.round(r.top - rb.top), Math.round(r.width), Math.round(r.height), Math.round(rb.right - r.right), hex(s.backgroundColor), [b('Top'), b('Right'), b('Bottom'), b('Left')].join(','), s.borderRadius].join('|'));
  }
  const text = L.join('\n');
  window.__SNAP = text;
  try { const c = new AbortController(); setTimeout(() => c.abort(), 2500); await fetch('http://127.0.0.1:9911/save?name=' + encodeURIComponent(NAME), { method: 'POST', body: text, signal: c.signal }); } catch (e) { /* asl sahifada bloklanadi — bo'laklab o'qiladi */ }
  return NAME + ' lines=' + L.length + ' chars=' + text.length;
})

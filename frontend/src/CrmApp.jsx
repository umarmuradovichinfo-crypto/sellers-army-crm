// ══ CRM — mustaqil ilova ══
// amoCRM tuzilmasi aynan —
// CHAP tomonda bo'limlar paneli (amoCRM'dagi kabi), har bo'lim ALOHIDA sahifa:
//   Ish stoli (Рабочий стол) · Lidlar (Сделки) · Vazifalar (Задачи) ·
//   Ro'yxatlar (Списки) · Suhbatlar (Почта/Чаты) · Analitika · Sozlamalar
import React from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { Loading, Pill } from './components/ui'
import Icon from './components/Icon'
import { useApi } from './lib/useApi'
import { crmService } from './services/crm.service'
import Login from './pages/Login'
import LeadForm from './pages/LeadForm'
import CRM from './pages/CRM'
import Settings from './pages/Settings'
import CallWidget from './components/CallWidget'

// amoCRM chap paneli — har bo'lim alohida route
const RAIL = [
  { path: '/ish-stoli', label: 'Ish stoli', icon: 'dashboard' },
  { path: '/', label: 'Lidlar', icon: 'crm' },
  { path: '/vazifalar', label: 'Vazifalar', icon: 'checkSquare' },
  { path: '/royxatlar', label: "Ro'yxatlar", icon: 'checklist' },
  { path: '/suhbatlar', label: 'Suhbatlar', icon: 'send' },
  { path: '/qongiroqlar', label: "Qo'ng'iroqlar", icon: 'phone' },
  { path: '/analitika', label: 'Analitika', icon: 'vision' },
  { path: '/sozlamalar', label: 'Sozlamalar', icon: 'settings' },
  { path: '/settings', label: 'Foydalanuvchilar', icon: 'hr' },
]

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function CrmShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const active = (p) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))
  return (
    <div className="crmsa">
      <aside className="crmsa-rail">
        <div className="crmsa-logo" title="Sellers Army CRM">SA</div>
        {RAIL.map((r) => (
          <button key={r.path} className={`crmsa-rl ${active(r.path) ? 'on' : ''}`} onClick={() => navigate(r.path)}>
            <Icon name={r.icon} size={19} />
            <span>{r.label}</span>
          </button>
        ))}
        <div className="f1" />
      </aside>
      <div className="crmsa-col">
        <header className="crmsa-top">
          <b className="crmsa-title">{RAIL.find((r) => active(r.path))?.label || 'CRM'}</b>
          <div className="f1" />
          <span className="crmsa-user">{user?.name}</span>
          <button className="crmsa-out" onClick={logout} title="Chiqish">⎋</button>
        </header>
        <div className="crmsa-body">
          <Routes>
            <Route path="/ish-stoli" element={<CrmDesk />} />
            {/* Foydalanuvchilar, rollar va ruxsatlar */}
            <Route path="/settings/*" element={<Settings />} />
            {/* Qolgan bo'limlar — CRM ichida URL slug bo'yicha (chrome='none': tab-qatorsiz) */}
            <Route path="/*" element={<CRM chrome="none" />} />
          </Routes>
        </div>
      </div>
      <CallWidget />
    </div>
  )
}

// Summa satrini ("18.4 mln", "990 ming") yoki sonni raqamga aylantiradi
function parseSum(s) {
  if (typeof s === 'number') return s
  if (!s) return 0
  const m = String(s).replace(/\s/g, '').match(/([\d.,]+)(mlrd|mln|ming)?/i)
  if (!m) return 0
  let v = parseFloat(m[1].replace(',', '.')) || 0
  const u = (m[2] || '').toLowerCase()
  if (u === 'mlrd') v *= 1e9
  else if (u === 'mln') v *= 1e6
  else if (u === 'ming') v *= 1e3
  return v
}
function fmtSum(v) {
  v = Number(v) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' mlrd'
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' mln'
  if (v >= 1e3) return Math.round(v / 1e3) + ' ming'
  return String(Math.round(v))
}

// ── Ish stoli (amoCRM "Рабочий стол") — kunlik ish holati bir qarashda ──
function CrmDesk() {
  const navigate = useNavigate()
  const { data, loading } = useApi(async () => {
    const [pipe, tasks] = await Promise.all([
      crmService.getPipeline(),
      crmService.listTasks({ status: 'open' }),
    ])
    return { pipe, tasks: tasks.tasks || [] }
  }, [])
  if (loading && !data) return <Loading />

  const stages = data?.pipe?.stages || []
  const allLeads = stages.flatMap((s) => s.leads || [])
  const stageSum = (s) => (s.sum ? parseSum(s.sum) : (s.leads || []).reduce((x, l) => x + parseSum(l.sum), 0))
  // Yopilgan (sotuv) bosqichlari — nom bo'yicha yoki won bayrog'i bo'yicha (takrorsiz)
  const isClosed = (s) => /yopil|sotuv|won|success|closed/i.test(s.name || '')
  const wonRaw = stages.filter(isClosed).flatMap((s) => s.leads || []).concat(allLeads.filter((l) => l.won))
  const wonLeads = [...new Map(wonRaw.map((l) => [l.id, l])).values()]
  const wonIds = new Set(wonLeads.map((l) => l.id))
  const wonCount = wonLeads.length
  const activeLeads = allLeads.filter((l) => !wonIds.has(l.id))
  // Voronka summasi — faqat ochiq (yopilmagan) bosqichlar
  const totalSum = stages.filter((s) => !isClosed(s)).reduce((a, s) => a + stageSum(s), 0)
  const wonSum = wonLeads.reduce((a, l) => a + parseSum(l.sum), 0)
  const hotCount = activeLeads.filter((l) => l.hot).length

  // Manba (tag/source) bo'yicha faol lidlar
  const bySource = {}
  for (const l of activeLeads) { const k = l.tag || l.source || 'Boshqa'; bySource[k] = (bySource[k] || 0) + 1 }
  const sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxSrc = sources.length ? sources[0][1] : 1

  // Voronka: bosqich bo'yicha lid soni (nisbiy bar)
  const funnel = stages.map((s) => ({ name: s.name, color: s.color || '#6366F1', count: (s.leads || []).length, sum: s.sum || fmtSum((s.leads || []).reduce((x, l) => x + parseSum(l.sum), 0)) }))
  const maxFun = Math.max(1, ...funnel.map((f) => f.count))

  const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10)
  const dueOf = (t) => (t.dueDate ? new Date(new Date(t.dueDate).getTime() + 5 * 3600_000).toISOString().slice(0, 10) : null)
  const overdue = data.tasks.filter((t) => dueOf(t) && dueOf(t) < today)
  const todays = data.tasks.filter((t) => dueOf(t) === today)
  const upcoming = data.tasks.filter((t) => dueOf(t) && dueOf(t) > today)
  const noTaskHint = activeLeads.filter((l) => l.taskStatus?.kind === 'none')

  const TaskRow = ({ t, tone, tag }) => (
    <div className="crmsa-taskrow" onClick={() => navigate('/vazifalar')}>
      <span className="crmsa-tdot" style={{ background: tone }} />
      <span className="f1" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t.title} {t.leadName && <span className="sub2" style={{ fontSize: 11.5 }}>— {t.leadName}</span>}
      </span>
      <Pill kind={tone === '#DE5147' ? 'dang' : tone === '#D9952E' ? 'warn' : 'ok'}>{tag}</Pill>
    </div>
  )

  // KPI plitka
  const Kpi = ({ label, value, sub, tone, onClick }) => (
    <div className="card" style={{ padding: '13px 15px', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <div className="sub2" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 2, color: tone || 'var(--ink)' }}>{value}</div>
      {sub && <div className="sub2" style={{ fontSize: 11.5, marginTop: 1 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* KPI qatori — voronkadan hisoblangan (mock va real ishlaydi) */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
        <Kpi label="Voronka summasi" value={fmtSum(totalSum) + " so'm"} sub={`${activeLeads.length} faol lid`} />
        <Kpi label="Yopilgan sotuvlar" value={wonCount} sub={fmtSum(wonSum) + " so'm"} tone="#2E9E5B" />
        <Kpi label="Kechikkan vazifa" value={overdue.length} tone={overdue.length ? 'var(--dang)' : undefined} onClick={() => navigate('/vazifalar')} />
        <Kpi label="Bugungi vazifa" value={todays.length} tone={todays.length ? 'var(--warn)' : undefined} onClick={() => navigate('/vazifalar')} />
        <Kpi label="Issiq lidlar" value={hotCount} sub="🔥 e'tibor kerak" onClick={() => navigate('/')} />
      </div>

      {/* Voronka mini-ko'rinishi */}
      {funnel.length > 0 && (
        <div className="card">
          <div className="fx jb ac mb12">
            <h3 className="ch" style={{ margin: 0 }}>🧲 Voronka holati</h3>
            <button className="btn sm" onClick={() => navigate('/')}>Lidlarga →</button>
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            {funnel.map((f, i) => (
              <div key={i} className="fx ac gap8" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                <span style={{ width: 150, minWidth: 150, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <div style={{ flex: 1, background: 'var(--line, #eee)', borderRadius: 99, height: 20, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(6, (f.count / maxFun) * 100)}%`, background: f.color, height: '100%', borderRadius: 99, transition: 'width .3s' }} />
                </div>
                <span style={{ width: 34, textAlign: 'right', fontWeight: 800, fontSize: 13 }}>{f.count}</span>
                <span className="sub2" style={{ width: 74, textAlign: 'right', fontSize: 11.5 }}>{f.sum}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {/* Bugungi ishlar */}
        <div className="card">
          <h3 className="ch mb12">📋 Bugungi ishlar</h3>
          {overdue.length === 0 && todays.length === 0 && upcoming.length === 0 && (
            <div className="sub2" style={{ fontSize: 13 }}>Vazifa yo'q — Lidlar bo'limida keyingi qadam qo'ying.</div>
          )}
          <div style={{ display: 'grid', gap: 6 }}>
            {overdue.slice(0, 5).map((t) => <TaskRow key={t.id} t={t} tone="#DE5147" tag="o'tgan" />)}
            {todays.slice(0, 6).map((t) => <TaskRow key={t.id} t={t} tone="#2E9E5B" tag="bugun" />)}
            {overdue.length + todays.length < 5 && upcoming.slice(0, 4).map((t) => <TaskRow key={t.id} t={t} tone="#D9952E" tag="kelgusi" />)}
          </div>
          {(overdue.length > 5 || todays.length > 6) && (
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => navigate('/vazifalar')}>Hammasi →</button>
          )}
        </div>

        {/* E'tibor talab qiladigan lidlar (amoCRM: vazifasiz lid = xavf) */}
        <div className="card">
          <h3 className="ch mb12">⚠️ Vazifasiz lidlar</h3>
          {noTaskHint.length === 0 ? (
            <div className="sub2" style={{ fontSize: 13 }}>Zo'r — har bir lidda keyingi qadam belgilangan.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {noTaskHint.slice(0, 8).map((l) => (
                <div className="crmsa-taskrow" key={l.id} onClick={() => navigate('/')}>
                  <span className="crmsa-tdot" style={{ background: '#DE5147' }} />
                  <span className="f1">{l.contactName || l.n}</span>
                  <span className="sub2" style={{ fontSize: 11.5 }}>{l.sum} so'm</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Manba bo'yicha faol lidlar */}
        <div className="card">
          <h3 className="ch mb12">📊 Manba bo'yicha lidlar</h3>
          {sources.length === 0 ? (
            <div className="sub2" style={{ fontSize: 13 }}>Faol lid yo'q.</div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {sources.map(([name, cnt]) => (
                <div key={name} className="fx ac gap8">
                  <span style={{ width: 90, minWidth: 90, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <div style={{ flex: 1, background: 'var(--line, #eee)', borderRadius: 99, height: 8 }}>
                    <div style={{ width: `${(cnt / maxSrc) * 100}%`, background: '#3F77DD', height: '100%', borderRadius: 99 }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontWeight: 700, fontSize: 12.5 }}>{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CrmApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Ochiq lid formasi subdomen'da ham ishlaydi (reklama havolalari uchun) */}
      <Route path="/lead/:slug" element={<LeadForm />} />
      {/* Login /dashboard'ga yo'naltiradi — alohida CRM'da bosh sahifaga qaytaramiz */}
      <Route path="/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/*" element={<RequireAuth><CrmShell /></RequireAuth>} />
    </Routes>
  )
}

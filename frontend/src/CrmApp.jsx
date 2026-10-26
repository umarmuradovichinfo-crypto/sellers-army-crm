// ══ CRM — mustaqil ilova ══
// amoCRM tuzilmasi aynan —
// CHAP tomonda bo'limlar paneli (amoCRM'dagi kabi), har bo'lim ALOHIDA sahifa:
//   Ish stoli (Рабочий стол) · Lidlar (Сделки) · Vazifalar (Задачи) ·
//   Ro'yxatlar (Списки) · Suhbatlar (Почта/Чаты) · Analitika · Sozlamalar
import React, { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useParams } from 'react-router-dom'
import { Loading } from './components/ui'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import LeadForm from './pages/LeadForm'
import CallWidget from './components/CallWidget'
import AmoShell from './amo/AmoShell'
import NotFound from './amo/NotFound'
import { useT } from './amo/i18n'
import { titleFor } from './amo/pageTitle'
import { useApi } from './lib/useApi'
import { billingService } from './services/billing.service'
import './amo/i18n/billing.ru'
import './amo/billing.css'

// bo'limlar alohida yuklanadi (birinchi ochilish tezroq; har sahifa o'z fayli bilan)
const LeadsPipeline = lazy(() => import('./amo/pages/LeadsPipeline'))
const ListsPage = lazy(() => import('./amo/pages/ListsPage'))
const LeadCard = lazy(() => import('./amo/pages/LeadCard'))
const TasksPage = lazy(() => import('./amo/pages/TasksPage'))
const LeadsList = lazy(() => import('./amo/pages/LeadsList'))
const StatsPage = lazy(() => import('./amo/pages/StatsPage'))
const ImboxPage = lazy(() => import('./amo/pages/ImboxPage'))
const DashboardPage = lazy(() => import('./amo/pages/DashboardPage'))
const PipelineSetupPage = lazy(() => import('./amo/pages/PipelineSetupPage'))
const FieldsSetupPage = lazy(() => import('./amo/pages/FieldsSetup'))
const ImportPage = lazy(() => import('./amo/pages/ImportPage'))
const ContactCard = lazy(() => import('./amo/pages/ContactCard'))
const CompanyCard = lazy(() => import('./amo/pages/CompanyCard'))
const SettingsPage = lazy(() => import('./amo/pages/SettingsPage'))
const ProfilePage = lazy(() => import('./amo/pages/ProfilePage'))
const IntegrationsPage = lazy(() => import('./amo/pages/IntegrationsPage'))
const BotsPage = lazy(() => import('./amo/pages/BotsPage'))
const ProductsPage = lazy(() => import('./amo/pages/ProductsPage'))

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  // Kirmagan foydalanuvchi: so'ralgan manzilni eslab qolamiz — kirgach shu yerga qaytadi (/login?next=...)
  if (!user) {
    const next = loc.pathname + loc.search
    return <Navigate to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />
  }
  return children
}

// Eski manzillar → yangi nomlar (parametr, query va hash saqlanadi: bookmark, bildirishnoma, Facebook qaytish havolasi buzilmasin)
function Redir({ to }) {
  const p = useParams()
  const { search, hash } = useLocation()
  const path = to.replace(/:(\w+|\*)/g, (_, k) => p[k] ?? '').replace(/\/+$/, '') || '/'
  return <Navigate to={path + search + hash} replace />
}

// Obuna tugagan/tugayotgan (7 kun qolgan) bo'lsa tepada ogohlantirish
function BillingBanner() {
  const t = useT()
  const { can } = useAuth()
  const { data } = useApi(() => billingService.status().catch(() => null), [], 'billing:status', 600000)
  if (!data || !data.enforced) return null // cheklov yoqilmagan serverda (hozirgi Railway) banner chiqmaydi
  const bad = data.status === 'expired' || data.status === 'grace'
  if (!bad && !(data.daysLeft <= 7)) return null
  const text = data.status === 'expired' ? t('bl§Obuna tugagan') : data.status === 'grace' ? t("bl§Muddat tugadi (qo'shimcha kunlar)") : `${t('bl§Obuna tugayapti')}: ${Math.max(0, data.daysLeft)} ${t('bl§kun')}`
  return (
    <div className={`ac-bl__banner ${bad ? 'ac-bl__banner--bad' : ''}`}>
      {text}{can('settings.view') && <> — <Link to="/settings/billing">{t("Hisob va to'lov")}</Link></>}
    </div>
  )
}

// Brauzer sarlavhasini manzilga moslash
function PageTitle() {
  const t = useT()
  const { pathname } = useLocation()
  useEffect(() => {
    const name = titleFor(pathname)
    document.title = name ? `${t(name)} · CRM` : 'CRM'
  }, [pathname, t])
  return null
}

// Bo'limlar: /dashboard, /leads, /inbox, /tasks, /contacts, /companies, /products, /stats, /settings, /integrations, /bots
function CrmShell() {
  return (
    <AmoShell>
      <PageTitle />
      <BillingBanner />
      <div className="amo-content">
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/leads" element={<Navigate to="/leads/pipeline" replace />} />
          <Route path="/leads/pipeline/:pipelineId?" element={<LeadsPipeline />} />
          <Route path="/leads/list" element={<LeadsList />} />
          <Route path="/leads/import" element={<ImportPage entity="leads" />} />
          <Route path="/leads/new" element={<LeadCard />} />
          <Route path="/leads/:id" element={<LeadCard />} />
          <Route path="/inbox" element={<ImboxPage />} />
          <Route path="/inbox/:leadId" element={<ImboxPage />} />
          <Route path="/tasks" element={<Navigate to="/tasks/line" replace />} />
          <Route path="/tasks/calendar" element={<Navigate to="/tasks/calendar/month" replace />} />
          <Route path="/tasks/*" element={<TasksPage />} />
          <Route path="/contacts" element={<ListsPage entity="contacts" />} />
          <Route path="/contacts/new" element={<ContactCard />} />
          <Route path="/contacts/import" element={<ImportPage entity="contacts" />} />
          <Route path="/contacts/:id" element={<ContactCard />} />
          <Route path="/companies" element={<ListsPage entity="companies" />} />
          <Route path="/companies/new" element={<CompanyCard />} />
          <Route path="/companies/:id" element={<CompanyCard />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/stats" element={<StatsLast />} />
          <Route path="/stats/pipeline" element={<StatsPage section="pipeline" />} />
          <Route path="/stats/consolidated" element={<StatsPage section="consolidated" />} />
          <Route path="/stats/activities" element={<StatsPage section="by_activities" />} />
          <Route path="/stats/calls" element={<StatsPage section="calls" />} />
          <Route path="/stats/goals" element={<StatsPage section="goals" />} />
          <Route path="/events" element={<StatsPage section="events" />} />
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="/settings/general" element={<SettingsPage section="general" />} />
          <Route path="/settings/users" element={<SettingsPage section="users" />} />
          <Route path="/settings/chats" element={<SettingsPage section="chats" />} />
          <Route path="/settings/security" element={<SettingsPage section="security" />} />
          <Route path="/settings/pbx" element={<Navigate to="/settings/pbx/incoming" replace />} />
          <Route path="/settings/pbx/:tab" element={<SettingsPage section="pbx" />} />
          <Route path="/settings/billing" element={<SettingsPage section="billing" />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/settings/pipelines/:pipelineId" element={<PipelineSetupPage />} />
          <Route path="/settings/fields/:entity" element={<FieldsSetupPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/bots" element={<BotsPage />} />
          {/* Eski manzillar (amoCRM nomlari va birinchi versiya) → yangilari */}
          <Route path="/todo/*" element={<Redir to="/tasks/:*" />} />
          <Route path="/imbox" element={<Redir to="/inbox" />} />
          <Route path="/imbox/:leadId" element={<Redir to="/inbox/:leadId" />} />
          <Route path="/amo-market" element={<Redir to="/integrations" />} />
          <Route path="/agents-and-bots" element={<Redir to="/bots" />} />
          <Route path="/leads/detail/:id" element={<Redir to="/leads/:id" />} />
          <Route path="/leads/add" element={<Redir to="/leads/new" />} />
          <Route path="/leads/duplicates" element={<Redir to="/leads/list" />} />
          <Route path="/contacts/detail/:id" element={<Redir to="/contacts/:id" />} />
          <Route path="/contacts/add" element={<Redir to="/contacts/new" />} />
          <Route path="/contacts/list" element={<Redir to="/contacts" />} />
          <Route path="/companies/detail/:id" element={<Redir to="/companies/:id" />} />
          <Route path="/companies/add" element={<Redir to="/companies/new" />} />
          <Route path="/companies/list" element={<Redir to="/companies" />} />
          <Route path="/catalogs/products" element={<Redir to="/products" />} />
          <Route path="/stats/by_activities" element={<Redir to="/stats/activities" />} />
          <Route path="/events/list" element={<Redir to="/events" />} />
          <Route path="/settings/pipeline/leads/:pipelineId" element={<Redir to="/settings/pipelines/:pipelineId" />} />
          <Route path="/settings/tags" element={<Redir to="/leads/list" />} />
          <Route path="/ish-stoli" element={<Redir to="/dashboard" />} />
          <Route path="/vazifalar" element={<Redir to="/tasks/line" />} />
          <Route path="/royxatlar" element={<Redir to="/contacts" />} />
          <Route path="/suhbatlar" element={<Redir to="/inbox" />} />
          <Route path="/analitika" element={<Redir to="/stats/pipeline" />} />
          <Route path="/sozlamalar" element={<Redir to="/settings/general" />} />
          <Route path="/settings/*" element={<NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </div>
      <CallWidget />
    </AmoShell>
  )
}

// amoCRM: /stats oxirgi ochilgan hisobotga olib boradi
const STATS_SECTIONS = ['pipeline', 'consolidated', 'by_activities', 'calls', 'goals', 'events']
function StatsLast() {
  let last = 'pipeline'
  try { const v = localStorage.getItem('amo_stats_last'); if (STATS_SECTIONS.includes(v)) last = v } catch { /* */ }
  // «Voqealar ro'yxati» alohida manzilda (/events)
  return <Navigate to={last === 'events' ? '/events' : last === 'by_activities' ? '/stats/activities' : `/stats/${last}`} replace />
}

export default function CrmApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Ochiq lid formasi subdomen'da ham ishlaydi (reklama havolalari uchun) */}
      <Route path="/lead/:slug" element={<LeadForm />} />
      <Route path="/*" element={<RequireAuth><CrmShell /></RequireAuth>} />
    </Routes>
  )
}

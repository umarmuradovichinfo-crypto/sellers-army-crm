// ══ CRM — mustaqil ilova ══
// amoCRM tuzilmasi aynan —
// CHAP tomonda bo'limlar paneli (amoCRM'dagi kabi), har bo'lim ALOHIDA sahifa:
//   Ish stoli (Рабочий стол) · Lidlar (Сделки) · Vazifalar (Задачи) ·
//   Ro'yxatlar (Списки) · Suhbatlar (Почта/Чаты) · Analitika · Sozlamalar
import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loading } from './components/ui'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import LeadForm from './pages/LeadForm'
import CallWidget from './components/CallWidget'
import AmoShell from './amo/AmoShell'

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
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return children
}

// amoCRM qobig'i ichida bo'limlar. Hali qayta yozilmagan bo'limlar eski komponentlar orqali ishlaydi.
function CrmShell() {
  return (
    <AmoShell>
      <div className="amo-content">
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/leads/pipeline/:pipelineId?" element={<LeadsPipeline />} />
          <Route path="/leads/detail/:id" element={<LeadCard />} />
          <Route path="/leads/add" element={<LeadCard />} />
          <Route path="/leads/list" element={<LeadsList />} />
          <Route path="/leads/duplicates" element={<Navigate to="/leads/list" replace />} />
          <Route path="/leads/import" element={<ImportPage entity="leads" />} />
          <Route path="/leads/*" element={<Navigate to="/leads/pipeline" replace />} />
          <Route path="/imbox" element={<ImboxPage />} />
          <Route path="/imbox/:leadId" element={<ImboxPage />} />
          <Route path="/todo" element={<Navigate to="/todo/line" replace />} />
          <Route path="/todo/calendar" element={<Navigate to="/todo/calendar/month" replace />} />
          <Route path="/todo/*" element={<TasksPage />} />
          <Route path="/contacts/list" element={<ListsPage entity="contacts" />} />
          <Route path="/companies/list" element={<ListsPage entity="companies" />} />
          <Route path="/contacts/detail/:id" element={<ContactCard />} />
          <Route path="/contacts/add" element={<ContactCard />} />
          <Route path="/contacts/import" element={<ImportPage entity="contacts" />} />
          <Route path="/companies/detail/:id" element={<CompanyCard />} />
          <Route path="/companies/add" element={<CompanyCard />} />
          <Route path="/catalogs/products" element={<ProductsPage />} />
          <Route path="/stats" element={<StatsLast />} />
          <Route path="/stats/pipeline" element={<StatsPage section="pipeline" />} />
          <Route path="/stats/consolidated" element={<StatsPage section="consolidated" />} />
          <Route path="/stats/by_activities" element={<StatsPage section="by_activities" />} />
          <Route path="/stats/calls" element={<StatsPage section="calls" />} />
          <Route path="/stats/goals" element={<StatsPage section="goals" />} />
          <Route path="/events/list" element={<StatsPage section="events" />} />
          <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
          <Route path="/settings/general" element={<SettingsPage section="general" />} />
          <Route path="/settings/users" element={<SettingsPage section="users" />} />
          <Route path="/settings/chats" element={<SettingsPage section="chats" />} />
          <Route path="/settings/security" element={<SettingsPage section="security" />} />
          <Route path="/settings/profile" element={<ProfilePage />} />
          <Route path="/settings/pipeline/leads/:pipelineId" element={<PipelineSetupPage />} />
          <Route path="/settings/fields/:entity" element={<FieldsSetupPage />} />
          <Route path="/settings/tags" element={<Navigate to="/leads/list" replace />} />
          <Route path="/settings/*" element={<Navigate to="/settings/general" replace />} />
          <Route path="/amo-market" element={<IntegrationsPage />} />
          <Route path="/agents-and-bots" element={<BotsPage />} />
          {/* Eski manzillar */}
          <Route path="/ish-stoli" element={<Navigate to="/dashboard" replace />} />
          <Route path="/vazifalar" element={<Navigate to="/todo/line" replace />} />
          <Route path="/royxatlar" element={<Navigate to="/contacts/list" replace />} />
          <Route path="/suhbatlar" element={<Navigate to="/imbox" replace />} />
          <Route path="/analitika" element={<Navigate to="/stats/pipeline" replace />} />
          <Route path="/sozlamalar" element={<Navigate to="/settings/general" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
  // «Список событий» amoCRM'da alohida manzilda (/events/list)
  return <Navigate to={last === 'events' ? '/events/list' : `/stats/${last}`} replace />
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

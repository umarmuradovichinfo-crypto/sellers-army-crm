// ══ CRM — mustaqil ilova ══
// amoCRM tuzilmasi aynan —
// CHAP tomonda bo'limlar paneli (amoCRM'dagi kabi), har bo'lim ALOHIDA sahifa:
//   Ish stoli (Рабочий стол) · Lidlar (Сделки) · Vazifalar (Задачи) ·
//   Ro'yxatlar (Списки) · Suhbatlar (Почта/Чаты) · Analitika · Sozlamalar
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loading } from './components/ui'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import LeadForm from './pages/LeadForm'
import CallWidget from './components/CallWidget'
import AmoShell from './amo/AmoShell'
import LeadsPipeline from './amo/pages/LeadsPipeline'
import ListsPage from './amo/pages/ListsPage'
import LeadCard from './amo/pages/LeadCard'
import TasksPage from './amo/pages/TasksPage'
import LeadsList from './amo/pages/LeadsList'
import StatsPage from './amo/pages/StatsPage'
import ImboxPage from './amo/pages/ImboxPage'
import DashboardPage from './amo/pages/DashboardPage'
import PipelineSetupPage from './amo/pages/PipelineSetupPage'
import FieldsSetupPage from './amo/pages/FieldsSetup'
import ImportPage from './amo/pages/ImportPage'
import ContactCard from './amo/pages/ContactCard'
import CompanyCard from './amo/pages/CompanyCard'
import SettingsPage from './amo/pages/SettingsPage'
import IntegrationsPage from './amo/pages/IntegrationsPage'

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
          <Route path="/contacts/list" element={<ListsPage entity="all" />} />
          <Route path="/companies/list" element={<ListsPage entity="companies" />} />
          <Route path="/contacts/detail/:id" element={<ContactCard />} />
          <Route path="/contacts/add" element={<ContactCard />} />
          <Route path="/contacts/import" element={<ImportPage entity="contacts" />} />
          <Route path="/companies/detail/:id" element={<CompanyCard />} />
          <Route path="/companies/add" element={<CompanyCard />} />
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
          <Route path="/settings/pipeline/leads/:pipelineId" element={<PipelineSetupPage />} />
          <Route path="/settings/fields/:entity" element={<FieldsSetupPage />} />
          <Route path="/settings/tags" element={<Navigate to="/leads/list" replace />} />
          <Route path="/settings/*" element={<Navigate to="/settings/general" replace />} />
          <Route path="/amo-market" element={<IntegrationsPage />} />
          {/* Eski manzillar */}
          <Route path="/ish-stoli" element={<Navigate to="/dashboard" replace />} />
          <Route path="/vazifalar" element={<Navigate to="/todo/line" replace />} />
          <Route path="/royxatlar" element={<Navigate to="/contacts/list" replace />} />
          <Route path="/suhbatlar" element={<Navigate to="/imbox" replace />} />
          <Route path="/analitika" element={<Navigate to="/stats/pipeline" replace />} />
          <Route path="/sozlamalar" element={<Navigate to="/settings/general" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
      <CallWidget />
    </AmoShell>
  )
}

// amoCRM: /stats oxirgi ochilgan hisobotga olib boradi
const STATS_SECTIONS = ['pipeline', 'consolidated', 'by_activities', 'calls', 'goals']
function StatsLast() {
  let last = 'pipeline'
  try { const v = localStorage.getItem('amo_stats_last'); if (STATS_SECTIONS.includes(v)) last = v } catch { /* */ }
  return <Navigate to={`/stats/${last}`} replace />
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

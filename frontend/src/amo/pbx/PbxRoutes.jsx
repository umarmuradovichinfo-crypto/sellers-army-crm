import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PbxShell, { AtsLayout, ServicesLayout } from './PbxShell'
import { AudioLibrary, Blacklist, CallbackSettings, AutoRecallSettings, Diagnostic, Incoming, Music, Outgoing } from '../pages/PbxPage'
import CallsPage from '../pages/CallsPage'
import CallReportsPage from '../pages/CallReportsPage'
import { PbxChats, PbxConfigurator, PbxHome, PbxIntegration, PbxLicense, PbxRecord, PbxStatistic, ServiceInfo, TopTabs } from './PbxPlaceholders'
import { InformerPage, QualityPage } from './PbxServices'

const S = (props) => <PbxShell {...props} />

const REP_DESC = ["pbx§Hisobotlar to'plami xodimlar ishini nazorat qilish va tahlil qilish uchun asosiy KPI'larni o'z ichiga oladi: o'rtacha kutish vaqti, liniyadagi mijozlar soni, turli yo'nalishdagi qo'ng'iroqlar umumiy soni, xodimlar yuklamasi, yuklama dinamikasi.", "pbx§Filtrlar tanlangan tashqi raqamlar, xodimlar guruhlari va xodimlar bo'yicha hisobot olish imkonini beradi."]

export default function PbxRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/pbx/calls" replace />} />
      <Route path="/home" element={<S><PbxHome /></S>} />
      <Route path="/ats" element={<Navigate to="/pbx/ats/incoming" replace />} />
      <Route path="/ats/incoming" element={<S tone="ats"><Incoming /></S>} />
      <Route path="/ats/outgoing" element={<S><AtsLayout><Outgoing /></AtsLayout></S>} />
      <Route path="/ats/diagnostic" element={<S><AtsLayout><Diagnostic /></AtsLayout></S>} />
      <Route path="/ats/configurator" element={<S><PbxConfigurator /></S>} />
      <Route path="/ats/blacklist" element={<S><AtsLayout><Blacklist /></AtsLayout></S>} />
      <Route path="/ats/music" element={<S><AtsLayout><Music /></AtsLayout></S>} />
      <Route path="/calls" element={<S><CallsPage /></S>} />
      <Route path="/chats" element={<S><PbxChats /></S>} />
      <Route path="/statistic" element={<S><PbxStatistic /></S>} />
      <Route path="/reports" element={<S><TopTabs first="pbx§Hisobotlar" desc={REP_DESC}><CallReportsPage /></TopTabs></S>} />
      <Route path="/reports/:kind" element={<S><TopTabs first="pbx§Hisobotlar" desc={REP_DESC}><CallReportsPage /></TopTabs></S>} />
      <Route path="/services/autorecall" element={<S><ServicesLayout><AutoRecallSettings /></ServicesLayout></S>} />
      <Route path="/services/callback" element={<S><ServicesLayout><CallbackSettings /></ServicesLayout></S>} />
      <Route path="/services/ai" element={<S><ServicesLayout><ServiceInfo title="pbx§AI-menejer" text="pbx§Sun'iy intellekt qo'ng'iroqlarni tahlil qiladi, suhbat mazmunini yozib oladi va mijoz kartochkasiga xulosa qo'shadi." /></ServicesLayout></S>} />
      <Route path="/services/record" element={<S><ServicesLayout free><PbxRecord /></ServicesLayout></S>} />
      <Route path="/services/quality" element={<S><ServicesLayout free><QualityPage /></ServicesLayout></S>} />
      <Route path="/services/informer" element={<S><ServicesLayout free><InformerPage /></ServicesLayout></S>} />
      <Route path="/services/tts" element={<S><ServicesLayout><AudioLibrary /></ServicesLayout></S>} />
      <Route path="/integration" element={<S><PbxIntegration /></S>} />
      <Route path="/license" element={<S><PbxLicense /></S>} />
      <Route path="*" element={<Navigate to="/pbx/calls" replace />} />
    </Routes>
  )
}

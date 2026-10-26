import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PbxShell, { AtsLayout } from './PbxShell'
import { AudioLibrary, Blacklist, CallbackSettings, AutoRecallSettings, Diagnostic, Incoming, Music, Outgoing } from '../pages/PbxPage'
import CallsPage from '../pages/CallsPage'
import CallReportsPage from '../pages/CallReportsPage'
import { PbxChats, PbxConfigurator, PbxHome, PbxIntegration, PbxLicense, PbxStatistic, ServiceInfo } from './PbxPlaceholders'

const S = (props) => <PbxShell {...props} />

export default function PbxRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/pbx/calls" replace />} />
      <Route path="/home" element={<S><PbxHome /></S>} />
      <Route path="/ats" element={<Navigate to="/pbx/ats/incoming" replace />} />
      <Route path="/ats/incoming" element={<S tone="ats"><Incoming /></S>} />
      <Route path="/ats/outgoing" element={<S><AtsLayout><Outgoing /></AtsLayout></S>} />
      <Route path="/ats/diagnostic" element={<S><AtsLayout><Diagnostic /></AtsLayout></S>} />
      <Route path="/ats/configurator" element={<S><AtsLayout><PbxConfigurator /></AtsLayout></S>} />
      <Route path="/ats/blacklist" element={<S><AtsLayout><Blacklist /></AtsLayout></S>} />
      <Route path="/ats/music" element={<S><AtsLayout><Music /></AtsLayout></S>} />
      <Route path="/calls" element={<S><CallsPage /></S>} />
      <Route path="/chats" element={<S><PbxChats /></S>} />
      <Route path="/statistic" element={<S><PbxStatistic /></S>} />
      <Route path="/reports" element={<S><CallReportsPage /></S>} />
      <Route path="/reports/:kind" element={<S><CallReportsPage /></S>} />
      <Route path="/services/autorecall" element={<S><AutoRecallSettings /></S>} />
      <Route path="/services/callback" element={<S><CallbackSettings /></S>} />
      <Route path="/services/ai" element={<S><ServiceInfo title="pbx§AI-menejer" text="pbx§Sun'iy intellekt qo'ng'iroqlarni tahlil qiladi, suhbat mazmunini yozib oladi va mijoz kartochkasiga xulosa qo'shadi." /></S>} />
      <Route path="/services/record" element={<S><ServiceInfo title="pbx§Suhbatlarni yozib olish" text="pbx§Barcha suhbatlar yozib olinadi va qo'ng'iroqlar jurnalidan tinglash mumkin; stereo yozuv nutq tahlili uchun." /></S>} />
      <Route path="/services/quality" element={<S><ServiceInfo title="pbx§Sifat bahosi" text="pbx§Suhbatdan keyin mijozdan 1–5 baho so'raladi; past baholar haqida xabar beriladi, natijalar hisobotda ko'rinadi." items={['pbx§Qo\'ng\'iroqdan keyin ovozli so\'rov', 'pbx§Past baholar haqida xabarnoma', 'pbx§Qo\'ng\'iroqlar jurnalida baho bo\'yicha filtr']} /></S>} />
      <Route path="/services/informer" element={<S><ServiceInfo title="pbx§Avtoinformator" text="pbx§Ovozli xabarni raqamlar ro'yxatiga avtomatik qo'ng'iroq qilib yetkazadi: balans, to'lov eslatmasi, aksiya, tabrik." /></S>} />
      <Route path="/services/tts" element={<S><AudioLibrary /></S>} />
      <Route path="/integration" element={<S><PbxIntegration /></S>} />
      <Route path="/license" element={<S><PbxLicense /></S>} />
      <Route path="*" element={<Navigate to="/pbx/calls" replace />} />
    </Routes>
  )
}

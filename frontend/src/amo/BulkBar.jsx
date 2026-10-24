// Ommaviy amallar paneli (voronka va ro'yxat uchun umumiy): bosqich, mas'ul, teg, o'chirish.
import React, { useState } from 'react'
import { Ico } from './AmoIcons'
import { useT } from './i18n'

export default function BulkBar({ count, total, allMode, canAll = true, selectedCount, onAll, stages, members, onRun, onClear }) {
  const t = useT()
  const [mode, setMode] = useState(null)
  return (
    <div className="ac-bulk">
      <b>{t('Belgilandi')}: {count}</b>
      {canAll && !allMode && total > selectedCount && selectedCount > 0 && <button onClick={onAll}>{t('Barchasini belgilash')} ({total})</button>}
      {mode === 'stage' ? (
        <select className="ac-select" style={{ width: 220 }} autoFocus onChange={(e) => e.target.value && onRun('stage', e.target.value)} defaultValue="">
          <option value="">{t("Bosqichni o'zgartirish")}</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : <button onClick={() => setMode('stage')}>{t("Bosqichni o'zgartirish")}</button>}
      {mode === 'assignee' ? (
        <select className="ac-select" style={{ width: 220 }} autoFocus onChange={(e) => e.target.value && onRun('assignee', e.target.value)} defaultValue="">
          <option value="">{t("Mas'ulni o'zgartirish")}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      ) : <button onClick={() => setMode('assignee')}>{t("Mas'ulni o'zgartirish")}</button>}
      {mode === 'tag' ? (
        <input className="ac-input" style={{ width: 180 }} autoFocus placeholder={t("Teg qo'shish")} onKeyDown={(e) => e.key === 'Enter' && e.target.value.trim() && onRun('add_tag', e.target.value.trim())} />
      ) : <button onClick={() => setMode('tag')}>{t("Teg qo'shish")}</button>}
      <button className="danger" onClick={() => window.confirm(t("Tanlangan bitimlar o'chirilsinmi?") + (allMode ? ` (${count})` : '')) && onRun('delete')}><Ico name="trash" /> {t("O'chirish")}</button>
      <span style={{ flex: 1 }} />
      <button onClick={onClear}>{t('Bekor qilish')}</button>
    </div>
  )
}

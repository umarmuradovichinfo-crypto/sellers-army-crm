// amoCRM «Права доступа» matritsasi: qatorlar (Сделки, Контакты, Компании, Задачи, Товары, har voronka «Неразобранное»)
// × ustunlar (Создание / Просмотр / Правка / Удаление / Экспорт). Katakda vertikal nuqtalar — yuqoridan pastga:
// Запрещено, Если ответственный, Для группы, Разрешено; tanlangani rangli (qizil / sariq / yashil).
import React from 'react'
import { useT } from '../i18n'

const COLS = [['add', 'YARATISH'], ['view', "KO'RISH"], ['edit', 'TAHRIRLASH'], ['delete', "O'CHIRISH"], ['export', 'EKSPORT']]
const ROWS = [['leads', 'Bitimlar'], ['contacts', 'Kontaktlar'], ['companies', 'Kompaniyalar'], ['tasks', 'Vazifalar'], ['products', 'Mahsulotlar']]
const LEVEL_NAME = { D: 'Taqiqlangan', M: "Agar mas'ul bo'lsa", G: 'Guruh uchun', L: 'Bitim ichida', A: 'Ruxsat etilgan' }
const ORDER = ['D', 'M', 'G', 'L', 'A']

function Cell({ allowed, value, onPick, locked, t }) {
  if (!allowed) return <td />
  const opts = ORDER.filter((l) => allowed.includes(l))
  return (
    <td>
      <span className={`ac-rm-dots ${locked ? 'locked' : ''}`}>
        {opts.map((l) => (
          <i key={l} className={`${l === value ? `on lv-${l}` : ''}`} title={t(LEVEL_NAME[l])} onClick={() => !locked && onPick(l)} />
        ))}
      </span>
    </td>
  )
}

export default function RightsMatrix({ rights, levels, pipelines = [], onChange, locked }) {
  const t = useT()
  if (!rights || !levels) return null
  const set = (entity, action, lv) => onChange({ ...rights, [entity]: { ...rights[entity], [action]: lv } })
  const setUns = (pid, action, lv) => {
    const cur = rights.unsorted?.[pid] || { view: 'A', edit: 'A', delete: 'A' }
    onChange({ ...rights, unsorted: { ...(rights.unsorted || {}), [pid]: { ...cur, [action]: lv } } })
  }
  const legend = (allowed) => ORDER.filter((l) => allowed.includes(l)).map((l) => <div key={l}>{t(LEVEL_NAME[l])}</div>)
  return (
    <table className="ac-rm">
      <thead>
        <tr><th />{COLS.map(([k, l]) => <th key={k}>{t(`rm§${l}`)}</th>)}<th /></tr>
      </thead>
      <tbody>
        {ROWS.map(([e, label]) => {
          const lv = levels[e] || {}
          const allowedAll = [...new Set(Object.values(lv).flat())]
          return (
            <tr key={e}>
              <td className="ac-rm__name">{t(label)}</td>
              {COLS.map(([a]) => <Cell key={a} t={t} allowed={lv[a]} value={rights[e]?.[a]} locked={locked} onPick={(x) => set(e, a, x)} />)}
              <td className="ac-rm__legend">{legend(allowedAll)}</td>
            </tr>
          )
        })}
        {pipelines.map((p) => {
          const u = rights.unsorted?.[p.id] || { view: 'A', edit: 'A', delete: 'A' }
          return (
            <tr key={`u${p.id}`}>
              <td className="ac-rm__name"><small>{p.name}</small>{t('Saralanmagan')}</td>
              <td />
              {['view', 'edit', 'delete'].map((a) => <Cell key={a} t={t} allowed={['D', 'A']} value={u[a]} locked={locked} onPick={(x) => setUns(p.id, a, x)} />)}
              <td />
              <td className="ac-rm__legend">{legend(['D', 'A'])}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

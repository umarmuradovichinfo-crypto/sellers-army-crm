import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicLeadForm } from '../services/crm.service'
import FormRenderer from '../components/forms/FormRenderer'

// Ommaviy lead-capture forma — /lead/<slug>. To'ldirilganda CRM'ga lid bo'lib tushadi.
export default function LeadForm() {
  const { slug } = useParams()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    publicLeadForm.get(slug)
      .then((f) => { if (alive) setForm(f) })
      .catch((e) => { if (alive) setError(e) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug])

  if (loading) return <div className="apply-wrap"><div className="apply-card">Yuklanmoqda…</div></div>
  if (error || !form) return <div className="apply-wrap"><div className="apply-card"><h2>Forma topilmadi</h2><p className="sub2">Havola noto‘g‘ri yoki forma yopilgan.</p></div></div>

  return <FormRenderer form={form} idKey="key" onSubmit={(answers) => publicLeadForm.submit(slug, answers)} />
}

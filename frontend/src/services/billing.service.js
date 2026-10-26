import { api } from '../lib/apiClient'

export const billingService = {
  // GET /billing/status -> { status:'trial'|'active'|'grace'|'expired', daysLeft, endsAt, enforced }
  status: () => api.get('/billing/status'),
  // GET /billing -> tariflar, davrlar, to'lov rekvizitlari, joriy obuna, tarix
  overview: () => api.get('/billing'),
  // POST /billing/activate { code } — litsenziya kodi (faqat super admin)
  activate: (code) => api.post('/billing/activate', { code }),
}

// ====== Demo (mock) ma'lumotlar — faqat VITE_USE_MOCKS=true bo'lganda, backend'siz ishlaydi ======
// Barcha ismlar va raqamlar to'qima (demo).

export const mock = {
  crm: {
    stages: [
      { id: 's1', name: 'Yangi lid', color: '#3F77DD', sum: '3 mln', leads: [
        { id: 'l1', n: 'Demo Mijoz 1', tag: 'Instagram', sum: '1.2 mln', ini: 'D1', c: '#3F77DD', task: "Qo'ng'iroq qilish", hot: true },
        { id: 'l2', n: 'Demo Mijoz 2', tag: 'Meta Ads', sum: '990 ming', ini: 'D2', c: '#46B17B', task: 'Bugun' }] },
      { id: 's2', name: "Aloqa o'rnatildi", color: '#D9952E', sum: '2 mln', leads: [
        { id: 'l3', n: 'Demo Mijoz 3', tag: 'Sayt', sum: '2.0 mln', ini: 'D3', c: '#9b59b6', task: 'Ertaga' }] },
      { id: 's3', name: 'Taklif yuborildi', color: '#9b59b6', sum: '1 mln', leads: [
        { id: 'l4', n: 'Demo Mijoz 4', tag: 'Telegram', sum: '1.0 mln', ini: 'D4', c: '#DE5147' }] },
      { id: 's4', name: 'Sotuv yopildi', color: '#46B17B', sum: '1.5 mln', leads: [
        { id: 'l5', n: 'Demo Mijoz 5', tag: 'Meta Ads', sum: '1.5 mln', ini: 'D5', c: '#3F77DD', won: true }] },
    ],
    analytics: {
      cards: { total: 5, open: 4, openSum: 6000000, won: 1, wonSum: 1500000, lost: 0, winRate: 100, avgCheck: 1500000 },
      funnel: [], bySource: [], byEmployee: [], lostReasons: [],
    },
    analyticsCalls: { total: 0, inbound: 0, outbound: 0, missed: 0, answered: 0, totalDuration: 0, avgDuration: 0, byEmployee: [], byDay: [] },
    analyticsEvents: { items: [], byType: [] },
    analyticsTimeline: { granularity: 'day', buckets: [] },
    analyticsEmployees: [],
  },
}

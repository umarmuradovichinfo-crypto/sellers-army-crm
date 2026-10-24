# amoCRM klon — bo'lim yozuvchi agentlar uchun yo'riqnoma

Loyiha: /Users/umarmuradovich/CRM (branch `amo-clone`). Frontend React 18 + Vite (frontend/), backend NestJS + Prisma (backend/).
Maqsad: har bir bo'lim amoCRM bilan nom va logodan tashqari 1:1 bo'lishi — joylashuv, o'lchamlar, ranglar, shriftlar,
hover/ochilish/yopilish animatsiyalari, funksiyalar. amoCRM'da yo'q narsani qo'shmang.

## Manbalar
- Ma'lumot uchun skrinshotlar (asl amoCRM, qorong'i mavzu, 1568x713):
  /private/tmp/claude-501/-Users-umarmuradovich--claude-spares-spare-DstSXk/979c286a-a4c8-4d1f-982f-1528e3109d3e/scratchpad/amo-ref/*.jpg
  Read tool bilan ko'ring. Ularda real mijoz ma'lumotlari bor — ularni kodga, demo ma'lumotlarga yoki hisobotga ko'chirmang.
- amoCRM'ning asl CSS qiymatlari (o'lcham/rang/transition qidirish uchun):
  `python3 -I <scratchpad>/tools/amo_css.py <scratchpad>/amo-css "<selector bo'lagi>" [--dark] [--max N]`
  (<scratchpad> = yuqoridagi yo'lning amo-ref'dan oldingi qismi). amoCRM CSS'ini so'zma-so'z nusxalamang — qiymatlarni olib, o'z CSS'ingizni yozing.
- Rang tokenlari: frontend/src/amo/palette.css (`--palette-*`, yorug' va `[data-color-scheme="dark"]`). Faqat shu tokenlardan foydalaning.

## Tayyor asos (o'qing, o'zgartirmang)
- frontend/src/amo/base.css — `.ac-btn`, `.ac-btn--blue`, `.ac-btn--sm`, `.ac-btn--plain`, `.ac-input`, `.ac-select`, `.ac-check`, `.ac-switch`,
  `.ac-tag`, `.ac-table` (+ `.chk`, `.selected`), `.ac-bulk`, `.ac-spinner`, `.ac-plug`, `.ac-caption`, `.ac-muted`.
- frontend/src/amo/shell.css — `.ac-top*` (yuqori panel 65px), `.ac-aside*` (238px ikkinchi panel), `.ac-menu*`, `.ac-modal*`, `.ac-overlay`.
- frontend/src/amo/TopBar.jsx — `<TopBar title switcher search onSearch filterPanel count menu actions>`; `DotsMenu`, `useOutside`.
- frontend/src/amo/SectionAside.jsx — `<SectionAside title items=[{to,label,note}] />` (Analitika/Sozlamalar chap paneli; keyin kontentga `className="ac-content"` bilan o'rang — `.ac-aside--fixed + .ac-content` 238px chapdan suradi).
- frontend/src/amo/AmoIcons.jsx — `<Ico name size />` (search, dots, burger, pipeline, chevron*, close, plus, filter, phone, phoneOut, calendar, clock, check, edit, trash, print, hash, excel, play, download, user, company, gear, send, attach, list, external, star, sparkle, instagram, telegram). Kerak bo'lsa yangi ikonka qo'shishingiz mumkin (faqat SMALL obyektiga qo'shing).
- frontend/src/amo/format.js — `money(v)` → "12,918,600 so'm", `cardDate(d, t)`, `feedDate(d, t)`, `dmy`, `hm`.
- frontend/src/amo/i18n.jsx — `useT()` → `t('o\'zbekcha matn')`, `usePlural()` → `plural(n, 'bitim'|'vazifa'|'kontakt'|'element'|"so'rov"|'voqea')`, `addRu({...})`.
  Har bir ko'rinadigan matn `t()` orqali. O'z bo'limingiz lug'atini `frontend/src/amo/i18n/<bo'lim>.ru.js` faylida yozing:
  `import { addRu } from '../i18n'; addRu({ "Vazifalar": "Задачи", ... })` va sahifa faylida shu faylni import qiling.
  Ruscha matnlar amoCRM'dagi asl nomlar bo'lsin (skrinshotlardagidek).
- frontend/src/amo/pages/LeadsPipeline.jsx — namuna: shu uslubda yozing (yuqori panel, useApi bilan yuklash, ac-* klasslar).
- Ma'lumot: frontend/src/services/crm.service.js (`crmService.*`, `notifService`), frontend/src/services/settings.service.js,
  frontend/src/lib/useApi.js (`useApi(fn, deps, cacheKey, refreshMs)`), frontend/src/context/AuthContext.jsx (`useAuth()` → user, can).

## Qoidalar
- Faqat o'zingizga berilgan fayllarni yarating/o'zgartiring: `frontend/src/amo/pages/<Bo'lim>*.jsx`, `frontend/src/amo/<bo'lim>.css`,
  `frontend/src/amo/i18n/<bo'lim>.ru.js`. Umumiy fayllarni (CrmApp.jsx, base.css, shell.css, TopBar.jsx, i18n.jsx, palette.css,
  boshqa bo'limlar) O'ZGARTIRMANG — kerak bo'lsa hisobotda yozing. Istisno: AmoIcons.jsx'ga yangi ikonka qo'shish mumkin.
- CSS klass prefiksi `ac-<bo'lim>-...` (masalan `ac-todo-...`). `.amo-*` ishlatmang (eski stillar bilan to'qnashadi).
- Backend o'zgarishi kerak bo'lsa (yangi endpoint/maydon) — mavjud modul uslubida minimal qo'shing, qaysi fayllarni o'zgartirganingizni hisobotda yozing.
- Eski komponentlar (frontend/src/pages/CRM.jsx, components/crm/*) dan faqat mantiq/API chaqiruvlarini o'rganish uchun foydalaning; ulardan import qilmang.
- Tekshirish: `cd /Users/umarmuradovich/CRM/frontend && npx vite build --logLevel error --outDir /tmp/ignore-build-<bo'lim>` xatosiz o'tishi kerak.
  Dev server http://localhost:5173 da ishlab turibdi (backend :8000, demo ma'lumotlar bor). Commit QILMANG.
- Hisobot (qisqa): yaratilgan fayllar, sahifa komponentlarining nomi va qaysi route'ga ulanishi kerakligi (masalan
  `/todo/line` → `TasksPage`), backend o'zgarishlari, nima amoCRM'dan farq qilib qoldi.

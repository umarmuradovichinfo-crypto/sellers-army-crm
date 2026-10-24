# QA agentlari uchun yo'riqnoma

Rol: dev jamoadagi tajribali tester + tuzatuvchi. Maqsad — o'z sohangizdagi HAR BIR tugma, funksiya va detalni
test-keys sifatida tekshirish, xatolarni topish va tuzatish. Avval docs/amo-clone/AGENT-BRIEF.md ni o'qing (kod qoidalari o'sha).

## Muhit
- Frontend http://localhost:5173, backend http://localhost:8000/api/v1 (ishlab turibdi, demo ma'lumotlar bor). Commit QILMANG.
- API token olish: `POST /api/v1/auth/login` body `{"email":"admin@crm.local","password":"<parol>"}` — parol
  /Users/umarmuradovich/CRM/backend/.env.local-credentials faylida (hisobotga yozmang). Javobdagi access token bilan
  `Authorization: Bearer <token>`. Demo sotuvchilar: akmal@crm.local va boshqalar, parol `Demo12345!` — ruxsatlar testida ishlating.
- Brauzerni ishlatmang (u band). Test usuli: kodni o'qish + API'ga curl so'rovlari + `npx vite build` + kerak bo'lsa
  kichik node skriptlari (scratchpad'da emas, /tmp/qa-<soha>/ ichida).
- Demo bazani buzmang: test uchun yaratgan yozuvlaringizni oxirida o'chiring (nomiga "QA-TEST" qo'shing).

## Har bir sahifa/komponent uchun tekshiring
1. Har bir tugma/havola/menyu bandi: handler bormi, to'g'ri API'ni to'g'ri parametr bilan chaqiradimi, javob shakli frontend kutgani bilan mosmi
   (backend kodini o'qib va curl bilan haqiqiy javobni ko'rib solishtiring), muvaffaqiyatdan keyin UI yangilanadimi, xato bo'lsa foydalanuvchi ko'radimi.
2. Formalar: majburiy maydonlar, bo'sh/noto'g'ri qiymat, juda uzun matn, raqam maydoniga harf, sana chegaralari, ikki marta bosish (dublikat so'rov).
3. Holatlar: bo'sh ro'yxat, yuklanish, xato (backend 4xx/5xx), ruxsat yo'q (sotuvchi roli bilan), 0 va juda katta sonlar.
4. Navigatsiya: har bir havola mavjud route'ga olib boradimi (frontend/src/CrmApp.jsx), orqaga qaytish, URL parametrlari.
5. i18n: har bir ko'rinadigan matn `t()` orqalimi, ruscha tarjimasi bormi; sana/son formatlari.
6. Mavzu: faqat `--palette-*` tokenlari (yorug' mavzuda ham o'qiladimi — qattiq kodlangan qorong'i ranglar bormi).
7. React: key ogohlantirishlari, cheksiz render/useEffect sikllari, unmount'dan keyin setState, memory leak (interval/listener tozalanadimi).
8. amoCRM bilan solishtirish: skrinshotlarga qarab (AGENT-BRIEF'dagi amo-ref papkasi) joylashuv/matn farqlari.

## Natija
- Topilgan har bir xato: docs/amo-clone/qa/<soha>.md ga test-keys jadvali (# | test | kutilgan | haqiqiy | holat) ko'rinishida.
- O'z sohangiz fayllaridagi xatolarni TUZATING (backend ham, minimal). Boshqa soha fayllaridagi xatoni tuzatmang — faqat yozing.
- Tuzatgandan keyin qayta tekshiring va build o'tishini ko'rsating.
- Hisobot (qisqa): nechta test-keys, nechta xato topildi/tuzatildi, tuzatilmay qolganlar va sababi, o'zgartirilgan fayllar.

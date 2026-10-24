# Facebook / Instagram ulanishini bir marta sozlash (Meta ilovasi)

Bu ishni **faqat bir marta** administrator qiladi. Shundan keyin CRM'dagi har bir foydalanuvchi
Market → Facebook Lead Ads → **"Facebook bilan ulash"** tugmasini bosib, amoCRM'dagidek bir zumda ulanadi.

Nega kerak: amoCRM'da bu tayyor, chunki amoCRM'ning Meta tasdiqlagan o'z ilovasi bor. Bizning CRM ham
o'z ilovasiga ega bo'lishi kerak — uni Meta sizning biznesingiz nomiga beradi.

---

## 0. Oldindan kerak bo'ladigan narsalar
- Facebook akkaunti (sahifalaringizga administrator bo'lgan).
- Meta Business portfoli (business.facebook.com) — sahifalar shu yerda bo'lgani ma'qul.
- CRM ochiq internetda **HTTPS** domen bilan ishlashi (masalan `https://crm.sizning-domen.uz`).
  Facebook lidlarni shu manzilga yuboradi; `localhost`ga yubora olmaydi.
- Maxfiylik siyosati sahifasi (Privacy Policy URL) — oddiy sahifa yetadi, saytingizda bo'lishi kerak.

## 1. Ilova yaratish (10 daqiqa)
1. https://developers.facebook.com → yuqori o'ngda **My Apps** → **Create App**.
2. "What do you want your app to do?" → **Other** → Next → turi **Business** → Next.
3. App name: masalan `Sellers Army CRM`, App contact email, Business portfolio: o'zingiznikini tanlang → **Create app**.
4. Chap menyu → **App settings → Basic**:
   - **App ID** va **App Secret** (Show tugmasi) — keyingi bosqich uchun yozib oling.
   - App Domains: `crm.sizning-domen.uz`
   - Privacy Policy URL: maxfiylik sahifangiz manzili
   - Category: Business and pages → **Save changes**.
5. **Add product** → **Facebook Login for Business** → Set up.
   - Settings → **Valid OAuth Redirect URIs** ga qo'shing:
     `https://crm.sizning-domen.uz/api/v1/facebook/oauth/callback`
   - Save.
6. **Add product** → **Webhooks** (qo'shib qo'yish yetadi — obunani CRM o'zi avtomatik o'rnatadi).

## 2. Kalitlarni CRM serveriga yozish (bir marta)
Server `.env` fayliga (yoki Railway → Variables):
```
FB_APP_ID=ilovangiz App ID
FB_APP_SECRET=ilovangiz App Secret
PUBLIC_URL=https://crm.sizning-domen.uz
```
`FB_VERIFY_TOKEN` shart emas — CRM o'zi yaratadi. Serverni qayta ishga tushiring.
Shundan keyin CRM interfeysida App ID/Secret maydonlari umuman ko'rinmaydi — faqat "Facebook bilan ulash" tugmasi.

## 3. Ruxsatlarni tasdiqlatish (App Review) — boshqa bizneslar ham ulanishi uchun
O'zingizning sahifalaringiz uchun ilova **Development** rejimida ham ishlaydi (siz ilovada Admin/Developer bo'lsangiz).
Boshqa odamlar/kompaniyalar ham ulanishi uchun ilovani **Live** qilish va ruxsatlarni tasdiqlatish kerak:
1. **App Review → Permissions and Features** — quyidagilarga **Advanced Access** so'rang:
   `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `business_management`.
   (Instagram uchun keyinroq: `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_messaging`.)
2. Har ruxsat uchun: qanday ishlatilishi tavsifi (o'zbek/ingliz) va qisqa ekran-video
   (CRM'da "Facebook bilan ulash" → sahifa tanlash → formadan lid kelishi).
3. **Business verification**: business.facebook.com → Settings → Business info → Verify (guvohnoma/hujjat so'raladi).
4. Tasdiqlangach: App settings → yuqoridagi **App Mode: Live**.
Odatda bir necha kundan 1–2 haftagacha oladi.

## 4. Tekshirish
- CRM → Market → Facebook Lead Ads → **Facebook bilan ulash** → sahifalarni belgilang → Davom etish.
- Ulangan sahifa yonida yashil **"Faol"** belgisi chiqadi.
- Formani tanlang → voronka, bosqich, mas'ul, maydonlarni moslang → Saqlash.
- Sinov lidi: https://developers.facebook.com/tools/lead-ads-testing → sahifa va formani tanlab "Create lead" —
  bir necha soniyada CRM'da "Saralanmagan"ga (yoki tanlangan bosqichga) tushadi.

## Muammolar
| Belgi | Sabab | Yechim |
|---|---|---|
| "URL blocked" Facebook oynasida | Redirect URI qo'shilmagan | 1.5-bandni tekshiring, manzil aynan bir xil bo'lsin |
| Sahifalar ro'yxati bo'sh | Ilova Development rejimida, siz Admin emassiz | Ilovaga rol bering yoki App Review'dan o'ting |
| "Qayta ulash kerak" (qizil) | Facebook parol o'zgardi / token eskirdi | "Facebook bilan ulash"ni qayta bosing |
| Lid kelmayapti | PUBLIC_URL HTTPS emas yoki webhook obunasi xato | Market → Facebook oynasidagi "Webhook holati"ni ko'ring |

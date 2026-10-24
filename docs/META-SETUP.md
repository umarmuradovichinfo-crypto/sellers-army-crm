# Facebook / Instagram ulanishi — arxitektura va Meta sozlash (VENDOR uchun, bir marta)

## Qanday ishlaydi
Har bir mijoz CRM'ni o'z serverida/domenida ishlatadi. Facebook esa bitta ilova uchun faqat bir nechta Redirect URI
va bitta webhook manzilini qabul qiladi. Shuning uchun **vendor (CRM egasi)** BITTA Meta ilovasini yuritadi va uning
oldida BITTA markaziy **Meta Connector** xizmati turadi (`connector/` papkasi, qo'llanma: `docs/CONNECTOR.md`).

```
Mijoz CRM'i ──"Facebook bilan ulash"──> Connector /fb/start ──> Facebook (login + sahifalar)
                                              │
Connector /fb/callback <──────────────────────┘  (sahifalarni tanlash, leadgen obunasi)
        │  imzolangan POST (sahifa tokenlari)
        ▼
Mijoz CRM'i /api/v1/facebook/connector/pages

Facebook ──leadgen webhook──> Connector /fb/webhook ──imzolangan forward──> Mijoz CRM'i /api/v1/facebook/connector/event
                                                                             └─ CRM lid ma'lumotini Graph API'dan o'zi oladi
```
- Mijoz **hech qanday** Meta ilova, App ID, App Secret, webhook yoki Redirect URI sozlamaydi.
- Connector mijoz lid ma'lumotini saqlamaydi (faqat `pageId/leadgenId/formId` forward). Sahifa tokenlari AES-256-GCM bilan shifrlanadi.
- CRM ↔ Connector aloqasi `instanceId/instanceSecret` bilan HMAC-SHA256 imzolanadi (CRM birinchi ishga tushganda avtomatik ro'yxatdan o'tadi).

## HOZIRGI HOLAT (2026-10-24)
- Meta ilovasi: **Sellers Army CRM**, App ID `2117920792432337`, biznes portfoli "Umar's Business Manager" (tekshirilmagan).
  Use case'lar: Lead Ads, Messenger, Instagram, Pages. Redirect URI, App Domains, Privacy/Terms/Data-deletion URL — sozlangan.
- Connector: Railway loyihasi `handsome-contentment`, servis `sellers-army-crm` (Root Directory `connector`, branch `amo-clone`),
  domen **https://sellers-army-crm-production.up.railway.app**, Volume `/data`. `/health`, `/privacy`, `/data-deletion` ishlaydi.
- `FB_APP_SECRET` kiritilgan. Railway'da `FB_SUBSCRIBED_FIELDS`/`FB_GRAPH_VERSION` o'chirilgan (koddagi standart ishlaydi).
- Instagram Direct/izohlar va Messenger ham shu connector orqali (bir tugma). Instagram akkaunti professional bo'lib, Facebook sahifaga
  ulangan va "Allow access to messages" yoqilgan bo'lishi kerak. Avval ulangan sahifalar "Yana sahifa qo'shish" bilan qayta ulanadi.
- QOLGAN (foydalanuvchi): Business verification; App Review (Advanced Access); App Mode = Live. Ungacha faqat ilovada roli bor akkauntlar ulana oladi.

## Vendor qadamlari (bir marta)
1. **Meta ilovasi**: https://developers.facebook.com → Create App → Other → **Business**. App settings → Basic: App ID, App Secret,
   App Domains = connector domeni (`connector.sizning-domen.uz`), Privacy Policy URL, Category.
2. **Facebook Login for Business** → Valid OAuth Redirect URIs: **faqat** `https://connector.sizning-domen.uz/fb/callback`.
3. **Webhooks** mahsulotini qo'shing (Page obyekti). Callback URL va obunani connector ishga tushganda **o'zi** o'rnatadi
   (`https://connector.sizning-domen.uz/fb/webhook`, field `leadgen`) — qo'lda kiritish shart emas.
4. Connector'ni deploy qiling (`docs/CONNECTOR.md`): `FB_APP_ID`, `FB_APP_SECRET`, `CONNECTOR_PUBLIC_URL`, `TOKEN_ENC_KEY`, Volume.
5. **Business verification** (business.facebook.com → Settings → Business info → Verify).
6. **App Review** → Advanced Access: `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`,
   `business_management`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`. Har ruxsat uchun tavsif va qisqa ekran-video
   (CRM'da "Facebook bilan ulash" → sahifa tanlash → formadan lid kelishi). Odatda bir necha kundan 1–2 haftagacha.
7. Tasdiqlangach App Mode = **Live**. Shundan keyin istalgan mijoz CRM'i ulana oladi.
8. Mijozlarga CRM'ni berayotganda `CONNECTOR_URL=https://connector.sizning-domen.uz` ni `.env.example` / Variables'da tayyor qo'ying.

> Review o'tgunicha ilova **Development** rejimida: faqat ilovada Admin/Developer/Tester roli bor akkauntlar ulana oladi.

## Mijoz tomoni
CRM `.env`: `PUBLIC_URL=https://crm.mijoz-domeni.uz` (HTTPS) va `CONNECTOR_URL`. Boshqa hech narsa.
CRM → Integratsiyalar → Facebook Lead Ads → **Facebook bilan ulash** → Facebook oynasida kirib sahifalarni tanlash →
forma → voronka/bosqich/mas'ul/maydonlarni moslash.

## Zaxira: o'z Meta ilovasi (ilg'or mijozlar)
CRM `.env`'ga `FB_APP_ID`, `FB_APP_SECRET`, `PUBLIC_URL` yozilsa connector ishlatilmaydi (to'g'ridan-to'g'ri rejim):
Redirect URI `https://<crm>/api/v1/facebook/oauth/callback`, webhook `https://<crm>/api/v1/facebook/webhook` (PUBLIC_URL https bo'lsa
CRM obunani o'zi o'rnatadi). Muqobil: env bo'lmasa super admin UI'dagi "Kengaytirilgan" bo'limiga kiritadi.

## Tekshirish va muammolar
| Belgi | Sabab | Yechim |
|---|---|---|
| "Meta Connector bilan bog'lanib bo'lmadi" | `CONNECTOR_URL` xato / connector o'chiq | `curl $CONNECTOR_URL/health` |
| Ro'yxatdan o'tmaydi | `PUBLIC_URL` yo'q yoki https emas | CRM `.env`'da HTTPS PUBLIC_URL |
| "URL blocked" Facebook oynasida | Redirect URI connector domeniga mos emas | 2-qadam |
| Sahifalar ro'yxati bo'sh | Ilova Development'da, akkaunt rolsiz | Rol bering yoki App Review |
| "Qayta ulash kerak" (qizil) | Token eskirdi / parol o'zgardi | "Facebook bilan ulash"ni qayta bosing |
| Lid kelmayapti | CRM HTTPS'da emas yoki connector forward qila olmayapti | Connector loglari, `PUBLIC_URL` |
| Sinov | https://developers.facebook.com/tools/lead-ads-testing | sahifa+forma → Create lead |

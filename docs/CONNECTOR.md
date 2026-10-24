# Meta Connector — deploy qo'llanmasi (vendor, bir marta)

`connector/` — mustaqil kichik xizmat (Node 24, **nol bog'liqlik**: faqat ichki `http`/`crypto`/`node:sqlite`). Arxitektura: `docs/META-SETUP.md`.

## Muhit o'zgaruvchilari
| O'zgaruvchi | Tavsif |
|---|---|
| `FB_APP_ID`, `FB_APP_SECRET` | Meta ilovasi kalitlari |
| `CONNECTOR_PUBLIC_URL` | Ommaviy HTTPS manzil (Meta'dagi Redirect URI `…/fb/callback`, webhook `…/fb/webhook`) |
| `TOKEN_ENC_KEY` | Sahifa tokenlari/instance sirlari shifrlash kaliti (`openssl rand -hex 32`). Production'da majburiy; yo'qotsangiz mijozlar qayta ulanishi kerak |
| `DATABASE_PATH` | SQLite fayl (standart `/data/connector.db`) — **Volume** ulang |
| `PORT` | standart 8100 |
| `FB_SUBSCRIBED_FIELDS` | standart `leadgen` (keyin `leadgen,messages`) |
| `FB_GRAPH_VERSION` | standart `v26.0` |
| `ALLOW_INSECURE` | faqat dev: `1` bo'lsa http instance manzillariga ruxsat |

## Railway
1. New Service → GitHub repo, **Root Directory = `connector`** (`railway.json` + `Dockerfile` tayyor).
2. Variables'ga yuqoridagilarni yozing. Volume qo'shib `/data` ga ulang.
3. Generate Domain → shu manzilni `CONNECTOR_PUBLIC_URL` ga yozing, redeploy. Health: `/health`.
4. Ishga tushganda connector Meta ilovasiga ilova darajasidagi webhook obunasini (`object=page`, `leadgen`) o'zi o'rnatadi (HTTPS bo'lsa).

## Docker / lokal
```
cd connector && docker build -t meta-connector . && docker run -p 8100:8100 -v connector-data:/data --env-file .env meta-connector
# lokal: cd connector && node --env-file=.env server.js
```

## Endpointlar
- `POST /instances/register {instanceUrl}` → `{instanceId, instanceSecret}` (IP bo'yicha 10/soat; prod'da https majburiy)
- `GET /fb/start?instanceId&return&ts&sig` — `sig = HMAC-SHA256(instanceSecret, instanceId|return|ts)`, 10 daqiqa; `return` origin'i instance manziliga teng bo'lishi shart
- `GET /fb/callback`, `POST /fb/select` — state tekshiruvi (bir martalik, 10 daqiqa), sahifa tanlash, `subscribed_apps`, CRM'ga imzolangan push
- `GET|POST /fb/webhook` — Meta verify + `X-Hub-Signature-256` tekshiruvi, leadgen'ni CRM'larga forward (3 qayta urinish, eksponensial)
- `POST /fb/disconnect` — CRM imzosi bilan sahifani uzish (boshqa CRM ishlatmasa Facebook obunasi ham bekor qilinadi)
- `GET /health`

CRM'ga yuboriladigan so'rovlar `X-Connector-Signature = HMAC-SHA256(instanceSecret, xom tana)` + `X-Connector-Instance`, tanada `ts` (15 daqiqa).

## Eslatmalar
- Bitta sahifa bir nechta CRM'ga ulangan bo'lishi mumkin — hodisa hammasiga yuboriladi.
- Bir nusxali (single instance) xizmat: SQLite va xotiradagi rate-limit. Ko'p replika kerak bo'lsa Postgres'ga ko'chirish lozim.
- Connector lid ma'lumotini saqlamaydi; CRM lidni sahifa tokeni bilan Graph API'dan o'zi oladi.

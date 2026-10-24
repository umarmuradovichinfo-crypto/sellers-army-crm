// Muhit o'zgaruvchilarini ishga tushishda tekshiradi — yetishmasa aniq xato bilan
// to'xtaydi (runtime'da yashirin 500 o'rniga).
const REQUIRED = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((k) => {
    const v = config[k];
    return v === undefined || v === null || String(v).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `\n❌ Yetishmayotgan muhit o'zgaruvchilari: ${missing.join(', ')}\n` +
        `   backend/.env (yoki hosting Variables) ga qo'shing — .env.example ga qarang.\n`,
    );
  }

  const access = String(config.JWT_ACCESS_SECRET);
  const refresh = String(config.JWT_REFRESH_SECRET);
  if (access.length < 32 || refresh.length < 32) {
    throw new Error(
      "\n❌ JWT_ACCESS_SECRET va JWT_REFRESH_SECRET kamida 32 belgidan iborat bo'lishi kerak (masalan: openssl rand -hex 32).\n",
    );
  }
  if (access === refresh) {
    throw new Error('\n❌ JWT_ACCESS_SECRET va JWT_REFRESH_SECRET bir-biridan farqli bo\'lishi kerak.\n');
  }

  // Standart qiymatlar (bo'sh qator ham "berilmagan" hisoblanadi)
  if (!String(config.JWT_ACCESS_TTL ?? '').trim()) config.JWT_ACCESS_TTL = '1h';
  if (!String(config.JWT_REFRESH_TTL ?? '').trim()) config.JWT_REFRESH_TTL = '30d';
  return config;
}

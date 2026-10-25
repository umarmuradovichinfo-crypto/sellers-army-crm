// amoCRM «Права доступа» matritsasi: har huquq profili (Role) uchun obyekt × amal → daraja.
//   D — Запрещено, M — Если ответственный, G — Для группы, A — Разрешено, L — (Товары) Внутри сделки
// Qatorlar: Сделки, Контакты, Компании, Задачи, Товары, har voronka «Неразобранное».

export type Level = 'D' | 'M' | 'G' | 'A' | 'L';
export type Action = 'add' | 'view' | 'edit' | 'delete' | 'export';
export type Entity = 'leads' | 'contacts' | 'companies' | 'tasks' | 'products';

export interface Rights {
  leads: Record<Action, Level>;
  contacts: Record<Action, Level>;
  companies: Record<Action, Level>;
  tasks: Pick<Record<Action, Level>, 'edit' | 'delete'>;
  products: Record<Action, Level>;
  /** voronka id ('' — asosiy) → «Неразобранное»: ko'rish / qabul qilish (tahrir) / o'chirish (D | A) */
  unsorted: Record<string, { view: Level; edit: Level; delete: Level }>;
}

// Har bir katakda tanlash mumkin bo'lgan darajalar (amoCRM'dagidek)
export const LEVELS: Record<Entity, Partial<Record<Action, Level[]>>> = {
  leads: { add: ['D', 'A'], view: ['D', 'M', 'G', 'A'], edit: ['D', 'M', 'G', 'A'], delete: ['D', 'M', 'G', 'A'], export: ['D', 'M', 'G', 'A'] },
  contacts: { add: ['D', 'A'], view: ['D', 'M', 'G', 'A'], edit: ['D', 'M', 'G', 'A'], delete: ['D', 'M', 'G', 'A'], export: ['D', 'M', 'G', 'A'] },
  companies: { add: ['D', 'A'], view: ['D', 'M', 'G', 'A'], edit: ['D', 'M', 'G', 'A'], delete: ['D', 'M', 'G', 'A'], export: ['D', 'M', 'G', 'A'] },
  tasks: { edit: ['D', 'M', 'G', 'A'], delete: ['D', 'M', 'G', 'A'] },
  products: { add: ['D', 'A'], view: ['D', 'L', 'A'], edit: ['D', 'L', 'A'], delete: ['D', 'A'], export: ['D', 'A'] },
};

const all = (e: Entity) => Object.fromEntries(Object.keys(LEVELS[e]).map((a) => [a, 'A'])) as Record<Action, Level>;

/** Hamma narsa ruxsat — eski rollar va administrator uchun (hozirgi xatti-harakat saqlanadi) */
export function fullRights(): Rights {
  return { leads: all('leads'), contacts: all('contacts'), companies: all('companies'), tasks: all('tasks'), products: all('products'), unsorted: {} };
}

/** Saqlangan/kelgan JSONni tozalaydi: noma'lum kalitlar tashlanadi, ruxsat etilmagan daraja → standart (A) */
export function normalizeRights(raw: unknown): Rights {
  const r = fullRights();
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  for (const e of Object.keys(LEVELS) as Entity[]) {
    for (const [a, allowed] of Object.entries(LEVELS[e]) as [Action, Level[]][]) {
      const v = src?.[e]?.[a];
      if (allowed.includes(v)) (r[e] as Record<string, Level>)[a] = v;
    }
  }
  if (src.unsorted && typeof src.unsorted === 'object') {
    for (const [pid, v] of Object.entries(src.unsorted as Record<string, any>).slice(0, 200)) {
      if (!/^[\w-]{0,64}$/.test(pid)) continue;
      const pick = (x: unknown): Level => (x === 'D' ? 'D' : 'A');
      r.unsorted[pid] = { view: pick(v?.view), edit: pick(v?.edit), delete: pick(v?.delete) };
    }
  }
  return r;
}

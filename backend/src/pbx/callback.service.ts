import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { ActivityService } from '../crm/activity.service';
import { CrmFormsService } from '../crm/crm-forms.service';
import { PbxGateway } from '../onlinepbx/pbx.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { EXT_RE, dialable, phoneKey } from './phone';

const KEY = 'pbx_callback';
export interface CallbackCfg {
  enabled: boolean; key: string; title: string; text: string; color: string; ext: string; createTask: boolean;
  /** Ruxsat etilgan mamlakat prefikslari (raqam shulardan biri bilan boshlanishi shart). Standart — faqat O'zbekiston (998). */
  prefixes: string[];
  /** Bitta raqamdan sutkasiga nechta so'rov (standart 3). */
  perPhoneDaily: number;
  /** Vidjet (kalit) bo'yicha sutkalik jami so'rovlar (standart 300). */
  perKeyDaily: number;
}
const DEFAULTS: CallbackCfg = { enabled: false, key: '', title: "Qayta qo'ng'iroq", text: "Raqamingizni qoldiring — sizga qo'ng'iroq qilamiz", color: '#2e84cf', ext: '', createTask: true, prefixes: ['998'], perPhoneDaily: 3, perKeyDaily: 300 };
const DAY = 86_400_000;
const TASK_PREFIX = "Qayta qo'ng'iroq qiling";
const lim = (v: unknown, d: number, min: number, max: number) => {
  if (v === undefined || v === null || v === '') return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException({ error: 'BAD_VALUE', message: `Qiymat ${min}–${max} oralig'ida bo'lsin` });
  return Math.round(n);
};

/** Sayt «Callback» vidjeti (OnlinePBX «Callback виджет»): mehmon raqam qoldiradi → lid + vazifa, ixtiyoriy ravishda ichki raqam avtomatik terib beriladi. */
@Injectable()
export class CallbackService {
  constructor(private readonly prisma: PrismaService, private readonly forms: CrmFormsService, private readonly activity: ActivityService, private readonly pbx: PbxGateway) {}

  async config(): Promise<CallbackCfg> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    let saved: Partial<CallbackCfg> = {};
    try { saved = row ? JSON.parse(row.value) : {}; } catch { /* */ }
    return { ...DEFAULTS, ...saved };
  }

  async save(dto: Partial<CallbackCfg>): Promise<CallbackCfg> {
    const cur = await this.config();
    const color = String(dto.color ?? cur.color);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new BadRequestException({ error: 'BAD_COLOR', message: "Rang #RRGGBB ko'rinishida bo'lsin" });
    const next: CallbackCfg = {
      enabled: dto.enabled === undefined ? cur.enabled : !!dto.enabled,
      key: cur.key || randomBytes(9).toString('base64url'), // kalit bir marta yaratiladi va o'zgarmaydi
      title: String(dto.title ?? cur.title).trim().slice(0, 60) || DEFAULTS.title,
      text: String(dto.text ?? cur.text).trim().slice(0, 200) || DEFAULTS.text,
      color,
      ext: String(dto.ext ?? cur.ext).trim().slice(0, 32),
      createTask: dto.createTask === undefined ? cur.createTask : !!dto.createTask,
      prefixes: dto.prefixes === undefined ? cur.prefixes : (Array.isArray(dto.prefixes) ? dto.prefixes : String(dto.prefixes).split(/[;,\s]+/)).map((x) => String(x).replace(/\D/g, '')).filter(Boolean).slice(0, 30),
      perPhoneDaily: lim(dto.perPhoneDaily, cur.perPhoneDaily, 1, 50),
      perKeyDaily: lim(dto.perKeyDaily, cur.perKeyDaily, 1, 10_000),
    };
    if (next.ext && !EXT_RE.test(next.ext)) throw new BadRequestException({ error: 'BAD_EXT', message: "Ichki raqam 2–5 xonali bo'lsin" });
    if (next.prefixes.some((x) => x.length > 4)) throw new BadRequestException({ error: 'BAD_PREFIX', message: "Mamlakat prefiksi 1–4 xonali bo'lsin (masalan 998)" });
    const value = JSON.stringify(next);
    await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    return next;
  }

  async byKey(key: string): Promise<CallbackCfg | null> {
    const c = await this.config();
    return c.enabled && c.key && c.key === key ? c : null;
  }

  /**
   * Ommaviy so'rov. Himoya: IP bo'yicha daqiqalik limit (kontrollerda, xotirada), mamlakat prefiksi oq ro'yxati, bitta raqamga sutkasiga N ta va
   * vidjet bo'yicha sutkalik limit (bazada — callback_requests, bir nechta nusxada ham to'g'ri), ochiq «qayta qo'ng'iroq» vazifasi bo'lsa yangisi yo'q,
   * honeypot (`website` maydoni to'ldirilgan bo'lsa — bot: jim «ok», hech narsa yaratilmaydi).
   */
  async request(key: string, nameIn: string, phoneIn: string, extra: { honeypot?: string; ip?: string } = {}) {
    const c = await this.byKey(key);
    if (!c) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vidjet topilmadi' });
    if (String(extra.honeypot || '').trim()) return { ok: true, task: false, dialed: false };
    let digits = String(phoneIn || '').replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) throw new BadRequestException({ error: 'BAD_PHONE', message: "Telefon raqami noto'g'ri" });
    const prefixes = c.prefixes?.length ? c.prefixes : [];
    // O'zbekiston uchun mahalliy 9 xonali (90 123 45 67) — 998 qo'shiladi
    if (digits.length === 9 && prefixes.includes('998')) digits = '998' + digits;
    if (prefixes.length && !prefixes.some((p) => digits.startsWith(p))) throw new BadRequestException({ error: 'BAD_COUNTRY', message: "Bu mamlakat raqamlari qabul qilinmaydi" });
    const phone = '+' + digits;
    const pk = phoneKey(digits);
    const since = new Date(Date.now() - DAY);
    if ((await this.prisma.callbackRequest.count({ where: { createdAt: { gte: since } } })) >= c.perKeyDaily) throw new HttpException({ error: 'DAILY_LIMIT', message: "Bugun so'rovlar soni tugadi, ertaga urinib ko'ring" }, 429);
    if ((await this.prisma.callbackRequest.count({ where: { phoneKey: pk, createdAt: { gte: since } } })) >= c.perPhoneDaily) throw new HttpException({ error: 'PHONE_LIMIT', message: "Bu raqamdan so'rov allaqachon qabul qilingan — tez orada qo'ng'iroq qilamiz" }, 429);
    await this.prisma.callbackRequest.create({ data: { phoneKey: pk, ip: extra.ip ? String(extra.ip).slice(0, 60) : null } });
    // eski yozuvlar (30 kundan eski) tozalanadi
    if (Math.random() < 0.05) await this.prisma.callbackRequest.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * DAY) } } }).catch(() => undefined);

    // shu raqam uchun ochiq «qayta qo'ng'iroq» vazifasi bor — so'rov allaqachon navbatda: yangi lid/vazifa/qo'ng'iroq yo'q
    const pending = await this.prisma.leadTask.findFirst({ where: { done: false, type: 'call', title: { startsWith: TASK_PREFIX, contains: pk } }, select: { id: true } });
    if (pending) return { ok: true, task: false, dialed: false, pending: true };

    const name = String(nameIn || '').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 100) || `Callback ${phone}`;
    const lead: any = await this.forms.createExternalLead({ name, phone, source: 'Callback vidjeti', label: "Qayta qo'ng'iroq so'rovi" });
    let task = false;
    if (c.createTask && lead?.id) {
      // shu bitimda ochiq «qayta qo'ng'iroq» vazifasi bo'lsa — takror yaratilmaydi
      const open = await this.prisma.leadTask.findFirst({ where: { leadId: lead.id, done: false, type: 'call', title: { startsWith: TASK_PREFIX } }, select: { id: true } });
      if (!open) {
        const t = await this.prisma.leadTask.create({ data: { leadId: lead.id, title: `${TASK_PREFIX}: ${phone}`, type: 'call', dueDate: new Date(), assigneeId: lead.assigneeId || null } });
        await this.activity.record(lead.id, 'task_created', { actorName: 'Callback vidjeti', text: `Vazifa: ${t.title}` });
        task = true;
      }
    }
    // ichki raqam ko'rsatilgan va stansiya ulangan bo'lsa — xodimning telefoni jiringlaydi, so'ng mijozga ulanadi
    let dialed = false;
    const to = dialable(phone);
    if (c.ext && EXT_RE.test(c.ext) && to && (await this.pbx.enabled().catch(() => false))) {
      const r = await this.pbx.call(c.ext, to).catch(() => null);
      dialed = !!r?.ok;
    }
    return { ok: true, task, dialed };
  }
}

/** Vidjet skripti: `<script src=".../api/v1/callback/<kalit>/widget.js" async></script>` */
export function callbackWidgetJs(key: string, c: { title: string; text: string; color: string }) {
  const cfg = JSON.stringify({ key, title: c.title, text: c.text, color: c.color });
  return `(function(){
var C=${cfg};
var s=document.currentScript;var base=s&&s.src?new URL(s.src).origin:location.origin;
var api=base+'/api/v1/callback/'+C.key+'/request';
var css=document.createElement('style');css.textContent='.sacb-b{position:fixed;left:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:'+C.color+';color:#fff;font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:2147483000}.sacb-p{position:fixed;left:20px;bottom:86px;width:290px;background:#fff;color:#222;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px;font:14px/1.4 system-ui,sans-serif;display:none;z-index:2147483000}.sacb-p.o{display:block}.sacb-p b{display:block;margin-bottom:4px}.sacb-p input{width:100%;box-sizing:border-box;margin:6px 0;padding:9px;border:1px solid #ccd;border-radius:6px;font:inherit}.sacb-p button{width:100%;padding:10px;border:0;border-radius:6px;background:'+C.color+';color:#fff;font:inherit;cursor:pointer}.sacb-m{margin-top:6px;font-size:13px}';
document.head.appendChild(css);
var b=document.createElement('button');b.className='sacb-b';b.setAttribute('aria-label',C.title);b.textContent='\\uD83D\\uDCDE';
var p=document.createElement('form');p.className='sacb-p';
var t=document.createElement('b');t.textContent=C.title;var d=document.createElement('div');d.textContent=C.text;
var n=document.createElement('input');n.placeholder='Ismingiz';n.maxLength=100;var hp=document.createElement('input');hp.name='website';hp.tabIndex=-1;hp.autocomplete='off';hp.setAttribute('aria-hidden','true');hp.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;opacity:0';var ph=document.createElement('input');ph.placeholder='+998 90 123 45 67';ph.type='tel';ph.required=true;ph.maxLength=20;
var sb=document.createElement('button');sb.type='submit';sb.textContent='Qo\\u2018ng\\u2018iroq qilishingizni kutaman';var m=document.createElement('div');m.className='sacb-m';
p.appendChild(t);p.appendChild(d);p.appendChild(hp);p.appendChild(n);p.appendChild(ph);p.appendChild(sb);p.appendChild(m);document.body.appendChild(b);document.body.appendChild(p);
b.onclick=function(){p.classList.toggle('o')};
p.onsubmit=function(e){e.preventDefault();sb.disabled=true;m.textContent='';fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value,phone:ph.value,website:hp.value})}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){if(x.ok){m.style.color='#2a8a3b';m.textContent='Rahmat! Tez orada qo\\u2018ng\\u2018iroq qilamiz.';n.value='';ph.value=''}else{m.style.color='#c33';m.textContent=(x.j&&x.j.message)||'Xatolik'}sb.disabled=false}).catch(function(){m.style.color='#c33';m.textContent='Tarmoq xatosi';sb.disabled=false})};
})();`;
}

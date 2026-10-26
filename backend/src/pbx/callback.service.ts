import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { ActivityService } from '../crm/activity.service';
import { CrmFormsService } from '../crm/crm-forms.service';
import { PbxGateway } from '../onlinepbx/pbx.gateway';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'pbx_callback';
export interface CallbackCfg { enabled: boolean; key: string; title: string; text: string; color: string; ext: string; createTask: boolean }
const DEFAULTS: CallbackCfg = { enabled: false, key: '', title: "Qayta qo'ng'iroq", text: "Raqamingizni qoldiring — sizga qo'ng'iroq qilamiz", color: '#2e84cf', ext: '', createTask: true };

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
    };
    const value = JSON.stringify(next);
    await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    return next;
  }

  async byKey(key: string): Promise<CallbackCfg | null> {
    const c = await this.config();
    return c.enabled && c.key && c.key === key ? c : null;
  }

  async request(key: string, nameIn: string, phoneIn: string) {
    const c = await this.byKey(key);
    if (!c) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vidjet topilmadi' });
    const digits = String(phoneIn || '').replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) throw new BadRequestException({ error: 'BAD_PHONE', message: "Telefon raqami noto'g'ri" });
    const phone = (/^\+/.test(String(phoneIn).trim()) ? '+' : '') + digits;
    const name = String(nameIn || '').replace(/[<>]/g, '').trim().slice(0, 100) || `Callback ${phone}`;
    const lead: any = await this.forms.createExternalLead({ name, phone, source: 'Callback vidjeti', label: "Qayta qo'ng'iroq so'rovi" });
    let task = false;
    if (c.createTask && lead?.id) {
      const t = await this.prisma.leadTask.create({ data: { leadId: lead.id, title: `Qayta qo'ng'iroq qiling: ${phone}`, type: 'call', dueDate: new Date(), assigneeId: lead.assigneeId || null } });
      await this.activity.record(lead.id, 'task_created', { actorName: 'Callback vidjeti', text: `Vazifa: ${t.title}` });
      task = true;
    }
    // ichki raqam ko'rsatilgan va stansiya ulangan bo'lsa — xodimning telefoni jiringlaydi, so'ng mijozga ulanadi
    let dialed = false;
    if (c.ext && (await this.pbx.enabled().catch(() => false))) {
      const r = await this.pbx.call(c.ext, phone).catch(() => null);
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
var n=document.createElement('input');n.placeholder='Ismingiz';n.maxLength=100;var ph=document.createElement('input');ph.placeholder='+998 90 123 45 67';ph.type='tel';ph.required=true;ph.maxLength=20;
var sb=document.createElement('button');sb.type='submit';sb.textContent='Qo\\u2018ng\\u2018iroq qilishingizni kutaman';var m=document.createElement('div');m.className='sacb-m';
p.appendChild(t);p.appendChild(d);p.appendChild(n);p.appendChild(ph);p.appendChild(sb);p.appendChild(m);document.body.appendChild(b);document.body.appendChild(p);
b.onclick=function(){p.classList.toggle('o')};
p.onsubmit=function(e){e.preventDefault();sb.disabled=true;m.textContent='';fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n.value,phone:ph.value})}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){if(x.ok){m.style.color='#2a8a3b';m.textContent='Rahmat! Tez orada qo\\u2018ng\\u2018iroq qilamiz.';n.value='';ph.value=''}else{m.style.color='#c33';m.textContent=(x.j&&x.j.message)||'Xatolik'}sb.disabled=false}).catch(function(){m.style.color='#c33';m.textContent='Tarmoq xatosi';sb.disabled=false})};
})();`;
}

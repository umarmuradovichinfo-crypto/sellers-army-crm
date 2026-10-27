// Modullardan Asterisk sozlamasini hosil qiladi: pjsip.conf (xodimlar + trunklar), extensions.conf (qo'ng'iroq oqimi), queues.conf.
// DIQQAT: haqiqiy Asterisk'da hali sinalmagan (PLAN 45, 3-bosqich) — matn tuzilishi testlar bilan tekshiriladi, ishlashi serverda sinaladi
// (ro'yxat: docs/amo-clone/PBX.md → «Haqiqiy serverda tekshirish kerak»).
import { normalizeConfig, type ModuleType, DAYS } from './pbx-schema';
import { EXT_RE, phoneKey } from './phone';

export interface GenModule { type: string; number: string; name: string | null; enabled: boolean; config: Record<string, any> }
export interface OutRule { mask: string; trunk: string; users: string[]; externalNumber?: string }
export interface GenOptions {
  blacklist?: string[]; outgoing?: { rules: OutRule[] }; sipSecrets?: Record<string, string>; wssHost?: string;
  /** Suhbatlarni yozib olish (MixMonitor): fayl `<dir>/<uuid>.wav` — CRM shu papkadan (ASTERISK_RECORDINGS_DIR) o'qiydi. */
  recording?: { enabled: boolean; dir?: string };
}
export interface GenResult { pjsip: string; extensions: string; queues: string }

export class GeneratorError extends Error {}

/**
 * Raqam → bo'lim/kontekst nomi uchun in'ektiv kodlash: harf/raqam o'zi, boshqa har belgi `_xx` (hex). Shunda `1-2` (m1_2d2) va `1_2` (m1_5f2)
 * to'qnashmaydi, `_` ham kodlanadi.
 */
const enc = (n: string) => String(n).replace(/[^0-9A-Za-z]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
const ctx = (n: string) => `m${enc(n)}`;
const trunkId = (n: string) => `trunk-${enc(n)}`;
const tzName = (tz: string) => { const m = /^UTC([+-])(\d{1,2})$/.exec(tz || ''); return m ? `Etc/GMT${m[1] === '+' ? '-' : '+'}${Number(m[2])}` : 'UTC'; }; // POSIX belgisi teskari
/** Audio kutubxona fayli Asterisk'da `custom/<id>` nomi bilan turadi; berilmasa — standart ovoz. */
const snd = (id: unknown, def: string) => (id && /^[A-Za-z0-9_-]+$/.test(String(id)) ? `custom/${id}` : def);
/** Dialplan ilova argumenti: `, ) \ $ ;` ekranlanadi (`;` — izoh boshlanishi). */
const esc = (s: string) => String(s).replace(/[,)\\$;]/g, (c) => `\\${c}`);
/** Raqam maskasi (X/Z/N, `.`, `!`, [..]) → regex; maska — prefiks (oxirida joker bo'lmasa davomi ixtiyoriy). */
function maskRe(mask: string): string {
  const m = mask.replace(/^\+/, '');
  let out = '^';
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === 'X') out += '[0-9]';
    else if (c === 'Z') out += '[1-9]';
    else if (c === 'N') out += '[2-9]';
    else if (c === '.') out += '[0-9*#]+';
    else if (c === '!') out += '[0-9*#]*';
    else if (c === '[') { const j = m.indexOf(']', i); if (j < 0) throw new GeneratorError(`Maska noto'g'ri: ${mask}`); out += `[${m.slice(i + 1, j).replace(/[^0-9-]/g, '')}]`; i = j; }
    else if (/[0-9]/.test(c)) out += c;
    else if (c === '*' || c === '+') out += `\\${c}`;
    else if (c === '#') out += '#';
    else if (c === '-') continue;
    else throw new GeneratorError(`Maska noto'g'ri: ${mask}`);
  }
  return /[.!]$/.test(m) ? `${out}$` : out;
}
const DAY_AST: Record<string, string> = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };

/** Ikkinchi himoya qatlami: konfiguratsiyaga tushadigan har qanday qiymatda qator uzilishi/nazorat belgisi bo'lsa — to'xtatamiz. */
function assertClean(v: unknown, path: string, depth = 0): void {
  if (depth > 8 || v === null || v === undefined) return;
  if (typeof v === 'string') { if (/[\x00-\x08\x0a-\x1f\x7f]/.test(v)) throw new GeneratorError(`Konfiguratsiyada ruxsat etilmagan belgi (qator uzilishi): ${path}`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => assertClean(x, `${path}[${i}]`, depth + 1)); return; }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) assertClean(x, `${path}.${k}`, depth + 1);
}
/** Bitta qiymatni qatorga qo'yishdan oldin: \n, \r, `;` bo'lsa — xato. */
const val = (s: unknown, what: string) => {
  const x = String(s ?? '');
  if (/[\r\n\x00;]/.test(x)) throw new GeneratorError(`Ruxsat etilmagan belgi: ${what}`);
  return x;
};

export function generateAsterisk(mods: GenModule[], opt: GenOptions = {}): GenResult {
  assertClean(mods, 'modules');
  assertClean(opt, 'options');
  const on = mods.filter((m) => m.enabled);
  const cfgOf = (m: GenModule) => normalizeConfig(m.type as ModuleType, m.config as any).config as Record<string, any>;
  const users = on.filter((m) => m.type === 'user');
  const trunks = on.filter((m) => m.type === 'trunk');
  for (const u of users) if (!EXT_RE.test(u.number)) throw new GeneratorError(`Xodim raqami 2–5 xonali bo'lishi kerak: ${u.number}`);
  const exists = new Set(on.map((m) => m.number));
  const webExt = new Set(users.filter((u) => cfgOf(u).webrtc !== false).map((u) => u.number));
  /** Xodim qurilmalari: stol telefoni (PJSIP/N) va, yoqilgan bo'lsa, brauzer telefoni (PJSIP/N-web). */
  const legs = (n: string) => (webExt.has(n) ? `PJSIP/${n}&PJSIP/${n}-web` : `PJSIP/${n}`);
  const go = (to?: string) => (to && exists.has(to) ? `Goto(${ctx(to)},s,1)` : 'Hangup()');
  const secrets = opt.sipSecrets || {};
  const rec = opt.recording?.enabled ? val(opt.recording.dir || '/var/spool/asterisk/monitor', 'recording.dir').replace(/\/+$/, '') : '';
  if (rec && !/^\/[\w./-]+$/.test(rec)) throw new GeneratorError('Yozuvlar papkasi noto`g`ri');
  // MixMonitor: fayl nomi CRM qo'ng'iroq identifikatori (Originate'dagi CRM_UUID) yoki kanal UNIQUEID — CDR bilan bir xil
  const mix = rec ? [` same => n,MixMonitor(${rec}/\${IF($["\${CRM_UUID}" != ""]?\${CRM_UUID}:\${UNIQUEID})}.wav,b)`] : [];

  // ── pjsip.conf ──
  const pj: string[] = [
    '; Avtomatik hosil qilingan (CRM → Telefoniya). Qo\'lda tahrirlamang.',
    '[transport-udp]', 'type=transport', 'protocol=udp', 'bind=0.0.0.0:5060', '',
    '[transport-wss]', 'type=transport', 'protocol=wss', 'bind=0.0.0.0:8089', '',
  ];
  for (const u of users) {
    const c = cfgOf(u);
    const id = u.number; // faqat raqam (EXT_RE) — transport-*/trunk-* bo'limlari bilan to'qnashmaydi
    const name = String(u.name || id).replace(/[\x00-\x1f\x7f;"<>\[\]\\]/g, '') || id;
    const web = c.webrtc !== false;
    // Oddiy SIP telefon (stol telefoni, MicroSIP, mobil softfon): oddiy RTP. Brauzer telefoni (WebRTC) — alohida «<raqam>-web» endpoint
    // (DTLS-SRTP/ICE majburiy); bir endpointda ikkalasi bo'lmaydi: webrtc=yes oddiy telefonni «no common codecs» bilan rad etadi.
    pj.push(
      `[${id}]`, 'type=endpoint', `context=from-internal`, 'disallow=all', 'allow=ulaw,alaw', `auth=${id}`, `aors=${id}`, `callerid="${name}" <${id}>`,
      'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes', 'rewrite_contact=yes', '',
      `[${id}]`, 'type=auth', 'auth_type=userpass', `username=${id}`, `password=${val(secrets[id] || 'CHANGE_ME', `${id} SIP paroli`)}`, '',
      `[${id}]`, 'type=aor', 'max_contacts=5', 'remove_existing=yes', 'qualify_frequency=30', '',
    );
    if (web) {
      pj.push(
        `[${id}-web]`, 'type=endpoint', `context=from-internal`, 'disallow=all', 'allow=opus,ulaw,alaw', `auth=${id}-web`, `aors=${id}-web`, `callerid="${name}" <${id}>`,
        'webrtc=yes', 'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes', 'rewrite_contact=yes', '',
        `[${id}-web]`, 'type=auth', 'auth_type=userpass', `username=${id}-web`, `password=${val(secrets[id] || 'CHANGE_ME', `${id} SIP paroli`)}`, '',
        `[${id}-web]`, 'type=aor', 'max_contacts=3', 'remove_existing=yes', 'qualify_frequency=30', '',
      );
    }
  }
  for (const t of trunks) {
    const c = cfgOf(t);
    const id = trunkId(t.number);
    const server = val(c.server, `${t.number} server`);
    const login = val(c.login || t.number, `${t.number} login`);
    if (!/^[\w.:-]+$/.test(server) || !/^[\w.:+*#-]+$/.test(login)) throw new GeneratorError(`Trunk ${t.number}: server/login noto'g'ri`);
    pj.push(
      `[${id}]`, 'type=registration', `outbound_auth=${id}`, `server_uri=sip:${server}`, `client_uri=sip:${login}@${server}`, `retry_interval=60`, `contact_user=${enc(t.number)}`, '',
      `[${id}]`, 'type=auth', 'auth_type=userpass', `username=${login}`, `password=${val(secrets[id] || c.password || 'CHANGE_ME', `${t.number} trunk paroli`)}`, '',
      `[${id}]`, 'type=aor', `contact=sip:${server}`, '',
      `[${id}]`, 'type=endpoint', 'context=from-trunk', 'disallow=all', 'allow=ulaw,alaw', `outbound_auth=${id}`, `aors=${id}`, `from_user=${login}`, `from_domain=${server}`, 'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes', '',
      `[${id}]`, 'type=identify', `endpoint=${id}`, `match=${server.replace(/:\d+$/, '')}`, '',
    );
  }

  // ── extensions.conf ──
  const ex: string[] = ['; Avtomatik hosil qilingan (CRM → Telefoniya). Qo\'lda tahrirlamang.', '[general]', 'static=yes', 'writeprotect=no', ''];
  // qora ro'yxat (faqat kiruvchi): raqamlar normallashtirib solishtiriladi — oxirgi 9 raqam (+998…/998…/90… bir xil)
  ex.push('[blacklist-check]');
  ex.push('exten => s,1,NoOp(Qora royxat tekshiruvi)');
  ex.push(' same => n,Set(CRM_CN=${FILTER(0123456789,${CALLERID(num)})})');
  const keys = [...new Set((opt.blacklist || []).map((n) => phoneKey(n)).filter((k) => /^\d{3,9}$/.test(k)))];
  for (const k of keys) ex.push(k.length === 9 ? ` same => n,GotoIf($["\${CRM_CN:-9}" = "${k}"]?blocked,1)` : ` same => n,GotoIf($["\${CRM_CN}" = "${k}"]?blocked,1)`);
  ex.push(' same => n,Return()', 'exten => blocked,1,Hangup(21)', '');
  // kiruvchi (trunk raqami = DID)
  ex.push('[from-trunk]');
  for (const t of trunks) {
    const c = cfgOf(t);
    ex.push(`exten => ${t.number},1,Gosub(blacklist-check,s,1)`, ...mix, ` same => n,${go(c.forwardTo)}`);
  }
  ex.push('exten => _X.,1,Hangup()', '');
  // modullar
  for (const m of on) {
    if (['trunk', 'telegram', 'postcall'].includes(m.type)) continue;
    const c = cfgOf(m);
    const lines: string[] = [`[${ctx(m.number)}]`];
    switch (m.type) {
      case 'user': {
        const f = (c.forward || [])[0] || { afterSec: 15, to: '' };
        lines.push(`exten => s,1,UserEvent(CrmRing,Caller: \${CALLERID(num)},Called: ${m.number},Uuid: \${UNIQUEID})`, ` same => n,Dial(${legs(m.number)},${f.afterSec ?? 15})`, ` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`, ` same => n,${go(f.to)}`, ' same => n(done),Hangup()');
        break;
      }
      case 'group':
        lines.push(`exten => s,1,UserEvent(CrmRing,Caller: \${CALLERID(num)},Called: ${(c.members as string[])[0] || m.number},Uuid: \${UNIQUEID})`, ` same => n,Dial(${(c.members as string[]).map((x) => legs(x)).join('&') || 'Local/0@nowhere'},${c.afterSec ?? 20})`, ` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`, ` same => n,${go(c.forwardTo)}`, ' same => n(done),Hangup()');
        break;
      case 'queue':
        lines.push(`exten => s,1,UserEvent(CrmRing,Caller: \${CALLERID(num)},Called: ${(c.members as { ext: string }[])[0]?.ext || m.number},Uuid: \${UNIQUEID})`, ` same => n,Queue(q${ctx(m.number)},t,,,${c.queueSec ?? 180})`, ` same => n,${go(c.forwardTo)}`);
        break;
      case 'timerule': {
        // GUMON: tunni kesib o'tuvchi oraliq (22:00-02:00) GotoIfTime'da bitta qator bilan ishlashi haqiqiy serverda tekshirilishi kerak
        const tz = tzName(c.timezone);
        lines.push('exten => s,1,NoOp(Vaqt qoidasi)');
        for (const h of c.holidays as string[]) lines.push(` same => n,GotoIf($["\${STRFTIME(\${EPOCH},${tz},%Y-%m-%d)}" = "${h}"]?holiday)`);
        for (const d of DAYS) {
          const x = c.days[d];
          if (x?.on) lines.push(` same => n,GotoIfTime(${x.from}-${x.to},${DAY_AST[d]},*,*,${tz}?work)`);
        }
        lines.push(` same => n,${go(c.offTo)}`, ` same => n(work),${go(c.workTo)}`, ` same => n(holiday),${go(c.holidayTo || c.offTo)}`);
        break;
      }
      case 'greeting': {
        const delay = c.delaySec ?? 5;
        // GUMON: audio (mp3/wav) 8 kHz'ga transkodlanishi kerak bo'lishi mumkin — haqiqiy serverda tekshirish kerak
        lines.push('exten => s,1,Answer()', ' same => n,Set(CRM_TRIES=0)', ` same => n(menu),Background(${snd(c.audioId, 'silence/1')})`, delay > 0 ? ` same => n,WaitExten(${delay})` : ' same => n,Goto(t,1)');
        for (const k of c.menu as { key: string; to: string }[]) if (exists.has(k.to)) lines.push(`exten => ${k.key},1,Goto(${ctx(k.to)},s,1)`);
        if (c.allowExt) for (const u of users) lines.push(`exten => ${u.number},1,Goto(${ctx(u.number)},s,1)`);
        // noto'g'ri tugma: 3 marta qayta eshittiriladi, keyin «keyingi qadam» (cheksiz aylanish yo'q)
        lines.push(`exten => t,1,${go(c.forwardTo)}`, 'exten => i,1,Set(CRM_TRIES=$[${CRM_TRIES} + 1])', ' same => n,GotoIf($[${CRM_TRIES} < 3]?s,menu)', ` same => n,${go(c.forwardTo)}`);
        break;
      }
      case 'voicemail':
        lines.push('exten => s,1,Answer()', ` same => n,Playback(${snd(c.audioBefore, 'vm-intro')})`, ` same => n,Record(/var/spool/asterisk/voicemail/${enc(m.number)}/\${UNIQUEID}.wav,${c.silenceSec ?? 5},${c.recordSec ?? 15},k)`, ` same => n,Playback(${snd(c.audioAfter, 'vm-goodbye')})`, ` same => n,${go(c.forwardTo)}`);
        break;
      case 'http': {
        const url = val(c.url || '', `${m.number} url`);
        const sep = url.includes('?') ? '&' : '?';
        const q = `${sep}caller=\${URIENCODE(\${CALLERID(num)})}&called=\${URIENCODE(\${CALLERID(dnid)})}&uuid=\${UNIQUEID}`;
        lines.push(`exten => s,1,Set(CURLOPT(conntimeout)=${c.timeoutSec ?? 5})`, ` same => n,Set(CURLOPT(httptimeout)=${c.timeoutSec ?? 5})`, ` same => n,Set(RESP=\${CURL(${esc(url)}${q})})`, ` same => n,${go(c.forwardTo)}`);
        break;
      }
      case 'alias':
        lines.push(`exten => s,1,${go(c.forwardTo)}`);
        break;
      case 'numrule':
        lines.push(`exten => s,1,GotoIf($[\${REGEX("${maskRe(c.mask || '')}" \${CALLERID(num)})}]?match)`, ` same => n,${go(c.noMatchTo)}`, ` same => n(match),${go(c.matchTo)}`);
        break;
    }
    ex.push(...lines, '');
  }
  // xodim qurilmalari (stol + brauzer telefoni): CRM click-to-call (Originate Local/<ext>@crm-user) va navbat a'zolari shu kontekstdan chaqiradi
  ex.push('[crm-user]');
  for (const u of users) ex.push(`exten => ${u.number},1,Dial(${legs(u.number)},40)`, ' same => n,Hangup()');
  ex.push('');
  // ichki va chiquvchi
  ex.push('[from-internal]');
  // ichki qo'ng'iroqlar ham yoziladi (MixMonitor — sozlamada yoqilgan bo'lsa)
  for (const u of users) ex.push(`exten => ${u.number},1,NoOp(Ichki)`, ...mix, ` same => n,Goto(${ctx(u.number)},s,1)`);
  for (const m of on) if (['group', 'queue', 'greeting', 'voicemail', 'alias', 'http'].includes(m.type)) ex.push(`exten => ${m.number},1,NoOp(Ichki)`, ...mix, ` same => n,Goto(${ctx(m.number)},s,1)`);
  // Chiquvchi qoidalar: tartib bo'yicha birinchi mos qoida (maska + «kimga ruxsat» ro'yxati). Faqat ko'rsatilgan xodimlar o'sha trunkdan chiqadi;
  // mos qoida bo'lmasa — rad (Hangup 21). Click-to-call (Originate) kanali ham xodim endpoint'i bo'lgani uchun xuddi shu tekshiruvdan o'tadi.
  const rules = (opt.outgoing?.rules || []).filter((r) => r.trunk && exists.has(r.trunk) && on.some((m) => m.type === 'trunk' && m.number === r.trunk));
  if (rules.length) {
    ex.push('exten => _X.,1,Goto(crm-outbound,${EXTEN},1)', '');
    ex.push('[crm-outbound]', 'exten => _X.,1,NoOp(Chiquvchi)', ' same => n,Set(CRM_EP=${CHANNEL(endpoint)})', ' same => n,ExecIf($["${CRM_EP}" = ""]?Set(CRM_EP=${CALLERID(num)}))');
    rules.forEach((r, i) => {
      const conds: string[] = [];
      if (r.mask) conds.push(`\${REGEX("${maskRe(r.mask)}" \${EXTEN})}`);
      const us = (r.users || []).filter((u) => EXT_RE.test(String(u)));
      if (us.length) conds.push(`\${REGEX("^(${us.join('|')})(-web)?$" \${CRM_EP})}`);
      ex.push(conds.length ? ` same => n,GotoIf($[${conds.join(' & ')}]?r${i + 1})` : ` same => n,Goto(r${i + 1})`);
    });
    ex.push(' same => n,Hangup(21)');
    rules.forEach((r, i) => {
      const cid = r.externalNumber && /^\+?\d{3,20}$/.test(r.externalNumber) ? r.externalNumber : r.trunk;
      ex.push(` same => n(r${i + 1}),Set(CALLERID(num)=${val(cid, 'externalNumber')})`,
        ' same => n,ExecIf($["${CRM_UUID}" != ""]?Set(CDR(userfield)=crm:${CRM_UUID}))', ...mix,
        ` same => n,Dial(PJSIP/\${EXTEN}@${trunkId(r.trunk)},60)`, ' same => n,Hangup()');
    });
  }
  ex.push('');

  // ── queues.conf ──
  const q: string[] = ['; Avtomatik hosil qilingan (CRM → Telefoniya).', '[general]', 'persistentmembers=yes', ''];
  for (const m of on.filter((x) => x.type === 'queue')) {
    const c = cfgOf(m);
    const strat = ({ count: 'leastrecent', ringall: 'ringall', roundrobin: 'rrmemory', random: 'random' } as Record<string, string>)[c.strategy] || 'leastrecent';
    q.push(`[q${ctx(m.number)}]`, `strategy=${strat}`, `timeout=${c.ringSec ?? 15}`, 'retry=2', `announce-position=${c.announcePosition ? 'yes' : 'no'}`, `announce-frequency=${c.repeatSec ?? 0}`);
    for (const mem of c.members as { ext: string; priority: number }[]) q.push(`member => ${webExt.has(mem.ext) ? `Local/${mem.ext}@crm-user/n` : `PJSIP/${mem.ext}`},${mem.priority - 1}`);
    q.push('');
  }
  return { pjsip: pj.join('\n'), extensions: ex.join('\n'), queues: q.join('\n') };
}

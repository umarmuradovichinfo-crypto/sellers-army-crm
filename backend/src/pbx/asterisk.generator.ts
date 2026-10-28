// Modullardan Asterisk sozlamasini hosil qiladi: pjsip.conf (xodimlar + trunklar), extensions.conf (qo'ng'iroq oqimi), queues.conf.
// Haqiqiy Asterisk 23 (Docker, scripts/pbx-live) da sinalgan: ichki/kiruvchi/chiquvchi, IVR (DTMF), ovozli pochta, vaqt qoidasi, NAT, WebRTC.
// Matn tuzilishi e2e testlarda (97*-pbx-*.test.mjs) tekshiriladi; haqiqiy operator trunki — serverda (docs/amo-clone/SERVER-DAY.md).
import { normalizeConfig, type ModuleType, DAYS } from './pbx-schema';
import { EXT_RE, phoneKey } from './phone';

export interface GenModule { type: string; number: string; name: string | null; enabled: boolean; config: Record<string, any> }
export interface OutRule { mask: string; trunk: string; users: string[]; externalNumber?: string }
export interface GenOptions {
  blacklist?: string[]; outgoing?: { rules: OutRule[] }; sipSecrets?: Record<string, string>; wssHost?: string;
  /** Suhbatlarni yozib olish (MixMonitor): fayl `<dir>/<uuid>.wav` — CRM shu papkadan (ASTERISK_RECORDINGS_DIR) o'qiydi. */
  recording?: { enabled: boolean; dir?: string };
  /**
   * NAT (server ichki IP + tashqi IP, yoki Docker): tashqi IP/domen SIP va SDP'ga yoziladi (`external_*`), `local_net` dagi manzillarga — yo'q.
   * Faqat berilganda yoziladi (env PBX_EXTERNAL_IP / PBX_LOCAL_NET).
   */
  nat?: { externalAddress?: string; localNets?: string[] };
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
/** IPv4, IPv6 yoki domen nomi (NAT tashqi manzili). */
export function isHostAddress(v: string): boolean {
  const s = String(v || '');
  if (!s || s.length > 253) return false;
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s)) return s.split('.').every((x) => Number(x) <= 255);
  if (s.includes(':')) return /^[0-9A-Fa-f:.]{2,45}$/.test(s) && (s.match(/::/g) || []).length <= 1;
  return /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(s) && !/^[\d.]+$/.test(s);
}
/** Tarmoq (local_net): `10.0.0.0/8`, `192.168.1.0/255.255.255.0`, `fd00::/8` yoki bitta IP. */
export function isLocalNet(v: string): boolean {
  const [ip, mask, ...rest] = String(v || '').split('/');
  if (rest.length || !ip) return false;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) && ip.split('.').every((x) => Number(x) <= 255);
  const v6 = !v4 && /^[0-9A-Fa-f:]{2,39}$/.test(ip) && ip.includes(':') && (ip.match(/::/g) || []).length <= 1;
  if (!v4 && !v6) return false;
  if (mask === undefined) return true;
  if (/^\d{1,3}$/.test(mask)) return Number(mask) <= (v4 ? 32 : 128);
  return v4 && /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(mask) && mask.split('.').every((x) => Number(x) <= 255);
}
/**
 * NAT sozlamasi (env): PBX_EXTERNAL_IP — serverning tashqi IP/domeni; PBX_LOCAL_NET — ichki tarmoqlar (vergul bilan). Tashqi manzil berilib,
 * ichki tarmoq berilmasa — Docker va localhost (`127.0.0.0/8`, `172.16.0.0/12`) ichki hisoblanadi.
 */
export function natFromEnv(env: Record<string, string | undefined> = process.env) {
  const externalAddress = String(env.PBX_EXTERNAL_IP || '').trim();
  const nets = String(env.PBX_LOCAL_NET || '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!externalAddress && !nets.length) return undefined;
  return { externalAddress, localNets: nets.length ? nets : externalAddress ? ['127.0.0.0/8', '172.16.0.0/12'] : [] };
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
  // Ovozli pochta xabari: yozuv sozlamasi o'chiq bo'lsa ham o'sha papkaga `<id>-vm.wav` (CRM jurnalida «Ovozli pochta» va tinglash)
  const vmDir = val(opt.recording?.dir || '/var/spool/asterisk/monitor', 'recording.dir').replace(/\/+$/, '');
  if (!/^\/[\w./-]+$/.test(vmDir) || vmDir.includes('..')) throw new GeneratorError('Yozuvlar papkasi noto`g`ri');
  // NAT: faqat berilganda; qiymatlar oq ro'yxat bilan tekshiriladi (qator uzilishi/`;` bo'lsa — konfiguratsiyaga tushmaydi)
  const natLines: string[] = [];
  const natExt = opt.nat?.externalAddress ? String(opt.nat.externalAddress).trim() : '';
  if (natExt) {
    if (!isHostAddress(natExt)) throw new GeneratorError(`Tashqi manzil (PBX_EXTERNAL_IP) noto'g'ri: ${natExt.slice(0, 60).replace(/[\x00-\x1f]/g, '?')}`);
    natLines.push(`external_media_address=${natExt}`, `external_signaling_address=${natExt}`);
  }
  for (const n of opt.nat?.localNets || []) {
    const x = String(n).trim();
    if (!x) continue;
    if (!isLocalNet(x)) throw new GeneratorError(`Ichki tarmoq (PBX_LOCAL_NET) noto'g'ri: ${x.slice(0, 60).replace(/[\x00-\x1f]/g, '?')}`);
    natLines.push(`local_net=${x}`);
  }

  // ── pjsip.conf ──
  const pj: string[] = [
    '; Avtomatik hosil qilingan (CRM → Telefoniya). Qo\'lda tahrirlamang.',
    '[transport-udp]', 'type=transport', 'protocol=udp', 'bind=0.0.0.0:5060', ...natLines, '',
    // brauzer telefoni: Asterisk ichkarida oddiy WebSocket (8088); TLS (wss://<domen>/ws) ni Caddy tugatadi — sertifikatni qo'lda sozlash shart emas
    '[transport-ws]', 'type=transport', 'protocol=ws', 'bind=0.0.0.0', '',
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
        // opus YO'Q: andrius/asterisk (va ko'p tasvirlar) da codec_opus yo'q — brauzer opus tanlasa, stol telefoni (ulaw) bilan ko'prik
        // «No path to translate» bilan uziladi (jonli sinovda 100-web → 101 shunday uzildi). Brauzerlar PCMU/PCMA ni qo'llaydi.
        `[${id}-web]`, 'type=endpoint', `context=from-internal`, 'disallow=all', 'allow=ulaw,alaw', `auth=${id}-web`, `aors=${id}-web`, `callerid="${name}" <${id}>`,
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
      ...(c.register === false ? [] : [`[${id}]`, 'type=registration', `outbound_auth=${id}`, `server_uri=sip:${server}`, `client_uri=sip:${login}@${server}`, `retry_interval=60`, `contact_user=${enc(t.number)}`, '']),
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
    for (const n of [t.number, ...((c.dids as string[]) || []).flatMap((d) => [d, `+${d}`])]) {
      if (!/^\+?[0-9A-Za-z]+$/.test(n)) continue;
      ex.push(`exten => ${n},1,Gosub(blacklist-check,s,1)`, ...mix, ` same => n,${go(c.forwardTo)}`);
    }
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
        // Tunni kesib o'tuvchi oraliq (masalan dush 22:00–06:00): GotoIfTime'da vaqt va hafta kuni ALOHIDA tekshiriladi — `22:00-06:00,mon`
        // dushanba 00:00–06:00 va 22:00–24:00 ni beradi (jonli Asterisk 23 da tasdiqlangan), seshanba 00:00–06:00 ni EMAS. Shuning uchun ikkiga
        // bo'linadi: `22:00-23:59,mon` + `00:00-06:00,tue`. from = to — butun kun.
        const tz = tzName(c.timezone);
        lines.push('exten => s,1,NoOp(Vaqt qoidasi)');
        for (const h of c.holidays as string[]) lines.push(` same => n,GotoIf($["\${STRFTIME(\${EPOCH},${tz},%Y-%m-%d)}" = "${h}"]?holiday)`);
        DAYS.forEach((d, i) => {
          const x = c.days[d];
          if (!x?.on) return;
          const next = DAY_AST[DAYS[(i + 1) % 7]];
          const ranges: [string, string][] = x.from === x.to ? [['00:00-23:59', DAY_AST[d]]] : x.from < x.to ? [[`${x.from}-${x.to}`, DAY_AST[d]]] : [[`${x.from}-23:59`, DAY_AST[d]], [`00:00-${x.to}`, next]];
          for (const [t, dd] of ranges) lines.push(` same => n,GotoIfTime(${t},${dd},*,*,${tz}?work)`);
        });
        lines.push(` same => n,${go(c.offTo)}`, ` same => n(work),${go(c.workTo)}`, ` same => n(holiday),${go(c.holidayTo || c.offTo)}`);
        break;
      }
      case 'greeting': {
        const delay = c.delaySec ?? 5;
        // Menyu tugmasi ichki raqam boshlanishi bilan bir xil bo'lsa (1 va 101) Asterisk keyingi raqamni kutadi (standart 5 s) — jonli sinovda
        // «1» bosilgach 5 s jimlik bo'ldi. Raqamlar orasidagi kutish 2 s ga tushiriladi (ichki raqamni terishga yetarli).
        const menuKeys = (c.menu as { key: string; to: string }[]).filter((k) => exists.has(k.to)).map((k) => k.key);
        const ambiguous = !!c.allowExt && users.some((u) => menuKeys.some((k) => u.number.startsWith(k)));
        lines.push('exten => s,1,Answer()', ' same => n,Set(CRM_TRIES=0)', ...(ambiguous ? [' same => n,Set(TIMEOUT(digit)=2)'] : []), ` same => n(menu),Background(${snd(c.audioId, 'silence/1')})`, delay > 0 ? ` same => n,WaitExten(${delay})` : ' same => n,Goto(t,1)');
        for (const k of c.menu as { key: string; to: string }[]) if (exists.has(k.to)) lines.push(`exten => ${k.key},1,Goto(${ctx(k.to)},s,1)`);
        if (c.allowExt) for (const u of users) lines.push(`exten => ${u.number},1,Goto(${ctx(u.number)},s,1)`);
        // noto'g'ri tugma: 3 marta qayta eshittiriladi, keyin «keyingi qadam» (cheksiz aylanish yo'q)
        lines.push(`exten => t,1,${go(c.forwardTo)}`, 'exten => i,1,Set(CRM_TRIES=$[${CRM_TRIES} + 1])', ' same => n,GotoIf($[${CRM_TRIES} < 3]?s,menu)', ` same => n,${go(c.forwardTo)}`);
        break;
      }
      case 'voicemail':
        // Fayl nomi — qo'ng'iroq identifikatori (CDR UniqueID / CRM_UUID, MixMonitor bilan bir xil) + `-vm`: CRM CDR kelganda shu faylni topib,
        // qo'ng'iroqni «Ovozli pochta» deb belgilaydi va yozuvni jurnalda tinglatadi. CDR userfield'ga ham `vm:1` (diagnostika uchun).
        lines.push('exten => s,1,Answer()', ' same => n,Set(CRM_VM=${IF($["${CRM_UUID}" != ""]?${CRM_UUID}:${UNIQUEID})})',
          ` same => n,Playback(${snd(c.audioBefore, 'vm-intro')})`, ' same => n,Set(CDR(userfield)=${CDR(userfield)} vm:1)',
          ` same => n,Record(${vmDir}/\${CRM_VM}-vm.wav,${c.silenceSec ?? 5},${c.recordSec ?? 15},k)`, ` same => n,Playback(${snd(c.audioAfter, 'vm-goodbye')})`, ` same => n,${go(c.forwardTo)}`);
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
  for (const m of on) if (['group', 'queue', 'greeting', 'voicemail', 'alias', 'http', 'timerule', 'numrule'].includes(m.type)) ex.push(`exten => ${m.number},1,NoOp(Ichki)`, ...mix, ` same => n,Goto(${ctx(m.number)},s,1)`);
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
      // CALLERID(num) tashqi raqamga almashadi (CDR Source ham shu bo'ladi) — shuning uchun xodim ichki raqami CDR userfield'iga `ext:` bilan yoziladi
      ex.push(` same => n(r${i + 1}),Set(CRM_EXT=\${CUT(CRM_EP,-,1)})`,
        ' same => n,Set(CRM_UF=ext:${CRM_EXT})', ' same => n,ExecIf($["${CRM_UUID}" != ""]?Set(CRM_UF=crm:${CRM_UUID} ${CRM_UF}))', ' same => n,Set(CDR(userfield)=${CRM_UF})',
        ` same => n,Set(CALLERID(num)=${val(cid, 'externalNumber')})`, ...mix,
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

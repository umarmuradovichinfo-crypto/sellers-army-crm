// Modullardan Asterisk sozlamasini hosil qiladi: pjsip.conf (xodimlar + trunklar), extensions.conf (qo'ng'iroq oqimi), queues.conf.
// DIQQAT: haqiqiy Asterisk'da hali sinalmagan (PLAN 45, 3-bosqich) — matn tuzilishi testlar bilan tekshiriladi, ishlashi serverda sinaladi.
import { normalizeConfig, type ModuleType, DAYS } from './pbx-schema';

export interface GenModule { type: string; number: string; name: string | null; enabled: boolean; config: Record<string, any> }
export interface GenOptions { blacklist?: string[]; outgoing?: { rules: { mask: string; trunk: string; users: string[] }[] }; sipSecrets?: Record<string, string>; wssHost?: string }
export interface GenResult { pjsip: string; extensions: string; queues: string }

const ctx = (n: string) => `m${n.replace(/[^0-9A-Za-z_]/g, '_')}`;
const tzName = (tz: string) => { const m = /^UTC([+-])(\d{1,2})$/.exec(tz || ''); return m ? `Etc/GMT${m[1] === '+' ? '-' : '+'}${Number(m[2])}` : 'UTC'; }; // POSIX belgisi teskari
/** Audio kutubxona fayli Asterisk'da `custom/<id>` nomi bilan turadi; berilmasa — standart ovoz. */
const snd = (id: unknown, def: string) => (id && /^[A-Za-z0-9_-]+$/.test(String(id)) ? `custom/${id}` : def);
const esc = (s: string) => String(s).replace(/[,)\\$]/g, (c) => `\\${c}`);
const rx = (mask: string) => '^' + mask.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/X/g, '[0-9]');
const DAY_AST: Record<string, string> = { mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };

export function generateAsterisk(mods: GenModule[], opt: GenOptions = {}): GenResult {
  const on = mods.filter((m) => m.enabled);
  const cfgOf = (m: GenModule) => normalizeConfig(m.type as ModuleType, m.config as any).config as Record<string, any>;
  const users = on.filter((m) => m.type === 'user');
  const trunks = on.filter((m) => m.type === 'trunk');
  const exists = new Set(on.map((m) => m.number));
  const go = (to?: string) => (to && exists.has(to) ? `Goto(${ctx(to)},s,1)` : 'Hangup()');
  const secrets = opt.sipSecrets || {};

  // ── pjsip.conf ──
  const pj: string[] = [
    '; Avtomatik hosil qilingan (CRM → Telefoniya). Qo\'lda tahrirlamang.',
    '[transport-udp]', 'type=transport', 'protocol=udp', 'bind=0.0.0.0:5060', '',
    '[transport-wss]', 'type=transport', 'protocol=wss', 'bind=0.0.0.0:8089', '',
  ];
  for (const u of users) {
    const c = cfgOf(u);
    const id = u.number;
    pj.push(
      `[${id}]`, 'type=endpoint', `context=from-internal`, 'disallow=all', 'allow=opus,ulaw,alaw', `auth=${id}`, `aors=${id}`, `callerid="${(u.name || id).replace(/"/g, '')}" <${id}>`,
      'webrtc=yes', 'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes', 'rewrite_contact=yes', '',
      `[${id}]`, 'type=auth', 'auth_type=userpass', `username=${id}`, `password=${secrets[id] || 'CHANGE_ME'}`, '',
      `[${id}]`, 'type=aor', 'max_contacts=5', 'remove_existing=yes', 'qualify_frequency=30', '',
    );
    void c;
  }
  for (const t of trunks) {
    const c = cfgOf(t);
    const id = `trunk-${t.number}`;
    const login = c.login || t.number;
    pj.push(
      `[${id}]`, 'type=registration', `outbound_auth=${id}`, `server_uri=sip:${c.server}`, `client_uri=sip:${login}@${c.server}`, `retry_interval=60`, `contact_user=${t.number}`, '',
      `[${id}]`, 'type=auth', 'auth_type=userpass', `username=${login}`, `password=${secrets[id] || c.password || 'CHANGE_ME'}`, '',
      `[${id}]`, 'type=aor', `contact=sip:${c.server}`, '',
      `[${id}]`, 'type=endpoint', 'context=from-trunk', 'disallow=all', 'allow=ulaw,alaw', `outbound_auth=${id}`, `aors=${id}`, `from_user=${login}`, `from_domain=${c.server}`, 'direct_media=no', 'rtp_symmetric=yes', 'force_rport=yes', '',
      `[${id}]`, 'type=identify', `endpoint=${id}`, `match=${c.server}`, '',
    );
  }

  // ── extensions.conf ──
  const ex: string[] = ['; Avtomatik hosil qilingan (CRM → Telefoniya). Qo\'lda tahrirlamang.', '[general]', 'static=yes', 'writeprotect=no', ''];
  // qora ro'yxat (faqat kiruvchi)
  ex.push('[blacklist-check]');
  ex.push('exten => s,1,NoOp(Qora royxat tekshiruvi)');
  for (const n of opt.blacklist || []) ex.push(` same => n,GotoIf($["\${CALLERID(num)}" = "${n}"]?blocked,1)`);
  ex.push(' same => n,Return()', 'exten => blocked,1,Hangup(21)', '');
  // kiruvchi (trunk raqami = DID)
  ex.push('[from-trunk]');
  for (const t of trunks) {
    const c = cfgOf(t);
    ex.push(`exten => ${t.number},1,Gosub(blacklist-check,s,1)`, ` same => n,${go(c.forwardTo)}`);
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
        lines.push(`exten => s,1,Dial(PJSIP/${m.number},${f.afterSec || 15})`, ` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`, ` same => n,${go(f.to)}`, ' same => n(done),Hangup()');
        break;
      }
      case 'group':
        lines.push(`exten => s,1,Dial(${(c.members as string[]).map((x) => `PJSIP/${x}`).join('&') || 'Local/0@nowhere'},${c.afterSec || 20})`, ` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`, ` same => n,${go(c.forwardTo)}`, ' same => n(done),Hangup()');
        break;
      case 'queue':
        lines.push(`exten => s,1,Queue(q${ctx(m.number)},t,,,${c.queueSec || 180})`, ` same => n,${go(c.forwardTo)}`);
        break;
      case 'timerule': {
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
        lines.push('exten => s,1,Answer()', ` same => n,Background(${snd(c.audioId, 'silence/1')})`, ` same => n,WaitExten(${c.delaySec || 5})`);
        for (const k of c.menu as { key: string; to: string }[]) if (exists.has(k.to)) lines.push(`exten => ${k.key},1,Goto(${ctx(k.to)},s,1)`);
        if (c.allowExt) for (const u of users) lines.push(`exten => ${u.number},1,Goto(${ctx(u.number)},s,1)`);
        lines.push(`exten => t,1,${go(c.forwardTo)}`, 'exten => i,1,Goto(s,1)');
        break;
      }
      case 'voicemail':
        lines.push('exten => s,1,Answer()', ` same => n,Playback(${snd(c.audioBefore, 'vm-intro')})`, ` same => n,Record(/var/spool/asterisk/voicemail/${m.number}/\${UNIQUEID}.wav,${c.silenceSec || 5},${c.recordSec || 15},k)`, ` same => n,Playback(${snd(c.audioAfter, 'vm-goodbye')})`, ` same => n,${go(c.forwardTo)}`);
        break;
      case 'http':
        lines.push(`exten => s,1,Set(CURLOPT(conntimeout)=${c.timeoutSec || 5})`, ` same => n,Set(CURLOPT(httptimeout)=${c.timeoutSec || 5})`, ` same => n,Set(RESP=\${CURL(${esc(c.url || '')}?caller=\${CALLERID(num)}&called=\${EXTEN}&uuid=\${UNIQUEID})})`, ` same => n,${go(c.forwardTo)}`);
        break;
      case 'alias':
        lines.push(`exten => s,1,${go(c.forwardTo)}`);
        break;
      case 'numrule':
        lines.push(`exten => s,1,GotoIf($[\${REGEX("${rx(c.mask || '')}" \${CALLERID(num)})}]?match)`, ` same => n,${go(c.noMatchTo)}`, ` same => n(match),${go(c.matchTo)}`);
        break;
    }
    ex.push(...lines, '');
  }
  // ichki va chiquvchi
  ex.push('[from-internal]');
  for (const u of users) ex.push(`exten => ${u.number},1,Goto(${ctx(u.number)},s,1)`);
  for (const m of on) if (['group', 'queue', 'greeting', 'voicemail', 'alias', 'http'].includes(m.type)) ex.push(`exten => ${m.number},1,Goto(${ctx(m.number)},s,1)`);
  for (const r of opt.outgoing?.rules || []) {
    if (!r.trunk || !exists.has(r.trunk)) continue;
    const pat = r.mask ? `_${r.mask.replace(/^\+/, '\\+')}.` : '_X.';
    ex.push(`exten => ${pat},1,Set(CALLERID(num)=${r.trunk})`, ` same => n,Dial(PJSIP/\${EXTEN}@trunk-${r.trunk},60)`, ' same => n,Hangup()');
  }
  ex.push('');

  // ── queues.conf ──
  const q: string[] = ['; Avtomatik hosil qilingan (CRM → Telefoniya).', '[general]', 'persistentmembers=yes', ''];
  for (const m of on.filter((x) => x.type === 'queue')) {
    const c = cfgOf(m);
    const strat = ({ count: 'leastrecent', ringall: 'ringall', roundrobin: 'rrmemory', random: 'random' } as Record<string, string>)[c.strategy] || 'leastrecent';
    q.push(`[q${ctx(m.number)}]`, `strategy=${strat}`, `timeout=${c.ringSec || 15}`, 'retry=2', `announce-position=${c.announcePosition ? 'yes' : 'no'}`, `announce-frequency=${c.repeatSec || 0}`);
    for (const mem of c.members as { ext: string; priority: number }[]) q.push(`member => PJSIP/${mem.ext},${mem.priority - 1}`);
    q.push('');
  }
  return { pjsip: pj.join('\n'), extensions: ex.join('\n'), queues: q.join('\n') };
}

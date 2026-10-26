import { randomBytes, timingSafeEqual, createHmac } from 'crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ChatService } from '../crm/chat.service';
import type { SocialChannel, SocialProvider } from '../crm/chat.service';
import { CrmFormsService } from '../crm/crm-forms.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookClient, GRAPH_VERSION } from './facebook.client';
import { FacebookConfigService } from './facebook-config.service';
import type { FbPage } from './facebook-config.service';
import { FacebookConnectorService } from './facebook-connector.service';

const SCOPE = (process.env.FB_SCOPE || 'leads_retrieval,pages_show_list,pages_manage_metadata,pages_read_engagement,pages_manage_ads,business_management,pages_messaging,instagram_basic,instagram_manage_messages,instagram_manage_comments').trim();

const STATE_PREFIX = 'fb_oauth_state:';
const STATE_TTL_MS = 10 * 60 * 1000;

function parseJson<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

@Injectable()
export class FacebookService implements OnModuleInit, SocialProvider {
  private readonly logger = new Logger(FacebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: FacebookConfigService,
    private readonly client: FacebookClient,
    private readonly connector: FacebookConnectorService,
    private readonly crmForms: CrmFormsService,
    private readonly chat: ChatService,
  ) {}

  onModuleInit() {
    this.chat.registerSocial(this); // CRM'dan Instagram/Messenger javoblari shu orqali Graph'ga ketadi
  }

  private baseUrl(): string {
    return (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/+$/, '');
  }
  private webhookUrl(): string {
    return (this.baseUrl() || 'https://<backend-domeningiz>') + '/api/v1/facebook/webhook';
  }
  callbackUrl(): string {
    return (this.baseUrl() || 'https://<backend-domeningiz>') + '/api/v1/facebook/oauth/callback';
  }

  // ── Sozlama (UI) ──
  async getConfig() {
    const c = await this.cfg.get();
    const managed = this.cfg.appManaged();
    const direct = !!(c.appId && c.appSecret);
    return {
      mode: direct ? 'direct' : 'connector',
      connectorOrigin: direct ? '' : this.connector.connectorOrigin(),
      appManaged: managed,
      // Env'dagi kalitlar foydalanuvchiga ko'rsatilmaydi
      appId: managed ? '' : c.appId || '',
      appIdSet: !!c.appId,
      appSecretSet: !!c.appSecret,
      verifyToken: managed ? '' : c.verifyToken || '',
      pages: c.pages.map((p) => ({ id: p.id, name: p.name, igId: p.igId || '', igUsername: p.igUsername || '' })),
      enabled: c.pages.length > 0,
      webhookUrl: this.webhookUrl(),
      webhookStatus: c.webhook?.status || 'pending',
      webhookError: c.webhook?.error || '',
      scope: SCOPE,
    };
  }
  async saveApp(patch: { appId?: string; appSecret?: string; verifyToken?: string }, perms: string[] = []) {
    if (this.cfg.appManaged()) {
      throw new BadRequestException({ error: 'APP_MANAGED', message: "Meta ilovasi serverda (.env) sozlangan — o'zgartirib bo'lmaydi" });
    }
    if (!perms.includes('settings.roles.manage')) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Ilova kalitlarini faqat administrator kiritadi" });
    }
    await this.cfg.updateApp(patch);
    return this.getConfig();
  }

  // ── OAuth (amoCRM: "Login with Facebook") ──
  private async createState(userId: string): Promise<string> {
    const state = randomBytes(24).toString('hex');
    // eskirgan state'larni tozalaymiz
    await this.prisma.appSetting.deleteMany({ where: { key: { startsWith: STATE_PREFIX }, updatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } }).catch(() => null);
    await this.prisma.appSetting.create({ data: { key: STATE_PREFIX + state, value: JSON.stringify({ userId, exp: Date.now() + STATE_TTL_MS }) } });
    return state;
  }
  /** State'ni bir martalik iste'mol qiladi: to'g'ri bo'lsa userId, aks holda null. */
  async consumeState(state: string): Promise<string | null> {
    if (!/^[a-f0-9]{48}$/.test(state || '')) return null;
    const key = STATE_PREFIX + state;
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) return null;
    const del = await this.prisma.appSetting.deleteMany({ where: { key } }); // atomik: faqat bitta so'rov g'olib
    if (del.count !== 1) return null;
    const v = parseJson<{ userId?: string; exp?: number }>(row.value, {});
    if (!v.exp || v.exp < Date.now()) return null;
    return v.userId || null;
  }
  async oauthUrl(userId: string) {
    const c = await this.cfg.get();
    if (!c.appId || !c.appSecret) {
      // Standart rejim: markaziy Meta Connector (mijoz hech narsa sozlamaydi)
      const base = this.connector.publicUrl();
      return { url: await this.connector.startUrl(`${base}/integrations`) };
    }
    // Zaxira: o'z Meta ilovasi bilan to'g'ridan-to'g'ri rejim
    const state = await this.createState(userId);
    const url =
      `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?client_id=${encodeURIComponent(c.appId)}` +
      `&redirect_uri=${encodeURIComponent(this.callbackUrl())}&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
      `&state=${state}`;
    return { url };
  }
  async handleOauthCallback(code: string, state: string) {
    const userId = await this.consumeState(state);
    if (!userId) throw new BadRequestException({ error: 'BAD_STATE', message: "Havola eskirgan yoki noto'g'ri — qaytadan urinib ko'ring" });
    const c = await this.cfg.get();
    if (!c.appId || !c.appSecret) throw new BadRequestException({ error: 'NO_APP', message: 'App ID/Secret sozlanmagan' });
    const userShort = await this.client.exchangeCode(code, this.callbackUrl(), c.appId, c.appSecret);
    const userLong = await this.client.longLived(userShort, c.appId, c.appSecret).catch(() => userShort);
    const pages = await this.client.getPages(userLong);
    const stored: FbPage[] = [];
    for (const p of pages) {
      const ig = await this.client.getInstagramAccount(p.id, p.access_token).catch(() => null);
      stored.push({ id: p.id, name: p.name, accessToken: p.access_token, igId: ig?.id || '', igUsername: ig?.username || '' });
    }
    if (!stored.length) throw new BadRequestException({ error: 'NO_PAGES', message: 'Facebook sahifa topilmadi (sahifalarni tanlaganingizni tekshiring)' });
    await this.cfg.setPages(stored); // birlashtiradi: boshqa sahifalar o'chmaydi
    for (const p of stored) {
      try { await this.client.subscribePage(p.id, p.accessToken, !!p.igId); }
      catch (e) { this.logger.warn(`Sahifa obuna xato (${p.name}): ${(e as Error).message}`); }
    }
    await this.ensureAppWebhook();
    return { pages: stored.map((p) => ({ id: p.id, name: p.name, igUsername: p.igUsername || '' })) };
  }

  /** Ilova darajasidagi webhook obunasi (faqat PUBLIC_URL https bo'lganda). */
  async ensureAppWebhook() {
    const c = await this.cfg.get();
    if (!c.appId || !c.appSecret) return;
    if (!this.baseUrl().startsWith('https://')) {
      await this.cfg.setWebhookStatus('skipped', 'PUBLIC_URL https emas');
      return;
    }
    try {
      await this.client.subscribeApp(c.appId, c.appSecret, this.webhookUrl(), c.verifyToken);
      await this.cfg.setWebhookStatus('ok');
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn('Ilova webhook obunasi xato: ' + msg);
      await this.cfg.setWebhookStatus('error', msg);
    }
  }

  /** Har ulangan sahifa: token yaroqlimi va leadgen obunasi bormi. */
  async pagesStatus() {
    const c = await this.cfg.get();
    const pages = await Promise.all(c.pages.map(async (p) => {
      try {
        const subscribed = await this.client.isPageSubscribed(p.id, p.accessToken, c.appId || undefined);
        return { id: p.id, name: p.name, igUsername: p.igUsername || '', tokenValid: true, subscribed, active: subscribed };
      } catch (e) {
        return { id: p.id, name: p.name, igUsername: p.igUsername || '', tokenValid: false, subscribed: false, active: false, error: (e as Error).message };
      }
    }));
    return { pages };
  }

  // ── Connector -> CRM (imzolangan, @Public) ──
  async connectorPages(raw: Buffer | undefined, sig: string | undefined, instanceId: string | undefined) {
    const body = await this.connector.verifyIncoming(raw, sig, instanceId);
    if (!body) throw new ForbiddenException('Invalid signature');
    const pages = (Array.isArray(body.pages) ? body.pages : [])
      .filter((p: any) => p?.id && p?.accessToken)
      .map((p: any) => ({ id: String(p.id), name: String(p.name || p.id), accessToken: String(p.accessToken), viaConnector: true, igId: String(p.igId || ''), igUsername: String(p.igUsername || '') }));
    if (pages.length) await this.cfg.setPages(pages); // birlashtiradi
    return { ok: true, count: pages.length };
  }
  async connectorEvent(raw: Buffer | undefined, sig: string | undefined, instanceId: string | undefined) {
    const body = await this.connector.verifyIncoming(raw, sig, instanceId);
    if (!body) throw new ForbiddenException('Invalid signature');
    // Eski connector: kind yo'q, faqat leadgenId. Xato bo'lsa tashlanadi -> connector qayta uradi.
    const kind = String(body.kind || (body.leadgenId ? 'lead' : ''));
    const pageId = String(body.pageId || '');
    const channel: SocialChannel = body.channel === 'instagram' ? 'instagram' : 'facebook';
    const payload = body.payload || {};
    if (kind === 'lead') {
      const leadgenId = String(body.leadgenId || payload.leadgenId || '');
      if (!leadgenId) throw new BadRequestException('leadgenId kerak');
      await this.processLead(leadgenId, String(body.formId || payload.formId || ''), pageId);
    } else if (kind === 'message') await this.onMessage(channel, pageId, String(body.igId || ''), payload);
    else if (kind === 'comment') await this.onComment(channel, pageId, String(body.igId || ''), payload);
    else throw new BadRequestException('kind noma\'lum');
    return { ok: true };
  }

  // ── Instagram / Messenger kiruvchi hodisalar ──
  private nameCache = new Map<string, { name: string; exp: number }>();

  private async senderName(channel: SocialChannel, senderId: string, token: string): Promise<string> {
    const key = channel + ':' + senderId;
    const hit = this.nameCache.get(key);
    if (hit && hit.exp > Date.now()) return hit.name;
    let name = '';
    try {
      const p = await this.client.getProfile(senderId, token, channel === 'instagram' ? 'name,username' : 'name');
      name = String((channel === 'instagram' ? p?.username || p?.name : p?.name) || '').trim();
    } catch (e) { this.logger.warn(`Profil olinmadi (${channel}/${senderId}): ${(e as Error).message}`); }
    if (!name) return channel === 'instagram' ? 'Instagram foydalanuvchi' : 'Facebook foydalanuvchi'; // keshlanmaydi — keyingi xabarda qayta uriniladi
    this.nameCache.set(key, { name, exp: Date.now() + 10 * 60 * 1000 });
    return name;
  }

  private async onMessage(channel: SocialChannel, pageId: string, igId: string, m: any) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) { this.logger.warn(`Xabar: sahifa tokeni yo'q (${pageId})`); return; }
    const senderId = String(m?.sender?.id || '');
    if (!senderId || senderId === pageId || (igId && senderId === igId) || m?.message?.is_echo) return; // o'zimizning xabarlar
    const msg = m.message || m.postback || {};
    const atts: any[] = Array.isArray(m.message?.attachments) ? m.message.attachments : [];
    // Salesbot tez javob tugmasi: to'liq matn payload'da (sarlavha 20 belgigacha qisqartiriladi)
    let text = String(m.message?.quick_reply?.payload || m.message?.text || m.postback?.title || m.postback?.payload || '').trim();
    if (!text && atts.length) text = atts.map((a) => `[${a?.type || 'fayl'}]${a?.payload?.url ? ' ' + a.payload.url : ''}`).join('\n');
    if (!text) return; // reaksiya, o'qildi va h.k.
    const name = await this.senderName(channel, senderId, token);
    await this.chat.handleSocialMessage({
      channel, pageId, senderId, senderName: name, text, mid: String(msg.mid || ''), at: m.timestamp ? new Date(Number(m.timestamp)) : undefined,
    });
  }

  private async onComment(channel: SocialChannel, pageId: string, igId: string, v: any) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) { this.logger.warn(`Izoh: sahifa tokeni yo'q (${pageId})`); return; }
    const fromId = String(v?.from?.id || '');
    if (!fromId || fromId === pageId || (igId && fromId === igId)) return; // o'zimizning javoblar
    let commentId: string, text: string, fromName: string, postLink = '';
    if (channel === 'instagram') {
      commentId = String(v.id || ''); text = String(v.text || '').trim(); fromName = String(v.from?.username || '') || await this.senderName('instagram', fromId, token);
      const mediaId = String(v.media?.id || '');
      if (mediaId) postLink = String((await this.client.getMedia(mediaId, token).catch(() => ({ permalink: '' }))).permalink || '');
    } else {
      commentId = String(v.comment_id || ''); text = String(v.message || '').trim(); fromName = String(v.from?.name || '') || await this.senderName('facebook', fromId, token);
      if (v.post_id) postLink = `https://www.facebook.com/${v.post_id}`;
    }
    if (!commentId || !text) return;
    await this.chat.handleSocialComment({ channel, pageId, fromId, fromName, text, commentId, postLink, at: v.created_time ? new Date(typeof v.created_time === 'number' ? v.created_time * 1000 : v.created_time) : undefined });
  }

  // ── SocialProvider: CRM'dan javob (ChatService chaqiradi) ──
  async connected() {
    const c = await this.cfg.get();
    return { facebook: c.pages.length > 0, instagram: c.pages.some((p) => !!p.igId) };
  }
  async hasPage(pageId: string) { return !!(await this.cfg.pageToken(pageId)); }
  async sendMessage(a: { pageId: string; recipientId: string; text: string; buttons?: string[] }) {
    const token = await this.cfg.pageToken(a.pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    const r = await this.client.sendMessage(a.pageId, token, a.recipientId, a.text, a.buttons);
    return { id: r.message_id };
  }
  async react(a: { pageId: string; recipientId: string; messageId: string }) {
    const token = await this.cfg.pageToken(a.pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    return this.client.react(a.pageId, token, a.recipientId, a.messageId);
  }
  async replyComment(a: { channel: SocialChannel; pageId: string; commentId: string; text: string }) {
    const token = await this.cfg.pageToken(a.pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    const r = await this.client.replyComment(a.channel, a.commentId, token, a.text);
    return { id: r.id };
  }

  // ── Qo'lda ulash (OAuthsiz — Page Access Token bilan) ──
  async connectManual(dto: { pageId?: string; pageName?: string; pageToken?: string }) {
    const pageId = (dto.pageId || '').trim();
    const pageToken = (dto.pageToken || '').trim();
    if (!pageId || !pageToken) throw new BadRequestException({ error: 'BAD', message: 'Page ID va Page Access Token kerak' });
    await this.cfg.setPages([{ id: pageId, name: (dto.pageName || pageId).trim(), accessToken: pageToken }]);
    try { await this.client.subscribePage(pageId, pageToken, false); }
    catch (e) { throw new BadRequestException({ error: 'SUBSCRIBE', message: 'Leadgen obunasi xato: ' + (e as Error).message }); }
    return this.getConfig();
  }
  async removePage(pageId: string) {
    const page = (await this.cfg.get()).pages.find((p) => p.id === pageId);
    await this.cfg.removePage(pageId);
    if (page?.viaConnector) await this.connector.disconnectPage(pageId);
    return this.getConfig();
  }

  async listForms(pageId: string) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    try {
      const forms = await this.client.getForms(pageId, token);
      return { forms };
    } catch (e) {
      // Meta ruxsati yetishmasa (masalan pages_manage_ads) — 500 emas, tushunarli xabar: qayta ulash kerak
      const msg = (e as Error).message || '';
      if (/permission|#200|#10|OAuth/i.test(msg))
        throw new BadRequestException({ error: 'FB_PERMISSION', message: "Facebook ruxsati yetarli emas — sahifani qayta ulang (\"Facebook bilan ulash\") va barcha ruxsatlarni bering. " + msg });
      throw new BadRequestException({ error: 'FB_ERROR', message: msg || 'Facebook xatosi' });
    }
  }

  // Forma maydonlari (amoCRM: FB savol -> CRM maydon moslash uchun)
  async formFields(pageId: string, formId: string) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    try {
      const fields = await this.client.getFormQuestions(formId, token);
      return { fields };
    } catch (e) {
      throw new BadRequestException({ error: 'FB_ERROR', message: (e as Error).message || 'Facebook xatosi' });
    }
  }

  // ── Forma → CRM bog'lash (mapping) ──
  async listMappings() {
    const mappings = await this.prisma.fbLeadForm.findMany({ orderBy: { createdAt: 'desc' } });
    return { mappings };
  }
  async saveMapping(dto: any) {
    const formId = String(dto.formId || '').trim();
    if (!formId) throw new BadRequestException({ error: 'BAD', message: 'formId kerak' });
    const data = {
      formName: String(dto.formName || 'Facebook forma'),
      pageId: String(dto.pageId || ''),
      pageName: String(dto.pageName || ''),
      destination: 'crm',
      pipelineId: dto.pipelineId || null,
      stageKey: dto.stageKey || null,
      assigneeId: dto.assigneeId || null,
      position: dto.position || null,
      source: dto.source || 'Facebook',
      active: dto.active !== false,
      fieldMapJson: JSON.stringify(dto.fieldMap || {}),
    };
    const mapping = await this.prisma.fbLeadForm.upsert({
      where: { formId },
      update: data,
      create: { formId, ...data },
    });
    return { mapping };
  }
  async deleteMapping(id: string) {
    await this.prisma.fbLeadForm.delete({ where: { id } }).catch(() => null);
    return { ok: true };
  }

  // ── Webhook (Facebook) ──
  async verifyWebhook(mode?: string, token?: string, challenge?: string): Promise<string | null> {
    const c = await this.cfg.get();
    if (mode === 'subscribe' && token && c.verifyToken && token === c.verifyToken) return challenge || '';
    return null;
  }

  /** X-Hub-Signature-256 ni app secret bilan tekshiradi (timing-safe). */
  async verifySignature(raw: Buffer | undefined, header: string | undefined): Promise<boolean> {
    const c = await this.cfg.get();
    if (!c.appSecret || !raw || !header) return false;
    const expected = 'sha256=' + createHmac('sha256', c.appSecret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(header));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleWebhook(body: any) {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const isIg = body?.object === 'instagram';
    const warn = (what: string) => (e: unknown) => this.logger.warn(`FB ${what} xato: ` + (e as Error).message);
    for (const entry of entries) {
      const entryId = String(entry?.id || '');
      // Instagram: entry.id = IG akkaunt ID -> sahifa; Facebook: entry.id = sahifa ID
      const pageId = isIg ? (await this.cfg.pageByIg(entryId))?.id || '' : entryId;
      const channel: SocialChannel = isIg ? 'instagram' : 'facebook';
      const igId = isIg ? entryId : '';
      for (const m of Array.isArray(entry?.messaging) ? entry.messaging : []) {
        if (pageId && (m?.message || m?.postback)) await this.onMessage(channel, pageId, igId, m).catch(warn('xabar'));
        // amoCRM «Прочитано»: mijoz xabarlarimizni o'qidi (watermark — shu vaqtgacha yuborilganlar o'qilgan)
        // Instagram'da watermark o'rniga o'qilgan xabar ID'si (mid) keladi
        if ((m?.read?.watermark || m?.read?.mid) && m?.sender?.id) await this.chat.markRead(channel, String(m.sender.id), Number(m.read.watermark) || 0, m.read.mid ? String(m.read.mid) : undefined).catch(warn('read'));
      }
      for (const ch of Array.isArray(entry?.changes) ? entry.changes : []) {
        const v = ch?.value || {};
        if (!isIg && ch?.field === 'leadgen') {
          const leadgenId = String(v.leadgen_id || '');
          if (!leadgenId) continue;
          await this.processLead(leadgenId, String(v.form_id || ''), String(v.page_id || entryId)).catch(warn('lead'));
        } else if (!isIg && ch?.field === 'feed' && v.item === 'comment' && v.verb === 'add' && v.comment_id) {
          await this.onComment('facebook', entryId, '', v).catch(warn('izoh'));
        } else if (isIg && ch?.field === 'comments' && v.id && pageId) {
          await this.onComment('instagram', pageId, igId, v).catch(warn('izoh'));
        }
      }
    }
    return { ok: true };
  }

  private async processLead(leadgenId: string, formId: string, pageId: string) {
    // Takroriy webhookni oldini olish (unique leadgenId)
    try { await this.prisma.fbProcessedLead.create({ data: { leadgenId, formId: formId || null } }); }
    catch { return; }

    // Xato bo'lsa "ishlangan" belgisini olib tashlaymiz — Facebook qayta yuborganda lid yo'qolmasin.
    try {
      await this.importLead(leadgenId, formId, pageId);
    } catch (e) {
      await this.prisma.fbProcessedLead.delete({ where: { leadgenId } }).catch(() => {});
      throw e;
    }
  }

  private async importLead(leadgenId: string, formId: string, pageId: string) {
    const pageToken = (await this.cfg.pageToken(pageId)) || (await this.cfg.get()).pages[0]?.accessToken;
    if (!pageToken) throw new Error('FB page token topilmadi: ' + pageId);

    const lead = await this.client.getLead(leadgenId, pageToken);
    const fd: Array<{ name?: string; values?: string[] }> = Array.isArray(lead?.field_data) ? lead.field_data : [];
    const val = (f: { values?: string[] }) => (f.values || []).join(', ');

    const mapping = formId ? await this.prisma.fbLeadForm.findUnique({ where: { formId } }) : null;
    if (mapping && mapping.active === false) return; // o'chirilgan forma

    // amoCRM: forma sozlanganda saqlangan maydon-mapping (FB savol kaliti -> CRM maydoni).
    // fieldMap format: { [fbKey]: 'name' | 'phone' | 'email' | '' (o'tkazib yuborish) | 'Custom nomi' }
    const fieldMap: Record<string, string> = mapping ? parseJson(mapping.fieldMapJson, {}) : {};
    const hasMap = Object.keys(fieldMap).length > 0;

    let name = '', phone = '', email = '';
    const answers: Record<string, string> = {};

    if (hasMap) {
      const parts: Record<string, string[]> = { name: [], phone: [], email: [] };
      for (const f of fd) {
        const key = String(f.name || '');
        const v = val(f);
        if (!v) continue;
        const target = fieldMap[key];
        if (target === 'name' || target === 'phone' || target === 'email') parts[target].push(v);
        else if (target === '' || target === undefined) { /* o'tkazib yuborilgan */ }
        else answers[target] = v; // maxsus maydon (custom) — moslangan nom bilan
      }
      name = parts.name.join(' ').trim();
      phone = parts.phone.join(' ').trim();
      email = parts.email.join(' ').trim();
    } else {
      // Mapping yo'q — eski heuristika (nomlarga qarab avto aniqlash)
      const pick = (...names: string[]) => {
        for (const n of names) {
          const f = fd.find((x) => String(x.name || '').toLowerCase() === n);
          if (f && f.values && f.values.length) return String(f.values[0]);
        }
        return '';
      };
      const first = pick('first_name'), last = pick('last_name');
      name = pick('full_name', 'name') || [first, last].filter(Boolean).join(' ');
      phone = pick('phone_number', 'phone');
      email = pick('email');
      for (const f of fd) {
        const label = String(f.name || '');
        const v = val(f);
        if (label && v) answers[label] = v;
      }
    }
    if (!name) name = 'Facebook lid';

    await this.crmForms.createExternalLead({
      name, phone, email, custom: answers, source: mapping?.source || 'Facebook',
      stageKey: mapping?.stageKey || null, pipelineId: mapping?.pipelineId || null, assigneeId: mapping?.assigneeId || null,
      label: mapping?.formName || 'Facebook Lead Ads', formId: mapping?.formId || null,
    });
    this.logger.log(`Facebook lid qabul qilindi: ${name} (crm)`);
  }
}

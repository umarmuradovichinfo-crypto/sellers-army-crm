import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { CrmFormsService } from '../crm/crm-forms.service';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookClient } from './facebook.client';
import { FacebookConfigService } from './facebook-config.service';

const SCOPE = 'leads_retrieval,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management';

function parseJson<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: FacebookConfigService,
    private readonly client: FacebookClient,
    private readonly crmForms: CrmFormsService,
  ) {}

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
    return {
      appId: c.appId || '',
      appIdSet: !!c.appId,
      appSecretSet: !!c.appSecret,
      verifyToken: c.verifyToken || '',
      pages: c.pages.map((p) => ({ id: p.id, name: p.name })),
      enabled: c.pages.length > 0,
      webhookUrl: this.webhookUrl(),
      scope: SCOPE,
    };
  }
  async saveApp(patch: { appId?: string; appSecret?: string; verifyToken?: string }) {
    await this.cfg.updateApp(patch);
    return this.getConfig();
  }

  // ── OAuth (amoCRM: "Login with Facebook") ──
  async oauthUrl() {
    const c = await this.cfg.get();
    if (!c.appId) throw new BadRequestException({ error: 'NO_APP', message: 'Avval Facebook App ID/Secret ni saqlang' });
    const url =
      `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(c.appId)}` +
      `&redirect_uri=${encodeURIComponent(this.callbackUrl())}&response_type=code&scope=${encodeURIComponent(SCOPE)}`;
    return { url };
  }
  async handleOauthCallback(code: string) {
    const c = await this.cfg.get();
    if (!c.appId || !c.appSecret) throw new BadRequestException({ error: 'NO_APP', message: 'App ID/Secret sozlanmagan' });
    const userShort = await this.client.exchangeCode(code, this.callbackUrl(), c.appId, c.appSecret);
    const userLong = await this.client.longLived(userShort, c.appId, c.appSecret).catch(() => userShort);
    const pages = await this.client.getPages(userLong);
    const stored = pages.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
    if (stored.length) await this.cfg.setPages(stored);
    for (const p of stored) {
      try { await this.client.subscribePage(p.id, p.accessToken); }
      catch (e) { this.logger.warn(`Sahifa obuna xato (${p.name}): ${(e as Error).message}`); }
    }
    return { pages: stored.map((p) => ({ id: p.id, name: p.name })) };
  }

  // ── Qo'lda ulash (OAuthsiz — Page Access Token bilan) ──
  async connectManual(dto: { pageId?: string; pageName?: string; pageToken?: string }) {
    const pageId = (dto.pageId || '').trim();
    const pageToken = (dto.pageToken || '').trim();
    if (!pageId || !pageToken) throw new BadRequestException({ error: 'BAD', message: 'Page ID va Page Access Token kerak' });
    await this.cfg.setPages([{ id: pageId, name: (dto.pageName || pageId).trim(), accessToken: pageToken }]);
    try { await this.client.subscribePage(pageId, pageToken); }
    catch (e) { throw new BadRequestException({ error: 'SUBSCRIBE', message: 'Leadgen obunasi xato: ' + (e as Error).message }); }
    return this.getConfig();
  }
  async removePage(pageId: string) {
    await this.cfg.removePage(pageId);
    return this.getConfig();
  }

  async listForms(pageId: string) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    const forms = await this.client.getForms(pageId, token);
    return { forms };
  }

  // Forma maydonlari (amoCRM: FB savol -> CRM maydon moslash uchun)
  async formFields(pageId: string, formId: string) {
    const token = await this.cfg.pageToken(pageId);
    if (!token) throw new BadRequestException({ error: 'NO_PAGE', message: 'Sahifa ulanmagan' });
    const fields = await this.client.getFormQuestions(formId, token);
    return { fields };
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

  async handleWebhook(body: any) {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        if (ch?.field !== 'leadgen') continue;
        const v = ch.value || {};
        const leadgenId = String(v.leadgen_id || '');
        const formId = String(v.form_id || '');
        const pageId = String(v.page_id || entry.id || '');
        if (!leadgenId) continue;
        await this.processLead(leadgenId, formId, pageId).catch((e) => this.logger.warn('FB lead xato: ' + (e as Error).message));
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

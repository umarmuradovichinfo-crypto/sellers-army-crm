import { Injectable, Logger } from '@nestjs/common';

// FB_GRAPH_BASE — faqat test/mock uchun (standart: rasmiy Graph API)
const GRAPH = (process.env.FB_GRAPH_BASE || 'https://graph.facebook.com/v19.0').replace(/\/$/, '');

/**
 * Facebook Graph API mijozi — amoCRM logikasi:
 *  OAuth -> uzoq muddatli token -> sahifalar (Page Access Token) -> leadgen webhook obuna
 *  -> yangi lid webhook -> {leadgen_id} bo'yicha lid ma'lumotini o'qish.
 */
@Injectable()
export class FacebookClient {
  private readonly logger = new Logger(FacebookClient.name);

  private async get(path: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${GRAPH}${path}?${qs}`, { signal: AbortSignal.timeout(20000) });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      throw new Error(json?.error?.message || `Facebook API xato (${res.status})`);
    }
    return json;
  }
  private async post(path: string, params: Record<string, string>): Promise<any> {
    const res = await fetch(`${GRAPH}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(20000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.error) {
      throw new Error(json?.error?.message || `Facebook API xato (${res.status})`);
    }
    return json;
  }

  // OAuth: code -> user access token
  async exchangeCode(code: string, redirectUri: string, appId: string, appSecret: string): Promise<string> {
    const j = await this.get('/oauth/access_token', {
      client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
    });
    return j.access_token;
  }
  // Qisqa muddatli -> uzoq muddatli (60 kun) user token
  async longLived(shortToken: string, appId: string, appSecret: string): Promise<string> {
    const j = await this.get('/oauth/access_token', {
      grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken,
    });
    return j.access_token;
  }
  // Foydalanuvchi sahifalari + har biriga Page Access Token
  async getPages(userToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
    const j = await this.get('/me/accounts', { access_token: userToken, fields: 'id,name,access_token', limit: '100' });
    return Array.isArray(j.data) ? j.data : [];
  }
  // Sahifani leadgen hodisalariga obuna qilish (webhook shu ilovaga keladi)
  async subscribePage(pageId: string, pageToken: string): Promise<boolean> {
    const j = await this.post(`/${pageId}/subscribed_apps`, {
      subscribed_fields: 'leadgen', access_token: pageToken,
    });
    return !!j.success;
  }
  // Sahifadagi lead formalar ro'yxati
  async getForms(pageId: string, pageToken: string): Promise<Array<{ id: string; name: string; status?: string }>> {
    const j = await this.get(`/${pageId}/leadgen_forms`, { access_token: pageToken, fields: 'id,name,status', limit: '200' });
    return Array.isArray(j.data) ? j.data : [];
  }
  // Forma savollari (maydonlar) — amoCRM: FB maydon -> CRM maydon moslash uchun
  async getFormQuestions(formId: string, pageToken: string): Promise<Array<{ key: string; label: string; type: string }>> {
    const j = await this.get(`/${formId}`, { access_token: pageToken, fields: 'questions' });
    const qs = Array.isArray(j?.questions) ? j.questions : [];
    return qs.map((q: any) => ({ key: String(q.key || q.type || ''), label: String(q.label || q.key || q.type || ''), type: String(q.type || 'custom') }));
  }
  // Lidni leadgen_id bo'yicha o'qish (field_data — javoblar)
  async getLead(leadgenId: string, pageToken: string): Promise<any> {
    return this.get(`/${leadgenId}`, {
      access_token: pageToken,
      fields: 'id,form_id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name',
    });
  }
}

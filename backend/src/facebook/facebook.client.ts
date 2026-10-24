import { Injectable, Logger } from '@nestjs/common';

// Graph API versiyasi — bitta joyda (OAuth dialog ham shundan foydalanadi)
export const GRAPH_VERSION = process.env.FB_GRAPH_VERSION || 'v26.0';
// FB_GRAPH_BASE — faqat test/mock uchun (standart: rasmiy Graph API)
const GRAPH = (process.env.FB_GRAPH_BASE || `https://graph.facebook.com/${GRAPH_VERSION}`).replace(/\/$/, '');

/** Graph xatosi: kod va subkod saqlanadi (24 soatlik oyna kabi holatlarni aniqlash uchun). */
export class GraphError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number, readonly status?: number) {
    super(message);
  }
}
function graphError(json: any, status: number): GraphError {
  const e = json?.error;
  return new GraphError(e?.message || `Facebook API xato (${status})`, e?.code, e?.error_subcode, status);
}

/** Sahifa obunasi maydonlari: Lead Ads + Messenger (+ Instagram ulangan bo'lsa messages, comments). */
export const PAGE_FIELDS = 'leadgen,messages,messaging_postbacks,message_reads,feed';
export const IG_FIELDS = 'messages,comments';

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
    if (!res.ok || json?.error) throw graphError(json, res.status);
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
    if (!res.ok || json?.error) throw graphError(json, res.status);
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
  async subscribePage(pageId: string, pageToken: string, withInstagram = false): Promise<boolean> {
    const fields = withInstagram ? [...new Set([...PAGE_FIELDS.split(','), ...IG_FIELDS.split(',')])].join(',') : PAGE_FIELDS;
    try {
      const j = await this.post(`/${pageId}/subscribed_apps`, { subscribed_fields: fields, access_token: pageToken });
      return !!j.success;
    } catch (e) {
      if (!withInstagram) throw e;
      const j = await this.post(`/${pageId}/subscribed_apps`, { subscribed_fields: PAGE_FIELDS, access_token: pageToken });
      return !!j.success;
    }
  }
  // Sahifaga ulangan Instagram biznes akkaunt (bo'lmasa null)
  async getInstagramAccount(pageId: string, pageToken: string): Promise<{ id: string; username: string } | null> {
    const j = await this.get(`/${pageId}`, { access_token: pageToken, fields: 'instagram_business_account{id,username}' });
    const ig = j?.instagram_business_account;
    return ig?.id ? { id: String(ig.id), username: String(ig.username || '') } : null;
  }
  // Suhbatdosh profili (Messenger: name; Instagram: name, username)
  async getProfile(id: string, pageToken: string, fields: string): Promise<any> {
    return this.get(`/${id}`, { access_token: pageToken, fields });
  }
  // Instagram post havolasi
  async getMedia(mediaId: string, pageToken: string): Promise<{ permalink?: string }> {
    return this.get(`/${mediaId}`, { access_token: pageToken, fields: 'permalink' });
  }
  // Messenger / Instagram Direct xabar yuborish: POST /{page-id}/messages
  async sendMessage(pageId: string, pageToken: string, recipientId: string, text: string): Promise<{ message_id?: string; recipient_id?: string }> {
    return this.post(`/${pageId}/messages`, {
      recipient: JSON.stringify({ id: recipientId }),
      message: JSON.stringify({ text }),
      messaging_type: 'RESPONSE',
      access_token: pageToken,
    });
  }
  // Izohga javob: Instagram POST /{comment-id}/replies, Facebook POST /{comment-id}/comments
  async replyComment(channel: 'instagram' | 'facebook', commentId: string, pageToken: string, text: string): Promise<{ id?: string }> {
    return this.post(`/${commentId}/${channel === 'instagram' ? 'replies' : 'comments'}`, { message: text, access_token: pageToken });
  }
  // Sahifaning obuna holati: token yaroqsiz bo'lsa xato tashlaydi; aks holda leadgen obunasi bormi
  async isPageSubscribed(pageId: string, pageToken: string, appId?: string): Promise<boolean> {
    const j = await this.get(`/${pageId}/subscribed_apps`, { access_token: pageToken });
    const list: any[] = Array.isArray(j?.data) ? j.data : [];
    return list.some((a) => (!appId || String(a.id) === appId) && (Array.isArray(a.subscribed_fields) ? a.subscribed_fields.includes('leadgen') : false));
  }
  // Ilova darajasidagi webhook obunasi (Meta panelida qo'lda sozlash shart emas)
  async subscribeApp(appId: string, appSecret: string, callbackUrl: string, verifyToken: string): Promise<boolean> {
    const j = await this.post(`/${appId}/subscriptions`, {
      object: 'page', callback_url: callbackUrl, fields: PAGE_FIELDS, verify_token: verifyToken, access_token: `${appId}|${appSecret}`,
    });
    try {
      await this.post(`/${appId}/subscriptions`, {
        object: 'instagram', callback_url: callbackUrl, fields: IG_FIELDS, verify_token: verifyToken, access_token: `${appId}|${appSecret}`,
      });
    } catch (e) { this.logger.warn('Instagram webhook obunasi xato: ' + (e as Error).message); }
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

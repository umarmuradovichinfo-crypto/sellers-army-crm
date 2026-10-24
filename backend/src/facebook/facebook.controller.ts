import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';

import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { FacebookService } from './facebook.service';

// ── Admin: Facebook Lead Ads sozlash (CRM → Sozlamalar → Facebook) ──
@Controller('crm/facebook')
@RequirePermissions('crm.view')
export class FacebookController {
  constructor(private readonly fb: FacebookService) {}

  @Get('config') config() { return this.fb.getConfig(); }
  @Put('config') @RequirePermissions('crm.settings') saveApp(@Body() dto: any, @CurrentUser('permissions') perms: string[]) { return this.fb.saveApp(dto, perms); }
  @Get('oauth-url') @RequirePermissions('crm.settings') oauthUrl(@CurrentUser('id') userId: string) { return this.fb.oauthUrl(userId); }
  @Get('pages-status') @RequirePermissions('crm.settings') pagesStatus() { return this.fb.pagesStatus(); }
  @Post('connect') @RequirePermissions('crm.settings') connect(@Body() dto: any) { return this.fb.connectManual(dto); }
  @Delete('pages/:pageId') @RequirePermissions('crm.settings') removePage(@Param('pageId') id: string) { return this.fb.removePage(id); }
  @Get('forms') @RequirePermissions('crm.settings') forms(@Query('pageId') pageId: string) { return this.fb.listForms(pageId); }
  @Get('form-fields') @RequirePermissions('crm.settings') formFields(@Query('pageId') pageId: string, @Query('formId') formId: string) { return this.fb.formFields(pageId, formId); }
  @Get('mappings') mappings() { return this.fb.listMappings(); }
  @Post('mappings') @RequirePermissions('crm.settings') saveMapping(@Body() dto: any) { return this.fb.saveMapping(dto); }
  @Delete('mappings/:id') @RequirePermissions('crm.settings') deleteMapping(@Param('id') id: string) { return this.fb.deleteMapping(id); }
}

// ── Ommaviy: Facebook webhook + OAuth callback ──
@Controller('facebook')
export class FacebookWebhookController {
  constructor(private readonly fb: FacebookService) {}

  // Webhook tekshiruvi (Facebook GET bilan verify_token yuboradi)
  @Public()
  @Get('webhook')
  async verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const ok = await this.fb.verifyWebhook(mode, token, challenge);
    if (ok !== null) { res.status(200).send(ok); return; }
    res.status(403).send('Forbidden');
  }

  // Yangi lidlar (leadgen) — Facebook POST qiladi; X-Hub-Signature-256 majburiy
  @Public()
  @Post('webhook')
  async webhook(@Body() body: any, @Req() req: RawBodyRequest<Request>) {
    const sig = req.headers['x-hub-signature-256'];
    const ok = await this.fb.verifySignature(req.rawBody, Array.isArray(sig) ? sig[0] : sig);
    if (!ok) throw new ForbiddenException('Invalid signature');
    return this.fb.handleWebhook(body);
  }

  // Meta Connector -> CRM: sahifalar (tokenlar bilan). Faqat to'g'ri HMAC imzo bilan.
  @Public()
  @Post('connector/pages')
  connectorPages(@Req() req: RawBodyRequest<Request>) {
    return this.fb.connectorPages(req.rawBody, this.hdr(req, 'x-connector-signature'), this.hdr(req, 'x-connector-instance'));
  }
  // Meta Connector -> CRM: yangi lid hodisasi (leadgen)
  @Public()
  @Post('connector/event')
  connectorEvent(@Req() req: RawBodyRequest<Request>) {
    return this.fb.connectorEvent(req.rawBody, this.hdr(req, 'x-connector-signature'), this.hdr(req, 'x-connector-instance'));
  }
  private hdr(req: Request, name: string): string | undefined {
    const v = req.headers[name];
    return Array.isArray(v) ? v[0] : v;
  }

  // OAuth callback (popup) — kod -> tokenlar -> sahifalar; natijani opener'ga postMessage bilan beramiz
  @Public()
  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Req() req: Request, @Res() res: Response) {
    let result: { ok: boolean; pages: Array<{ id: string; name: string }>; error?: string };
    if (error || !code || !state) {
      result = { ok: false, pages: [], error: error ? 'Facebook ruxsat berilmadi' : "So'rov noto'g'ri" };
    } else {
      try {
        const r = await this.fb.handleOauthCallback(code, state);
        result = { ok: true, pages: r.pages };
      } catch (e) {
        const resp: any = (e as any).getResponse?.();
        result = { ok: false, pages: [], error: (resp && resp.message) || (e as Error).message || 'xato' };
      }
    }
    const origin = this.frontendOrigin(req);
    const payload = JSON.stringify({ type: 'fb-connect', ...result }).replace(/</g, '\\u003c');
    const fallback = `${origin}/amo-market?fb=${result.ok ? 'ok&pages=' + result.pages.length : 'error&msg=' + encodeURIComponent(result.error || '')}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Facebook</title></head><body style="font-family:sans-serif;text-align:center;padding-top:40px">` +
      `<p>${result.ok ? 'OK' : 'Error'}</p><script>(function(){var d=${payload},o=${JSON.stringify(origin)};` +
      `if(window.opener&&!window.opener.closed){try{window.opener.postMessage(d,o);}catch(e){}window.close();}` +
      `else{location.replace(${JSON.stringify(fallback)});}})();</script></body></html>`;
    res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(html);
  }

  // postMessage nishon origin'i: PUBLIC_URL yoki so'rov host'i (hech qachon '*')
  private frontendOrigin(req: Request): string {
    const pub = process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
    try { if (pub) return new URL(pub).origin; } catch { /* host */ }
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  }
}

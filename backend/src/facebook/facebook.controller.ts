import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { FacebookService } from './facebook.service';

// ── Admin: Facebook Lead Ads sozlash (CRM → Sozlamalar → Facebook) ──
@Controller('crm/facebook')
@RequirePermissions('crm.view')
export class FacebookController {
  constructor(private readonly fb: FacebookService) {}

  @Get('config') config() { return this.fb.getConfig(); }
  @Put('config') @RequirePermissions('crm.settings') saveApp(@Body() dto: any) { return this.fb.saveApp(dto); }
  @Get('oauth-url') @RequirePermissions('crm.settings') oauthUrl() { return this.fb.oauthUrl(); }
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

  // Yangi lidlar (leadgen) — Facebook POST qiladi
  @Public()
  @Post('webhook')
  webhook(@Body() body: any) { return this.fb.handleWebhook(body); }

  // OAuth callback — kod -> tokenlar -> sahifalar, keyin sozlamalarga qaytaramiz
  @Public()
  @Get('oauth/callback')
  async oauthCallback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    const back = '/?app=crm&fb=';
    if (error || !code) { res.redirect(back + 'error'); return; }
    try {
      const r = await this.fb.handleOauthCallback(code);
      res.redirect(back + 'ok&pages=' + encodeURIComponent(String(r.pages.length)));
    } catch (e) {
      res.redirect(back + 'error&msg=' + encodeURIComponent((e as Error).message || 'xato'));
    }
  }
}

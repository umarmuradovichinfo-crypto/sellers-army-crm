import { Body, Controller, Get, Header, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { clientIp } from '../common/guards/ip-whitelist.guard';
import { rateLimit } from '../common/rate-limit';
import { CallbackService, callbackWidgetJs } from './callback.service';

// Ommaviy (login'siz): saytdagi «Callback» vidjeti
@Controller('callback')
export class CallbackController {
  constructor(private readonly s: CallbackService) {}

  @Public()
  @Get(':key/widget.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async widget(@Param('key') key: string, @Res() res: Response) {
    const c = /^[\w-]{6,40}$/.test(key) ? await this.s.byKey(key) : null;
    if (!c) return res.status(404).type('text/plain').send('// vidjet topilmadi yoki o\'chiq');
    return res.send(callbackWidgetJs(key, c));
  }

  @Public()
  @Post(':key/request')
  async request(@Param('key') key: string, @Body() b: { name?: string; phone?: string }, @Req() req: any) {
    rateLimit(`cb-ip:${clientIp(req)}`, 5, 60_000, "Juda ko'p so'rov, biroz kuting");
    rateLimit(`cb-key:${key}`, 100, 60_000, "Vidjet vaqtincha band");
    return this.s.request(key, String(b?.name || ''), String(b?.phone || ''));
  }
}

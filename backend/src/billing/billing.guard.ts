import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { BillingService } from './billing.service';

/** BILLING_ENFORCE=1 bo'lsa va obuna tugagan bo'lsa — o'zgartiruvchi so'rovlar 402 bilan to'xtaydi (o'qish, kirish va to'lov ishlayveradi). */
@Injectable()
export class BillingGuard implements CanActivate {
  constructor(private readonly billing: BillingService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    if (!this.billing.enforced()) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    const path = String(req.originalUrl || req.url).split('?')[0];
    if (/^\/api\/v1\/(auth|billing)(\/|$)/.test(path)) return true;
    const c = await this.billing.current();
    if (c.status === 'expired') throw new HttpException({ error: 'PAYMENT_REQUIRED', message: "Obuna muddati tugagan. «Hisob va to'lov» bo'limida uzaytiring" }, 402);
    return true;
  }
}

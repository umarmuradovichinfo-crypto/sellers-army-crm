import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { BillingService } from './billing.service';
import { FEATURE_KEY } from './require-feature.decorator';
import type { Feature } from './plans';

/** BILLING_ENFORCE=1 bo'lsa va obuna tugagan bo'lsa — o'zgartiruvchi so'rovlar 402 bilan to'xtaydi (o'qish, kirish va to'lov ishlayveradi). */
@Injectable()
export class BillingGuard implements CanActivate {
  constructor(private readonly billing: BillingService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    if (!this.billing.enforced()) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string }>();
    const gate = this.reflector.getAllAndOverride<{ feature: Feature; all: boolean } | undefined>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (gate && (gate.all || !readOnly)) await this.billing.assertFeature(gate.feature);
    if (readOnly) return true;
    const path = String(req.originalUrl || req.url).split('?')[0];
    if (/^\/api\/v1\/(auth|billing)(\/|$)/.test(path)) return true;
    const c = await this.billing.current();
    if (c.status === 'expired') throw new HttpException({ error: 'PAYMENT_REQUIRED', message: "Obuna muddati tugagan. «Hisob va to'lov» bo'limida uzaytiring" }, 402);
    return true;
  }
}

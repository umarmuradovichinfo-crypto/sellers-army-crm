import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  permissions: string[];
  sid?: string; // sessiya (RefreshToken.id)
}

/** Joriy foydalanuvchini (yoki uning bitta maydonini) oladi. */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) return undefined;
    return data ? req.user[data] : req.user;
  },
);

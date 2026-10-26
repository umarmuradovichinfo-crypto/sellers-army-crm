import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';

import { AuthModule } from './auth/auth.module';
import { CrmModule } from './crm/crm.module';
import { HealthController } from './common/health.controller';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { IpWhitelistGuard } from './common/guards/ip-whitelist.guard';
import { validateEnv } from './config/env.validation';
import { FacebookModule } from './facebook/facebook.module';
import { OnlinePbxModule } from './onlinepbx/onlinepbx.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { BillingModule } from './billing/billing.module';
import { BillingGuard } from './billing/billing.guard';
import { RightsModule } from './common/rights/rights.service';

// Frontend dist papkasini turli deploy tuzilmalarida topadi
function resolveFrontendDist(): string {
  const candidates = [
    join(__dirname, 'public'), // monolit: build paytida ko'chirilgan (backend/dist/public)
    join(__dirname, '..', '..', 'frontend', 'dist'),
    join(process.cwd(), '..', 'frontend', 'dist'),
    join(process.cwd(), 'frontend', 'dist'),
    join(process.cwd(), 'backend', 'dist', 'public'),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'index.html')));
  const result = found ?? candidates[0];
  new Logger('StaticFiles').log(`Frontend dist: ${result}`);
  return result;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Frontend (Vite) statik fayllarini uzatadi — monolit deploy (bitta domen).
    // __dirname = backend/dist -> ../../frontend/dist
    ServeStaticModule.forRoot({
      rootPath: resolveFrontendDist(),
      exclude: ['/api/{*path}'],
    }),
    PrismaModule,
    RightsModule,
    AuthModule,
    CrmModule,
    SettingsModule,
    BillingModule,
    OnlinePbxModule,
    FacebookModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    // Barcha endpointlar standart bo'yicha himoyalangan (@Public bilan ochiladi)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BillingGuard },
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionsSyncService } from './permissions-sync.service';
import { PasswordResetService } from './password-reset.service';
import { Mailer } from './mailer';
import { CrmModule } from '../crm/crm.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), CrmModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PermissionsSyncService, PasswordResetService, Mailer],
  exports: [AuthService],
})
export class AuthModule {}

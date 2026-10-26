import { Module } from '@nestjs/common';

import { PbxController } from './pbx.controller';
import { PbxService } from './pbx.service';

@Module({ controllers: [PbxController], providers: [PbxService], exports: [PbxService] })
export class PbxAdminModule {}

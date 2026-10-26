import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { OnlinePbxModule } from '../onlinepbx/onlinepbx.module';
import { AutoRecallService } from './autorecall.service';
import { CallbackController } from './callback.controller';
import { CallbackService } from './callback.service';
import { PbxController } from './pbx.controller';
import { PbxService } from './pbx.service';

@Module({ imports: [CrmModule, OnlinePbxModule], controllers: [PbxController, CallbackController], providers: [PbxService, CallbackService, AutoRecallService], exports: [PbxService] })
export class PbxAdminModule {}

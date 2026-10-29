import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { OnlinePbxModule } from '../onlinepbx/onlinepbx.module';
import { AutoRecallService } from './autorecall.service';
import { CallbackController } from './callback.controller';
import { CallbackService } from './callback.service';
import { PbxController } from './pbx.controller';
import { PbxService } from './pbx.service';
import { RecordingRetentionService } from './recording-retention.service';
import { InformerService } from './informer/informer.service';
import { TtsService } from './tts/tts.service';
import { PbxAiController } from './ai/ai.controller';
import { PbxAiService } from './ai/ai.service';

@Module({ imports: [CrmModule, OnlinePbxModule], controllers: [PbxController, CallbackController, PbxAiController], providers: [PbxService, CallbackService, AutoRecallService, RecordingRetentionService, TtsService, InformerService, PbxAiService], exports: [PbxService] })
export class PbxAdminModule {}

import { Injectable } from '@nestjs/common';

import { OnlinePbxConfigService } from './onlinepbx-config.service';
import { OnlinePbxClient } from './onlinepbx.client';
import { OwnPbxProvider } from './own-pbx.provider';
import type { PbxCall, PbxKind, PbxProvider } from './pbx-provider';

/**
 * CRM uchun yagona kirish nuqtasi: faol provayderni (Sozlamalar → Telefoniya → «provider») har chaqiruvda tanlaydi,
 * shuning uchun almashtirish uchun qayta ishga tushirish kerak emas.
 */
@Injectable()
export class PbxGateway implements PbxProvider {
  constructor(private readonly cfg: OnlinePbxConfigService, private readonly online: OnlinePbxClient, private readonly own: OwnPbxProvider) {}

  private async active(): Promise<PbxProvider> {
    return (await this.cfg.get()).provider === 'own' ? this.own : this.online;
  }
  get kind(): PbxKind { return 'onlinepbx'; }
  async activeKind(): Promise<PbxKind> { return (await this.active()).kind; }
  async enabled() { return (await this.active()).enabled(); }
  async testConnection() { return (await this.active()).testConnection(); }
  async call(from: string, to: string, extra: Record<string, string> = {}) { return (await this.active()).call(from, to, extra); }
  async history(params: Record<string, string>): Promise<PbxCall[]> { return (await this.active()).history(params); }
  async recordUrl(uuid: string) { return (await this.active()).recordUrl(uuid); }
  async fetchRecording(uuidOrUrl: string) { return (await this.active()).fetchRecording(uuidOrUrl); }
}

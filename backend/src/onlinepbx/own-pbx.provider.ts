import { Injectable } from '@nestjs/common';

import type { PbxCall, PbxKind, PbxProvider } from './pbx-provider';

/**
 * O'z stansiyamiz (Asterisk) provayderi — PLAN 45, 2-bosqich. Hozircha ulanmagan: enabled()=false, shuning uchun CRM OnlinePBX'da qoladi.
 * Keyingi bosqichda AMI/ARI orqali originate, tarix (CDR) va yozuv fayllari shu yerda amalga oshiriladi.
 */
@Injectable()
export class OwnPbxProvider implements PbxProvider {
  readonly kind: PbxKind = 'own';
  async enabled() { return false; }
  async testConnection() { return { ok: false, message: "O'z stansiyamiz hali ulanmagan (PLAN 45)" }; }
  async call(): Promise<{ ok: boolean; uuid?: string; comment?: string; raw: unknown }> { return { ok: false, comment: "O'z stansiyamiz hali ulanmagan", raw: null }; }
  async history(): Promise<PbxCall[]> { return []; }
  async recordUrl() { return null; }
  async fetchRecording() { return null; }
}

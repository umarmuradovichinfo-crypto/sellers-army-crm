import { Controller, Get, Head } from '@nestjs/common';

import { Public } from './decorators/public.decorator';

/** Frontend tarmoq nazoratchisi uchun yengil ping. */
@Controller('health')
export class HealthController {
  @Public() @Get() get() { return { ok: true }; }
  @Public() @Head() head() { return; }
}

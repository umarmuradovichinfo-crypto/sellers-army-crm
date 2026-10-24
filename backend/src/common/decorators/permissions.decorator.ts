import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/** Endpoint uchun kerakli ruxsatlar (hammasi bo'lishi shart). */
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

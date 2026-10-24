import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Endpointni auth'siz ochiq qiladi (login, refresh). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

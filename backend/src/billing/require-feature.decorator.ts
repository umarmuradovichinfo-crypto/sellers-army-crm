import { SetMetadata } from '@nestjs/common';

import type { Feature } from './plans';

export const FEATURE_KEY = 'billingFeature';

/** Endpoint tarif imkoniyatiga bog'liq. Odatda faqat yozuvchi so'rovlar (POST/PUT/PATCH/DELETE) cheklanadi, o'qish ochiq qoladi; all:true — hammasi. */
export const RequireFeature = (feature: Feature, opts: { all?: boolean } = {}) => SetMetadata(FEATURE_KEY, { feature, all: !!opts.all });

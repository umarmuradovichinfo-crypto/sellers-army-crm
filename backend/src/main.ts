import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Katta JSON (avatar/rasm base64) uchun tana chegarasini oshiramiz (standart 100kb kam)
  const { json, urlencoded } = await import('express');
  // Facebook webhook imzosini tekshirish uchun xom tana (faqat shu yo'l uchun saqlanadi)
  app.use(json({
    limit: '25mb',
    verify: (req: any, _res, buf) => { if (String(req.originalUrl || req.url).includes('/facebook/')) req.rawBody = buf; },
  }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  // Barcha endpointlar /api/v1 prefiksi ostida (frontend VITE_API_BASE=/api/v1)
  app.setGlobalPrefix('api/v1');

  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',') : true,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.PORT || 8000);
  app.enableShutdownHooks();
  await app.listen(port);
  console.log(`API ishlamoqda: http://localhost:${port}/api/v1`);
}

void bootstrap();

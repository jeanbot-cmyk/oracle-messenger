import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });
  app.use(require('express').json({ limit: process.env.JSON_LIMIT ?? '25mb' }));
  app.use(require('express').urlencoded({ limit: process.env.JSON_LIMIT ?? '25mb', extended: true }));
  app.use('/uploads', require('express').static(
    process.env.MEDIA_UPLOAD_DIR || join(process.cwd(), 'uploads'),
    {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      immutable: process.env.NODE_ENV === 'production',
    },
  ));

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'https://messenger.oracle-plus.online')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`Oracle Messenger Backend running on port ${port}`);
}
bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});

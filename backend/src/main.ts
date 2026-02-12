import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import * as path from 'path';

async function bootstrap() {
  // Initialize with Fastify Adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );

  // Register Cookie Plugin
  await app.register(fastifyCookie, {
    secret: process.env.JWT_SECRET, // Used to sign cookies
  });

  const defaultOrigins = ['http://localhost:4321', 'http://localhost:5173'];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Requested-With',
    ],
  });

  await app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
      files: 6,
      parts: 40,
      fields: 30,
      fieldNameSize: 100,
      fieldSize: 1 * 1024 * 1024,
    },
  });

  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });

  // Global Validation Pipe (Protects all endpoints)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // Throw error if extra properties sent
      transform: true, // Auto-convert types (e.g. string "1" to number 1)
    }),
  );

  // Set global prefix (e.g., api.yourdomain.com/v1/...)
  app.setGlobalPrefix('v1');

  // cPanel/Passenger Logic
  // Passenger automatically sets the PORT env variable.
  // We bind to 0.0.0.0 to ensure external access via the proxy.
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on: ${await app.getUrl()}`);
}
void bootstrap();

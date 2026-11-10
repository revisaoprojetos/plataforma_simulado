import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { parseEnv } from './config/env';

const version = (): string => {
  try {
    return (
      JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
    ).version;
  } catch {
    return '0.0.0';
  }
};

async function bootstrap(): Promise<void> {
  const env = parseEnv(); // em produção recusa segredos fracos, CORS em localhost etc.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);

  // Documentação interativa: ligada fora de produção; em produção só com SWAGGER_ENABLED=true.
  if (env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Gerenciador de Vídeo-Aulas')
        .setVersion(version())
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();

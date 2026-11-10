import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const PASSWORD = 'senha-de-teste-123';

export async function createApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication> {
  const mod = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE tenants, users CASCADE');
}

let hash: string | undefined;
export async function addUser(
  prisma: PrismaClient,
  tenantId: string | null,
  email: string,
  role: Role,
  name = email,
) {
  hash ??= await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 1024, timeCost: 1 });
  return prisma.user.create({ data: { tenantId, email, name, role, passwordHash: hash } });
}

export async function login(
  app: INestApplication,
  tenant: string | undefined,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/auth/login')
    .send({ tenant, email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login falhou (${res.status}) para ${email}`);
  return res.body;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

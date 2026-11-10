import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addUser, bearer, createApp, login, PASSWORD, resetDb } from './helpers';

describe('auth (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  let tenantA: string;

  beforeAll(async () => {
    app = await createApp();
    await resetDb(prisma);
    const a = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    const b = await prisma.tenant.create({ data: { slug: 'empresa-b', name: 'B' } });
    tenantA = a.id;
    await addUser(prisma, a.id, 'maria@x.com', 'aluno');
    await addUser(prisma, b.id, 'maria@x.com', 'aluno'); // mesmo e-mail em outra empresa é permitido
    await addUser(prisma, null, 'plataforma@x.com', 'platform_admin');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('rotas protegidas exigem token', async () => {
    await http().get('/v1/courses').expect(401);
    await http().get('/v1/me').expect(401);
    await http().get('/v1/courses').set(bearer('lixo')).expect(401);
  });

  it('health é público', async () => {
    await http().get('/health').expect(200);
  });

  it('login por empresa devolve JWT com tid e papel', async () => {
    const res = await http()
      .post('/v1/auth/login')
      .send({ tenant: 'empresa-a', email: 'MARIA@x.com', password: PASSWORD })
      .expect(200);
    expect(res.body.expiresIn).toBeGreaterThan(0);
    const payload = JSON.parse(
      Buffer.from(res.body.accessToken.split('.')[1], 'base64url').toString(),
    );
    expect(payload).toMatchObject({ tid: tenantA, role: 'aluno', email: 'maria@x.com' });
  });

  it('credenciais inválidas, empresa inexistente e login sem empresa falham com a mesma resposta', async () => {
    const bodies = await Promise.all([
      http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'maria@x.com', password: 'errada' }),
      http()
        .post('/v1/auth/login')
        .send({ tenant: 'nao-existe', email: 'maria@x.com', password: PASSWORD }),
      http().post('/v1/auth/login').send({ email: 'maria@x.com', password: PASSWORD }), // aluno não é platform_admin
    ]);
    for (const r of bodies) {
      expect(r.status).toBe(401);
      expect(r.body.message).toBe('Credenciais inválidas');
    }
  });

  it('platform_admin loga sem empresa e não acessa rotas de empresa', async () => {
    const t = await login(app, undefined, 'plataforma@x.com');
    await http().get('/v1/platform/tenants').set(bearer(t.accessToken)).expect(200);
    await http().get('/v1/courses').set(bearer(t.accessToken)).expect(403);
  });

  it('empresa suspensa não loga e perde o refresh', async () => {
    const { refreshToken } = await login(app, 'empresa-b', 'maria@x.com');
    await prisma.tenant.update({ where: { slug: 'empresa-b' }, data: { status: 'suspended' } });
    await http()
      .post('/v1/auth/login')
      .send({ tenant: 'empresa-b', email: 'maria@x.com', password: PASSWORD })
      .expect(401);
    await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
    await prisma.tenant.update({ where: { slug: 'empresa-b' }, data: { status: 'active' } });
  });

  it('refresh rotaciona e o reuso derruba a família inteira', async () => {
    const first = await login(app, 'empresa-a', 'maria@x.com');
    const second = (
      await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(200)
    ).body;
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await http().get('/v1/me').set(bearer(second.accessToken)).expect(200);

    // reuso do token antigo → 401 e a família toda é revogada
    await http().post('/v1/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await http().post('/v1/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
  });

  it('logout revoga o refresh token', async () => {
    const t = await login(app, 'empresa-a', 'maria@x.com');
    await http().post('/v1/auth/logout').send({ refreshToken: t.refreshToken }).expect(204);
    await http().post('/v1/auth/refresh').send({ refreshToken: t.refreshToken }).expect(401);
  });

  it('valida entrada (400)', async () => {
    await http().post('/v1/auth/login').send({ email: 'nao-e-email', password: 'x' }).expect(400);
  });
});

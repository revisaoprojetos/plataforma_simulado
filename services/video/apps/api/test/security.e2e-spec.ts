import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { REDIS } from '../src/redis/redis.module';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, PASSWORD, resetDb } from './helpers';

const overrides = (b: Parameters<Parameters<typeof createApp>[0] & object>[0]) =>
  b
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(TranscodeQueue)
    .useValue(new FakeQueue());

describe('segurança e robustez (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const id: Record<string, string> = {};
  const tok: Record<string, string> = {};
  let previous: string | undefined;

  const wrongLogin = (email: string, tenant = 'empresa-a') =>
    http().post('/v1/auth/login').send({ tenant, email, password: 'senha-errada-123' });

  beforeAll(async () => {
    previous = process.env.RATE_LIMIT_ENABLED;
    process.env.RATE_LIMIT_ENABLED = 'true'; // esta suíte testa os limites de verdade
    app = await createApp(overrides);
    await resetDb(prisma);

    const a = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    id.tenanta = a.id;
    for (const role of ['admin', 'professor', 'aluno'] as const) {
      id[role] = (await addUser(prisma, a.id, `${role}@a.com`, role)).id;
    }
    await addUser(prisma, a.id, 'outro@a.com', 'aluno');
    await addUser(prisma, a.id, 'novo@a.com', 'aluno');
    tok.aluno = (await login(app, 'empresa-a', 'aluno@a.com')).accessToken;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'C', status: 'published', ownerId: id.professor },
    });
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M' },
    });
    await prisma.enrollment.create({
      data: { tenantId: a.id, courseId: course.id, userId: id.aluno },
    });
    const video = await prisma.video.create({
      data: {
        tenantId: a.id,
        status: 'ready',
        sourceKey: 'x',
        originalName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: BigInt(1),
        durationS: 100,
        renditions: [{ name: '240p' }],
      },
    });
    id.lesson = (
      await prisma.lesson.create({
        data: {
          tenantId: a.id,
          moduleId: mod.id,
          title: 'Aula',
          status: 'published',
          videoId: video.id,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = [
      ...(await redis.keys('rl:*')),
      ...(await redis.keys('ps:*')),
      ...(await redis.keys('hb:*')),
    ];
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (previous === undefined) delete process.env.RATE_LIMIT_ENABLED;
    else process.env.RATE_LIMIT_ENABLED = previous;
  });

  describe('saúde', () => {
    it('/health/live (liveness) e /health (readiness) ficam na raiz, sem prefixo /v1', async () => {
      expect((await http().get('/health/live').expect(200)).body).toEqual({ status: 'ok' });
      expect((await http().get('/health').expect(200)).body).toMatchObject({
        status: 'ok',
        db: 'up',
        redis: 'up',
      });
      await http().get('/v1/health/live').expect(404);
    });
  });

  describe('cabeçalhos e identificação da requisição', () => {
    it('envia cabeçalhos de segurança e esconde a tecnologia', async () => {
      const res = await http().get('/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('todo pedido recebe um X-Correlation-Id; o válido do cliente é mantido, o suspeito é trocado', async () => {
      const gen = await http().get('/health');
      expect(gen.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
      const kept = await http().get('/health').set('X-Correlation-Id', 'trace-abc_12345');
      expect(kept.headers['x-correlation-id']).toBe('trace-abc_12345');
      const bad = await http().get('/health').set('X-Correlation-Id', 'x y z <script>');
      expect(bad.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('formato único de erro', () => {
    it('inclui o correlationId igual ao cabeçalho, sem perder o formato anterior', async () => {
      const r401 = await http().get('/v1/courses').expect(401);
      expect(r401.body).toMatchObject({
        statusCode: 401,
        correlationId: r401.headers['x-correlation-id'],
      });

      const r400 = await http().post('/v1/auth/login').send({ email: 'x' }).expect(400);
      expect(Array.isArray(r400.body.message)).toBe(true);
      expect(r400.body.correlationId).toBe(r400.headers['x-correlation-id']);

      const r404 = await http().get('/v1/rota-inexistente').set(bearer(tok.aluno)).expect(404);
      expect(r404.body.correlationId).toBeTruthy();
    });

    it('erro inesperado vira 500 genérico, sem vazar a causa', async () => {
      const spy = jest
        .spyOn(app.get(AuthService), 'me')
        .mockRejectedValue(
          new Error('password authentication failed for user "video" at 10.0.0.5'),
        );
      const res = await http().get('/v1/me').set(bearer(tok.aluno)).expect(500);
      spy.mockRestore();
      expect(res.body.message).toMatch(/correlationId/);
      expect(JSON.stringify(res.body)).not.toMatch(/password|10\.0\.0\.5|video/i);
      expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
    });

    it('JSON inválido → 400; corpo grande demais → 413', async () => {
      const bad = await http()
        .post('/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{quebrado');
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe('JSON inválido');
      const big = await http()
        .post('/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'x'.repeat(4 * 1024 * 1024) }));
      expect(big.status).toBe(413);
      expect(big.body.correlationId).toBeTruthy();
    });
  });

  describe('limite de requisições', () => {
    it('força bruta: a 9ª tentativa na mesma conta leva 429 com Retry-After, até com a senha certa', async () => {
      for (let i = 0; i < 8; i++) await wrongLogin('aluno@a.com').expect(401);
      const blocked = await wrongLogin('aluno@a.com').expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.body).toMatchObject({
        statusCode: 429,
        correlationId: blocked.headers['x-correlation-id'],
      });
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'aluno@a.com', password: PASSWORD })
        .expect(429); // conta travada por um tempo
      await wrongLogin('outro@a.com').expect(401); // outra conta não é afetada
    });

    it('acertar a senha limpa as tentativas erradas da conta', async () => {
      for (let i = 0; i < 5; i++) await wrongLogin('novo@a.com').expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'novo@a.com', password: PASSWORD })
        .expect(200);
      for (let i = 0; i < 8; i++) await wrongLogin('novo@a.com').expect(401); // contagem recomeçou
      await wrongLogin('novo@a.com').expect(429);
    });

    it('varredura de várias contas pelo mesmo IP é barrada (30 por 10 min)', async () => {
      for (let i = 0; i < 30; i++) await wrongLogin(`alvo${i}@a.com`).expect(401);
      await wrongLogin('alvo99@a.com').expect(429);
    });

    it('relatórios têm limite por usuário (60/min); outro usuário não é afetado', async () => {
      const get = (t: string) => http().get('/v1/analytics/students/me').set(bearer(t));
      for (let i = 0; i < 60; i++) await get(tok.aluno).expect(200);
      await get(tok.aluno).expect(429);
      const other = (await login(app, 'empresa-a', 'outro@a.com')).accessToken;
      await get(other).expect(200);
    });

    it('entrega de vídeo: limite por sessão de reprodução (300/min), sem afetar outra sessão', async () => {
      const open = async () =>
        (
          await http()
            .post(`/v1/lessons/${id.lesson}/playback`)
            .set(bearer(tok.aluno))
            .send({})
            .expect(200)
        ).body as {
          playbackToken: string;
        };
      const s1 = await open();
      const s2 = await open();
      const beat = (t: string, seq: number) =>
        http().post('/v1/progress/heartbeat').set(bearer(t)).send({ seq, position: 1, rate: 1 });
      for (let i = 1; i <= 300; i++) {
        const r = await beat(s1.playbackToken, i);
        if (r.status !== 204) throw new Error(`heartbeat ${i} → ${r.status}`);
      }
      const over = await beat(s1.playbackToken, 301);
      expect(over.status).toBe(429);
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
      await beat(s2.playbackToken, 1).expect(204);
    });

    it('rotas de saúde não têm limite', async () => {
      for (let i = 0; i < 650; i++) {
        const r = await http().get('/health');
        if (r.status !== 200) throw new Error(`/health → ${r.status} na ${i + 1}ª`);
      }
    });
  });

  describe('servidor MCP', () => {
    it('limita por token pessoal: a 121ª chamada do minuto leva 429', async () => {
      const created = await http()
        .post('/v1/me/mcp-tokens')
        .set(bearer(tok.aluno))
        .send({ name: 'limite', scopes: ['catalog:read'] })
        .expect(201);
      const ping = () =>
        http()
          .post('/mcp')
          .set(bearer(created.body.token))
          .set('Accept', 'application/json, text/event-stream')
          .send({ jsonrpc: '2.0', id: 1, method: 'ping' });

      for (let i = 0; i < 120; i++) {
        const r = await ping();
        if (r.status !== 200) throw new Error(`/mcp → ${r.status} na ${i + 1}ª`);
      }
      const blocked = await ping();
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('com o limite desligado por configuração', () => {
    it('não bloqueia nada', async () => {
      process.env.RATE_LIMIT_ENABLED = 'false';
      const off = await createApp(overrides);
      try {
        for (let i = 0; i < 12; i++) {
          const r = await request(off.getHttpServer())
            .post('/v1/auth/login')
            .send({ tenant: 'empresa-a', email: 'aluno@a.com', password: 'errada-errada' });
          expect(r.status).toBe(401);
        }
      } finally {
        await off.close();
        process.env.RATE_LIMIT_ENABLED = 'true';
      }
    });
  });
});

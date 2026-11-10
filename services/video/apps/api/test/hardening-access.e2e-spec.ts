import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthService } from '../src/auth/auth.service';
import { REDIS } from '../src/redis/redis.module';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { StorageService } from '../src/storage/storage.service';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, PASSWORD, resetDb } from './helpers';

const overrides = (b: Parameters<Parameters<typeof createApp>[0] & object>[0]) =>
  b
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(TranscodeQueue)
    .useValue(new FakeQueue());

/** Fases 1.5 (revogação imediata), 1.7/1.8 (relatórios), 1.9 (CORS por empresa) e 1.14 (LGPD). */
describe('endurecimento de acesso: revogação, relatórios, CORS e LGPD (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  const redis = () => app.get<Redis>(REDIS);

  beforeAll(async () => {
    app = await createApp(overrides);
    await resetDb(prisma);
    const t = await prisma.tenant.create({
      data: { slug: 'empresa-a', name: 'A', allowedDomains: ['app.empresa-a.com'] },
    });
    id.tenanta = t.id;
    for (const role of ['admin', 'professor', 'aluno'] as const) {
      id[`${role}a`] = (await addUser(prisma, t.id, `${role}@a.com`, role)).id;
      tok[`${role}a`] = (await login(app, 'empresa-a', `${role}@a.com`)).accessToken;
    }
    id.course = (
      await prisma.course.create({
        data: { tenantId: t.id, title: 'C', status: 'published', ownerId: id.professora },
      })
    ).id;
    const mod = await prisma.module.create({
      data: { tenantId: t.id, courseId: id.course, title: 'M' },
    });
    const video = await prisma.video.create({
      data: {
        tenantId: t.id,
        status: 'ready',
        sourceKey: 'x',
        originalName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1n,
        durationS: 100,
        renditions: [{ name: '240p' }],
      },
    });
    id.lesson = (
      await prisma.lesson.create({
        data: {
          tenantId: t.id,
          moduleId: mod.id,
          title: 'A1',
          status: 'published',
          videoId: video.id,
        },
      })
    ).id;
    await prisma.enrollment.create({
      data: { tenantId: t.id, courseId: id.course, userId: id.alunoa },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('revogação imediata (1.5)', () => {
    it('desativar o usuário derruba o JWT já emitido, o refresh e as telas abertas na hora', async () => {
      const u = await addUser(prisma, id.tenanta, 'kick@a.com', 'aluno');
      const { accessToken, refreshToken } = await login(app, 'empresa-a', 'kick@a.com');
      await http().get('/v1/me').set(bearer(accessToken)).expect(200); // entra no cache de estado
      await redis().zadd(`ps:${u.id}`, Date.now() + 60_000, 'sessao-aberta');

      await http()
        .patch(`/v1/users/${u.id}`)
        .set(bearer(tok.admina))
        .send({ active: false })
        .expect(200);

      await http().get('/v1/me').set(bearer(accessToken)).expect(401); // sem esperar o JWT expirar
      await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
      expect(await redis().exists(`ps:${u.id}`)).toBe(0);

      // reativar volta a valer (o cache foi invalidado, não fica "preso" negando)
      await http()
        .patch(`/v1/users/${u.id}`)
        .set(bearer(tok.admina))
        .send({ active: true })
        .expect(200);
      await http().get('/v1/me').set(bearer(accessToken)).expect(200);
    });

    it('trocar a senha revoga os refresh tokens existentes', async () => {
      const u = await addUser(prisma, id.tenanta, 'troca@a.com', 'aluno');
      const { refreshToken } = await login(app, 'empresa-a', 'troca@a.com');
      await http()
        .patch(`/v1/users/${u.id}`)
        .set(bearer(tok.admina))
        .send({ password: 'outra-senha-forte-123' })
        .expect(200);
      await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'troca@a.com', password: 'outra-senha-forte-123' })
        .expect(200);
    });

    it('rebaixar o papel vale antes do JWT expirar (o guard usa o papel do banco)', async () => {
      await addUser(prisma, id.tenanta, 'prof3@a.com', 'professor');
      const { accessToken } = await login(app, 'empresa-a', 'prof3@a.com');
      await http()
        .post('/v1/courses')
        .set(bearer(accessToken))
        .send({ title: 'Antes' })
        .expect(201);
      const u = await prisma.user.findFirstOrThrow({ where: { email: 'prof3@a.com' } });
      await http()
        .patch(`/v1/users/${u.id}`)
        .set(bearer(tok.admina))
        .send({ role: 'aluno' })
        .expect(200);
      await http()
        .post('/v1/courses')
        .set(bearer(accessToken))
        .send({ title: 'Depois' })
        .expect(403);
    });

    it('empresa suspensa derruba os JWTs dos seus usuários (assim que o cache de estado vence)', async () => {
      await prisma.tenant.update({ where: { id: id.tenanta }, data: { status: 'suspended' } });
      await redis().del(`au:${id.alunoa}`); // simula o fim do TTL de 20 s
      await http().get('/v1/me').set(bearer(tok.alunoa)).expect(401);
      await prisma.tenant.update({ where: { id: id.tenanta }, data: { status: 'active' } });
      await redis().del(`au:${id.alunoa}`);
      await http().get('/v1/me').set(bearer(tok.alunoa)).expect(200);
    });
  });

  describe('relatórios (1.7, 1.8)', () => {
    it('lista de matrículas é paginada com total', async () => {
      for (let i = 0; i < 5; i++) {
        const u = await addUser(prisma, id.tenanta, `pg${i}@a.com`, 'aluno', `Pg ${i}`);
        await prisma.enrollment.create({
          data: { tenantId: id.tenanta, courseId: id.course, userId: u.id },
        });
      }
      const p1 = await http()
        .get(`/v1/courses/${id.course}/enrollments?limit=2&page=1`)
        .set(bearer(tok.professora))
        .expect(200);
      const p2 = await http()
        .get(`/v1/courses/${id.course}/enrollments?limit=2&page=2`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(p1.body).toMatchObject({ page: 1, limit: 2 });
      expect(p1.body.total).toBeGreaterThanOrEqual(6);
      expect(p1.body.data).toHaveLength(2);
      expect(p2.body.data).toHaveLength(2);
      const ids = [...p1.body.data, ...p2.body.data].map((e: { id: string }) => e.id);
      expect(new Set(ids).size).toBe(4); // páginas diferentes, sem repetir
      await http()
        .get(`/v1/courses/${id.course}/enrollments?limit=101`)
        .set(bearer(tok.professora))
        .expect(400); // teto de página
    });

    it('relatórios só contam alunos com matrícula vigente (professor e matrícula revogada ficam de fora)', async () => {
      const now = new Date();
      const mk = (userId: string, watchedS: number) =>
        prisma.watchSession.create({
          data: {
            id: randomUUID(),
            tenantId: id.tenanta,
            userId,
            lessonId: id.lesson,
            startedAt: now,
            lastSeenAt: now,
            watchedS,
          },
        });
      await mk(id.alunoa, 40);
      await mk(id.professora, 500); // pré-visualização do professor: não é audiência

      const lesson = await http()
        .get(`/v1/analytics/lessons/${id.lesson}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(lesson.body.uniqueViewers).toBe(1);
      expect(lesson.body.watchedS).toBe(40);

      const before = await http()
        .get(`/v1/analytics/courses/${id.course}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(before.body.truncated).toBe(false);
      const enrolledBefore = before.body.enrolledStudents;

      await prisma.enrollment.updateMany({
        where: { userId: id.alunoa },
        data: { revokedAt: new Date() },
      });
      const after = await http()
        .get(`/v1/analytics/courses/${id.course}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(after.body.enrolledStudents).toBe(enrolledBefore - 1);

      // o aluno com matrícula revogada também some da visão "do aluno"
      const mine = await http()
        .get('/v1/analytics/students/me')
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(mine.body.coursesEnrolled).toBe(0);
      await prisma.enrollment.updateMany({
        where: { userId: id.alunoa },
        data: { revokedAt: null },
      });
    });

    it('inactive aceita limit e avisa quando cortou', async () => {
      const res = await http()
        .get(`/v1/analytics/courses/${id.course}/inactive?days=1&limit=1`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(res.body.students).toHaveLength(1);
      expect(res.body.count).toBeGreaterThan(1);
      expect(res.body.truncated).toBe(true);
    });
  });

  describe('LGPD (1.14)', () => {
    async function noPasswordStudent(email: string, externalId: string) {
      const u = await prisma.user.create({
        data: {
          tenantId: id.tenanta,
          email,
          name: 'Sem Senha',
          role: 'aluno',
          externalId,
          passwordHash: '!sem-login:abc',
        },
      });
      await prisma.enrollment.create({
        data: {
          tenantId: id.tenanta,
          courseId: id.course,
          userId: u.id,
          externalRef: `ref-${externalId}`,
        },
      });
      await prisma.firstAccessToken.create({
        data: {
          tenantId: id.tenanta,
          userId: u.id,
          tokenHash: `fa-${externalId}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const session = await app.get(AuthService).issueSessionFor({
        id: u.id,
        tenantId: id.tenanta,
        role: 'aluno',
        email,
      });
      return { user: u, token: session.accessToken };
    }

    it('aluno sem senha (sessão de integração) se autoexclui confirmando com o e-mail', async () => {
      const { user, token } = await noPasswordStudent('semsenha@a.com', 'ext-77');
      const del = (body: object) => http().delete('/v1/me').set(bearer(token)).send(body);

      await del({}).expect(400);
      await del({ password: 'qualquer-coisa' }).expect(400); // conta sem senha não confirma por senha
      await del({ confirm: 'outro@a.com' }).expect(400);
      await del({ confirm: ' SemSenha@a.com ' }).expect(204);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.email).toContain('anonimo.invalid');
      expect(row.externalId).toBeNull(); // dado pessoal do sistema de origem
      expect(await prisma.firstAccessToken.count({ where: { userId: user.id } })).toBe(0);
      const enr = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } });
      expect(enr.externalRef).toBeNull();
      // o JWT da sessão morre junto (guard confere o estado da conta)
      await http().get('/v1/me').set(bearer(token)).expect(401);
    });

    it('conta com senha continua exigindo a senha; só o e-mail não basta', async () => {
      await addUser(prisma, id.tenanta, 'lgpd@a.com', 'aluno');
      const { accessToken } = await login(app, 'empresa-a', 'lgpd@a.com');
      await http()
        .delete('/v1/me')
        .set(bearer(accessToken))
        .send({ confirm: 'lgpd@a.com' })
        .expect(400);
      await http()
        .delete('/v1/me')
        .set(bearer(accessToken))
        .send({ password: `${PASSWORD}-errada` })
        .expect(403);
    });

    it('exclusão por admin (anonimizar) também limpa externalId/externalRef/tokens', async () => {
      const { user } = await noPasswordStudent('admin-apaga@a.com', 'ext-78');
      await http().delete(`/v1/users/${user.id}`).set(bearer(tok.admina)).expect(204);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(row.externalId).toBeNull();
      expect(await prisma.firstAccessToken.count({ where: { userId: user.id } })).toBe(0);
      expect(
        (await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } })).externalRef,
      ).toBeNull();
    });
  });

  describe('CORS por empresa (1.9)', () => {
    let cors: INestApplication;

    beforeAll(async () => {
      const mod = await overrides(Test.createTestingModule({ imports: [AppModule] })).compile();
      cors = mod.createNestApplication();
      configureApp(cors, { CORS_ORIGINS: ['https://painel.nosso.com'], TRUST_PROXY: 1 });
      await cors.init();
    });
    afterAll(async () => {
      await cors.close();
    });

    const preflight = (origin: string) =>
      request(cors.getHttpServer())
        .options('/v1/courses')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET');

    it('libera origens fixas e os domínios cadastrados nas empresas ativas', async () => {
      expect(
        (await preflight('https://painel.nosso.com')).headers['access-control-allow-origin'],
      ).toBe('https://painel.nosso.com');
      expect(
        (await preflight('https://app.empresa-a.com')).headers['access-control-allow-origin'],
      ).toBe('https://app.empresa-a.com');
    });

    it('origem desconhecida não recebe o cabeçalho CORS', async () => {
      const res = await preflight('https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

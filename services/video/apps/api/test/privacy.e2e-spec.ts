import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { REDIS } from '../src/redis/redis.module';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, PASSWORD, resetDb } from './helpers';

describe('privacidade / LGPD (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  /** Cria um aluno matriculado com progresso, trechos, sessão e anotação. */
  async function student(email: string, name: string) {
    const u = await addUser(prisma, id.tenanta, email, 'aluno', name);
    await prisma.enrollment.create({
      data: { tenantId: id.tenanta, courseId: id.course, userId: u.id },
    });
    await prisma.lessonProgress.create({
      data: {
        tenantId: id.tenanta,
        userId: u.id,
        lessonId: id.lesson,
        lastPos: 40,
        maxPos: 40,
        percent: 40,
      },
    });
    await prisma.watchRange.create({
      data: { tenantId: id.tenanta, userId: u.id, lessonId: id.lesson, fromS: 0, toS: 40 },
    });
    await prisma.watchSession.create({
      data: {
        id: randomUUID(),
        tenantId: id.tenanta,
        userId: u.id,
        lessonId: id.lesson,
        watchedS: 40,
        device: 'web',
        ratesS: { '1': 40 },
        qualitiesS: { '720p': 40 },
      },
    });
    await prisma.note.create({
      data: {
        tenantId: id.tenanta,
        userId: u.id,
        lessonId: id.lesson,
        atS: 12,
        text: 'meu segredo de estudo',
      },
    });
    return u;
  }

  const counts = (userId: string) =>
    Promise.all([
      prisma.watchSession.count({ where: { userId } }),
      prisma.watchRange.count({ where: { userId } }),
      prisma.lessonProgress.count({ where: { userId } }),
      prisma.note.count({ where: { userId } }),
      prisma.enrollment.count({ where: { userId } }),
    ]);

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(new FakeStorage())
        .overrideProvider(TranscodeQueue)
        .useValue(new FakeQueue()),
    );
    await resetDb(prisma);
    const a = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    const b = await prisma.tenant.create({ data: { slug: 'empresa-b', name: 'B' } });
    id.tenanta = a.id;
    for (const [t, slug] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      for (const role of ['admin', 'professor'] as const) {
        id[`${role}${slug}`] = (await addUser(prisma, t.id, `${role}@${slug}.com`, role)).id;
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso', status: 'published', ownerId: id.professora },
    });
    id.course = course.id;
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M' },
    });
    id.lesson = (
      await prisma.lesson.create({
        data: { tenantId: a.id, moduleId: mod.id, title: 'Aula 1', status: 'published' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('exportação dos dados', () => {
    it('o titular recebe tudo que existe sobre ele, sem senha nem tokens', async () => {
      const u = await student('ana@a.com', 'Ana Souza');
      const t = (await login(app, 'empresa-a', 'ana@a.com')).accessToken;
      const res = await http().get('/v1/me/data-export').set(bearer(t)).expect(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body.user).toMatchObject({
        id: u.id,
        name: 'Ana Souza',
        email: 'ana@a.com',
        role: 'aluno',
      });
      expect(res.body.enrollments).toEqual([{ courseId: id.course, courseTitle: 'Curso' }]);
      expect(res.body.progress[0]).toMatchObject({
        lessonTitle: 'Aula 1',
        percent: 40,
        lastPos: 40,
      });
      expect(res.body.watchedRanges).toEqual([{ lessonId: id.lesson, fromS: 0, toS: 40 }]);
      expect(res.body.sessions[0]).toMatchObject({
        watchedS: 40,
        device: 'web',
        secondsByRate: { '1': 40 },
      });
      expect(res.body.notes[0]).toMatchObject({ text: 'meu segredo de estudo', atS: 12 });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/passwordHash|\$argon2|refreshToken|tokenHash/);
    });

    it('admin exporta os dados de um usuário da empresa; outros papéis e outra empresa não', async () => {
      const u = await student('bia@a.com', 'Bia');
      const mine = (await login(app, 'empresa-a', 'bia@a.com')).accessToken;
      await http().get(`/v1/users/${u.id}/data-export`).set(bearer(tok.admina)).expect(200);
      await http().get(`/v1/users/${u.id}/data-export`).set(bearer(mine)).expect(403);
      await http().get(`/v1/users/${u.id}/data-export`).set(bearer(tok.professora)).expect(403);
      await http().get(`/v1/users/${u.id}/data-export`).set(bearer(tok.adminb)).expect(404);
    });
  });

  describe('anonimização (padrão)', () => {
    it('autoexclusão exige a senha; depois não há login nem renovação e a identidade some', async () => {
      const u = await student('carla@a.com', 'Carla Dias');
      const { accessToken, refreshToken } = await login(app, 'empresa-a', 'carla@a.com');

      await http()
        .delete('/v1/me')
        .set(bearer(accessToken))
        .send({ password: 'errada-errada' })
        .expect(403);
      await http().delete('/v1/me').set(bearer(accessToken)).send({}).expect(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt).toBeNull();

      await http()
        .delete('/v1/me')
        .set(bearer(accessToken))
        .send({ password: PASSWORD })
        .expect(204);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.name).toBe('Usuário removido');
      expect(row.email).toBe(`removido-${u.id}@anonimo.invalid`);
      expect(row.deletedAt).not.toBeNull();
      expect(row.passwordHash.startsWith('$argon2')).toBe(false);
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'carla@a.com', password: PASSWORD })
        .expect(401);
      await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
      await http().get('/v1/me').set(bearer(accessToken)).expect(401);
    });

    it('apaga anotações e logins, mas mantém o histórico sem identificação (estatísticas intactas)', async () => {
      const u = await student('davi@a.com', 'Davi');
      await http().delete(`/v1/users/${u.id}`).set(bearer(tok.admina)).expect(204);
      const [sessions, ranges, progress, notes] = await counts(u.id);
      expect([sessions, ranges, progress]).toEqual([1, 1, 1]); // pseudonimizado
      expect(notes).toBe(0); // conteúdo pessoal é removido
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).name).toBe(
        'Usuário removido',
      );
    });

    it('o e-mail original fica livre para um novo cadastro', async () => {
      const u = await student('edu@a.com', 'Edu');
      await http().delete(`/v1/users/${u.id}`).set(bearer(tok.admina)).expect(204);
      await http()
        .post('/v1/users')
        .set(bearer(tok.admina))
        .send({ email: 'edu@a.com', name: 'Edu Novo', password: 'senha-forte-1', role: 'aluno' })
        .expect(201);
    });

    it('corta as sessões de reprodução abertas', async () => {
      const u = await student('fabi@a.com', 'Fabi');
      const redis = app.get<Redis>(REDIS);
      await redis.zadd(`ps:${u.id}`, Date.now() + 60_000, 'sessao-aberta');
      await http().delete(`/v1/users/${u.id}`).set(bearer(tok.admina)).expect(204);
      expect(await redis.exists(`ps:${u.id}`)).toBe(0);
    });
  });

  describe('exclusão total (?mode=erase)', () => {
    it('remove também sessões, trechos, progresso, anotações e matrículas', async () => {
      const u = await student('gui@a.com', 'Gui');
      expect(await counts(u.id)).toEqual([1, 1, 1, 1, 1]);
      await http().delete(`/v1/users/${u.id}?mode=erase`).set(bearer(tok.admina)).expect(204);
      expect(await counts(u.id)).toEqual([0, 0, 0, 0, 0]);
      expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    });

    it('valida o modo', async () => {
      const u = await student('hugo@a.com', 'Hugo');
      await http().delete(`/v1/users/${u.id}?mode=apagar-tudo`).set(bearer(tok.admina)).expect(400);
    });
  });

  describe('travas e permissões', () => {
    it('não remove quem é dono de curso nem o último administrador', async () => {
      await http().delete(`/v1/users/${id.professora}`).set(bearer(tok.admina)).expect(409);
      // um único admin na empresa B: outro admin tenta apagá-lo (precisaria ter 2) e ele mesmo tenta sair
      await http()
        .delete('/v1/me')
        .set(bearer(tok.adminb))
        .send({ password: PASSWORD })
        .expect(409);
      await http().delete(`/v1/users/${id.admina}`).set(bearer(tok.admina)).expect(409); // pela rota de admin: use /me
    });

    it('admin pode remover outro admin quando há mais de um', async () => {
      const second = await addUser(prisma, id.tenanta, 'admin2@a.com', 'admin');
      await http().delete(`/v1/users/${second.id}`).set(bearer(tok.admina)).expect(204);
    });

    it('só admin usa a rota de remoção; outra empresa recebe 404; sem login 401', async () => {
      const u = await student('iris@a.com', 'Iris');
      const mine = (await login(app, 'empresa-a', 'iris@a.com')).accessToken;
      await http().delete(`/v1/users/${u.id}`).set(bearer(mine)).expect(403);
      await http().delete(`/v1/users/${u.id}`).set(bearer(tok.professora)).expect(403);
      await http().delete(`/v1/users/${u.id}`).set(bearer(tok.adminb)).expect(404);
      await http().delete(`/v1/users/${u.id}`).expect(401);
      expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
    });
  });
});

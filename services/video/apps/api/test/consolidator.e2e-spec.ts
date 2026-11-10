import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { ConsolidatorModule } from '../src/consolidator.module';
import { ProgressConsolidator } from '../src/progress/progress.consolidator';
import { EVENTS_KEY } from '../src/progress/progress.events';
import { REDIS } from '../src/redis/redis.module';
import { addUser, resetDb } from './helpers';

const hbEvent = (o: Record<string, unknown>) =>
  JSON.stringify({ type: 'hb', rate: 1, from: -1, to: -1, ...o });

/**
 * O processo dedicado (consolidator.main) usa só o ConsolidatorModule. Aqui provamos que ele sobe
 * sem a API (sem HTTP, sem autenticação) e grava no banco o que a API enfileirou no Redis.
 */
describe('módulo do consolidador dedicado (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  const id: Record<string, string> = {};

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [ConsolidatorModule] }).compile();
    app = mod.createNestApplication();
    await app.init();

    await resetDb(prisma);
    const t = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    id.tenant = t.id;
    id.user = (await addUser(prisma, t.id, 'aluno@a.com', 'aluno')).id;
    const prof = await addUser(prisma, t.id, 'prof@a.com', 'professor');
    const course = await prisma.course.create({
      data: { tenantId: t.id, title: 'C', status: 'published', ownerId: prof.id },
    });
    const mod1 = await prisma.module.create({
      data: { tenantId: t.id, courseId: course.id, title: 'M' },
    });
    id.lesson = (
      await prisma.lesson.create({
        data: { tenantId: t.id, moduleId: mod1.id, title: 'A', status: 'published' },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('resolve o consolidador e grava no banco o que está na fila do Redis', async () => {
    const redis = app.get<Redis>(REDIS);
    await redis.del(EVENTS_KEY);
    const base = { tid: id.tenant, uid: id.user, lid: id.lesson, sid: 'sessao-dedicada', dur: 60 };
    const t0 = Date.now();
    await redis.rpush(
      EVENTS_KEY,
      hbEvent({ ...base, pos: 0, ts: t0 }),
      hbEvent({ ...base, pos: 10, ts: t0 + 10_000, from: 0, to: 10, q: '720p', dev: 'web' }),
      hbEvent({ ...base, pos: 25, ts: t0 + 25_000, from: 10, to: 25, q: '720p', dev: 'web' }),
    );

    await app.get(ProgressConsolidator).flush();

    expect(await redis.llen(EVENTS_KEY)).toBe(0);
    const ranges = await prisma.watchRange.findMany({ where: { userId: id.user } });
    expect(ranges.map((r) => [r.fromS, r.toS])).toEqual([[0, 25]]);
    const p = await prisma.lessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId: id.user, lessonId: id.lesson } },
    });
    expect(p).toMatchObject({ lastPos: 25, maxPos: 25, tenantId: id.tenant });
    expect(Math.round(p.percent)).toBe(42); // 25 / 60
    const s = await prisma.watchSession.findUniqueOrThrow({ where: { id: 'sessao-dedicada' } });
    expect(s).toMatchObject({ watchedS: 25, device: 'web', tenantId: id.tenant });
    expect(s.qualitiesS).toEqual({ '720p': 25 });
  });

  it('um evento de aula removida não trava os demais (vai para o descarte, o resto é gravado)', async () => {
    const redis = app.get<Redis>(REDIS);
    const ghost = '99999999-9999-4999-8999-999999999999';
    const t0 = Date.now();
    const ok = { tid: id.tenant, uid: id.user, lid: id.lesson, sid: 'sessao-dedicada', dur: 60 };
    await redis.rpush(
      EVENTS_KEY,
      hbEvent({
        tid: id.tenant,
        uid: id.user,
        lid: ghost,
        sid: 'fantasma',
        dur: 10,
        pos: 5,
        ts: t0,
        from: 0,
        to: 5,
      }),
      hbEvent({ ...ok, pos: 40, ts: t0 + 1000, from: 25, to: 40 }),
    );
    await expect(app.get(ProgressConsolidator).flush()).resolves.toBeUndefined();
    expect(await redis.llen(EVENTS_KEY)).toBe(0);
    const ranges = await prisma.watchRange.findMany({
      where: { userId: id.user, lessonId: id.lesson },
    });
    expect(ranges.map((r) => [r.fromS, r.toS])).toEqual([[0, 40]]);
  });
});

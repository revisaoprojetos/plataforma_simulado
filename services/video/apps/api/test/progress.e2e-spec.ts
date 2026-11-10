import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { PlaybackClaims, PlaybackTokenService } from '../src/playback/playback-token.service';
import { HeartbeatService } from '../src/progress/heartbeat.service';
import { ProgressConsolidator } from '../src/progress/progress.consolidator';
import { EVENTS_KEY } from '../src/progress/progress.events';
import { REDIS } from '../src/redis/redis.module';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const T0 = 1_700_000_000_000; // relógio fictício dos heartbeats
const sec = (n: number) => T0 + n * 1000;

describe('progresso (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  const hbs = () => app.get(HeartbeatService);
  const flush = () => app.get(ProgressConsolidator).flush();

  /** Abre uma sessão de reprodução pela API e devolve os claims do token. */
  async function open(token: string, lesson = id.lesson1) {
    const res = await http()
      .post(`/v1/lessons/${lesson}/playback`)
      .set(bearer(token))
      .send({})
      .expect(200);
    const claims = await app.get(PlaybackTokenService).verify(res.body.playbackToken);
    return {
      claims,
      token: res.body.playbackToken as string,
      sessionId: res.body.sessionId as string,
    };
  }

  const beat = (
    c: PlaybackClaims,
    seq: number,
    pos: number,
    atSec: number,
    rate = 1,
    device?: string,
  ) => hbs().record(c, { seq, position: pos, rate, device }, sec(atSec));

  const progressOf = async (token: string, lesson = id.lesson1, q = '') =>
    (await http().get(`/v1/lessons/${lesson}/progress${q}`).set(bearer(token)).expect(200)).body;

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
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role);
        id[`${role}${slug}`] = u.id;
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    const aluno2 = await addUser(prisma, a.id, 'aluno2@a.com', 'aluno');
    id.aluno2 = aluno2.id;
    tok.aluno2 = (await login(app, 'empresa-a', 'aluno2@a.com')).accessToken;
    const prof2 = await addUser(prisma, a.id, 'prof2@a.com', 'professor');
    tok.prof2 = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;
    id.prof2 = prof2.id;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    id.course = course.id;
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M1' },
    });
    for (const uid of [id.alunoa, id.aluno2]) {
      await prisma.enrollment.create({
        data: { tenantId: a.id, courseId: course.id, userId: uid },
      });
    }
    for (const [key, title, position] of [
      ['lesson1', 'Aula 1', 1],
      ['lesson2', 'Aula 2', 2],
    ] as const) {
      const v = await prisma.video.create({
        data: {
          tenantId: a.id,
          status: 'ready',
          sourceKey: 'x',
          originalName: `${key}.mp4`,
          contentType: 'video/mp4',
          sizeBytes: BigInt(1),
          durationS: 100,
          renditions: [{ name: '240p' }],
        },
      });
      const l = await prisma.lesson.create({
        data: {
          tenantId: a.id,
          moduleId: mod.id,
          title,
          position,
          status: 'published',
          videoId: v.id,
        },
      });
      id[key] = l.id;
    }
  });

  beforeEach(async () => {
    await prisma.watchRange.deleteMany();
    await prisma.lessonProgress.deleteMany();
    await prisma.watchSession.deleteMany();
  });

  afterEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = [
      ...(await redis.keys('ps:*')),
      ...(await redis.keys('hb:*')),
      ...(await redis.keys('pm:*')),
      EVENTS_KEY,
    ];
    await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('regras de trecho assistido', () => {
    it('trecho contínuo conta; pulo para frente não conta e começa novo trecho', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 0, 0);
      await beat(claims, 2, 10, 10);
      await beat(claims, 3, 20, 20);
      await beat(claims, 4, 80, 30); // seek de 60 s em 10 s reais → não conta
      await beat(claims, 5, 90, 40);
      await flush();

      const p = await progressOf(tok.alunoa);
      expect(p.ranges).toEqual([
        [0, 20],
        [80, 90],
      ]);
      expect(p).toMatchObject({ percent: 30, lastPos: 90, maxPos: 90, completedAt: null });
    });

    it('heartbeat duplicado ou fora de ordem é ignorado (idempotente)', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 0, 0);
      await beat(claims, 2, 10, 10);
      await beat(claims, 3, 20, 20);
      expect(await beat(claims, 3, 20, 25)).toBe(0); // repetido
      expect(await beat(claims, 2, 99, 26)).toBe(0); // atrasado
      await flush();
      const p = await progressOf(tok.alunoa);
      expect(p.ranges).toEqual([[0, 20]]);
      expect(p.lastPos).toBe(20);
    });

    it('velocidade 2× conta o dobro; avançar mais do que a velocidade permite não conta', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 0, 0, 2);
      await beat(claims, 2, 20, 10, 2); // 20 s de vídeo em 10 s reais a 2× → legítimo
      await beat(claims, 3, 50, 20, 1); // +30 s em 10 s a 1× (teto 22 s) → pulo
      await flush();
      expect((await progressOf(tok.alunoa)).ranges).toEqual([[0, 20]]);
    });

    it('pausa e retrocesso não geram trecho; só o relógio do servidor vale', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 30, 0);
      await beat(claims, 2, 30, 10); // pausado
      await beat(claims, 3, 10, 20); // voltou
      expect(await beat(claims, 4, 15, 20.2)).toBe(3); // rápido demais (< 500 ms)
      await beat(claims, 5, 25, 150); // lacuna de 130 s → não dá para afirmar que assistiu
      await flush();
      const p = await progressOf(tok.alunoa);
      expect(p.ranges).toEqual([]);
      expect(p.maxPos).toBe(30);
    });

    it('chegar ao fim pulando não conclui a aula', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 0, 0);
      await beat(claims, 2, 100, 10);
      await flush();
      expect(await progressOf(tok.alunoa)).toMatchObject({
        percent: 0,
        completedAt: null,
        maxPos: 100,
      });
    });

    it('conclui com 90% de cobertura e nunca desfaz a conclusão', async () => {
      const { claims } = await open(tok.alunoa);
      for (let i = 0; i <= 9; i++) await beat(claims, i + 1, i * 10, i * 10);
      await flush();
      const done = await progressOf(tok.alunoa);
      expect(done.percent).toBe(90);
      expect(done.completedAt).not.toBeNull();

      await beat(claims, 20, 5, 200); // volta ao começo para rever
      await flush();
      expect((await progressOf(tok.alunoa)).completedAt).toEqual(done.completedAt);
    });

    it('duas telas (sessões) do mesmo aluno: os trechos se unem sem contar duas vezes', async () => {
      const s1 = await open(tok.alunoa);
      const s2 = await open(tok.alunoa);
      for (const [i, pos] of [0, 10, 20, 30].entries()) await beat(s1.claims, i + 1, pos, i * 10);
      for (const [i, pos] of [20, 30, 40, 50, 60].entries())
        await beat(s2.claims, i + 1, pos, i * 10);
      await flush();
      const p = await progressOf(tok.alunoa);
      expect(p.ranges).toEqual([[0, 60]]);
      expect(p.percent).toBe(60);
    });

    it('leitura padrão é eventualmente consistente; ?consistent=1 (player) esvazia a fila antes (1.6)', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 0, 0);
      await beat(claims, 2, 10, 10);

      // sem flush: o progresso ainda não foi gravado e a leitura NÃO força a gravação
      expect((await progressOf(tok.alunoa)).ranges).toEqual([]);
      // o player pede leitura consistente para retomar do ponto certo
      expect((await progressOf(tok.alunoa, id.lesson1, '?consistent=1')).ranges).toEqual([[0, 10]]);
      // e depois disso a leitura comum já enxerga
      expect((await progressOf(tok.alunoa)).ranges).toEqual([[0, 10]]);
    });

    it('posição além da duração é limitada à duração', async () => {
      const { claims } = await open(tok.alunoa);
      await beat(claims, 1, 90, 0);
      await beat(claims, 2, 5000, 10);
      await flush();
      expect((await progressOf(tok.alunoa)).maxPos).toBe(100);
    });
  });

  describe('sessões e histórico', () => {
    it('registra a visualização: quando, quanto, em que velocidade e onde', async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0, 1, 'web');
      await beat(s.claims, 2, 10, 10, 1, 'web');
      await beat(s.claims, 3, 30, 20, 2, 'web'); // +20 s a 2×
      await http().post('/v1/playback/end').set(bearer(s.token)).expect(204);
      await flush(); // as leituras não esvaziam mais a fila (consistência eventual, 1.6)

      const hist = (await http().get('/v1/me/history').set(bearer(tok.alunoa)).expect(200)).body;
      expect(hist.total).toBe(1);
      const row = hist.data[0];
      expect(row).toMatchObject({
        sessionId: s.sessionId,
        lessonId: id.lesson1,
        lessonTitle: 'Aula 1',
        courseTitle: 'Curso A',
        watchedS: 30,
        device: 'web',
      });
      expect(new Date(row.startedAt).getTime()).toBe(sec(0));
      expect(row.endedAt).not.toBeNull();
      expect(row.avgRate).toBeCloseTo((10 * 1 + 20 * 2) / 30, 5);
    });

    it('guarda os segundos assistidos por velocidade e por qualidade (base dos analytics)', async () => {
      const s = await open(tok.alunoa);
      const at = (seq: number, pos: number, atSec: number, rate: number, quality: string) =>
        hbs().record(s.claims, { seq, position: pos, rate, quality }, sec(atSec));
      await at(1, 0, 0, 1, '720p');
      await at(2, 10, 10, 1, '720p'); // 10 s a 1× em 720p
      await at(3, 30, 20, 2, '480p'); // 20 s a 2× em 480p
      await at(4, 38, 28, 1, '480p'); // 8 s a 1× em 480p
      await flush();
      await at(5, 48, 38, 1, '720p'); // outro ciclo: soma ao que já existe
      await flush();
      const row = await prisma.watchSession.findUniqueOrThrow({ where: { id: s.sessionId } });
      expect(row.ratesS).toEqual({ '1': 28, '2': 20 });
      expect(row.qualitiesS).toEqual({ '720p': 20, '480p': 28 });
      expect(row.watchedS).toBe(48);
    });

    it('acumula entre ciclos de consolidação', async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await flush();
      await beat(s.claims, 3, 20, 20);
      await beat(s.claims, 4, 30, 30);
      await flush();
      const row = (await http().get('/v1/me/history').set(bearer(tok.alunoa))).body.data[0];
      expect(row.watchedS).toBe(30);
      expect((await progressOf(tok.alunoa)).ranges).toEqual([[0, 30]]);
    });

    it('sessão abandonada (sem "end") é fechada no último sinal de vida', async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await flush();
      (app.get(ProgressConsolidator) as unknown as { lastSweep: number }).lastSweep = 0;
      await flush();
      const row = await prisma.watchSession.findUniqueOrThrow({ where: { id: s.sessionId } });
      expect(row.endedAt?.getTime()).toBe(sec(10));
    });

    it('histórico é só do próprio usuário', async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await flush();
      expect((await http().get('/v1/me/history').set(bearer(tok.aluno2))).body.total).toBe(0);
      expect((await http().get('/v1/me/history').set(bearer(tok.adminb))).body.total).toBe(0);
    });
  });

  describe('continuar assistindo, retomada e curso', () => {
    it('lista aulas em andamento, retoma de onde parou e some quando conclui', async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await beat(s.claims, 3, 20, 20);
      await flush();

      const cw = (await http().get('/v1/me/continue-watching').set(bearer(tok.alunoa)).expect(200))
        .body;
      expect(cw).toHaveLength(1);
      expect(cw[0]).toMatchObject({
        lessonId: id.lesson1,
        lessonTitle: 'Aula 1',
        courseTitle: 'Curso A',
        lastPos: 20,
      });

      const again = await http()
        .post(`/v1/lessons/${id.lesson1}/playback`)
        .set(bearer(tok.alunoa))
        .send({});
      expect(again.body.resumeAt).toBe(20);
      await http().post('/v1/playback/end').set(bearer(again.body.playbackToken));

      for (let i = 3; i <= 10; i++) await beat(s.claims, i + 1, i * 10, i * 10); // até 100
      await flush();
      expect(
        (await http().get('/v1/me/continue-watching').set(bearer(tok.alunoa))).body,
      ).toHaveLength(0);

      const finished = await http()
        .post(`/v1/lessons/${id.lesson1}/playback`)
        .set(bearer(tok.alunoa))
        .send({});
      expect(finished.body.resumeAt).toBe(0); // terminou: recomeça do início
    });

    it('progresso do curso: aulas concluídas / publicadas', async () => {
      const s = await open(tok.alunoa);
      for (let i = 0; i <= 9; i++) await beat(s.claims, i + 1, i * 10, i * 10);
      await flush();
      const c = (
        await http().get(`/v1/courses/${id.course}/progress`).set(bearer(tok.alunoa)).expect(200)
      ).body;
      expect(c).toMatchObject({ totalLessons: 2, completedLessons: 1, percent: 50 });
      expect(
        c.lessons.map((l: { title: string; completed: boolean }) => [l.title, l.completed]),
      ).toEqual([
        ['Aula 1', true],
        ['Aula 2', false],
      ]);
      const me = (await http().get('/v1/me/courses').set(bearer(tok.alunoa)).expect(200)).body;
      expect(me[0]).toMatchObject({ completedLessons: 1, progressPercent: 50 });
    });
  });

  describe('heartbeat HTTP', () => {
    const post = (t: string | null, body: object) => {
      const r = http().post('/v1/progress/heartbeat');
      if (t) r.set(bearer(t));
      return r.send(body);
    };

    it('aceita com token de playback, rejeita sem token ou com JWT de acesso', async () => {
      const s = await open(tok.alunoa);
      await post(s.token, { seq: 1, position: 5, rate: 1 }).expect(204);
      await post(null, { seq: 2, position: 6, rate: 1 }).expect(401);
      await post(tok.alunoa, { seq: 2, position: 6, rate: 1 }).expect(401);
      await http()
        .post(`/v1/progress/heartbeat?t=${encodeURIComponent(s.token)}`)
        .send({ seq: 3, position: 7, rate: 1 })
        .expect(204);
    });

    it('valida o corpo', async () => {
      const s = await open(tok.alunoa);
      await post(s.token, { position: 5, rate: 1 }).expect(400); // sem seq
      await post(s.token, { seq: 1, position: -1, rate: 1 }).expect(400);
      await post(s.token, { seq: 1, position: 5, rate: 10 }).expect(400);
      await post(s.token, { seq: 1, position: 5, rate: 0 }).expect(400);
      await post(s.token, { seq: 1.5, position: 5, rate: 1 }).expect(400);
    });

    it('sessão encerrada não registra mais (e o beacon de saída funciona só com ?t=)', async () => {
      const s = await open(tok.alunoa);
      await post(s.token, { seq: 1, position: 5, rate: 1 }).expect(204);
      await http()
        .post(`/v1/playback/end?t=${encodeURIComponent(s.token)}`)
        .expect(204); // sendBeacon
      await post(s.token, { seq: 2, position: 15, rate: 1 }).expect(401);
    });
  });

  describe('leitura: permissões e isolamento', () => {
    beforeEach(async () => {
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await flush();
    });

    it('aluno vê só o próprio; dono do curso e admin veem um aluno', async () => {
      await http()
        .get(`/v1/lessons/${id.lesson1}/progress?userId=${id.alunoa}`)
        .set(bearer(tok.aluno2))
        .expect(403);
      const own = await progressOf(tok.aluno2);
      expect(own.ranges).toEqual([]); // o progresso do aluno2 é outro

      const byProf = await progressOf(tok.professora, id.lesson1, `?userId=${id.alunoa}`);
      expect(byProf).toMatchObject({ userId: id.alunoa, ranges: [[0, 10]] });
      const byAdmin = await progressOf(tok.admina, id.lesson1, `?userId=${id.alunoa}`);
      expect(byAdmin.ranges).toEqual([[0, 10]]);
      const course = await http()
        .get(`/v1/courses/${id.course}/progress?userId=${id.alunoa}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(course.body.userId).toBe(id.alunoa);
    });

    it('professor que não é dono do curso não vê o progresso do aluno', async () => {
      await http()
        .get(`/v1/lessons/${id.lesson1}/progress?userId=${id.alunoa}`)
        .set(bearer(tok.prof2))
        .expect(403);
      await http()
        .get(`/v1/courses/${id.course}/progress?userId=${id.alunoa}`)
        .set(bearer(tok.prof2))
        .expect(403);
    });

    it('outra empresa: 404 para aula, curso e usuário', async () => {
      await http().get(`/v1/lessons/${id.lesson1}/progress`).set(bearer(tok.adminb)).expect(404);
      await http().get(`/v1/courses/${id.course}/progress`).set(bearer(tok.adminb)).expect(404);
      // admin da A consultando um usuário que não existe na A
      await http()
        .get(`/v1/lessons/${id.lesson1}/progress?userId=${id.alunob}`)
        .set(bearer(tok.admina))
        .expect(404);
    });

    it('todo registro gravado carrega o tenant da aula', async () => {
      const [ranges, progress, sessions] = await Promise.all([
        prisma.watchRange.findMany(),
        prisma.lessonProgress.findMany(),
        prisma.watchSession.findMany(),
      ]);
      expect(ranges.length + progress.length + sessions.length).toBeGreaterThan(0);
      for (const row of [...ranges, ...progress, ...sessions])
        expect(row.tenantId).toBe(id.tenanta);
    });
  });

  describe('robustez da consolidação', () => {
    it('descarta evento de aula inexistente sem travar a fila', async () => {
      const redis = app.get<Redis>(REDIS);
      const ghost = '99999999-9999-4999-8999-999999999999';
      await redis.rpush(
        EVENTS_KEY,
        JSON.stringify({
          type: 'hb',
          tid: id.tenanta,
          uid: id.alunoa,
          lid: ghost,
          sid: ghost,
          dur: 10,
          pos: 5,
          rate: 1,
          ts: sec(0),
          from: 0,
          to: 5,
        }),
      );
      const s = await open(tok.alunoa);
      await beat(s.claims, 1, 0, 0);
      await beat(s.claims, 2, 10, 10);
      await expect(flush()).resolves.toBeUndefined();
      expect(await redis.llen(EVENTS_KEY)).toBe(0);
      expect((await progressOf(tok.alunoa)).ranges).toEqual([[0, 10]]); // o evento bom foi gravado
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PlaybackTokenService } from '../src/playback/playback-token.service';
import { HeartbeatService } from '../src/progress/heartbeat.service';
import { ProgressConsolidator } from '../src/progress/progress.consolidator';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('analytics (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  const d1 = daysAgo(1);
  const d2 = daysAgo(2);
  const d40 = daysAgo(40);

  /** Cria uma sessão de visualização já consolidada. */
  async function session(
    key: string,
    user: string,
    lesson: string,
    startedAt: Date,
    watchedS: number,
    extra: { device?: string; rates?: object; qualities?: object } = {},
  ) {
    await prisma.watchSession.create({
      data: {
        id: randomUUID(),
        tenantId: id.tenanta,
        userId: id[user],
        lessonId: id[lesson],
        startedAt,
        lastSeenAt: startedAt,
        endedAt: startedAt,
        watchedS,
        device: extra.device ?? 'web',
        avgRate: 1,
        ratesS: extra.rates ?? { '1': watchedS },
        qualitiesS: extra.qualities ?? { '720p': watchedS },
      },
    });
    return key;
  }

  async function progress(user: string, lesson: string, percent: number, completed: boolean) {
    await prisma.lessonProgress.create({
      data: {
        tenantId: id.tenanta,
        userId: id[user],
        lessonId: id[lesson],
        percent,
        lastPos: percent,
        maxPos: percent,
        completedAt: completed ? daysAgo(1) : null,
      },
    });
  }

  const range = (user: string, lesson: string, from: number, to: number) =>
    prisma.watchRange.create({
      data: { tenantId: id.tenanta, userId: id[user], lessonId: id[lesson], fromS: from, toS: to },
    });

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
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role, `${role} ${slug}`);
        id[`${role}${slug}`] = u.id;
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    id.prof2 = (await addUser(prisma, a.id, 'prof2@a.com', 'professor')).id;
    tok.prof2 = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;

    // alunos s1..s7 da empresa A (s1 e s2 fazem login)
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      id[`s${n}`] = (await addUser(prisma, a.id, `s${n}@a.com`, 'aluno', `Aluno ${n}`)).id;
    }
    tok.s1 = (await login(app, 'empresa-a', 's1@a.com')).accessToken;
    tok.s2 = (await login(app, 'empresa-a', 's2@a.com')).accessToken;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    id.course = course.id;
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'Módulo 1', position: 1 },
    });
    const mkLesson = async (
      key: string,
      title: string,
      position: number,
      status: 'published' | 'draft',
      dur?: number,
    ) => {
      const video = dur
        ? await prisma.video.create({
            data: {
              tenantId: a.id,
              status: 'ready',
              sourceKey: 'x',
              originalName: `${key}.mp4`,
              contentType: 'video/mp4',
              sizeBytes: BigInt(1),
              durationS: dur,
              renditions: [{ name: '240p' }],
            },
          })
        : null;
      id[key] = (
        await prisma.lesson.create({
          data: { tenantId: a.id, moduleId: mod.id, title, position, status, videoId: video?.id },
        })
      ).id;
    };
    await mkLesson('l1', 'Aula 1', 1, 'published', 100);
    await mkLesson('l2', 'Aula 2', 2, 'published', 60);
    await mkLesson('ld', 'Rascunho', 3, 'draft');

    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      await prisma.enrollment.create({
        data: { tenantId: a.id, courseId: course.id, userId: id[`s${n}`] },
      });
    }

    // ---- Aula 1 (100 s) ----
    await session('s1', 's1', 'l1', d2, 100, { rates: { '1': 100 }, qualities: { '720p': 100 } });
    await session('s2', 's2', 'l1', d1, 50, { rates: { '1.5': 50 }, qualities: { '480p': 50 } });
    await session('s3a', 's3', 'l1', d1, 20, {
      device: 'mobile',
      rates: { '2': 20 },
      qualities: { '480p': 20 },
    });
    await session('s3b', 's3', 'l1', d1, 10, {
      device: 'mobile',
      rates: { '1': 10 },
      qualities: { '480p': 10 },
    });
    await session('s4', 's4', 'l1', d1, 3); // abaixo de 5 s: não conta como visualização
    await session('s5', 's5', 'l1', d1, 30, { rates: { '1': 30 }, qualities: { '720p': 30 } });
    await range('s1', 'l1', 0, 100);
    await range('s2', 'l1', 0, 50);
    await range('s3', 'l1', 0, 30);
    await range('s5', 'l1', 0, 30);
    await range('s4', 'l1', 0, 3);
    await progress('s1', 'l1', 100, true);
    await progress('s2', 'l1', 50, false);
    await progress('s3', 'l1', 30, false);
    await progress('s5', 'l1', 30, false);
    await progress('s4', 'l1', 3, false);

    // ---- Aula 2 (60 s) ----
    await session('s1b', 's1', 'l2', d2, 60);
    await session('s2b', 's2', 'l2', d1, 57);
    await session('s7', 's7', 'l2', d40, 40); // há 40 dias: fora do período padrão e inativo
    await range('s1', 'l2', 0, 60);
    await range('s2', 'l2', 0, 57);
    await range('s7', 'l2', 0, 40);
    await progress('s1', 'l2', 100, true);
    await progress('s2', 'l2', 95, true);
    await progress('s7', 'l2', 66.6667, false);

    // ---- Empresa B: dados que NÃO podem aparecer nos números da A ----
    const cb = await prisma.course.create({
      data: { tenantId: b.id, title: 'Curso B', status: 'published', ownerId: id.professorb },
    });
    const mb = await prisma.module.create({
      data: { tenantId: b.id, courseId: cb.id, title: 'M' },
    });
    const lb = await prisma.lesson.create({
      data: { tenantId: b.id, moduleId: mb.id, title: 'Aula B', status: 'published' },
    });
    id.lessonB = lb.id;
    id.courseB = cb.id;
    await prisma.watchSession.create({
      data: {
        id: randomUUID(),
        tenantId: b.id,
        userId: id.alunob,
        lessonId: lb.id,
        watchedS: 999,
        startedAt: d1,
        lastSeenAt: d1,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('aula', () => {
    it('visualizações, únicos, tempo e conclusão (período padrão = 30 dias)', async () => {
      const res = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(res.body).toMatchObject({
        title: 'Aula 1',
        durationS: 100,
        views: 5, // s4 (3 s) não conta
        uniqueViewers: 4,
        watchedS: 210,
        avgWatchedPerViewerS: 52.5,
        enrolledStudents: 7,
        startedStudents: 5,
        notStartedStudents: 2,
        completions: 1,
        completionRate: 0.2,
        avgPercentWatched: 42.6,
      });
    });

    it('série diária preenchida com zeros nos dias sem acesso', async () => {
      const { body } = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body.daily.length).toBeGreaterThanOrEqual(30);
      const byDay = Object.fromEntries(body.daily.map((d: { day: string }) => [d.day, d]));
      expect(byDay[day(d2)]).toMatchObject({ views: 1, uniqueViewers: 1, watchedS: 100 });
      expect(byDay[day(d1)]).toMatchObject({ views: 4, uniqueViewers: 3, watchedS: 110 });
      const zeros = body.daily.filter((d: { views: number }) => d.views === 0);
      expect(zeros.length).toBe(body.daily.length - 2);
    });

    it('curva de retenção a cada 5 s e pontos de abandono', async () => {
      const { body } = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      const viewers = body.retention.points.map((p: { viewers: number }) => p.viewers);
      expect(body.retention.bucketSeconds).toBe(5);
      expect(viewers).toEqual([5, 4, 4, 4, 4, 4, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(body.retention.points[3]).toEqual({ bucketS: 15, viewers: 4 });
      expect(body.dropoffs).toEqual([
        { atS: 30, fromViewers: 4, toViewers: 2, lostViewers: 2 },
        { atS: 5, fromViewers: 5, toViewers: 4, lostViewers: 1 },
        { atS: 50, fromViewers: 2, toViewers: 1, lostViewers: 1 },
      ]);
    });

    it('velocidade, qualidade e dispositivo mais usados, com percentuais', async () => {
      const { body } = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body.playbackRates).toEqual([
        { rate: 1, watchedS: 140, percent: 66.7 },
        { rate: 1.5, watchedS: 50, percent: 23.8 },
        { rate: 2, watchedS: 20, percent: 9.5 },
      ]);
      expect(body.qualities).toEqual([
        { quality: '720p', watchedS: 130, percent: 61.9 },
        { quality: '480p', watchedS: 80, percent: 38.1 },
      ]);
      expect(body.devices).toEqual([
        { device: 'web', sessions: 3, watchedS: 180, percent: 85.7 },
        { device: 'mobile', sessions: 2, watchedS: 30, percent: 14.3 },
      ]);
    });

    it('o período filtra as sessões (e só elas)', async () => {
      const from = daysAgo(1.5).toISOString();
      const { body } = await http()
        .get(`/v1/analytics/lessons/${id.l1}?from=${from}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body).toMatchObject({ views: 4, uniqueViewers: 3, watchedS: 110, completions: 1 });
      expect(body.retention.points[19].viewers).toBe(1); // retenção é do histórico inteiro
      const old = await http()
        .get(
          `/v1/analytics/lessons/${id.l2}?from=${daysAgo(60).toISOString()}&to=${day(daysAgo(30))}`,
        )
        .set(bearer(tok.professora))
        .expect(200);
      expect(old.body).toMatchObject({ views: 1, uniqueViewers: 1, watchedS: 40 }); // só o s7, de 40 dias atrás
    });

    it('aula sem vídeo devolve zeros, sem erro', async () => {
      const { body } = await http()
        .get(`/v1/analytics/lessons/${id.ld}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body).toMatchObject({
        durationS: null,
        views: 0,
        uniqueViewers: 0,
        completionRate: 0,
      });
      expect(body.retention.points).toEqual([]);
      expect(body.dropoffs).toEqual([]);
    });

    it('valida o período', async () => {
      const get = (q: string) =>
        http().get(`/v1/analytics/lessons/${id.l1}?${q}`).set(bearer(tok.professora));
      await get('from=ontem').expect(400);
      await get('from=2026-10-10&to=2026-10-01').expect(400);
      await get('from=2020-01-01&to=2026-01-01').expect(400);
    });
  });

  describe('curso', () => {
    it('engajamento, ranking de aulas e destaques', async () => {
      const { body } = await http()
        .get(`/v1/analytics/courses/${id.course}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body).toMatchObject({
        title: 'Curso A',
        enrolledStudents: 7,
        activeStudents: 4,
        totalWatchedS: 327,
        avgProgressPercent: 21.4, // (100% + 50%) / 7 alunos; rascunho não entra
        studentsCompleted: 1,
        completionRate: 0.143,
      });
      expect(body.highlights).toEqual({
        lowestCompletion: { lessonId: id.l1, title: 'Aula 1', completionRate: 0.2 },
        mostWatched: { lessonId: id.l1, title: 'Aula 1', watchedS: 210 },
      });
      expect(body.lessons.map((l: { title: string }) => l.title)).toEqual([
        'Aula 1',
        'Aula 2',
        'Rascunho',
      ]);
      expect(body.lessons[0]).toMatchObject({
        views: 5,
        uniqueViewers: 4,
        completions: 1,
        startedStudents: 5,
      });
      expect(body.lessons[1]).toMatchObject({
        views: 2,
        uniqueViewers: 2,
        watchedS: 117,
        startedStudents: 3,
        completions: 2,
        completionRate: 0.667,
        avgPercentWatched: 87.2,
      });
      expect(body.lessons[2]).toMatchObject({ status: 'draft', views: 0 });
    });

    it('alunos inativos: quem nunca começou vem primeiro, depois o mais tempo parado', async () => {
      const { body } = await http()
        .get(`/v1/analytics/courses/${id.course}/inactive?days=14`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(body.count).toBe(2);
      expect(body.students.map((s: { name: string }) => s.name)).toEqual(['Aluno 6', 'Aluno 7']);
      expect(body.students[0]).toMatchObject({
        lastActivityAt: null,
        daysInactive: null,
        completedLessons: 0,
        totalLessons: 2,
      });
      expect(body.students[1]).toMatchObject({ daysInactive: 40, email: 's7@a.com' });

      const wide = await http()
        .get(`/v1/analytics/courses/${id.course}/inactive?days=60`)
        .set(bearer(tok.professora));
      expect(wide.body.students.map((s: { name: string }) => s.name)).toEqual(['Aluno 6']);
      await http()
        .get(`/v1/analytics/courses/${id.course}/inactive?days=0`)
        .set(bearer(tok.professora))
        .expect(400);
      await http()
        .get(`/v1/analytics/courses/${id.course}/inactive?days=999`)
        .set(bearer(tok.professora))
        .expect(400);
    });
  });

  describe('aluno', () => {
    it('o aluno vê o próprio resumo por "me" ou pelo id', async () => {
      const me = await http().get('/v1/analytics/students/me').set(bearer(tok.s1)).expect(200);
      expect(me.body).toMatchObject({
        name: 'Aluno 1',
        coursesEnrolled: 1,
        lessonsCompleted: 2,
        totalWatchedS: 160,
      });
      expect(me.body.courses[0]).toMatchObject({
        title: 'Curso A',
        totalLessons: 2,
        completedLessons: 2,
        progressPercent: 100,
        watchedS: 160,
      });
      expect(new Date(me.body.lastActivityAt).getTime()).toBeCloseTo(d2.getTime(), -3);
      const byId = await http()
        .get(`/v1/analytics/students/${id.s1}`)
        .set(bearer(tok.s1))
        .expect(200);
      expect(byId.body.userId).toBe(id.s1);
    });

    it('aluno não vê outro aluno; professor dono e admin veem', async () => {
      await http().get(`/v1/analytics/students/${id.s2}`).set(bearer(tok.s1)).expect(403);
      const prof = await http()
        .get(`/v1/analytics/students/${id.s2}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(prof.body).toMatchObject({ name: 'Aluno 2', lessonsCompleted: 1 });
      await http().get(`/v1/analytics/students/${id.s2}`).set(bearer(tok.admina)).expect(200);
    });

    it('professor sem curso em comum com o aluno recebe 404; id inválido 400', async () => {
      await http().get(`/v1/analytics/students/${id.s2}`).set(bearer(tok.prof2)).expect(404);
      await http().get('/v1/analytics/students/xyz').set(bearer(tok.admina)).expect(400);
      await http()
        .get(`/v1/analytics/students/${randomUUID()}`)
        .set(bearer(tok.admina))
        .expect(404);
    });
  });

  describe('permissões e isolamento entre empresas', () => {
    it('aluno e professor que não é dono não acessam analytics de aula/curso', async () => {
      for (const path of [
        `lessons/${id.l1}`,
        `courses/${id.course}`,
        `courses/${id.course}/inactive`,
      ]) {
        await http().get(`/v1/analytics/${path}`).set(bearer(tok.s1)).expect(403);
        await http().get(`/v1/analytics/${path}`).set(bearer(tok.prof2)).expect(403);
        await http().get(`/v1/analytics/${path}`).set(bearer(tok.admina)).expect(200);
        await http().get(`/v1/analytics/${path}`).expect(401);
      }
    });

    it('empresa B nunca vê a A (404) e seus próprios dados não vazam para a A', async () => {
      for (const path of [
        `lessons/${id.l1}`,
        `courses/${id.course}`,
        `courses/${id.course}/inactive`,
        `students/${id.s1}`,
      ]) {
        await http().get(`/v1/analytics/${path}`).set(bearer(tok.adminb)).expect(404);
      }
      await http().get(`/v1/analytics/lessons/${id.lessonB}`).set(bearer(tok.admina)).expect(404);
      await http().get(`/v1/analytics/courses/${id.courseB}`).set(bearer(tok.admina)).expect(404);

      // a sessão de 999 s da empresa B não entra em nenhum total da A
      const a = await http().get(`/v1/analytics/courses/${id.course}`).set(bearer(tok.admina));
      expect(a.body.totalWatchedS).toBe(327);
      const b = await http()
        .get(`/v1/analytics/lessons/${id.lessonB}`)
        .set(bearer(tok.adminb))
        .expect(200);
      expect(b.body).toMatchObject({ views: 1, watchedS: 999, enrolledStudents: 0 });
    });
  });

  describe('exportação CSV', () => {
    it('retenção da aula: BOM, cabeçalho e uma linha por trecho de 5 s', async () => {
      const res = await http()
        .get(`/v1/analytics/lessons/${id.l1}/export.csv`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="aula-[0-9a-f]{8}-retencao\.csv"$/,
      );
      expect(res.headers['cache-control']).toBe('no-store');
      const lines = res.text.split('\r\n').filter(Boolean);
      expect(lines[0].replace('﻿', '')).toBe('inicio_s,fim_s,alunos,percentual_do_pico');
      expect(lines).toHaveLength(21);
      expect(lines[1]).toBe('0,5,5,100');
      expect(lines[7]).toBe('30,35,2,40');
    });

    it('delimitador ";" para Excel em português', async () => {
      const res = await http()
        .get(`/v1/analytics/lessons/${id.l1}/export.csv?delimiter=;`)
        .set(bearer(tok.professora));
      expect(res.text.split('\r\n')[1]).toBe('0;5;5;100');
      await http()
        .get(`/v1/analytics/lessons/${id.l1}/export.csv?delimiter=x`)
        .set(bearer(tok.professora))
        .expect(400);
    });

    it('ranking de aulas do curso', async () => {
      const res = await http()
        .get(`/v1/analytics/courses/${id.course}/export.csv`)
        .set(bearer(tok.professora))
        .expect(200);
      const lines = res.text.split('\r\n').filter(Boolean);
      expect(lines[0].replace('﻿', '')).toContain('modulo,aula,situacao,visualizacoes');
      expect(lines[1]).toBe('Módulo 1,Aula 1,published,5,4,210,5,1,0.2,42.6');
    });

    it('alunos inativos: nomes com fórmula são neutralizados', async () => {
      const evil = await addUser(
        prisma,
        id.tenanta,
        'evil@a.com',
        'aluno',
        '=HYPERLINK("http://x","clique")',
      );
      await prisma.enrollment.create({
        data: { tenantId: id.tenanta, courseId: id.course, userId: evil.id },
      });
      const res = await http()
        .get(`/v1/analytics/courses/${id.course}/inactive/export.csv`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(res.text).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`);
      expect(res.text).not.toMatch(/(^|\r\n)=HYPERLINK/);
    });

    it('exportação segue as mesmas permissões', async () => {
      for (const p of [
        `lessons/${id.l1}`,
        `courses/${id.course}`,
        `courses/${id.course}/inactive`,
      ]) {
        await http().get(`/v1/analytics/${p}/export.csv`).set(bearer(tok.s1)).expect(403);
        await http().get(`/v1/analytics/${p}/export.csv`).set(bearer(tok.adminb)).expect(404);
      }
    });
  });

  describe('atualidade dos dados', () => {
    it('relatórios são eventualmente consistentes: só incluem heartbeats depois do consolidador (1.6)', async () => {
      const pb = await http()
        .post(`/v1/lessons/${id.l1}/playback`)
        .set(bearer(tok.s1))
        .send({})
        .expect(200);
      const claims = await app.get(PlaybackTokenService).verify(pb.body.playbackToken);
      const t0 = Date.now();
      const beat = (seq: number, pos: number, ms: number) =>
        app
          .get(HeartbeatService)
          .record(claims, { seq, position: pos, rate: 1.5, quality: '480p' }, t0 + ms);
      await beat(1, 0, 0);
      await beat(2, 4, 3000);
      await beat(3, 8, 6000); // 8 s a 1,5× em 480p; nada foi consolidado manualmente

      const stale = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(stale.body.views).toBe(5); // a leitura NÃO esvazia a fila: ainda não aparece

      await app.get(ProgressConsolidator).flush(); // o ciclo do consolidador (a cada ~5 s)
      const res = await http()
        .get(`/v1/analytics/lessons/${id.l1}`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(res.body.views).toBe(6); // as 5 de antes + esta sessão
      expect(res.body.playbackRates).toContainEqual(
        expect.objectContaining({ rate: 1.5, watchedS: 58 }),
      ); // 50 + 8
      expect(res.body.qualities).toContainEqual(
        expect.objectContaining({ quality: '480p', watchedS: 88 }),
      ); // 80 + 8
      await http().post('/v1/playback/end').set(bearer(pb.body.playbackToken));
    });
  });
});

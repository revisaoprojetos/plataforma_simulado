import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { REDIS } from '../src/redis/redis.module';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const VTT = [
  'WEBVTT',
  '',
  '00:00:01.000 --> 00:00:04.000',
  'Bem-vindos à aula de Direito Administrativo.',
  '',
  '00:00:04.000 --> 00:00:08.000',
  'Hoje vamos falar sobre princípios.',
  '',
  '00:00:08.000 --> 00:00:12.000',
  'O princípio da legalidade é fundamental.',
  '',
].join('\n');

describe('conteúdo da aula: legendas, transcrição, capítulos e anotações (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const storage = new FakeStorage();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  const upload = (lesson: string, token: string, body: object) =>
    http().post(`/v1/lessons/${lesson}/subtitles`).set(bearer(token)).send(body);

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(storage)
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
    const prof2 = await addUser(prisma, a.id, 'prof2@a.com', 'professor');
    tok.prof2 = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;
    id.prof2 = prof2.id;
    const outro = await addUser(prisma, a.id, 'outro@a.com', 'aluno');
    tok.outro = (await login(app, 'empresa-a', 'outro@a.com')).accessToken;
    id.outro = outro.id;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M' },
    });
    await prisma.enrollment.create({
      data: { tenantId: a.id, courseId: course.id, userId: id.alunoa },
    });
    await prisma.enrollment.create({
      data: { tenantId: a.id, courseId: course.id, userId: id.outro },
    });

    const video = await prisma.video.create({
      data: {
        tenantId: a.id,
        status: 'ready',
        sourceKey: 'x',
        originalName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: BigInt(1),
        durationS: 60,
        renditions: [{ name: '240p' }],
      },
    });
    const lesson = await prisma.lesson.create({
      data: {
        tenantId: a.id,
        moduleId: mod.id,
        title: 'Aula',
        status: 'published',
        videoId: video.id,
      },
    });
    id.lesson = lesson.id;
    id.video = video.id;
    const noVideo = await prisma.lesson.create({
      data: { tenantId: a.id, moduleId: mod.id, title: 'Sem vídeo', status: 'published' },
    });
    id.noVideo = noVideo.id;
  });

  afterEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('ps:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('legendas e transcrição', () => {
    it('professor dono envia o .vtt: guarda no S3 da empresa e cria a transcrição', async () => {
      const res = await upload(id.lesson, tok.professora, { lang: 'pt-BR', content: VTT }).expect(
        201,
      );
      expect(res.body).toEqual({ lang: 'pt-BR', cues: 3 });
      expect(
        storage.objects.get(`tenants/${id.tenanta}/subtitles/${id.lesson}/pt-BR.vtt`)?.toString(),
      ).toBe(VTT);
      expect(
        await prisma.transcriptSegment.count({ where: { videoId: id.video, lang: 'pt-BR' } }),
      ).toBe(3);
    });

    it('reenviar o mesmo idioma substitui a transcrição (sem duplicar)', async () => {
      await upload(id.lesson, tok.professora, { lang: 'pt-BR', content: VTT }).expect(201);
      expect(
        await prisma.transcriptSegment.count({ where: { videoId: id.video, lang: 'pt-BR' } }),
      ).toBe(3);
      expect(await prisma.subtitle.count({ where: { lessonId: id.lesson } })).toBe(1);
    });

    it('nega: aluno, professor não-dono, outra empresa; e valida o conteúdo', async () => {
      await upload(id.lesson, tok.alunoa, { lang: 'en', content: VTT }).expect(403);
      await upload(id.lesson, tok.prof2, { lang: 'en', content: VTT }).expect(403);
      await upload(id.lesson, tok.adminb, { lang: 'en', content: VTT }).expect(404);
      await upload(id.lesson, tok.professora, { lang: 'português', content: VTT }).expect(400);
      await upload(id.lesson, tok.professora, {
        lang: 'en',
        content: 'isto não é webvtt, é só texto',
      }).expect(400);
      await upload(id.lesson, tok.professora, {
        lang: 'en',
        content: 'WEBVTT\n\nNOTE só comentário, sem falas',
      }).expect(400);
      await upload(id.noVideo, tok.professora, { lang: 'en', content: VTT }).expect(409);
    });

    it('aceita legenda grande (acima do limite padrão de 100 kb do Express)', async () => {
      const cues = Array.from({ length: 4000 }, (_, i) => {
        const t = (n: number) => {
          const hh = String(Math.floor(n / 3600)).padStart(2, '0');
          const mm = String(Math.floor((n % 3600) / 60)).padStart(2, '0');
          const ss = String(n % 60).padStart(2, '0');
          return `${hh}:${mm}:${ss}.000`;
        };
        const start = i * 2;
        return `${t(start)} --> ${t(start + 2)}
Fala número ${i} com algum texto para ocupar espaço`;
      });
      const big = `WEBVTT\n\n${cues.join('\n\n')}\n`;
      expect(big.length).toBeGreaterThan(200_000);
      const res = await upload(id.lesson, tok.professora, { lang: 'es', content: big }).expect(201);
      expect(res.body.cues).toBe(4000);
      await http()
        .delete(`/v1/lessons/${id.lesson}/subtitles/es`)
        .set(bearer(tok.professora))
        .expect(204);
    });

    it('lista idiomas e devolve a transcrição para quem pode ver a aula', async () => {
      await upload(id.lesson, tok.professora, {
        lang: 'en',
        content: 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello class',
      }).expect(201);

      const list = await http()
        .get(`/v1/lessons/${id.lesson}/subtitles`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(list.body).toEqual([{ lang: 'en' }, { lang: 'pt-BR' }]);

      const t = await http()
        .get(`/v1/lessons/${id.lesson}/transcript`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(t.body.lang).toBe('en'); // primeiro idioma por ordem alfabética
      const pt = await http()
        .get(`/v1/lessons/${id.lesson}/transcript?lang=pt-BR`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(pt.body.languages).toEqual(['en', 'pt-BR']);
      expect(pt.body.segments).toEqual([
        { startS: 1, endS: 4, text: 'Bem-vindos à aula de Direito Administrativo.' },
        { startS: 4, endS: 8, text: 'Hoje vamos falar sobre princípios.' },
        { startS: 8, endS: 12, text: 'O princípio da legalidade é fundamental.' },
      ]);
    });

    it('busca por texto (sem diferenciar maiúsculas) e por janela de tempo', async () => {
      const q = await http()
        .get(`/v1/lessons/${id.lesson}/transcript?lang=pt-BR&q=LEGALIDADE`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(q.body.segments.map((s: { startS: number }) => s.startS)).toEqual([8]);
      const w = await http()
        .get(`/v1/lessons/${id.lesson}/transcript?lang=pt-BR&from=3&to=5`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(w.body.segments.map((s: { startS: number }) => s.startS)).toEqual([1, 4]); // 1–4 e 4–8 tocam a janela
      const none = await http()
        .get(`/v1/lessons/${id.lesson}/transcript?lang=pt-BR&q=inexistente`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(none.body.segments).toEqual([]);
      const noLang = await http()
        .get(`/v1/lessons/${id.lesson}/transcript?lang=fr`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(noLang.body.segments).toEqual([]);
    });

    it('quem não está matriculado não lê legendas nem transcrição; outra empresa = 404', async () => {
      const stranger = await addUser(prisma, id.tenanta, 'estranho@a.com', 'aluno');
      const t = (await login(app, 'empresa-a', 'estranho@a.com')).accessToken;
      expect(stranger.id).toBeDefined();
      await http().get(`/v1/lessons/${id.lesson}/transcript`).set(bearer(t)).expect(403);
      await http().get(`/v1/lessons/${id.lesson}/subtitles`).set(bearer(t)).expect(403);
      await http().get(`/v1/lessons/${id.lesson}/transcript`).set(bearer(tok.adminb)).expect(404);
    });

    it('remover a legenda apaga arquivo, registro e transcrição', async () => {
      await upload(id.lesson, tok.professora, {
        lang: 'it',
        content: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nCiao',
      }).expect(201);
      await http()
        .delete(`/v1/lessons/${id.lesson}/subtitles/it`)
        .set(bearer(tok.alunoa))
        .expect(403);
      await http()
        .delete(`/v1/lessons/${id.lesson}/subtitles/it`)
        .set(bearer(tok.professora))
        .expect(204);
      await http()
        .delete(`/v1/lessons/${id.lesson}/subtitles/it`)
        .set(bearer(tok.professora))
        .expect(404);
      expect(storage.deleted).toContain(`tenants/${id.tenanta}/subtitles/${id.lesson}/it.vtt`);
      expect(
        await prisma.transcriptSegment.count({ where: { videoId: id.video, lang: 'it' } }),
      ).toBe(0);
    });
  });

  describe('entrega da legenda e capítulos no playback', () => {
    it('o playback traz legendas (URL com token) e capítulos; o .vtt só abre com o token da aula', async () => {
      await http()
        .put(`/v1/lessons/${id.lesson}/chapters`)
        .set(bearer(tok.professora))
        .send({
          chapters: [
            { startS: 30, title: 'Conclusão' },
            { startS: 0, title: 'Introdução' },
          ],
        })
        .expect(200);

      const pb = (
        await http()
          .post(`/v1/lessons/${id.lesson}/playback`)
          .set(bearer(tok.alunoa))
          .send({})
          .expect(200)
      ).body;
      expect(pb.chapters).toEqual([
        { startS: 0, title: 'Introdução' },
        { startS: 30, title: 'Conclusão' },
      ]);
      expect(pb.subtitles.map((s: { lang: string }) => s.lang)).toEqual(['en', 'pt-BR']);
      expect(pb.subtitles[1].url).toMatch(
        new RegExp(`^/v1/hls/${id.video}/subtitles/pt-BR\\.vtt\\?t=`),
      );

      const vtt = await http().get(pb.subtitles[1].url).expect(200);
      expect(vtt.headers['content-type']).toContain('text/vtt');
      expect(vtt.text).toBe(VTT);

      // sem token, idioma inexistente ou nome estranho
      await http().get(`/v1/hls/${id.video}/subtitles/pt-BR.vtt`).expect(401);
      const t = encodeURIComponent(pb.playbackToken);
      await http().get(`/v1/hls/${id.video}/subtitles/fr.vtt?t=${t}`).expect(404);
      await http().get(`/v1/hls/${id.video}/subtitles/..%2F..%2Fx.vtt?t=${t}`).expect(404);
      await http().get(`/v1/hls/${id.video}/subtitles/pt-BR.txt?t=${t}`).expect(404);
      await http().post('/v1/playback/end').set(bearer(pb.playbackToken));
    });
  });

  describe('capítulos', () => {
    it('lê para quem vê a aula; só quem gerencia altera; valida duplicados e limites', async () => {
      const got = await http()
        .get(`/v1/lessons/${id.lesson}/chapters`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(got.body).toHaveLength(2);

      const put = (token: string, chapters: object[]) =>
        http().put(`/v1/lessons/${id.lesson}/chapters`).set(bearer(token)).send({ chapters });
      await put(tok.alunoa, []).expect(403);
      await put(tok.prof2, []).expect(403);
      await put(tok.adminb, []).expect(404);
      await put(tok.professora, [
        { startS: 5, title: 'A' },
        { startS: 5, title: 'B' },
      ]).expect(422);
      await put(tok.professora, [{ startS: 61, title: 'Depois do fim' }]).expect(422);
      await put(tok.professora, [{ startS: -1, title: 'Negativo' }]).expect(400);
      await put(tok.professora, [{ startS: 1, title: '' }]).expect(400);

      await put(tok.professora, [{ startS: 10, title: 'Único' }]).expect(200);
      const after = await http().get(`/v1/lessons/${id.lesson}/chapters`).set(bearer(tok.alunoa));
      expect(after.body).toEqual([{ startS: 10, title: 'Único' }]); // substituiu a lista
    });
  });

  describe('anotações', () => {
    it('CRUD do próprio usuário, ordenado pelo instante', async () => {
      const mk = (atS: number, text: string) =>
        http().post(`/v1/lessons/${id.lesson}/notes`).set(bearer(tok.alunoa)).send({ atS, text });
      const n2 = (await mk(30, 'Segunda').expect(201)).body;
      await mk(5.5, 'Primeira').expect(201);

      const list = await http()
        .get(`/v1/lessons/${id.lesson}/notes`)
        .set(bearer(tok.alunoa))
        .expect(200);
      expect(list.body.map((n: { text: string }) => n.text)).toEqual(['Primeira', 'Segunda']);

      const upd = await http()
        .patch(`/v1/notes/${n2.id}`)
        .set(bearer(tok.alunoa))
        .send({ text: 'Editada', atS: 12 })
        .expect(200);
      expect(upd.body).toMatchObject({ text: 'Editada', atS: 12 });
      await http().delete(`/v1/notes/${n2.id}`).set(bearer(tok.alunoa)).expect(204);
      await http().delete(`/v1/notes/${n2.id}`).set(bearer(tok.alunoa)).expect(404);
    });

    it('anotações são privadas: outro aluno, o professor e outra empresa não as veem nem alteram', async () => {
      const note = (
        await http()
          .post(`/v1/lessons/${id.lesson}/notes`)
          .set(bearer(tok.alunoa))
          .send({ atS: 3, text: 'Só minha' })
          .expect(201)
      ).body;
      expect(
        (await http().get(`/v1/lessons/${id.lesson}/notes`).set(bearer(tok.outro)).expect(200))
          .body,
      ).toEqual([]);
      expect(
        (await http().get(`/v1/lessons/${id.lesson}/notes`).set(bearer(tok.professora)).expect(200))
          .body,
      ).toEqual([]);
      for (const t of [tok.outro, tok.professora, tok.admina, tok.adminb]) {
        await http().patch(`/v1/notes/${note.id}`).set(bearer(t)).send({ text: 'x' }).expect(404);
        await http().delete(`/v1/notes/${note.id}`).set(bearer(t)).expect(404);
      }
      expect((await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).text).toBe(
        'Só minha',
      );
      expect((await prisma.note.findUniqueOrThrow({ where: { id: note.id } })).tenantId).toBe(
        id.tenanta,
      );
    });

    it('valida texto e instante; exige acesso à aula', async () => {
      const post = (token: string, body: object, lesson = id.lesson) =>
        http().post(`/v1/lessons/${lesson}/notes`).set(bearer(token)).send(body);
      await post(tok.alunoa, { atS: 3, text: '   ' }).expect(400);
      await post(tok.alunoa, { atS: -1, text: 'x' }).expect(400);
      await post(tok.alunoa, { atS: 3, text: 'x'.repeat(2001) }).expect(400);
      await post(tok.alunoa, { atS: 61, text: 'depois do fim' }).expect(422);

      const stranger = await addUser(prisma, id.tenanta, 'estranho2@a.com', 'aluno');
      const t = (await login(app, 'empresa-a', 'estranho2@a.com')).accessToken;
      expect(stranger.id).toBeDefined();
      await post(t, { atS: 3, text: 'x' }).expect(403);
      await post(tok.adminb, { atS: 3, text: 'x' }).expect(404);
      await http().get(`/v1/lessons/${id.lesson}/notes`).set(bearer(t)).expect(403);
    });
  });
});

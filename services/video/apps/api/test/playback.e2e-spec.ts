import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import request from 'supertest';
import { PlaybackTokenService } from '../src/playback/playback-token.service';
import { REDIS } from '../src/redis/redis.module';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const ORIGIN = 'https://app.empresa-a.com';

const MASTER =
  '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=510400,RESOLUTION=426x240\n240p/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=985600,RESOLUTION=640x360\n360p/index.m3u8\n';
const variant = (n: number) =>
  [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="__KEY_URI__",IV=0x0aff96147f137cf7a4672d0e79fe8385',
    ...Array.from(
      { length: n },
      (_, i) => `#EXTINF:6.000000,\nseg_${String(i).padStart(5, '0')}.ts`,
    ),
    '#EXT-X-ENDLIST',
    '',
  ].join('\n');

describe('playback seguro (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const storage = new FakeStorage();
  const http = () => request(app.getHttpServer());

  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  let vid: string; // vídeo pronto da aula 1

  const play = (
    lesson: string,
    token: string,
    origin: string | null = ORIGIN,
    body: object = {},
  ) => {
    const r = http().post(`/v1/lessons/${lesson}/playback`).set(bearer(token));
    if (origin) r.set('Origin', origin);
    return r.send(body);
  };

  /** Playback do aluno A com origem válida; devolve o corpo. */
  async function open(token = tok.alunoa, body: object = {}) {
    return (await play(id.lesson1, token, ORIGIN, body).expect(200)).body as {
      sessionId: string;
      playbackToken: string;
      manifestUrl: string;
      spriteVttUrl: string;
    };
  }

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(TranscodeQueue)
        .useValue(new FakeQueue()),
    );
    await resetDb(prisma);

    const a = await prisma.tenant.create({
      data: { slug: 'empresa-a', name: 'A', allowedDomains: ['app.empresa-a.com'] },
    });
    const b = await prisma.tenant.create({ data: { slug: 'empresa-b', name: 'B' } });
    id.tenanta = a.id;
    for (const [t, slug] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role, `Nome ${role}`);
        id[`${role}${slug}`] = u.id;
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    const other = await addUser(prisma, a.id, 'fora@a.com', 'aluno');
    id.fora = other.id;
    tok.fora = (await login(app, 'empresa-a', 'fora@a.com')).accessToken;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    id.course = course.id;
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M' },
    });
    await prisma.enrollment.create({
      data: { tenantId: a.id, courseId: course.id, userId: id.alunoa },
    });

    const mkLesson = async (
      title: string,
      status: 'draft' | 'published',
      videoStatus?: 'ready' | 'queued',
    ) => {
      let videoId: string | undefined;
      if (videoStatus) {
        const v = await prisma.video.create({
          data: {
            tenantId: a.id,
            status: videoStatus,
            sourceKey: 'x',
            originalName: 'a.mp4',
            contentType: 'video/mp4',
            sizeBytes: BigInt(1),
            durationS: 12,
            renditions: [{ name: '240p' }, { name: '360p' }],
          },
        });
        videoId = v.id;
      }
      return prisma.lesson.create({
        data: { tenantId: a.id, moduleId: mod.id, title, status, videoId },
        include: { video: true },
      });
    };
    const l1 = await mkLesson('Pronta', 'published', 'ready');
    id.lesson1 = l1.id;
    vid = l1.videoId!;
    id.lessonDraft = (await mkLesson('Rascunho', 'draft', 'ready')).id;
    id.lessonQueued = (await mkLesson('Processando', 'published', 'queued')).id;
    id.lessonNoVideo = (await mkLesson('Sem vídeo', 'published')).id;

    const base = `tenants/${a.id}/videos/${vid}/`;
    await storage.put(`${base}hls/master.m3u8`, MASTER);
    await storage.put(`${base}hls/240p/index.m3u8`, variant(2));
    await storage.put(`${base}hls/360p/index.m3u8`, variant(3));
    await storage.put(`${base}hls/key.bin`, Buffer.alloc(16, 0xab));
    await storage.put(
      `${base}thumbs/sprite.vtt`,
      'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nsprite.jpg#xywh=0,0,160,90\n',
    );

    await app.get<Redis>(REDIS).del(...(await app.get<Redis>(REDIS).keys('ps:*')), 'ps:none');
  });

  // Sessões abertas por um teste que falhou não podem contaminar os seguintes.
  afterEach(async () => {
    const redis = app.get<Redis>(REDIS);
    const keys = await redis.keys('ps:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('emissão', () => {
    it('aluno matriculado recebe token, URLs, marca d’água mascarada e posição de retomada', async () => {
      const res = await play(id.lesson1, tok.alunoa).expect(200);
      expect(res.body).toMatchObject({
        durationS: 12,
        expiresIn: 300,
        resumeAt: 0,
        watermark: { text: 'Nome aluno · a***@a.com' },
      });
      expect(res.body.manifestUrl).toMatch(new RegExp(`^/v1/hls/${vid}/master\\.m3u8\\?t=`));
      expect(res.body.spriteVttUrl).toContain(`/v1/hls/${vid}/sprite.vtt?t=`);
      expect(res.body.posterUrl).toContain(`tenants/${id.tenanta}/videos/${vid}/thumbs/poster.jpg`);
      expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      await http().post('/v1/playback/end').set(bearer(res.body.playbackToken)).expect(204);
    });

    it('retoma da última posição salva', async () => {
      await prisma.lessonProgress.create({
        data: { tenantId: id.tenanta, userId: id.alunoa, lessonId: id.lesson1, lastPos: 3.5 },
      });
      const res = await play(id.lesson1, tok.alunoa).expect(200);
      expect(res.body.resumeAt).toBe(3.5);
      await prisma.lessonProgress.deleteMany({});
      await http().post('/v1/playback/end').set(bearer(res.body.playbackToken)).expect(204);
    });

    it('nega: sem login, sem matrícula, rascunho, vídeo não pronto; 404 em outra empresa', async () => {
      await http().post(`/v1/lessons/${id.lesson1}/playback`).set('Origin', ORIGIN).expect(401);
      await play(id.lesson1, tok.fora).expect(403);
      await play(id.lessonDraft, tok.alunoa).expect(403);
      await play(id.lessonQueued, tok.alunoa).expect(409);
      await play(id.lessonNoVideo, tok.alunoa).expect(409);
      await play(id.lesson1, tok.adminb).expect(404);
    });

    it('platform_admin não toca vídeo (rotas de empresa são exclusivas de usuários de empresa)', async () => {
      await addUser(prisma, null, 'plat@x.com', 'platform_admin');
      const t = (await login(app, undefined, 'plat@x.com')).accessToken;
      await play(id.lesson1, t).expect(403);
    });

    it('professor dono e admin da empresa assistem o próprio conteúdo, inclusive rascunho', async () => {
      const prof = await play(id.lessonDraft, tok.professora).expect(200);
      const adm = await play(id.lesson1, tok.admina).expect(200);
      await http().post('/v1/playback/end').set(bearer(prof.body.playbackToken));
      await http().post('/v1/playback/end').set(bearer(adm.body.playbackToken));
    });
  });

  describe('domínios permitidos', () => {
    it('empresa com lista exige Origin válida', async () => {
      await play(id.lesson1, tok.alunoa, null).expect(403); // sem Origin (curl/script)
      await play(id.lesson1, tok.alunoa, 'https://evil.com').expect(403);
      await play(id.lesson1, tok.alunoa, 'https://app.empresa-a.com.evil.com').expect(403);
      const ok = await play(id.lesson1, tok.alunoa, ORIGIN).expect(200);
      await http().post('/v1/playback/end').set(bearer(ok.body.playbackToken));
    });

    it('token só funciona no site para o qual foi emitido', async () => {
      const p = await open();
      await http().get(p.manifestUrl).set('Origin', 'https://evil.com').expect(403);
      await http().get(p.manifestUrl).set('Origin', ORIGIN).expect(200);
      await http().get(p.manifestUrl).expect(200); // player nativo (Safari) não manda Origin
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('empresa sem lista de domínios não restringe (empresa B, inclusive sem Origin)', async () => {
      const t = await prisma.tenant.findUniqueOrThrow({ where: { slug: 'empresa-b' } });
      const course = await prisma.course.create({
        data: { tenantId: t.id, title: 'Curso B', status: 'published', ownerId: id.professorb },
      });
      const mod = await prisma.module.create({
        data: { tenantId: t.id, courseId: course.id, title: 'M' },
      });
      const video = await prisma.video.create({
        data: {
          tenantId: t.id,
          status: 'ready',
          sourceKey: 'x',
          originalName: 'b.mp4',
          contentType: 'video/mp4',
          sizeBytes: BigInt(1),
          durationS: 5,
          renditions: [{ name: '240p' }],
        },
      });
      const lesson = await prisma.lesson.create({
        data: {
          tenantId: t.id,
          moduleId: mod.id,
          title: 'B1',
          status: 'published',
          videoId: video.id,
        },
      });
      await prisma.enrollment.create({
        data: { tenantId: t.id, courseId: course.id, userId: id.alunob },
      });
      const res = await play(lesson.id, tok.alunob, null).expect(200);
      expect(res.body.manifestUrl).toContain(`/v1/hls/${video.id}/`);
      await http().post('/v1/playback/end').set(bearer(res.body.playbackToken));
    });
  });

  describe('entrega HLS', () => {
    it('master reescrito leva o token em cada qualidade', async () => {
      const p = await open();
      const res = await http().get(p.manifestUrl).expect(200);
      expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
      expect(res.headers['cache-control']).toBe('no-store');
      const uris = res.text
        .split('\n')
        .filter((l) => l.endsWith(`?t=${encodeURIComponent(p.playbackToken)}`));
      expect(uris.map((u) => u.split('?')[0])).toEqual(['240p/index.m3u8', '360p/index.m3u8']);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('qualidade: segmentos viram URLs assinadas da empresa e a chave aponta para a API', async () => {
      const p = await open();
      const res = await http()
        .get(`/v1/hls/${vid}/360p/index.m3u8?t=${encodeURIComponent(p.playbackToken)}`)
        .expect(200);
      const prefix = `https://fake.test/get/tenants/${id.tenanta}/videos/${vid}/hls/360p/`;
      for (let i = 0; i < 3; i++) {
        expect(res.text).toContain(`${prefix}seg_0000${i}.ts?ttl=3600&sig=fake`);
      }
      expect(res.text).toContain(
        `URI="/v1/hls/key/${vid}?t=${encodeURIComponent(p.playbackToken)}"`,
      );
      expect(res.text).not.toContain('__KEY_URI__');
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('qualidade inexistente ou com traversal → 404', async () => {
      const p = await open();
      const t = encodeURIComponent(p.playbackToken);
      await http().get(`/v1/hls/${vid}/1080p/index.m3u8?t=${t}`).expect(404);
      await http().get(`/v1/hls/${vid}/..%2F..%2Fother/index.m3u8?t=${t}`).expect(404);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('chave: 16 bytes, nunca cacheável, só com token válido', async () => {
      const p = await open();
      const t = encodeURIComponent(p.playbackToken);
      const res = await http().get(`/v1/hls/key/${vid}?t=${t}`).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(Buffer.from(res.body)).toEqual(Buffer.alloc(16, 0xab));
      await http().get(`/v1/hls/key/${vid}`).expect(401);
      await http().get(`/v1/hls/key/${vid}?t=lixo`).expect(401);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('sprite.vtt aponta para a imagem assinada', async () => {
      const p = await open();
      const res = await http().get(p.spriteVttUrl).expect(200);
      expect(res.headers['content-type']).toContain('text/vtt');
      expect(res.text).toContain(
        `https://fake.test/get/tenants/${id.tenanta}/videos/${vid}/thumbs/sprite.jpg?ttl=3600&sig=fake#xywh=0,0,160,90`,
      );
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('aceita o token também no cabeçalho Authorization (hls.js com xhrSetup)', async () => {
      const p = await open();
      await http().get(`/v1/hls/${vid}/master.m3u8`).set(bearer(p.playbackToken)).expect(200);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });
  });

  describe('tokens', () => {
    it('token de playback não é um token de acesso, e vice-versa', async () => {
      const p = await open();
      await http().get('/v1/courses').set(bearer(p.playbackToken)).expect(401);
      await http().get(`/v1/hls/${vid}/master.m3u8?t=${tok.alunoa}`).expect(401);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('token de outro vídeo na URL → 403; token expirado → 401', async () => {
      const p = await open();
      const other = '11111111-1111-4111-8111-111111111111';
      await http()
        .get(`/v1/hls/${other}/master.m3u8?t=${encodeURIComponent(p.playbackToken)}`)
        .expect(403);

      const short = await app.get(PlaybackTokenService).sign(
        {
          sub: id.alunoa,
          tid: id.tenanta,
          vid,
          lid: id.lesson1,
          sid: p.sessionId,
          dom: 'app.empresa-a.com',
        },
        1,
      );
      await new Promise((r) => setTimeout(r, 1500));
      await http().get(`/v1/hls/${vid}/master.m3u8?t=${short.token}`).expect(401);
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });
  });

  describe('sessões simultâneas', () => {
    it('aluno: 3ª tela é barrada (409); o sessionId do cliente é IGNORADO (1.3); encerrar libera vaga', async () => {
      const s1 = await open();
      const s2 = await open();
      await play(id.lesson1, tok.alunoa).expect(409);

      // mandar o sessionId de uma sessão aberta não "reaproveita" nem fura o limite: o servidor gera outro
      await play(id.lesson1, tok.alunoa, ORIGIN, { sessionId: s1.sessionId }).expect(409);

      await http().post('/v1/playback/end').set(bearer(s2.playbackToken)).expect(204);
      const s3 = await open();
      expect(s3.sessionId).not.toBe(s2.sessionId);

      // sessão encerrada perde o acesso na hora
      await http().get(s2.manifestUrl).expect(401);
      await http().post('/v1/playback/end').set(bearer(s1.playbackToken));
      await http().post('/v1/playback/end').set(bearer(s3.playbackToken));
    });

    it('professor não tem o limite de telas', async () => {
      const opened: string[] = [];
      for (let i = 0; i < 4; i++) {
        opened.push((await play(id.lesson1, tok.professora).expect(200)).body.playbackToken);
      }
      for (const t of opened) await http().post('/v1/playback/end').set(bearer(t));
    });

    it('sessionId alheio não dá acesso a sessão de outro usuário (vagas são por usuário)', async () => {
      const mine = await open();
      // outro aluno matriculado passando o sessionId do primeiro apenas abre a própria sessão
      await prisma.enrollment.create({
        data: { tenantId: id.tenanta, courseId: id.course, userId: id.fora },
      });
      const theirs = await play(id.lesson1, tok.fora, ORIGIN, { sessionId: mine.sessionId }).expect(
        200,
      );
      expect(theirs.body.sessionId).not.toBe(mine.sessionId); // id sempre gerado no servidor
      expect(theirs.body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
      await http().post('/v1/playback/end').set(bearer(theirs.body.playbackToken)).expect(204);
      await http().get(mine.manifestUrl).expect(200); // a sessão do primeiro segue viva
      await prisma.enrollment.deleteMany({ where: { userId: id.fora } });
      await http().post('/v1/playback/end').set(bearer(mine.playbackToken));
    });
  });

  describe('renovação', () => {
    it('renova o token mantendo a sessão e revalida o acesso', async () => {
      const p = await open();
      const renewed = await http()
        .post('/v1/playback/renew')
        .set('Origin', ORIGIN)
        .set(bearer(p.playbackToken))
        .expect(200);
      expect(renewed.body.sessionId).toBe(p.sessionId);
      expect(renewed.body.playbackToken).toBeTruthy();

      // desmatriculado: a renovação passa a negar, mesmo com o token anterior ainda válido
      await prisma.enrollment.deleteMany({ where: { userId: id.alunoa } });
      await http()
        .post('/v1/playback/renew')
        .set('Origin', ORIGIN)
        .set(bearer(p.playbackToken))
        .expect(403);
      await prisma.enrollment.create({
        data: { tenantId: id.tenanta, courseId: id.course, userId: id.alunoa },
      });
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });

    it('sessão encerrada não renova', async () => {
      const p = await open();
      await http().post('/v1/playback/end').set(bearer(p.playbackToken)).expect(204);
      await http()
        .post('/v1/playback/renew')
        .set('Origin', ORIGIN)
        .set(bearer(p.playbackToken))
        .expect(409);
    });
  });

  describe('empresa suspensa', () => {
    it('bloqueia novos playbacks e renovações', async () => {
      const p = await open();
      await prisma.tenant.update({ where: { id: id.tenanta }, data: { status: 'suspended' } });
      // 403 (empresa suspensa) ou 401 (o guard JWT já barra pelo estado do usuário/empresa, 1.5)
      expect([401, 403]).toContain((await play(id.lesson1, tok.alunoa)).status);
      await http()
        .post('/v1/playback/renew')
        .set('Origin', ORIGIN)
        .set(bearer(p.playbackToken))
        .expect(403);
      await prisma.tenant.update({ where: { id: id.tenanta }, data: { status: 'active' } });
      await http().post('/v1/playback/end').set(bearer(p.playbackToken));
    });
  });
});

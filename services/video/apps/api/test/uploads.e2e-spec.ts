import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const MiB = 1024 * 1024;

describe('uploads e vídeos (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  const http = () => request(app.getHttpServer());

  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  /** Cria uma aula nova no curso da professora A e devolve o id. */
  async function newLesson(title = 'Aula'): Promise<string> {
    const lesson = await prisma.lesson.create({
      data: { tenantId: id.tenanta, moduleId: id.module, title, status: 'published' },
    });
    return lesson.id;
  }

  function startUpload(lessonId: string, size = 40 * MiB, token = tok.professora) {
    return http()
      .post('/v1/uploads')
      .set(bearer(token))
      .send({ lessonId, filename: 'Aula 1.MP4', size, contentType: 'video/mp4' });
  }

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(TranscodeQueue)
        .useValue(queue),
    );
    await resetDb(prisma);

    for (const slug of ['a', 'b']) {
      const t = await prisma.tenant.create({ data: { slug: `empresa-${slug}`, name: slug } });
      id[`tenant${slug}`] = t.id;
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role);
        id[`${role}${slug}`] = u.id;
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    const prof2 = await addUser(prisma, id.tenanta, 'prof2@a.com', 'professor');
    id.prof2a = prof2.id;
    tok.prof2a = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;

    const course = await prisma.course.create({
      data: { tenantId: id.tenanta, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    const mod = await prisma.module.create({
      data: { tenantId: id.tenanta, courseId: course.id, title: 'M1' },
    });
    id.module = mod.id;
    await prisma.enrollment.create({
      data: { tenantId: id.tenanta, courseId: course.id, userId: id.alunoa },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    queue.jobs.length = 0;
    queue.fail = false;
    storage.deletedPrefixes.length = 0;
    storage.aborted.length = 0;
  });

  describe('criação do upload', () => {
    it('professor dono cria o upload: partes assinadas, chave sob o prefixo da empresa, aula vinculada', async () => {
      const lessonId = await newLesson();
      const res = await startUpload(lessonId, 40 * MiB).expect(201);
      expect(res.body).toMatchObject({ partSize: 16 * MiB, partCount: 3 });
      expect(res.body.parts).toHaveLength(3);
      expect(res.body.parts[0].url).toContain('part=1');

      const video = await prisma.video.findUniqueOrThrow({ where: { id: res.body.videoId } });
      expect(video).toMatchObject({
        status: 'uploading',
        tenantId: id.tenanta,
        createdById: id.professora,
      });
      expect(video.sourceKey).toBe(`tenants/${id.tenanta}/originals/${video.id}/source.mp4`);
      expect(Number(video.sizeBytes)).toBe(40 * MiB);
      expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).videoId).toBe(
        video.id,
      );
    });

    it('aluno, professor não-dono e outra empresa não conseguem', async () => {
      const lessonId = await newLesson();
      await startUpload(lessonId, 10 * MiB, tok.alunoa).expect(403);
      await startUpload(lessonId, 10 * MiB, tok.prof2a).expect(403);
      await startUpload(lessonId, 10 * MiB, tok.adminb).expect(404); // aula de outra empresa não existe
      await startUpload(lessonId, 10 * MiB, tok.admina).expect(201); // admin da empresa pode
    });

    it('valida extensão, tipo e tamanho', async () => {
      const lessonId = await newLesson();
      const base = { lessonId, size: 10 * MiB };
      const post = (body: object) =>
        http().post('/v1/uploads').set(bearer(tok.professora)).send(body);
      await post({ ...base, filename: 'doc.pdf', contentType: 'video/mp4' }).expect(400);
      await post({ ...base, filename: 'a.mp4', contentType: 'application/pdf' }).expect(400);
      await post({ ...base, size: 0, filename: 'a.mp4', contentType: 'video/mp4' }).expect(400);
      await post({
        ...base,
        size: 11 * 1024 * 1024 * 1024,
        filename: 'a.mp4',
        contentType: 'video/mp4',
      }).expect(413);
    });

    it('exige autenticação', async () => {
      await http().post('/v1/uploads').send({}).expect(401);
    });
  });

  describe('finalização', () => {
    it('valida partes, finaliza, enfileira uma vez e é idempotente', async () => {
      const lessonId = await newLesson();
      const { videoId } = (await startUpload(lessonId, 40 * MiB)).body;
      const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      storage.sizes.set(video.sourceKey, 40 * MiB);

      const parts = [1, 2, 3].map((n) => ({ partNumber: n, etag: `"e${n}"` }));
      const complete = (p: object[]) =>
        http()
          .post(`/v1/uploads/${videoId}/complete`)
          .set(bearer(tok.professora))
          .send({ parts: p });

      await complete(parts.slice(0, 2)).expect(422); // faltou a parte 3
      await complete([parts[0], parts[0], parts[2]]).expect(422); // duplicada

      const ok = await complete(parts).expect(202);
      expect(ok.body).toMatchObject({
        id: videoId,
        status: 'queued',
        lessonId,
        sizeBytes: 40 * MiB,
      });
      expect(queue.jobs).toEqual([{ videoId, tenantId: id.tenanta }]);

      await complete(parts).expect(202); // repetir não enfileira de novo
      expect(queue.jobs).toHaveLength(1);
      expect(
        (await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).uploadId,
      ).toBeNull();
    });

    it('tamanho diferente do declarado → 422 e vídeo marcado como falho', async () => {
      const lessonId = await newLesson();
      const { videoId } = (await startUpload(lessonId, 20 * MiB)).body;
      const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      storage.sizes.set(video.sourceKey, 5 * MiB);
      await http()
        .post(`/v1/uploads/${videoId}/complete`)
        .set(bearer(tok.professora))
        .send({
          parts: [
            { partNumber: 1, etag: '"e1"' },
            { partNumber: 2, etag: '"e2"' },
          ],
        })
        .expect(422);
      expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).status).toBe(
        'failed',
      );
      expect(queue.jobs).toHaveLength(0);
    });

    it('fila indisponível → 503 e o vídeo fica "uploaded" para reprocessar depois', async () => {
      const lessonId = await newLesson();
      const { videoId } = (await startUpload(lessonId, 10 * MiB)).body;
      const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      storage.sizes.set(video.sourceKey, 10 * MiB);
      queue.fail = true;
      await http()
        .post(`/v1/uploads/${videoId}/complete`)
        .set(bearer(tok.professora))
        .send({ parts: [{ partNumber: 1, etag: '"e1"' }] })
        .expect(503);
      expect((await prisma.video.findUniqueOrThrow({ where: { id: videoId } })).status).toBe(
        'uploaded',
      );

      queue.fail = false;
      await http().post(`/v1/videos/${videoId}/reprocess`).set(bearer(tok.professora)).expect(202);
      expect(queue.jobs).toHaveLength(1);
    });
  });

  describe('retomada, aborto e substituição', () => {
    it('lista partes enviadas e assina partes de novo (retomável)', async () => {
      const lessonId = await newLesson();
      const { videoId } = (await startUpload(lessonId, 40 * MiB)).body;
      const list = await http()
        .get(`/v1/uploads/${videoId}/parts`)
        .set(bearer(tok.professora))
        .expect(200);
      expect(list.body).toMatchObject({ partCount: 3, uploaded: [{ partNumber: 1 }] });

      const signed = await http()
        .post(`/v1/uploads/${videoId}/parts`)
        .set(bearer(tok.professora))
        .send({ partNumbers: [2, 3] })
        .expect(200);
      expect(signed.body.parts.map((p: { partNumber: number }) => p.partNumber)).toEqual([2, 3]);
      await http()
        .post(`/v1/uploads/${videoId}/parts`)
        .set(bearer(tok.professora))
        .send({ partNumbers: [9] })
        .expect(422);
    });

    it('abortar remove o registro, desvincula a aula e cancela o multipart', async () => {
      const lessonId = await newLesson();
      const { videoId, uploadId } = (await startUpload(lessonId)).body;
      await http().delete(`/v1/uploads/${videoId}`).set(bearer(tok.professora)).expect(204);
      expect(await prisma.video.findUnique({ where: { id: videoId } })).toBeNull();
      expect(
        (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).videoId,
      ).toBeNull();
      expect(storage.aborted).toContain(uploadId);
    });

    it('aula com vídeo em processamento recusa novo upload; vídeo falho é substituído', async () => {
      const lessonId = await newLesson();
      const first = (await startUpload(lessonId)).body.videoId;
      await prisma.video.update({ where: { id: first }, data: { status: 'queued' } });
      await startUpload(lessonId).expect(409);

      await prisma.video.update({ where: { id: first }, data: { status: 'failed' } });
      const second = (await startUpload(lessonId).expect(201)).body.videoId;
      expect(second).not.toBe(first);
      expect(await prisma.video.findUnique({ where: { id: first } })).toBeNull();
      expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).videoId).toBe(
        second,
      );
    });
  });

  describe('vídeo', () => {
    it('consulta, reprocessa e remove respeitando estado e empresa', async () => {
      const lessonId = await newLesson();
      const { videoId } = (await startUpload(lessonId)).body;
      await prisma.video.update({
        where: { id: videoId },
        data: { status: 'ready', durationS: 61.5, renditions: [{ name: '360p' }] },
      });

      const got = await http().get(`/v1/videos/${videoId}`).set(bearer(tok.professora)).expect(200);
      expect(got.body).toMatchObject({ status: 'ready', durationS: 61.5, lessonId });
      await http().get(`/v1/videos/${videoId}`).set(bearer(tok.alunoa)).expect(403);
      await http().get(`/v1/videos/${videoId}`).set(bearer(tok.prof2a)).expect(403);
      await http().get(`/v1/videos/${videoId}`).set(bearer(tok.adminb)).expect(404);
      await http().post(`/v1/videos/${videoId}/reprocess`).set(bearer(tok.adminb)).expect(404);
      await http().delete(`/v1/videos/${videoId}`).set(bearer(tok.adminb)).expect(404);

      await http().post(`/v1/videos/${videoId}/reprocess`).set(bearer(tok.professora)).expect(202);
      expect(queue.jobs).toEqual([{ videoId, tenantId: id.tenanta }]);
      await http().post(`/v1/videos/${videoId}/reprocess`).set(bearer(tok.professora)).expect(409); // já na fila

      await prisma.video.update({ where: { id: videoId }, data: { status: 'processing' } });
      await http().delete(`/v1/videos/${videoId}`).set(bearer(tok.professora)).expect(409);

      await prisma.video.update({ where: { id: videoId }, data: { status: 'ready' } });
      await http().delete(`/v1/videos/${videoId}`).set(bearer(tok.professora)).expect(204);
      expect(storage.deletedPrefixes).toEqual([
        `tenants/${id.tenanta}/originals/${videoId}/`,
        `tenants/${id.tenanta}/videos/${videoId}/`,
      ]);
      expect(
        (await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } })).videoId,
      ).toBeNull();
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { CONFIG } from '../src/config/config.module';
import { Env } from '../src/config/env';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { StorageService } from '../src/storage/storage.service';
import { VideosService } from '../src/videos/videos.service';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const MiB = 1024 * 1024;

/** Fase 1.12 (GC de vídeos, varredura de upload abandonado) e 1.13 (cota por empresa, assinatura do arquivo). */
describe('endurecimento de vídeos: cota, assinatura do arquivo e coleta de lixo (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const storage = new FakeStorage();
  const queue = new FakeQueue();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  const env = () => app.get<Env>(CONFIG);

  async function newLesson(moduleId = id.module): Promise<string> {
    return (
      await prisma.lesson.create({
        data: { tenantId: id.tenanta, moduleId, title: 'Aula', status: 'published' },
      })
    ).id;
  }
  const startUpload = (lessonId: string, size: number) =>
    http()
      .post('/v1/uploads')
      .set(bearer(tok.professora))
      .send({ lessonId, filename: 'a.mp4', size, contentType: 'video/mp4' });

  /** Aula com vídeo pronto (como depois do transcode). */
  async function lessonWithVideo(moduleId = id.module) {
    const video = await prisma.video.create({
      data: {
        tenantId: id.tenanta,
        status: 'ready',
        sourceKey: 'x',
        originalName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1n,
        durationS: 10,
      },
    });
    const lesson = await prisma.lesson.create({
      data: { tenantId: id.tenanta, moduleId, title: 'Com vídeo', videoId: video.id },
    });
    return { videoId: video.id, lessonId: lesson.id };
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
    const t = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    id.tenanta = t.id;
    for (const role of ['admin', 'professor'] as const) {
      id[`${role}a`] = (await addUser(prisma, t.id, `${role}@a.com`, role)).id;
      tok[`${role}a`] = (await login(app, 'empresa-a', `${role}@a.com`)).accessToken;
    }
    id.course = (
      await prisma.course.create({
        data: { tenantId: t.id, title: 'C', status: 'published', ownerId: id.professora },
      })
    ).id;
    id.module = (
      await prisma.module.create({ data: { tenantId: t.id, courseId: id.course, title: 'M' } })
    ).id;
  });

  afterAll(async () => {
    env().MAX_TENANT_STORAGE_BYTES = 0;
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    storage.deletedPrefixes.length = 0;
    storage.deleted.length = 0;
    storage.aborted.length = 0;
    storage.objects.clear();
  });

  describe('cota de armazenamento por empresa (1.13)', () => {
    afterEach(async () => {
      env().MAX_TENANT_STORAGE_BYTES = 0;
      await prisma.lesson.updateMany({ data: { videoId: null } });
      await prisma.video.deleteMany({});
    });

    it('recusa (413) o upload que estoura a cota; trocar o vídeo da aula devolve a cota do antigo', async () => {
      env().MAX_TENANT_STORAGE_BYTES = 50 * MiB;
      const l1 = await newLesson();
      await startUpload(l1, 30 * MiB).expect(201);

      const l2 = await newLesson();
      const over = await startUpload(l2, 30 * MiB).expect(413);
      expect(JSON.stringify(over.body)).toMatch(/Cota/);
      expect(await prisma.video.count({ where: { tenantId: id.tenanta } })).toBe(1);

      // substituir o vídeo da própria aula: os 30 MiB antigos saem da conta (40 <= 50)
      await startUpload(l1, 40 * MiB).expect(201);
      // mas 60 MiB não cabe nem substituindo
      await startUpload(l1, 60 * MiB).expect(413);
    });

    it('sem cota configurada (0) não limita', async () => {
      env().MAX_TENANT_STORAGE_BYTES = 0;
      await startUpload(await newLesson(), 30 * MiB).expect(201);
      await startUpload(await newLesson(), 30 * MiB).expect(201);
    });
  });

  describe('assinatura do arquivo (1.13)', () => {
    afterEach(async () => {
      await prisma.lesson.updateMany({ data: { videoId: null } });
      await prisma.video.deleteMany({});
    });

    it('arquivo que não é vídeo (renomeado para .mp4) é recusado no finalizar e fica "failed" com o motivo', async () => {
      const { videoId } = (await startUpload(await newLesson(), 10 * MiB)).body;
      const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      storage.sizes.set(video.sourceKey, 10 * MiB);
      storage.objects.set(
        video.sourceKey,
        Buffer.from('MZ\u0090\u0000 isto é um executável, não um vídeo'),
      );

      await http()
        .post(`/v1/uploads/${videoId}/complete`)
        .set(bearer(tok.professora))
        .send({
          parts: [{ partNumber: 1, etag: '"e1"' }],
        })
        .expect(422);
      const row = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      expect(row.status).toBe('failed');
      expect(row.error).toMatch(/MP4/);
      expect(storage.deleted).toContain(video.sourceKey); // o original recusado não fica no bucket
      expect(queue.jobs.filter((j) => j.videoId === videoId)).toHaveLength(0);
    });

    it('MP4 de verdade passa e é enfileirado', async () => {
      const { videoId } = (await startUpload(await newLesson(), 10 * MiB)).body;
      const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
      storage.sizes.set(video.sourceKey, 10 * MiB);
      storage.objects.set(
        video.sourceKey,
        Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(32)]),
      );
      await http()
        .post(`/v1/uploads/${videoId}/complete`)
        .set(bearer(tok.professora))
        .send({ parts: [{ partNumber: 1, etag: '"e1"' }] })
        .expect(202);
    });

    it('tamanho declarado absurdo é recusado já na validação', async () => {
      await startUpload(await newLesson(), 2 ** 52).expect(400);
    });
  });

  describe('coleta de lixo ao excluir (1.12)', () => {
    it('excluir a aula apaga o vídeo (registro e arquivos)', async () => {
      const { videoId, lessonId } = await lessonWithVideo();
      await http().delete(`/v1/lessons/${lessonId}`).set(bearer(tok.professora)).expect(204);
      expect(await prisma.video.findUnique({ where: { id: videoId } })).toBeNull();
      expect(storage.deletedPrefixes).toEqual([
        `tenants/${id.tenanta}/originals/${videoId}/`,
        `tenants/${id.tenanta}/videos/${videoId}/`,
      ]);
    });

    it('excluir o módulo apaga os vídeos de todas as suas aulas', async () => {
      const mod = await prisma.module.create({
        data: { tenantId: id.tenanta, courseId: id.course, title: 'M2' },
      });
      const a = await lessonWithVideo(mod.id);
      const b = await lessonWithVideo(mod.id);
      await http().delete(`/v1/modules/${mod.id}`).set(bearer(tok.professora)).expect(204);
      expect(await prisma.video.count({ where: { id: { in: [a.videoId, b.videoId] } } })).toBe(0);
      expect(storage.deletedPrefixes).toHaveLength(4);
    });

    it('excluir o curso apaga os vídeos de todos os módulos', async () => {
      const course = await prisma.course.create({
        data: { tenantId: id.tenanta, title: 'C2', ownerId: id.professora },
      });
      const mod = await prisma.module.create({
        data: { tenantId: id.tenanta, courseId: course.id, title: 'M' },
      });
      const a = await lessonWithVideo(mod.id);
      await http().delete(`/v1/courses/${course.id}`).set(bearer(tok.professora)).expect(204);
      expect(await prisma.video.findUnique({ where: { id: a.videoId } })).toBeNull();
      expect(storage.deletedPrefixes).toContain(`tenants/${id.tenanta}/videos/${a.videoId}/`);
    });

    it('upload abandonado (sem finalizar) é abortado e removido pela varredura; o recente fica', async () => {
      const old = (await startUpload(await newLesson(), 10 * MiB)).body;
      const fresh = (await startUpload(await newLesson(), 10 * MiB)).body;
      await prisma.video.update({
        where: { id: old.videoId },
        data: { createdAt: new Date(Date.now() - 72 * 3_600_000) },
      });

      const removed = await app.get(VideosService).sweepAbandonedUploads();
      expect(removed).toBe(1);
      expect(await prisma.video.findUnique({ where: { id: old.videoId } })).toBeNull();
      expect(await prisma.video.findUnique({ where: { id: fresh.videoId } })).not.toBeNull();
      expect(storage.aborted).toContain(old.uploadId);
    });
  });
});

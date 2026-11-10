import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { StorageService } from '../src/storage/storage.service';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';
import {
  crossTenantFkViolations,
  modelsMissingTenant,
  rowsPerTenant,
  tenantScopedModels,
} from './tenant-isolation';

/**
 * Isolamento entre empresas (Fase 1.17, ADR 0006): sem RLS no banco, a barreira é o código.
 * Esta suíte é guiada pelo schema (tenant-isolation.ts) e cobre: (1) toda tabela de negócio tem
 * tenant_id; (2) FKs nunca cruzam empresas; (3) a empresa A, com qualquer papel, não lê nem altera
 * NENHUM recurso da empresa B pelas rotas; (4) as listagens de A não trazem ids de B; (5) nada de B
 * mudou depois dos ataques.
 */
describe('vazamento entre empresas, tabela por tabela (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};
  let before: Awaited<ReturnType<typeof rowsPerTenant>>;

  async function seedTenant(slug: 'a' | 'b') {
    const t = await prisma.tenant.create({
      data: { slug: `empresa-${slug}`, name: slug, accessEndpointEnabled: true },
    });
    id[`tenant${slug}`] = t.id;
    for (const role of ['admin', 'professor', 'aluno'] as const) {
      id[`${role}${slug}`] = (await addUser(prisma, t.id, `${role}@${slug}.com`, role)).id;
    }
    const owner = id[`professor${slug}`];
    const student = id[`aluno${slug}`];
    const course = await prisma.course.create({
      data: { tenantId: t.id, title: `Curso ${slug}`, status: 'published', ownerId: owner },
    });
    const mod = await prisma.module.create({
      data: { tenantId: t.id, courseId: course.id, title: 'M1' },
    });
    const video = await prisma.video.create({
      data: {
        tenantId: t.id,
        status: 'ready',
        sourceKey: `tenants/${t.id}/originals/x/source.mp4`,
        originalName: 'a.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1000n,
        durationS: 100,
        renditions: [{ name: '480p' }],
      },
    });
    const lesson = await prisma.lesson.create({
      data: {
        tenantId: t.id,
        moduleId: mod.id,
        title: 'Aula',
        status: 'published',
        videoId: video.id,
      },
    });
    await prisma.enrollment.create({
      data: { tenantId: t.id, userId: student, courseId: course.id, externalRef: `ref-${slug}` },
    });
    const note = await prisma.note.create({
      data: { tenantId: t.id, userId: student, lessonId: lesson.id, atS: 1, text: 'nota' },
    });
    await prisma.subtitle.create({
      data: { tenantId: t.id, lessonId: lesson.id, lang: 'pt', s3Key: `tenants/${t.id}/s.vtt` },
    });
    await prisma.chapter.create({
      data: { tenantId: t.id, lessonId: lesson.id, startS: 0, title: 'Início' },
    });
    await prisma.transcriptSegment.create({
      data: { tenantId: t.id, videoId: video.id, lang: 'pt', startS: 0, endS: 2, text: 'olá' },
    });
    await prisma.watchSession.create({
      data: {
        tenantId: t.id,
        id: randomUUID(),
        userId: student,
        lessonId: lesson.id,
        watchedS: 30,
      },
    });
    await prisma.watchRange.create({
      data: { tenantId: t.id, userId: student, lessonId: lesson.id, fromS: 0, toS: 30 },
    });
    await prisma.lessonProgress.create({
      data: { tenantId: t.id, userId: student, lessonId: lesson.id, percent: 30, lastPos: 30 },
    });
    await prisma.apiToken.create({
      data: {
        tenantId: t.id,
        userId: owner,
        name: 'k',
        prefix: 'gvmcp_x',
        tokenHash: `hash-${slug}`,
        scopes: ['courses:read'],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: t.id, actorId: owner, via: 'test', tool: 't', argsHash: 'h', ok: true },
    });
    await prisma.firstAccessToken.create({
      data: {
        tenantId: t.id,
        userId: student,
        tokenHash: `fa-${slug}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    Object.assign(id, {
      [`course${slug}`]: course.id,
      [`module${slug}`]: mod.id,
      [`lesson${slug}`]: lesson.id,
      [`video${slug}`]: video.id,
      [`note${slug}`]: note.id,
    });
  }

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(new FakeStorage())
        .overrideProvider(TranscodeQueue)
        .useValue(new FakeQueue()),
    );
    await resetDb(prisma);
    await seedTenant('a');
    await seedTenant('b');
    for (const role of ['admin', 'professor', 'aluno']) {
      tok[`${role}a`] = (await login(app, 'empresa-a', `${role}@a.com`)).accessToken;
    }
    before = await rowsPerTenant(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('estrutura (guiada pelo schema)', () => {
    it('toda tabela de negócio tem tenant_id (exceções só as declaradas em GLOBAL_MODELS)', () => {
      expect(modelsMissingTenant()).toEqual([]);
    });

    it('o seed deste teste cobre TODAS as tabelas com tenant_id, nas duas empresas', () => {
      const missing = tenantScopedModels()
        .filter((m) => m.name !== 'Tenant')
        .filter((m) => !before[m.name]?.[id.tenanta] || !before[m.name]?.[id.tenantb])
        .map((m) => m.name);
      // tabela nova no schema => acrescente-a ao seedTenant(): é assim que ela entra na vigilância
      expect(missing).toEqual([]);
    });

    it('nenhuma FK liga linhas de empresas diferentes', async () => {
      expect(await crossTenantFkViolations(prisma)).toEqual([]);
    });
  });

  describe('empresa A não alcança recursos da empresa B', () => {
    type Call = [method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object];
    // Destrutivas por último: se alguma vazasse, o resto do teste ainda diria o que quebrou.
    const attacks = (): Call[] => [
      ['get', `/v1/courses/${id.courseb}`],
      ['get', `/v1/courses/${id.courseb}/enrollments`],
      ['post', `/v1/courses/${id.courseb}/enrollments`, { userId: id.alunoa }],
      ['get', `/v1/courses/${id.courseb}/modules`],
      ['post', `/v1/courses/${id.courseb}/modules`, { title: 'x' }],
      ['get', `/v1/courses/${id.courseb}/progress`],
      ['get', `/v1/modules/${id.moduleb}/lessons`],
      ['post', `/v1/modules/${id.moduleb}/lessons`, { title: 'x' }],
      ['get', `/v1/lessons/${id.lessonb}`],
      ['get', `/v1/lessons/${id.lessonb}/progress`],
      ['post', `/v1/lessons/${id.lessonb}/playback`, {}],
      ['get', `/v1/lessons/${id.lessonb}/notes`],
      ['post', `/v1/lessons/${id.lessonb}/notes`, { atS: 1, text: 'x' }],
      ['get', `/v1/lessons/${id.lessonb}/subtitles`],
      ['get', `/v1/lessons/${id.lessonb}/transcript`],
      ['get', `/v1/lessons/${id.lessonb}/chapters`],
      [
        'post',
        '/v1/uploads',
        { lessonId: id.lessonb, filename: 'a.mp4', size: 1000, contentType: 'video/mp4' },
      ],
      ['get', `/v1/videos/${id.videob}`],
      ['post', `/v1/videos/${id.videob}/reprocess`],
      ['get', `/v1/analytics/lessons/${id.lessonb}`],
      ['get', `/v1/analytics/courses/${id.courseb}`],
      ['get', `/v1/analytics/courses/${id.courseb}/inactive`],
      ['get', `/v1/analytics/courses/${id.courseb}/export.csv`],
      ['get', `/v1/analytics/students/${id.alunob}`],
      ['get', `/v1/users/${id.alunob}/data-export`],
      ['patch', `/v1/courses/${id.courseb}`, { title: 'Invadido' }],
      ['patch', `/v1/modules/${id.moduleb}`, { title: 'Invadido' }],
      ['patch', `/v1/lessons/${id.lessonb}`, { title: 'Invadido' }],
      ['patch', `/v1/notes/${id.noteb}`, { text: 'Invadido' }],
      ['patch', `/v1/users/${id.alunob}`, { name: 'Invadido' }],
      ['delete', `/v1/notes/${id.noteb}`],
      ['delete', `/v1/courses/${id.courseb}/enrollments/${id.alunob}`],
      ['delete', `/v1/videos/${id.videob}`],
      ['delete', `/v1/lessons/${id.lessonb}`],
      ['delete', `/v1/modules/${id.moduleb}`],
      ['delete', `/v1/courses/${id.courseb}`],
      ['delete', `/v1/users/${id.alunob}`],
    ];

    for (const role of ['admin', 'professor', 'aluno'] as const) {
      it(`como ${role} de A: tudo de B responde 403/404 (nunca 2xx)`, async () => {
        const leaks: string[] = [];
        for (const [method, path, body] of attacks()) {
          const req = http()
            [method](path)
            .set(bearer(tok[`${role}a`]));
          const res = await (body ? req.send(body) : req);
          if (![403, 404].includes(res.status)) {
            leaks.push(`${method.toUpperCase()} ${path} -> ${res.status}`);
          }
        }
        expect(leaks).toEqual([]);
      });
    }

    it('listagens de A não contêm nenhum id de B', async () => {
      const bIds = Object.entries(id)
        .filter(([k]) => k.endsWith('b'))
        .map(([, v]) => v);
      expect(bIds.length).toBeGreaterThan(5);
      const lists = [
        '/v1/courses',
        '/v1/users',
        '/v1/me/courses',
        '/v1/me/history',
        '/v1/me/continue-watching',
        '/v1/tenant',
        `/v1/courses/${id.coursea}/enrollments`,
        `/v1/courses/${id.coursea}/modules`,
        `/v1/analytics/courses/${id.coursea}`,
        `/v1/analytics/courses/${id.coursea}/inactive`,
        '/v1/analytics/students/me',
        '/v1/me/mcp-tokens',
      ];
      for (const path of lists) {
        const res = await http().get(path).set(bearer(tok.admina));
        expect([200, 403]).toContain(res.status);
        for (const b of bIds) expect(JSON.stringify(res.body)).not.toContain(b);
      }
    });

    it('depois dos ataques, nada da empresa B mudou (nem linhas, nem conteúdo)', async () => {
      const after = await rowsPerTenant(prisma);
      for (const m of tenantScopedModels()) {
        expect([m.name, after[m.name]?.[id.tenantb]]).toEqual([
          m.name,
          before[m.name]?.[id.tenantb],
        ]);
      }
      const course = await prisma.course.findUniqueOrThrow({ where: { id: id.courseb } });
      expect(course.title).toBe('Curso b');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: id.alunob } })).name).toBe(
        'aluno@b.com',
      );
      expect((await prisma.note.findUniqueOrThrow({ where: { id: id.noteb } })).text).toBe('nota');
    });
  });
});

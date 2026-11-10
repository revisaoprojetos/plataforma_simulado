import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { StorageService } from '../src/storage/storage.service';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const TOKEN = 'metricas-token-1234567890';
const overrides = (b: Parameters<Parameters<typeof createApp>[0] & object>[0]) =>
  b
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(TranscodeQueue)
    .useValue(new FakeQueue());

describe('métricas Prometheus (e2e)', () => {
  const prisma = new PrismaClient();
  let off: INestApplication;
  let on: INestApplication;
  let alunoToken: string;
  let lessonId: string;

  beforeAll(async () => {
    delete process.env.METRICS_TOKEN;
    off = await createApp(overrides);
    process.env.METRICS_TOKEN = TOKEN;
    on = await createApp(overrides);
    await resetDb(prisma);
    const t = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    await addUser(prisma, t.id, 'aluno@a.com', 'aluno');
    alunoToken = (await login(on, 'empresa-a', 'aluno@a.com')).accessToken;
    const prof = await addUser(prisma, t.id, 'prof@a.com', 'professor');
    const course = await prisma.course.create({
      data: { tenantId: t.id, title: 'C', status: 'published', ownerId: prof.id },
    });
    const mod = await prisma.module.create({
      data: { tenantId: t.id, courseId: course.id, title: 'M' },
    });
    lessonId = (
      await prisma.lesson.create({
        data: { tenantId: t.id, moduleId: mod.id, title: 'A', status: 'published' },
      })
    ).id;
  });

  afterAll(async () => {
    delete process.env.METRICS_TOKEN;
    await off.close();
    await on.close();
    await prisma.$disconnect();
  });

  it('sem METRICS_TOKEN configurado o endpoint não existe (404)', async () => {
    await request(off.getHttpServer()).get('/metrics').expect(404);
    await request(off.getHttpServer()).get('/metrics').set(bearer(TOKEN)).expect(404);
  });

  it('com token: 401 sem credencial ou com token errado; 200 com o certo', async () => {
    const http = () => request(on.getHttpServer());
    await http().get('/metrics').expect(401);
    await http().get('/metrics').set(bearer('token-errado-0000000000')).expect(401);
    await http().get('/metrics').set('Authorization', TOKEN).expect(401); // sem "Bearer"
    const ok = await http().get('/metrics').set(bearer(TOKEN)).expect(200);
    expect(ok.headers['content-type']).toContain('text/plain');
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.text).toContain('process_cpu_user_seconds_total');
    expect(ok.text).toContain('progress_events_queue_length');
    expect(ok.text).toContain('transcode_queue_jobs');
  });

  it('mede as requisições pelo PADRÃO da rota (sem ids) e conta os eventos de negócio', async () => {
    const http = () => request(on.getHttpServer());
    await http().get(`/v1/lessons/${lessonId}/progress`).set(bearer(alunoToken)); // 403: aluno não matriculado
    await http().get('/v1/courses').set(bearer(alunoToken)).expect(200);
    await http().get('/v1/rota-que-nao-existe').set(bearer(alunoToken)).expect(404);

    const text = (await http().get('/metrics').set(bearer(TOKEN)).expect(200)).text;
    expect(text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/v1\/courses",status="200"\} 1/,
    );
    expect(text).toContain('route="/v1/lessons/:id/progress"');
    // varreduras de URL inexistente aparecem agrupadas no curinga, sem explodir a cardinalidade
    expect(text).toMatch(/route="\/v1\/\*",status="404"\} 1/);
    expect(text).not.toContain('rota-que-nao-existe');
    expect(text).not.toContain(lessonId); // cardinalidade controlada: nunca o id na etiqueta
  });
});

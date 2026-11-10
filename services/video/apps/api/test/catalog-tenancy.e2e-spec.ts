import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

describe('catálogo, permissões e isolamento entre empresas (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  const tok: Record<string, string> = {};
  const id: Record<string, string> = {};

  beforeAll(async () => {
    app = await createApp();
    await resetDb(prisma);

    for (const slug of ['a', 'b']) {
      const t = await prisma.tenant.create({ data: { slug: `empresa-${slug}`, name: slug } });
      id[`tenant${slug}`] = t.id;
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role);
        id[`${role}${slug}`] = u.id;
      }
    }
    await addUser(prisma, id.tenanta, 'prof2@a.com', 'professor').then((u) => (id.prof2a = u.id));
    await addUser(prisma, null, 'plataforma@x.com', 'platform_admin');

    for (const slug of ['a', 'b']) {
      for (const role of ['admin', 'professor', 'aluno']) {
        tok[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    tok.prof2a = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;
    tok.platform = (await login(app, undefined, 'plataforma@x.com')).accessToken;

    // Empresa A: curso da professora com módulo, aula publicada e aula em rascunho; aluno matriculado.
    const course = await http()
      .post('/v1/courses')
      .set(bearer(tok.professora))
      .send({ title: 'Curso A', status: 'published' })
      .expect(201);
    id.courseA = course.body.id;
    const mod = await http()
      .post(`/v1/courses/${id.courseA}/modules`)
      .set(bearer(tok.professora))
      .send({ title: 'M1' })
      .expect(201);
    id.moduleA = mod.body.id;
    id.lessonPub = (
      await http()
        .post(`/v1/modules/${id.moduleA}/lessons`)
        .set(bearer(tok.professora))
        .send({ title: 'Publicada', status: 'published' })
        .expect(201)
    ).body.id;
    id.lessonDraft = (
      await http()
        .post(`/v1/modules/${id.moduleA}/lessons`)
        .set(bearer(tok.professora))
        .send({ title: 'Rascunho' })
        .expect(201)
    ).body.id;
    await http()
      .post(`/v1/courses/${id.courseA}/enrollments`)
      .set(bearer(tok.professora))
      .send({ userId: id.alunoa })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('permissões dentro da empresa', () => {
    it('aluno não cria curso; professor cria e vira dono; admin pode atribuir dono', async () => {
      await http()
        .post('/v1/courses')
        .set(bearer(tok.alunoa))
        .send({ title: 'X curso' })
        .expect(403);
      const mine = await http()
        .post('/v1/courses')
        .set(bearer(tok.professora))
        .send({ title: 'Meu' })
        .expect(201);
      expect(mine.body.ownerId).toBe(id.professora);
      const byAdmin = await http()
        .post('/v1/courses')
        .set(bearer(tok.admina))
        .send({ title: 'Do admin', ownerId: id.prof2a })
        .expect(201);
      expect(byAdmin.body.ownerId).toBe(id.prof2a);
    });

    it('professor só gerencia os próprios cursos; admin gerencia todos', async () => {
      await http()
        .patch(`/v1/courses/${id.courseA}`)
        .set(bearer(tok.prof2a))
        .send({ title: 'Invasor' })
        .expect(403);
      await http()
        .post(`/v1/courses/${id.courseA}/modules`)
        .set(bearer(tok.prof2a))
        .send({ title: 'x' })
        .expect(403);
      await http()
        .patch(`/v1/courses/${id.courseA}`)
        .set(bearer(tok.admina))
        .send({ title: 'Curso A' })
        .expect(200);
    });

    it('aluno vê só cursos publicados em que está matriculado e não vê rascunhos', async () => {
      const list = await http().get('/v1/courses').set(bearer(tok.alunoa)).expect(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([id.courseA]);

      const course = await http()
        .get(`/v1/courses/${id.courseA}`)
        .set(bearer(tok.alunoa))
        .expect(200);
      const titles = course.body.modules[0].lessons.map((l: { title: string }) => l.title);
      expect(titles).toEqual(['Publicada']);

      await http().get(`/v1/lessons/${id.lessonPub}`).set(bearer(tok.alunoa)).expect(200);
      await http().get(`/v1/lessons/${id.lessonDraft}`).set(bearer(tok.alunoa)).expect(403);
    });

    it('aluno não matriculado não acessa o curso nem a aula (403)', async () => {
      const outro = await addUser(prisma, id.tenanta, 'outro@a.com', 'aluno');
      const t = (await login(app, 'empresa-a', 'outro@a.com')).accessToken;
      await http().get(`/v1/courses/${id.courseA}`).set(bearer(t)).expect(403);
      await http().get(`/v1/lessons/${id.lessonPub}`).set(bearer(t)).expect(403);
      expect((await http().get('/v1/courses').set(bearer(t)).expect(200)).body.total).toBe(0);
      expect(outro.id).toBeDefined();
    });

    it('/me/courses traz o progresso do aluno', async () => {
      const res = await http().get('/v1/me/courses').set(bearer(tok.alunoa)).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        totalLessons: 1,
        completedLessons: 0,
        progressPercent: 0,
      });
    });

    it('só alunos são matriculáveis; só admin cria usuários', async () => {
      await http()
        .post(`/v1/courses/${id.courseA}/enrollments`)
        .set(bearer(tok.professora))
        .send({ userId: id.prof2a })
        .expect(422);
      await http()
        .post('/v1/users')
        .set(bearer(tok.professora))
        .send({ email: 'n@a.com', name: 'Nova', password: 'senha-forte-1' })
        .expect(403);
      await http()
        .post('/v1/users')
        .set(bearer(tok.admina))
        .send({ email: 'n@a.com', name: 'Nova', password: 'senha-forte-1', role: 'aluno' })
        .expect(201);
      await http()
        .post('/v1/users')
        .set(bearer(tok.admina))
        .send({ email: 'n@a.com', name: 'Nova', password: 'senha-forte-1' })
        .expect(409);
    });

    it('admin não pode desativar a si mesmo', async () => {
      await http()
        .patch(`/v1/users/${id.admina}`)
        .set(bearer(tok.admina))
        .send({ active: false })
        .expect(403);
    });
  });

  describe('busca de usuários', () => {
    it('filtra por nome ou e-mail, sem diferenciar maiúsculas, e pagina', async () => {
      const admin = bearer(tok.admina);
      const byEmail = await http().get('/v1/users?q=ALUNO@A').set(admin).expect(200);
      expect(byEmail.body.data.map((u: { email: string }) => u.email)).toEqual(['aluno@a.com']);
      expect(byEmail.body.total).toBe(1);
      const none = await http().get('/v1/users?q=nao-existe-xyz').set(admin).expect(200);
      expect(none.body).toMatchObject({ data: [], total: 0 });
      // sem q lista todos; limit continua valendo
      const all = await http().get('/v1/users?limit=2').set(admin).expect(200);
      expect(all.body.data).toHaveLength(2);
      expect(all.body.total).toBeGreaterThan(2);
    });
  });

  describe('ISOLAMENTO entre empresas', () => {
    it('empresa B não enxerga nada da empresa A', async () => {
      const bAdmin = bearer(tok.adminb);
      expect((await http().get('/v1/courses').set(bAdmin).expect(200)).body.total).toBe(0);
      expect(
        (await http().get('/v1/users').set(bAdmin).expect(200)).body.data.map(
          (u: { email: string }) => u.email,
        ),
      ).not.toContain('aluno@a.com');

      // a busca também respeita a empresa: o e-mail da A não aparece nem procurando por ele
      const found = await http().get('/v1/users?q=aluno@a.com').set(bAdmin).expect(200);
      expect(found.body.data).toEqual([]);

      // todo recurso da A responde 404 (não 403) para a B — nem a existência vaza
      await http().get(`/v1/courses/${id.courseA}`).set(bAdmin).expect(404);
      await http().get(`/v1/courses/${id.courseA}/modules`).set(bAdmin).expect(404);
      await http().get(`/v1/modules/${id.moduleA}/lessons`).set(bAdmin).expect(404);
      await http().get(`/v1/lessons/${id.lessonPub}`).set(bAdmin).expect(404);
      await http().get(`/v1/courses/${id.courseA}/enrollments`).set(bAdmin).expect(404);
    });

    it('empresa B não consegue alterar nem apagar recursos da A', async () => {
      const bAdmin = bearer(tok.adminb);
      await http()
        .patch(`/v1/courses/${id.courseA}`)
        .set(bAdmin)
        .send({ title: 'Hackeado' })
        .expect(404);
      await http().delete(`/v1/courses/${id.courseA}`).set(bAdmin).expect(404);
      await http().patch(`/v1/modules/${id.moduleA}`).set(bAdmin).send({ title: 'x' }).expect(404);
      await http()
        .post(`/v1/modules/${id.moduleA}/lessons`)
        .set(bAdmin)
        .send({ title: 'x' })
        .expect(404);
      await http()
        .patch(`/v1/lessons/${id.lessonPub}`)
        .set(bAdmin)
        .send({ title: 'x' })
        .expect(404);
      await http().delete(`/v1/lessons/${id.lessonPub}`).set(bAdmin).expect(404);
      await http()
        .patch(`/v1/users/${id.alunoa}`)
        .set(bAdmin)
        .send({ name: 'Hackeado' })
        .expect(404);

      const intact = await prisma.course.findUniqueOrThrow({ where: { id: id.courseA } });
      expect(intact.title).toBe('Curso A');
    });

    it('não é possível matricular usuário de outra empresa nem usar dono de outra empresa', async () => {
      // admin da B cria curso na B e tenta matricular o aluno da A / atribuir dono da A
      const courseB = (
        await http()
          .post('/v1/courses')
          .set(bearer(tok.adminb))
          .send({ title: 'Curso B' })
          .expect(201)
      ).body.id;
      await http()
        .post(`/v1/courses/${courseB}/enrollments`)
        .set(bearer(tok.adminb))
        .send({ userId: id.alunoa })
        .expect(404);
      await http()
        .post('/v1/courses')
        .set(bearer(tok.adminb))
        .send({ title: 'Dono alheio', ownerId: id.professora })
        .expect(422);
      await http()
        .patch(`/v1/courses/${courseB}`)
        .set(bearer(tok.adminb))
        .send({ ownerId: id.professora })
        .expect(422);

      // aluno da A matriculado na A não vira aluno da B
      const rows = await prisma.enrollment.findMany({ where: { courseId: courseB } });
      expect(rows).toHaveLength(0);
    });

    it('token da empresa A nunca autoriza dados da B, mesmo com ids da B na URL', async () => {
      const courseB = await prisma.course.findFirstOrThrow({ where: { tenantId: id.tenantb } });
      await http().get(`/v1/courses/${courseB.id}`).set(bearer(tok.admina)).expect(404);
      await http().delete(`/v1/courses/${courseB.id}`).set(bearer(tok.admina)).expect(404);
    });

    it('toda linha criada carrega o tenant do criador', async () => {
      const [courses, modules, lessons, enrollments] = await Promise.all([
        prisma.course.findMany({ where: { id: id.courseA } }),
        prisma.module.findMany({ where: { courseId: id.courseA } }),
        prisma.lesson.findMany({ where: { moduleId: id.moduleA } }),
        prisma.enrollment.findMany({ where: { courseId: id.courseA } }),
      ]);
      for (const row of [...courses, ...modules, ...lessons, ...enrollments]) {
        expect(row.tenantId).toBe(id.tenanta);
      }
    });
  });

  describe('plataforma', () => {
    it('só platform_admin gerencia empresas; cria empresa com admin que consegue logar', async () => {
      await http().get('/v1/platform/tenants').set(bearer(tok.admina)).expect(403);
      await http()
        .post('/v1/platform/tenants')
        .set(bearer(tok.platform))
        .send({
          slug: 'empresa-c',
          name: 'Empresa C',
          allowedDomains: ['cursos.empresa-c.com'],
          admin: { email: 'admin@c.com', name: 'Admin C', password: 'senha-forte-1' },
        })
        .expect(201);
      await http()
        .post('/v1/platform/tenants')
        .set(bearer(tok.platform))
        .send({
          slug: 'empresa-c',
          name: 'Dup',
          admin: { email: 'x@c.com', name: 'Xis', password: 'senha-forte-1' },
        })
        .expect(409);

      const res = await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-c', email: 'admin@c.com', password: 'senha-forte-1' })
        .expect(200);
      const me = await http().get('/v1/tenant').set(bearer(res.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({
        slug: 'empresa-c',
        allowedDomains: ['cursos.empresa-c.com'],
      });
    });

    it('suspender a empresa bloqueia o login', async () => {
      const list = await http().get('/v1/platform/tenants').set(bearer(tok.platform)).expect(200);
      const c = list.body.find((t: { slug: string }) => t.slug === 'empresa-c');
      await http()
        .patch(`/v1/platform/tenants/${c.id}`)
        .set(bearer(tok.platform))
        .send({ status: 'suspended' })
        .expect(200);
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-c', email: 'admin@c.com', password: 'senha-forte-1' })
        .expect(401);
    });
  });
});

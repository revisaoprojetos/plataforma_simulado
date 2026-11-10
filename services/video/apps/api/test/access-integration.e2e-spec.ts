import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { StorageService } from '../src/storage/storage.service';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, resetDb } from './helpers';

const overrides = (b: Parameters<Parameters<typeof createApp>[0] & object>[0]) =>
  b
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(TranscodeQueue)
    .useValue(new FakeQueue());

const DAY = 86_400_000;

describe('API de integração: matrícula genérica e sessão do aluno (e2e)', () => {
  let app: INestApplication;
  let previous: string | undefined;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const jwt: Record<string, string> = {};
  const id: Record<string, string> = {};
  let key: string; // chave de integração do admin da empresa A

  const post = (path: string, body: object, token: string = key) =>
    http().post(path).set(bearer(token)).send(body);
  const enroll = (body: Record<string, unknown>, token: string = key) =>
    post('/v1/access/enrollments', { courseId: id.courseA, ...body }, token);
  const session = (body: object) => post('/v1/access/sessions', body);

  async function newKey(user: string, scopes: string[]) {
    const res = await http()
      .post('/v1/me/mcp-tokens')
      .set(bearer(jwt[user]))
      .send({ name: 'integração', scopes });
    return res;
  }

  const visibleCourses = async (studentJwt: string): Promise<string[]> =>
    (await http().get('/v1/courses').set(bearer(studentJwt)).expect(200)).body.data.map(
      (c: { id: string }) => c.id,
    );

  beforeAll(async () => {
    previous = process.env.ACCESS_ENDPOINT_ENABLED;
    process.env.ACCESS_ENDPOINT_ENABLED = 'true';
    app = await createApp(overrides);
    await resetDb(prisma);

    const a = await prisma.tenant.create({
      data: { slug: 'empresa-a', name: 'A', accessEndpointEnabled: true },
    });
    const b = await prisma.tenant.create({ data: { slug: 'empresa-b', name: 'B' } }); // trava desligada
    id.tenantA = a.id;
    id.tenantB = b.id;
    for (const [t, slug] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        id[`${role}${slug}`] = (await addUser(prisma, t.id, `${role}@${slug}.com`, role)).id;
        jwt[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    await addUser(prisma, null, 'plataforma@x.com', 'platform_admin');
    jwt.platform = (await login(app, undefined, 'plataforma@x.com')).accessToken;

    for (const [t, owner, k] of [
      [a, id.professora, 'courseA'],
      [b, id.professorb, 'courseB'],
    ] as const) {
      id[k] = (
        await prisma.course.create({
          data: { tenantId: t.id, title: k, status: 'published', ownerId: owner },
        })
      ).id;
    }
    key = (await newKey('admina', ['access:manage'])).body.token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (previous === undefined) delete process.env.ACCESS_ENDPOINT_ENABLED;
    else process.env.ACCESS_ENDPOINT_ENABLED = previous;
  });

  describe('trava', () => {
    it('com a trava global desligada as rotas respondem 404 e nada é criado', async () => {
      process.env.ACCESS_ENDPOINT_ENABLED = 'false';
      const off = await createApp(overrides);
      try {
        const h = bearer(key);
        const body = { email: 'x@x.com', name: 'Xis', courseId: id.courseA };
        await request(off.getHttpServer())
          .post('/v1/access/enrollments')
          .set(h)
          .send(body)
          .expect(404);
        await request(off.getHttpServer())
          .post('/v1/access/sessions')
          .set(h)
          .send({ email: 'a@a.com' })
          .expect(404);
        await request(off.getHttpServer())
          .post('/v1/auth/first-access')
          .send({ token: 'x'.repeat(30), password: 'senha-forte-1' })
          .expect(404);
        expect(await prisma.user.count({ where: { email: 'x@x.com' } })).toBe(0);
      } finally {
        await off.close();
        process.env.ACCESS_ENDPOINT_ENABLED = 'true';
      }
    });

    it('empresa não habilitada pelo operador também recebe 404', async () => {
      const keyB = (await newKey('adminb', ['access:manage'])).body.token;
      await enroll({ email: 'novo@b.com', name: 'Novo B', courseId: id.courseB }, keyB).expect(404);
      await post('/v1/access/sessions', { email: 'aluno@b.com' }, keyB).expect(404);
      expect(await prisma.user.count({ where: { email: 'novo@b.com' } })).toBe(0);
    });

    it('só o operador da plataforma liga a API de uma empresa', async () => {
      await http()
        .patch(`/v1/platform/tenants/${id.tenantB}`)
        .set(bearer(jwt.adminb))
        .send({ accessEndpointEnabled: true })
        .expect(403);
      const on = await http()
        .patch(`/v1/platform/tenants/${id.tenantB}`)
        .set(bearer(jwt.platform))
        .send({ accessEndpointEnabled: true })
        .expect(200);
      expect(on.body.accessEndpointEnabled).toBe(true);
      await http()
        .patch(`/v1/platform/tenants/${id.tenantB}`)
        .set(bearer(jwt.platform))
        .send({ accessEndpointEnabled: false })
        .expect(200);
    });
  });

  describe('chave de integração', () => {
    it('só admin recebe o escopo; aluno e professor são recusados', async () => {
      await newKey('professora', ['access:manage']).then((r) => expect(r.status).toBe(403));
      await newKey('alunoa', ['access:manage']).then((r) => expect(r.status).toBe(403));
    });

    it('sem chave, chave inventada, JWT de login ou token sem o escopo: 401', async () => {
      const body = { email: 'z@z.com', name: 'Zê', courseId: id.courseA };
      const catalogOnly = (await newKey('admina', ['catalog:read'])).body.token;
      await http().post('/v1/access/enrollments').send(body).expect(401);
      await post('/v1/access/enrollments', body, 'gvmcp_' + 'x'.repeat(43)).expect(401);
      await post('/v1/access/enrollments', body, jwt.admina).expect(401);
      await post('/v1/access/enrollments', body, catalogOnly).expect(401);
      expect(await prisma.user.count({ where: { email: 'z@z.com' } })).toBe(0);
    });

    it('revogar a chave corta a integração na hora', async () => {
      const k = await newKey('admina', ['access:manage']);
      await post('/v1/access/sessions', { email: 'alunoa@a.com' }, k.body.token).expect(404); // chave vale
      await http().delete(`/v1/me/mcp-tokens/${k.body.id}`).set(bearer(jwt.admina)).expect(204);
      await post('/v1/access/sessions', { email: 'aluno@a.com' }, k.body.token).expect(401);
    });

    it('a chave de uma empresa não alcança a outra', async () => {
      await post('/v1/access/enrollments', {
        email: 'aluno@b.com',
        name: 'Xis',
        courseId: id.courseB,
      }).expect(404);
      await session({ email: 'aluno@b.com' }).expect(404);
    });
  });

  describe('matrícula', () => {
    it('cria o aluno sem senha utilizável, matricula e guarda o externalId', async () => {
      const res = await enroll({
        email: ' Maria@Exemplo.COM ',
        name: 'Maria Souza',
        externalId: 'ext-100',
      }).expect(201);
      expect(res.body).toMatchObject({
        userCreated: true,
        created: true,
        replayed: false,
        revoked: false,
        courseId: id.courseA,
        startsAt: null,
        endsAt: null,
        firstAccess: null,
      });
      const user = await prisma.user.findFirstOrThrow({ where: { email: 'maria@exemplo.com' } });
      expect(user).toMatchObject({ role: 'aluno', tenantId: id.tenantA, externalId: 'ext-100' });
      expect(user.passwordHash.startsWith('!')).toBe(true);
      // nenhuma senha, nem a vazia, entra por login direto
      for (const password of ['senha-qualquer-1', user.passwordHash]) {
        await http()
          .post('/v1/auth/login')
          .send({ tenant: 'empresa-a', email: 'maria@exemplo.com', password })
          .expect(401);
      }
    });

    it('com a mesma externalRef repetir não duplica nem renova o prazo', async () => {
      const body = {
        email: 'pedro@exemplo.com',
        name: 'Pedro',
        accessDays: 30,
        externalRef: 'pedido-1',
      };
      const first = await enroll(body).expect(201);
      const again = await enroll(body).expect(200);
      expect(again.body).toMatchObject({ replayed: true, created: false, userCreated: false });
      expect(again.body.enrollmentId).toBe(first.body.enrollmentId);
      expect(again.body.endsAt).toBe(first.body.endsAt);
      expect(await prisma.user.count({ where: { email: 'pedro@exemplo.com' } })).toBe(1);
      expect(await prisma.enrollment.count({ where: { externalRef: 'pedido-1' } })).toBe(1);

      // a mesma referência em outro curso ou para outro aluno é um erro, não uma segunda matrícula
      const other = await prisma.course.create({
        data: { tenantId: id.tenantA, title: 'outro', status: 'published', ownerId: id.professora },
      });
      await enroll({ ...body, courseId: other.id }).expect(409);
      await enroll({ ...body, email: 'outro@exemplo.com' }).expect(409);
    });

    it('aluno que já existe só ganha a matrícula: senha e nome ficam como estão', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: id.alunoa } });
      const res = await enroll({ email: 'aluno@a.com', name: 'Nome Diferente' }).expect(201);
      expect(res.body.userCreated).toBe(false);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: id.alunoa } });
      expect(after.name).toBe(before.name);
      expect(after.passwordHash).toBe(before.passwordHash);
      await login(app, 'empresa-a', 'aluno@a.com'); // continua entrando pela senha dele
    });

    it('recusa quem não é aluno, curso inexistente ou de outra empresa e campos desconhecidos', async () => {
      await enroll({ email: 'professor@a.com' }).expect(422);
      await enroll({ email: 'admin@a.com' }).expect(422);
      await enroll({
        email: 'novo@exemplo.com',
        name: 'Novo',
        courseId: '00000000-0000-4000-8000-000000000000',
      }).expect(404);
      await enroll({ email: 'novo@exemplo.com', name: 'Novo', courseId: id.courseB }).expect(404);
      await enroll({ email: 'sem-nome@exemplo.com' }).expect(400); // aluno novo exige nome
      await enroll({ email: 'x@exemplo.com', name: 'Xis', tenantId: id.tenantB }).expect(400);
      expect(
        await prisma.user.count({
          where: { email: { in: ['novo@exemplo.com', 'sem-nome@exemplo.com', 'x@exemplo.com'] } },
        }),
      ).toBe(0);
    });

    it('externalId não pode apontar para dois alunos', async () => {
      await enroll({ email: 'a1@exemplo.com', name: 'A Um', externalId: 'ext-dup' }).expect(201);
      await enroll({ email: 'a2@exemplo.com', name: 'A Dois', externalId: 'ext-dup' }).expect(409);
      await enroll({ email: 'a1@exemplo.com', externalId: 'ext-outro' }).expect(409);
      expect(await prisma.user.count({ where: { email: 'a2@exemplo.com' } })).toBe(0);
    });

    it('duas chamadas simultâneas para o mesmo aluno novo geram um só usuário', async () => {
      const call = () => enroll({ email: 'corrida@exemplo.com', name: 'Corrida' });
      const [r1, r2] = await Promise.all([call(), call()]);
      expect([r1.status, r2.status].every((s) => s === 200 || s === 201)).toBe(true);
      expect(await prisma.user.count({ where: { email: 'corrida@exemplo.com' } })).toBe(1);
      expect(
        await prisma.enrollment.count({ where: { user: { email: 'corrida@exemplo.com' } } }),
      ).toBe(1);
    });
  });

  describe('prazo, revogação e sessão do aluno', () => {
    const sessionFor = async (email: string) =>
      (await session({ email }).expect(200)).body.accessToken as string;

    it('janela de acesso: futuro e vencida escondem o curso; vigente mostra', async () => {
      await enroll({
        email: 'janela@exemplo.com',
        name: 'Janela',
        startsAt: new Date(Date.now() + 2 * DAY).toISOString(),
        accessDays: 10,
      }).expect(201);
      const s = await sessionFor('janela@exemplo.com');
      expect(await visibleCourses(s)).not.toContain(id.courseA); // ainda não começou
      await http().get(`/v1/courses/${id.courseA}`).set(bearer(s)).expect(403);

      const user = await prisma.user.findFirstOrThrow({ where: { email: 'janela@exemplo.com' } });
      const where = { userId_courseId: { userId: user.id, courseId: id.courseA } };
      await prisma.enrollment.update({
        where,
        data: { startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) },
      });
      expect(await visibleCourses(s)).toContain(id.courseA); // vigente
      await http().get(`/v1/courses/${id.courseA}`).set(bearer(s)).expect(200);

      await prisma.enrollment.update({ where, data: { endsAt: new Date(Date.now() - 1000) } });
      expect(await visibleCourses(s)).not.toContain(id.courseA); // venceu
      await http().get(`/v1/courses/${id.courseA}`).set(bearer(s)).expect(403);
    });

    it('datas inválidas são recusadas', async () => {
      const base = { email: 'datas@exemplo.com', name: 'Datas' };
      await enroll({ ...base, endsAt: '2020-01-01' }).expect(400);
      await enroll({ ...base, startsAt: '2030-02-01', endsAt: '2030-01-01' }).expect(400);
      await enroll({ ...base, endsAt: '2030-01-01', accessDays: 5 }).expect(400);
      await enroll({ ...base, endsAt: 'amanhã' }).expect(400);
      expect(await prisma.user.count({ where: { email: 'datas@exemplo.com' } })).toBe(0);
    });

    it('data só com o dia vale o dia inteiro em São Paulo', async () => {
      const res = await enroll({
        email: 'dia@exemplo.com',
        name: 'Dia',
        startsAt: '2030-03-01',
        endsAt: '2030-03-31',
      }).expect(201);
      expect(res.body.startsAt).toBe('2030-03-01T03:00:00.000Z');
      expect(res.body.endsAt).toBe('2030-04-01T02:59:59.999Z');
    });

    it('revogar tira o acesso na hora; repetir é inofensivo; só reactivate:true (ou novas datas) reativa', async () => {
      await enroll({ email: 'rev@exemplo.com', name: 'Rev' }).expect(201);
      const s = await sessionFor('rev@exemplo.com');
      expect(await visibleCourses(s)).toContain(id.courseA);

      await post('/v1/access/enrollments/revoke', {
        email: 'rev@exemplo.com',
        courseId: id.courseA,
      }).expect(204);
      await post('/v1/access/enrollments/revoke', {
        email: 'rev@exemplo.com',
        courseId: id.courseA,
      }).expect(204);
      expect(await visibleCourses(s)).not.toContain(id.courseA);
      await http().get(`/v1/courses/${id.courseA}`).set(bearer(s)).expect(403);
      const row = await prisma.enrollment.findFirstOrThrow({
        where: { user: { email: 'rev@exemplo.com' } },
      });
      expect(row.revokedAt).not.toBeNull(); // o registro fica para histórico

      // chamada "pelada" (sem datas nem externalRef) NÃO reativa uma matrícula revogada
      const bare = await enroll({ email: 'rev@exemplo.com' }).expect(200);
      expect(bare.body.revoked).toBe(true);
      expect(await visibleCourses(s)).not.toContain(id.courseA);

      const back = await enroll({ email: 'rev@exemplo.com', reactivate: true }).expect(200);
      expect(back.body.revoked).toBe(false);
      expect(await visibleCourses(s)).toContain(id.courseA);

      await post('/v1/access/enrollments/revoke', {
        email: 'nao-existe@exemplo.com',
        courseId: id.courseA,
      }).expect(404);
      await post('/v1/access/enrollments/revoke', {
        email: 'aluno@a.com',
        courseId: id.courseB,
      }).expect(404);
    });

    it('chamada sem datas e sem externalRef não zera o prazo nem reativa (1.1)', async () => {
      const first = await enroll({
        email: 'prazo@exemplo.com',
        name: 'Prazo',
        accessDays: 10,
      }).expect(201);
      const again = await enroll({ email: 'prazo@exemplo.com' }).expect(200);
      expect(again.body.endsAt).toBe(first.body.endsAt); // prazo preservado, não vira "sem limite"
      expect(again.body.created).toBe(false);

      // revogada + chamada pelada continua revogada e com o mesmo prazo
      await post('/v1/access/enrollments/revoke', {
        email: 'prazo@exemplo.com',
        courseId: id.courseA,
      }).expect(204);
      const still = await enroll({ email: 'prazo@exemplo.com' }).expect(200);
      expect(still.body).toMatchObject({ revoked: true, endsAt: first.body.endsAt });

      // reactivate:true reativa MANTENDO a janela existente
      const back = await enroll({ email: 'prazo@exemplo.com', reactivate: true }).expect(200);
      expect(back.body).toMatchObject({ revoked: false, endsAt: first.body.endsAt });

      // datas novas continuam sendo uma nova concessão (contrato anterior): reativa e troca a janela
      await post('/v1/access/enrollments/revoke', {
        email: 'prazo@exemplo.com',
        courseId: id.courseA,
      }).expect(204);
      const renewed = await enroll({ email: 'prazo@exemplo.com', accessDays: 60 }).expect(200);
      expect(renewed.body.revoked).toBe(false);
      expect(renewed.body.endsAt).not.toBe(first.body.endsAt);
    });

    it('matrícula manual do professor não zera o prazo de uma matrícula vigente (1.1) e unenroll revoga sem apagar (1.2)', async () => {
      await enroll({ email: 'manual2@exemplo.com', name: 'Manual 2', accessDays: 5 }).expect(201);
      const user = await prisma.user.findFirstOrThrow({ where: { email: 'manual2@exemplo.com' } });
      await http()
        .post(`/v1/courses/${id.courseA}/enrollments`)
        .set(bearer(jwt.professora))
        .send({ userId: user.id })
        .expect(201);
      const kept = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } });
      expect(kept.endsAt).not.toBeNull(); // prazo da integração intacto

      await http()
        .delete(`/v1/courses/${id.courseA}/enrollments/${user.id}`)
        .set(bearer(jwt.professora))
        .expect(204);
      const soft = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } });
      expect(soft.revokedAt).not.toBeNull(); // linha continua existindo (histórico)
      expect(soft.endsAt?.getTime()).toBe(kept.endsAt?.getTime());
      // repetir é inofensivo e não muda a data da revogação
      await http()
        .delete(`/v1/courses/${id.courseA}/enrollments/${user.id}`)
        .set(bearer(jwt.professora))
        .expect(204);
      const again = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } });
      expect(again.revokedAt?.getTime()).toBe(soft.revokedAt?.getTime());
    });

    it('matrícula manual do professor reativa uma revogada e remove o prazo', async () => {
      await enroll({ email: 'manual@exemplo.com', name: 'Manual', accessDays: 5 }).expect(201);
      await post('/v1/access/enrollments/revoke', {
        email: 'manual@exemplo.com',
        courseId: id.courseA,
      }).expect(204);
      const user = await prisma.user.findFirstOrThrow({ where: { email: 'manual@exemplo.com' } });
      await http()
        .post(`/v1/courses/${id.courseA}/enrollments`)
        .set(bearer(jwt.professora))
        .send({ userId: user.id })
        .expect(201);
      const row = await prisma.enrollment.findFirstOrThrow({ where: { userId: user.id } });
      expect(row).toMatchObject({ revokedAt: null, startsAt: null, endsAt: null });
    });

    it('sessão por e-mail ou externalId: JWT curto de aluno, sem refresh, que serve na API', async () => {
      await enroll({
        email: 'sessao@exemplo.com',
        name: 'Sessão',
        externalId: 'ext-sessao',
      }).expect(201);
      const byEmail = await session({ email: 'sessao@exemplo.com' }).expect(200);
      const byExt = await session({ externalId: 'ext-sessao' }).expect(200);
      for (const res of [byEmail, byExt]) {
        expect(res.body).toMatchObject({ tokenType: 'Bearer', user: { name: 'Sessão' } });
        expect(res.body.refreshToken).toBeUndefined();
        expect(res.body.expiresIn).toBeGreaterThan(0);
      }
      const claims = JSON.parse(
        Buffer.from(byEmail.body.accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(claims).toMatchObject({ tid: id.tenantA, role: 'aluno', email: 'sessao@exemplo.com' });

      const me = await http().get('/v1/me').set(bearer(byEmail.body.accessToken)).expect(200);
      expect(me.body).toMatchObject({ role: 'aluno', email: 'sessao@exemplo.com' });
      expect(await visibleCourses(byExt.body.accessToken)).toEqual([id.courseA]);
    });

    it('sessão só para aluno da própria empresa; entrada precisa de exatamente um identificador', async () => {
      await session({ email: 'admin@a.com' }).expect(422);
      await session({ email: 'professor@a.com' }).expect(422);
      await session({ email: 'inexistente@exemplo.com' }).expect(404);
      await session({ email: 'aluno@b.com' }).expect(404); // outra empresa
      await session({}).expect(400);
      await session({ email: 'aluno@a.com', externalId: 'x' }).expect(400);
    });
  });

  describe('primeiro acesso (login direto nesta API)', () => {
    const redeem = (token: string, password = 'minha-senha-nova-1') =>
      http().post('/v1/auth/first-access').send({ token, password });

    it('só é emitido se pedido; define a senha uma vez e depois o aluno faz login', async () => {
      const plain = await enroll({ email: 'pa1@exemplo.com', name: 'PA Um' }).expect(201);
      expect(plain.body.firstAccess).toBeNull();

      const res = await enroll({
        email: 'pa2@exemplo.com',
        name: 'PA Dois',
        issueFirstAccess: true,
      }).expect(201);
      const { token, expiresAt } = res.body.firstAccess;
      expect(token.length).toBeGreaterThan(30);
      expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(6 * DAY);
      const stored = await prisma.firstAccessToken.findFirstOrThrow({
        where: { user: { email: 'pa2@exemplo.com' } },
      });
      expect(stored.tokenHash).not.toContain(token); // só o HMAC fica no banco

      await redeem(token, 'curta').expect(400); // mesma regra de senha do cadastro
      await redeem(token).expect(204);
      await redeem(token).expect(401); // uso único
      await http()
        .post('/v1/auth/login')
        .send({ tenant: 'empresa-a', email: 'pa2@exemplo.com', password: 'minha-senha-nova-1' })
        .expect(200);
    });

    it('token novo invalida o anterior; vencido, inventado ou de aluno com senha não funcionam', async () => {
      const first = (
        await enroll({ email: 'pa3@exemplo.com', name: 'PA Três', issueFirstAccess: true })
      ).body.firstAccess.token;
      const second = (await enroll({ email: 'pa3@exemplo.com', issueFirstAccess: true })).body
        .firstAccess.token;
      await redeem(first).expect(401);
      await prisma.firstAccessToken.updateMany({
        where: { user: { email: 'pa3@exemplo.com' }, usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await redeem(second).expect(401); // venceu
      await redeem('x'.repeat(43)).expect(401);

      // aluno que já tem senha não recebe token mesmo se pedirem
      const withPassword = await enroll({ email: 'aluno@a.com', issueFirstAccess: true }).expect(
        200,
      );
      expect(withPassword.body.firstAccess).toBeNull();
    });
  });

  describe('auditoria', () => {
    it('registra o que foi feito, por quem e com quais ids, sem e-mail', async () => {
      await prisma.auditLog.deleteMany({});
      await enroll({
        email: 'auditado@exemplo.com',
        name: 'Auditado',
        externalRef: 'pedido-aud',
      }).expect(201);
      await session({ email: 'auditado@exemplo.com' }).expect(200);
      await post('/v1/access/enrollments/revoke', {
        email: 'auditado@exemplo.com',
        courseId: id.courseA,
      }).expect(204);

      const rows = await prisma.auditLog.findMany({ orderBy: { at: 'asc' } });
      expect(rows.map((r) => [r.via, r.tool, r.ok])).toEqual([
        ['access-api', 'access.enroll', true],
        ['access-api', 'access.session', true],
        ['access-api', 'access.revoke', true],
      ]);
      expect(rows[0]).toMatchObject({ tenantId: id.tenantA, actorId: id.admina });
      expect(rows[0].detail).toMatchObject({
        userCreated: true,
        created: true,
        courseId: id.courseA,
      });
      expect(JSON.stringify(rows)).not.toContain('auditado@exemplo.com');
    });
  });
});

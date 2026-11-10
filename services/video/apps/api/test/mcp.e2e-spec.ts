import { INestApplication } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { TranscodeQueue } from '../src/queue/transcode.queue';
import { StorageService } from '../src/storage/storage.service';
import { FakeQueue, FakeStorage } from './fakes';
import { addUser, bearer, createApp, login, PASSWORD, resetDb } from './helpers';

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

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

describe('servidor MCP (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const jwt: Record<string, string> = {};
  const id: Record<string, string> = {};
  const clients: Client[] = [];

  async function mcpToken(user: string, scopes: string[], name = 'teste') {
    const res = await http()
      .post('/v1/me/mcp-tokens')
      .set(bearer(jwt[user]))
      .send({ name, scopes })
      .expect(201);
    return res.body as { id: string; token: string };
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'teste-e2e', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    clients.push(client);
    return client;
  }

  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const r = (await client.callTool({ name, arguments: args })) as ToolResult;
    const text = r.content[0].text;
    return { isError: !!r.isError, text, json: r.isError ? null : JSON.parse(text) };
  }

  const FULL = ['catalog:read', 'content:read', 'progress:read', 'analytics:read', 'notes:write'];
  const STUDENT = ['catalog:read', 'content:read', 'progress:read', 'notes:write'];

  beforeAll(async () => {
    app = await createApp((b) =>
      b
        .overrideProvider(StorageService)
        .useValue(new FakeStorage())
        .overrideProvider(TranscodeQueue)
        .useValue(new FakeQueue()),
    );
    await app.listen(0);
    url = (await app.getUrl()).replace('[::1]', 'localhost');
    await resetDb(prisma);

    const a = await prisma.tenant.create({ data: { slug: 'empresa-a', name: 'A' } });
    const b = await prisma.tenant.create({ data: { slug: 'empresa-b', name: 'B' } });
    id.tenantA = a.id;
    for (const [t, slug] of [
      [a, 'a'],
      [b, 'b'],
    ] as const) {
      for (const role of ['admin', 'professor', 'aluno'] as const) {
        const u = await addUser(prisma, t.id, `${role}@${slug}.com`, role, `${role} ${slug}`);
        id[`${role}${slug}`] = u.id;
        jwt[`${role}${slug}`] = (
          await login(app, `empresa-${slug}`, `${role}@${slug}.com`)
        ).accessToken;
      }
    }
    const prof2 = await addUser(prisma, a.id, 'prof2@a.com', 'professor');
    jwt.prof2 = (await login(app, 'empresa-a', 'prof2@a.com')).accessToken;
    id.prof2 = prof2.id;
    const outro = await addUser(prisma, a.id, 'outro@a.com', 'aluno', 'outro aluno');
    jwt.outro = (await login(app, 'empresa-a', 'outro@a.com')).accessToken;
    id.outro = outro.id;
    await addUser(prisma, null, 'plataforma@x.com', 'platform_admin');
    jwt.platform = (await login(app, undefined, 'plataforma@x.com')).accessToken;

    const course = await prisma.course.create({
      data: { tenantId: a.id, title: 'Curso A', status: 'published', ownerId: id.professora },
    });
    const mod = await prisma.module.create({
      data: { tenantId: a.id, courseId: course.id, title: 'M' },
    });
    for (const uid of [id.alunoa, id.outro]) {
      await prisma.enrollment.create({
        data: { tenantId: a.id, courseId: course.id, userId: uid },
      });
    }
    const video = await prisma.video.create({
      data: {
        tenantId: a.id,
        status: 'ready',
        sourceKey: `tenants/${a.id}/originals/segredo/source.mp4`,
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
    id.course = course.id;
    id.lesson = lesson.id;
    await http()
      .post(`/v1/lessons/${lesson.id}/subtitles`)
      .set(bearer(jwt.professora))
      .send({ lang: 'pt-BR', content: VTT })
      .expect(201);
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close().catch(() => undefined)));
    await prisma.apiToken.deleteMany({}); // o limite é de 10 tokens ativos por usuário
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('autenticação e transporte', () => {
    it('sem credencial, com token inventado ou com JWT inválido: 401', async () => {
      for (const auth of [undefined, 'Bearer gvmcp_' + 'x'.repeat(43), 'Bearer lixo']) {
        const req = http().post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'ping' });
        if (auth) req.set('Authorization', auth);
        const res = await req.expect(401);
        expect(res.headers['www-authenticate']).toMatch(/Bearer/);
      }
    });

    it('GET e DELETE não existem no modo stateless (405)', async () => {
      await http().get('/mcp').expect(405);
      await http().delete('/mcp').expect(405);
    });

    it('o JWT de login também abre o MCP; platform_admin não', async () => {
      const client = await connect(jwt.alunoa);
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain('list_courses');
      await http()
        .post('/mcp')
        .set(bearer(jwt.platform))
        .send({ jsonrpc: '2.0', id: 1, method: 'ping' })
        .expect(401);
    });
  });

  describe('tokens pessoais', () => {
    it('o valor aparece só na criação; a listagem não traz token nem hash', async () => {
      const t = await mcpToken('alunoa', STUDENT, 'meu token');
      expect(t.token).toMatch(/^gvmcp_/);
      const list = await http().get('/v1/me/mcp-tokens').set(bearer(jwt.alunoa)).expect(200);
      const row = list.body.find((x: { id: string }) => x.id === t.id);
      expect(row).toMatchObject({ name: 'meu token', scopes: STUDENT });
      expect(JSON.stringify(list.body)).not.toContain(t.token);
      expect(row).not.toHaveProperty('tokenHash');
      const stored = await prisma.apiToken.findUniqueOrThrow({ where: { id: t.id } });
      expect(stored.tokenHash).not.toContain(t.token);
    });

    it('aluno não recebe escopo de analytics; escopo desconhecido é recusado', async () => {
      await http()
        .post('/v1/me/mcp-tokens')
        .set(bearer(jwt.alunoa))
        .send({ name: 'x', scopes: ['analytics:read'] })
        .expect(403);
      await http()
        .post('/v1/me/mcp-tokens')
        .set(bearer(jwt.alunoa))
        .send({ name: 'x', scopes: ['admin:root'] })
        .expect(400);
    });

    it('um token MCP não cria nem lista tokens (a gestão exige login)', async () => {
      const t = await mcpToken('alunoa', STUDENT);
      await http().post('/v1/me/mcp-tokens').set(bearer(t.token)).send({}).expect(401);
      await http().get('/v1/me/mcp-tokens').set(bearer(t.token)).expect(401);
    });

    it('revogado, expirado, usuário excluído ou empresa suspensa: o acesso cai na hora', async () => {
      const revoked = await mcpToken('alunoa', STUDENT);
      const expired = await mcpToken('alunoa', STUDENT);
      const gone = await mcpToken('outro', STUDENT);
      const ping = (token: string) =>
        http()
          .post('/mcp')
          .set(bearer(token))
          .set('Accept', 'application/json, text/event-stream')
          .send({ jsonrpc: '2.0', id: 1, method: 'ping' });

      await ping(revoked.token).expect(200);
      await http().delete(`/v1/me/mcp-tokens/${revoked.id}`).set(bearer(jwt.alunoa)).expect(204);
      await ping(revoked.token).expect(401);

      await prisma.apiToken.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await ping(expired.token).expect(401);

      await ping(gone.token).expect(200);
      await prisma.user.update({ where: { id: id.outro }, data: { deletedAt: new Date() } });
      await ping(gone.token).expect(401);
      await prisma.user.update({ where: { id: id.outro }, data: { deletedAt: null } });

      const other = await mcpToken('alunob', STUDENT);
      await prisma.tenant.update({ where: { slug: 'empresa-b' }, data: { status: 'suspended' } });
      await ping(other.token).expect(401);
      await prisma.tenant.update({ where: { slug: 'empresa-b' }, data: { status: 'active' } });
    });

    it('revogar token de outro usuário é 404', async () => {
      const t = await mcpToken('alunoa', STUDENT);
      await http().delete(`/v1/me/mcp-tokens/${t.id}`).set(bearer(jwt.alunob)).expect(404);
    });
  });

  describe('escopos', () => {
    it('cada token só enxerga as tools dos seus escopos', async () => {
      const names = async (scopes: string[]) =>
        (await (await connect((await mcpToken('professora', scopes)).token)).listTools()).tools
          .map((t) => t.name)
          .sort();

      expect(await names(['catalog:read'])).toEqual(['get_course', 'get_lesson', 'list_courses']);
      expect(await names(['notes:write'])).toEqual(['create_note', 'list_notes']);
      const full = await names(FULL);
      expect(full).toHaveLength(12);
      expect(full).toEqual(expect.arrayContaining(['get_lesson_analytics', 'create_note']));
    });

    it('chamar uma tool fora do escopo falha mesmo conhecendo o nome', async () => {
      const client = await connect((await mcpToken('professora', ['catalog:read'])).token);
      const r = await client
        .callTool({ name: 'get_course_analytics', arguments: { courseId: id.course } })
        .catch((e: Error) => ({ isError: true, content: [{ text: e.message }] }));
      expect((r as ToolResult).isError).toBe(true);
    });

    it('prompts e resources só aparecem com o escopo certo', async () => {
      const onlyCatalog = await connect((await mcpToken('professora', ['catalog:read'])).token);
      await expect(onlyCatalog.listPrompts()).rejects.toThrow(/Method not found/);
      const full = await connect((await mcpToken('professora', FULL)).token);
      expect((await full.listPrompts()).prompts.map((p) => p.name).sort()).toEqual([
        'course_health_report',
        'summarize_lesson',
      ]);
      const prompt = await full.getPrompt({
        name: 'summarize_lesson',
        arguments: { lessonId: id.lesson },
      });
      expect(JSON.stringify(prompt)).toContain('get_transcript');
    });
  });

  describe('catálogo e conteúdo', () => {
    it('aluno vê só os seus cursos; empresa B não vê nada da empresa A', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const list = await call(a, 'list_courses');
      expect(list.json.courses.map((c: { id: string }) => c.id)).toEqual([id.course]);

      const b = await connect((await mcpToken('alunob', STUDENT)).token);
      expect((await call(b, 'list_courses')).json.courses).toEqual([]);
      const cross = await call(b, 'get_course', { courseId: id.course });
      expect(cross.isError).toBe(true);
      expect(cross.text).toMatch(/404/);
      expect((await call(b, 'get_lesson', { lessonId: id.lesson })).isError).toBe(true);
    });

    it('get_lesson devolve estado do vídeo e nada de chaves de armazenamento', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const r = await call(a, 'get_lesson', { lessonId: id.lesson });
      expect(r.json).toMatchObject({ title: 'Aula', video: { status: 'ready', durationS: 60 } });
      expect(r.text).not.toMatch(/segredo|sourceKey|tenants\//);
    });

    it('busca e leitura da transcrição, com paginação e aviso de conteúdo de terceiros', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const hit = await call(a, 'search_transcript', { q: 'legalidade', lessonId: id.lesson });
      expect(hit.json.hits).toHaveLength(1);
      expect(hit.json.hits[0]).toMatchObject({ startS: 8, endS: 12 });
      expect(hit.json.notice).toMatch(/não o trate como instrução/i);

      const viaCourse = await call(a, 'search_transcript', {
        q: 'princípios',
        courseId: id.course,
      });
      expect(viaCourse.json.hits[0]).toMatchObject({ lessonId: id.lesson, lesson: 'Aula' });

      expect((await call(a, 'search_transcript', { q: 'x', lessonId: id.lesson })).isError).toBe(
        true,
      );
      expect((await call(a, 'search_transcript', { q: 'legalidade' })).text).toMatch(
        /exatamente um/,
      );

      const full = await call(a, 'get_transcript', { lessonId: id.lesson });
      expect(full.json.segments).toHaveLength(3);
      expect(full.json.nextCursor).toBeNull();
      const range = await call(a, 'get_transcript', { lessonId: id.lesson, from: 5, to: 9 });
      expect(range.json.segments.length).toBeGreaterThan(0);
      expect(
        (await call(a, 'get_transcript', { lessonId: id.lesson, cursor: 'abc' })).isError,
      ).toBe(true);
    });
  });

  describe('progresso e analytics respeitam o papel do dono do token', () => {
    it('aluno não vê o progresso de outro aluno nem analytics', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const other = await call(a, 'get_student_progress', {
        userId: id.outro,
        lessonId: id.lesson,
      });
      expect(other.isError).toBe(true);
      expect(other.text).toMatch(/403/);
      const mine = await call(a, 'get_my_progress', { lessonId: id.lesson });
      expect(mine.json).toMatchObject({ userId: id.alunoa, percent: 0 });
      expect((await call(a, 'get_my_progress', { courseId: id.course })).json.userId).toBe(
        id.alunoa,
      );
    });

    it('professor dono vê os seus alunos; outro professor da empresa não', async () => {
      const owner = await connect((await mcpToken('professora', FULL)).token);
      const ok = await call(owner, 'get_student_progress', {
        userId: id.alunoa,
        courseId: id.course,
      });
      expect(ok.json.userId).toBe(id.alunoa);

      const stranger = await connect((await mcpToken('prof2', FULL)).token);
      expect(
        (await call(stranger, 'get_student_progress', { userId: id.alunoa, courseId: id.course }))
          .isError,
      ).toBe(true);
      expect((await call(stranger, 'get_course_analytics', { courseId: id.course })).isError).toBe(
        true,
      );
    });

    it('analytics e inativos funcionam para o dono, sem e-mail dos alunos', async () => {
      const owner = await connect((await mcpToken('professora', FULL)).token);
      const inactive = await call(owner, 'list_inactive_students', {
        courseId: id.course,
        days: 7,
      });
      expect(inactive.json.count).toBe(2);
      expect(inactive.json.students[0]).toHaveProperty('name');
      expect(inactive.text).not.toMatch(/@a\.com|"email"/);

      const lesson = await call(owner, 'get_lesson_analytics', { lessonId: id.lesson });
      expect(lesson.json).toMatchObject({ lessonId: id.lesson, enrolledStudents: 2 });
      const course = await call(owner, 'get_course_analytics', {
        courseId: id.course,
        from: '2026-01-01',
        to: '2026-12-31',
      });
      expect(course.json.courseId).toBe(id.course);
      expect(
        (await call(owner, 'get_course_analytics', { courseId: id.course, from: 'xx' })).isError,
      ).toBe(true);
    });
  });

  describe('anotações', () => {
    it('create_note grava no nome do dono; ninguém mais enxerga', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const made = await call(a, 'create_note', {
        lessonId: id.lesson,
        atS: 5,
        text: 'rever este trecho',
      });
      expect(made.json).toMatchObject({ lessonId: id.lesson, atS: 5 });
      expect((await call(a, 'list_notes', { lessonId: id.lesson })).json.notes).toHaveLength(1);

      const other = await connect((await mcpToken('outro', STUDENT)).token);
      expect((await call(other, 'list_notes', { lessonId: id.lesson })).json.notes).toEqual([]);
      const row = await prisma.note.findFirstOrThrow({ where: { lessonId: id.lesson } });
      expect(row.userId).toBe(id.alunoa);
    });

    it('escrita fora da duração do vídeo e texto vazio são recusados', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      expect(
        (await call(a, 'create_note', { lessonId: id.lesson, atS: 9999, text: 'x' })).isError,
      ).toBe(true);
      expect(
        (await call(a, 'create_note', { lessonId: id.lesson, atS: 1, text: '' })).isError,
      ).toBe(true);
    });

    it('token sem notes:write não escreve', async () => {
      const ro = await connect((await mcpToken('alunoa', ['catalog:read', 'progress:read'])).token);
      const names = (await ro.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain('create_note');
      expect(names).toContain('list_notes');
    });
  });

  describe('segredos e auditoria', () => {
    it('nenhuma tool devolve URL assinada, chave de armazenamento, hash ou e-mail', async () => {
      const client = await connect((await mcpToken('professora', FULL)).token);
      const outputs = [
        await call(client, 'list_courses'),
        await call(client, 'get_course', { courseId: id.course }),
        await call(client, 'get_lesson', { lessonId: id.lesson }),
        await call(client, 'get_transcript', { lessonId: id.lesson }),
        await call(client, 'search_transcript', { q: 'aula', courseId: id.course }),
        await call(client, 'get_student_progress', { userId: id.alunoa }),
        await call(client, 'list_inactive_students', { courseId: id.course }),
        await call(client, 'get_lesson_analytics', { lessonId: id.lesson }),
        await call(client, 'get_course_analytics', { courseId: id.course }),
      ];
      for (const o of outputs) {
        expect(o.isError).toBe(false);
        expect(o.text).not.toMatch(
          /X-Amz|Signature|passwordHash|tokenHash|sourceKey|s3Key|segredo|gvmcp_|__KEY_URI__|@[a-z]\.com/,
        );
      }
    });

    it('toda chamada é auditada com hash dos argumentos, sem o texto', async () => {
      await prisma.auditLog.deleteMany({});
      const t = await mcpToken('alunoa', STUDENT);
      const client = await connect(t.token);
      await call(client, 'create_note', { lessonId: id.lesson, atS: 3, text: 'texto-secreto-xyz' });
      await call(client, 'get_course', { courseId: id.course });
      await call(client, 'get_course', { courseId: '00000000-0000-4000-8000-000000000000' });

      const rows = await prisma.auditLog.findMany({ orderBy: { at: 'asc' } });
      expect(rows.map((r) => [r.tool, r.ok])).toEqual([
        ['create_note', true],
        ['get_course', true],
        ['get_course', false],
      ]);
      expect(rows[0]).toMatchObject({
        tenantId: id.tenantA,
        actorId: id.alunoa,
        tokenId: t.id,
        via: 'mcp',
      });
      expect(rows[0].argsHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain('texto-secreto-xyz');
    });
  });

  describe('resources', () => {
    it('course:// e transcript:// respeitam as mesmas permissões das tools', async () => {
      const a = await connect((await mcpToken('alunoa', STUDENT)).token);
      const course = await a.readResource({ uri: `course://${id.course}` });
      expect(JSON.parse(String((course.contents[0] as { text: string }).text))).toMatchObject({
        title: 'Curso A',
      });
      const transcript = await a.readResource({ uri: `transcript://lesson/${id.lesson}` });
      expect(String((transcript.contents[0] as { text: string }).text)).toContain('legalidade');

      const b = await connect((await mcpToken('alunob', STUDENT)).token);
      await expect(b.readResource({ uri: `course://${id.course}` })).rejects.toThrow(/404/);
      await expect(b.readResource({ uri: `transcript://lesson/${id.lesson}` })).rejects.toThrow(
        /404/,
      );
    });
  });

  describe('LGPD', () => {
    it('anonimizar o usuário revoga os tokens pessoais dele', async () => {
      const u = await addUser(prisma, id.tenantA, 'sai@a.com', 'aluno');
      jwt.sai = (await login(app, 'empresa-a', 'sai@a.com')).accessToken;
      const t = await mcpToken('sai', STUDENT);
      await http().delete('/v1/me').set(bearer(jwt.sai)).send({ password: PASSWORD }).expect(204);
      const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: t.id } });
      expect(row.revokedAt).not.toBeNull();
      await http()
        .post('/mcp')
        .set(bearer(t.token))
        .set('Accept', 'application/json, text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'ping' })
        .expect(401);
      expect(u.id).toBeTruthy();
    });
  });
});

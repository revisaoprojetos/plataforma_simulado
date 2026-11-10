import { BadRequestException } from '@nestjs/common';
import { z, ZodRawShape } from 'zod';
import { AnalyticsService } from '../analytics/analytics.service';
import { resolvePeriod } from '../analytics/period';
import { TenantUser } from '../auth/auth.types';
import { ContentService } from '../content/content.service';
import { CoursesService } from '../courses/courses.service';
import { LessonsService } from '../lessons/lessons.service';
import { NotesService } from '../notes/notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { Scope } from './scopes';
import { pageSegments, Segment, UNTRUSTED_NOTICE } from './transcript';

export interface Tool {
  name: string;
  title: string;
  description: string;
  /** a tool existe para o token se ele tiver ao menos um destes escopos */
  scopes: readonly Scope[];
  input: ZodRawShape;
  /** só escrita altera dados; o resto é somente leitura (anotação para o cliente) */
  readOnly: boolean;
  run(user: TenantUser, args: unknown): Promise<unknown>;
}

function defineTool<S extends ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  scopes: readonly Scope[];
  input: S;
  readOnly?: boolean;
  run(user: TenantUser, args: z.infer<z.ZodObject<S>>): Promise<unknown>;
}): Tool {
  return { ...def, readOnly: def.readOnly ?? true, run: (u, a) => def.run(u, a as never) };
}

export interface ToolDeps {
  prisma: PrismaService;
  courses: CoursesService;
  lessons: LessonsService;
  content: ContentService;
  progress: ProgressService;
  analytics: AnalyticsService;
  notes: NotesService;
}

const id = (what: string) => z.string().uuid().describe(`Id (UUID) ${what}`);
const lang = z.string().min(2).max(10).optional().describe('Idioma da legenda, ex.: pt-BR');
const date = (what: string) =>
  z.string().max(40).optional().describe(`${what} (AAAA-MM-DD ou data/hora ISO; padrão: 30 dias)`);

const MAX_COURSE_LESSONS = 40;

function exactlyOne(a: Record<string, unknown>, ...keys: string[]): void {
  if (keys.filter((k) => a[k] !== undefined).length !== 1) {
    throw new BadRequestException(`Informe exatamente um entre: ${keys.join(', ')}`);
  }
}

export function buildTools(d: ToolDeps): Tool[] {
  return [
    defineTool({
      name: 'list_courses',
      title: 'Listar cursos',
      description: 'Cursos que o usuário do token pode ver (aluno: os matriculados e publicados).',
      scopes: ['catalog:read'],
      input: {
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      },
      async run(u, a) {
        const page = await d.courses.list(u, a);
        const data = page.data as {
          id: string;
          title: string;
          description: string | null;
          status: string;
        }[];
        return {
          page: page.page,
          limit: page.limit,
          total: page.total,
          courses: data.map(({ id, title, description, status }) => ({
            id,
            title,
            description,
            status,
          })),
        };
      },
    }),

    defineTool({
      name: 'get_course',
      title: 'Detalhar curso',
      description: 'Curso com seus módulos e aulas (ids, títulos, posição e status).',
      scopes: ['catalog:read'],
      input: { courseId: id('do curso') },
      async run(u, a) {
        const c = await d.courses.get(u, a.courseId);
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          status: c.status,
          modules: c.modules.map((m) => ({
            id: m.id,
            title: m.title,
            position: m.position,
            lessons: m.lessons.map((l) => ({
              id: l.id,
              title: l.title,
              position: l.position,
              status: l.status,
            })),
          })),
        };
      },
    }),

    defineTool({
      name: 'get_lesson',
      title: 'Detalhar aula',
      description: 'Metadados da aula, duração, estado do vídeo e capítulos.',
      scopes: ['catalog:read'],
      input: { lessonId: id('da aula') },
      async run(u, a) {
        const lesson = await d.lessons.getLesson(u, a.lessonId);
        const [chapters, video] = await Promise.all([
          d.content.chapters(u, a.lessonId),
          lesson.videoId
            ? d.prisma.video.findFirst({
                where: { id: lesson.videoId, tenantId: u.tenantId },
                select: { status: true, durationS: true },
              })
            : null,
        ]);
        return {
          id: lesson.id,
          title: lesson.title,
          status: lesson.status,
          moduleId: lesson.moduleId,
          position: lesson.position,
          video: video ? { status: video.status, durationS: video.durationS } : null,
          chapters,
        };
      },
    }),

    defineTool({
      name: 'search_transcript',
      title: 'Buscar na transcrição',
      description:
        'Busca um texto na transcrição de uma aula ou de todas as aulas de um curso (até 40). ' +
        'Devolve trechos com o tempo em segundos.',
      scopes: ['content:read'],
      input: {
        q: z.string().trim().min(2).max(100).describe('Texto a procurar'),
        lessonId: id('da aula').optional(),
        courseId: id('do curso').optional(),
        lang,
        limit: z.number().int().min(1).max(50).default(20),
      },
      async run(u, a) {
        exactlyOne(a, 'lessonId', 'courseId');
        const targets: { id: string; title: string }[] = [];
        if (a.lessonId) {
          targets.push({ id: a.lessonId, title: '' });
        } else {
          const course = await d.courses.get(u, a.courseId as string);
          for (const m of course.modules) {
            for (const l of m.lessons) if (l.videoId) targets.push({ id: l.id, title: l.title });
          }
        }
        const hits: {
          lessonId: string;
          lesson: string;
          startS: number;
          endS: number;
          text: string;
        }[] = [];
        for (const t of targets.slice(0, MAX_COURSE_LESSONS)) {
          if (hits.length >= a.limit) break;
          const r = await d.content.transcript(u, t.id, { q: a.q, lang: a.lang });
          for (const s of r.segments) {
            if (hits.length < a.limit) hits.push({ lessonId: t.id, lesson: t.title, ...s });
          }
        }
        return {
          notice: UNTRUSTED_NOTICE,
          searchedLessons: Math.min(targets.length, MAX_COURSE_LESSONS),
          hits,
        };
      },
    }),

    defineTool({
      name: 'get_transcript',
      title: 'Ler transcrição',
      description:
        'Transcrição de uma aula, opcionalmente só um intervalo (segundos). Textos longos vêm em ' +
        'páginas: repita a chamada com o `nextCursor` recebido.',
      scopes: ['content:read'],
      input: {
        lessonId: id('da aula'),
        lang,
        from: z.number().min(0).optional().describe('Início do intervalo, em segundos'),
        to: z.number().min(0).optional().describe('Fim do intervalo, em segundos'),
        cursor: z.string().max(10).optional().describe('`nextCursor` da página anterior'),
      },
      async run(u, a) {
        const r = await d.content.transcript(u, a.lessonId, {
          lang: a.lang,
          from: a.from,
          to: a.to,
        });
        let page;
        try {
          page = pageSegments(r.segments as Segment[], a.cursor);
        } catch {
          throw new BadRequestException('cursor inválido');
        }
        return {
          notice: UNTRUSTED_NOTICE,
          lang: r.lang,
          languages: r.languages,
          segments: page.segments,
          nextCursor: page.nextCursor,
        };
      },
    }),

    defineTool({
      name: 'get_my_progress',
      title: 'Meu progresso',
      description: 'Progresso do próprio usuário numa aula (trechos assistidos) ou num curso.',
      scopes: ['progress:read'],
      input: { lessonId: id('da aula').optional(), courseId: id('do curso').optional() },
      async run(u, a) {
        exactlyOne(a, 'lessonId', 'courseId');
        return a.lessonId
          ? d.progress.lessonProgress(u, a.lessonId)
          : d.progress.courseProgress(u, a.courseId as string);
      },
    }),

    defineTool({
      name: 'get_student_progress',
      title: 'Progresso de um aluno',
      description:
        'Progresso de um aluno da empresa. Só admin ou o professor dono do curso; sem aula nem ' +
        'curso, devolve o resumo geral do aluno.',
      scopes: ['progress:read'],
      input: {
        userId: id('do aluno'),
        lessonId: id('da aula').optional(),
        courseId: id('do curso').optional(),
      },
      async run(u, a) {
        if (a.lessonId && a.courseId) {
          throw new BadRequestException('Informe no máximo um entre: lessonId, courseId');
        }
        if (a.lessonId) return d.progress.lessonProgress(u, a.lessonId, a.userId);
        if (a.courseId) return d.progress.courseProgress(u, a.courseId, a.userId);
        return d.analytics.student(u, a.userId);
      },
    }),

    defineTool({
      name: 'list_inactive_students',
      title: 'Alunos inativos',
      description:
        'Alunos matriculados sem atividade há N dias (ou que nunca começaram). Sem e-mail.',
      scopes: ['analytics:read'],
      input: { courseId: id('do curso'), days: z.number().int().min(1).max(365).default(14) },
      async run(u, a) {
        const r = await d.analytics.inactive(u, a.courseId, a.days);
        return { ...r, students: r.students.map(({ email: _email, ...s }) => s) };
      },
    }),

    defineTool({
      name: 'get_lesson_analytics',
      title: 'Analytics da aula',
      description:
        'Visualizações, espectadores únicos, conclusão, retenção e pontos de abandono de uma aula.',
      scopes: ['analytics:read'],
      input: { lessonId: id('da aula'), from: date('Início'), to: date('Fim') },
      async run(u, a) {
        return d.analytics.lesson(u, a.lessonId, resolvePeriod(a.from, a.to));
      },
    }),

    defineTool({
      name: 'get_course_analytics',
      title: 'Analytics do curso',
      description: 'Engajamento do curso e ranking de aulas no período.',
      scopes: ['analytics:read'],
      input: { courseId: id('do curso'), from: date('Início'), to: date('Fim') },
      async run(u, a) {
        return d.analytics.course(u, a.courseId, resolvePeriod(a.from, a.to));
      },
    }),

    defineTool({
      name: 'list_notes',
      title: 'Minhas anotações',
      description: 'Anotações do próprio usuário numa aula.',
      scopes: ['notes:write', 'progress:read'],
      input: { lessonId: id('da aula') },
      async run(u, a) {
        return { notice: UNTRUSTED_NOTICE, notes: await d.notes.list(u, a.lessonId) };
      },
    }),

    defineTool({
      name: 'create_note',
      title: 'Criar anotação',
      description: 'Cria uma anotação do usuário numa aula, em um instante (segundos).',
      scopes: ['notes:write'],
      readOnly: false,
      input: {
        lessonId: id('da aula'),
        atS: z.number().finite().min(0).max(86_400).describe('Instante da aula, em segundos'),
        text: z.string().trim().min(1).max(2000),
      },
      async run(u, a) {
        return d.notes.create(u, a.lessonId, { atS: a.atS, text: a.text });
      },
    }),
  ];
}

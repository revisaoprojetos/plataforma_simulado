import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { activeEnrollment } from '../access/enrollment-window';
import { TenantUser } from '../auth/auth.types';
import Redis from 'ioredis';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { findDropoffs, RetentionPoint } from './dropoff';
import { daysOf, Period } from './period';

/** Uma sessão só conta como visualização a partir de 5 s realmente assistidos (descarta cliques acidentais). */
export const MIN_VIEW_S = 5;
/** Largura de cada ponto da curva de retenção. */
export const BUCKET_S = 5;
const DAY_MS = 86_400_000;

/** Só alunos entram nas métricas (professor/admin em pré-visualização não conta como audiência). */
const wsStudent = Prisma.sql`EXISTS (SELECT 1 FROM users su WHERE su.id = ws.user_id AND su.role = 'aluno')`;
const lpStudent = Prisma.sql`EXISTS (SELECT 1 FROM users su WHERE su.id = lp.user_id AND su.role = 'aluno')`;
const rStudent = Prisma.sql`EXISTS (SELECT 1 FROM users su WHERE su.id = r.user_id AND su.role = 'aluno')`;

/** Teto de linhas de relatório que carregam alunos em memória (acima disso o resultado é truncado). */
export const MAX_REPORT_STUDENTS = 5000;

const round1 = (n: number) => Math.round(n * 10) / 10;
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : 0);
const pct = (a: number, total: number) => (total > 0 ? round1((a / total) * 100) : 0);

interface Weighted {
  key: string;
  seconds: number;
}

const withPercent = (rows: Weighted[]) => {
  const total = rows.reduce((s, r) => s + r.seconds, 0);
  return rows
    .map((r) => ({ key: r.key, watchedS: round1(r.seconds), percent: pct(r.seconds, total) }))
    .sort((a, b) => b.watchedS - a.watchedS);
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly env: Pick<Env, 'REPORT_CACHE_TTL_S'>,
  ) {}

  // ---------- aula ----------

  /**
   * Visualizações, tempo, conclusão, curva de retenção, abandono, velocidade, qualidade e dispositivo.
   * Métricas de sessão obedecem ao período; retenção, conclusão e progresso são do histórico inteiro
   * (os trechos assistidos não guardam data).
   */
  async lesson(user: TenantUser, lessonId: string, period: Period) {
    // a permissão é checada ANTES do cache: o cache nunca serve dado a quem não pode ver
    await this.access.assertManageLesson(user, lessonId);
    return this.cached('lesson', user.tenantId, lessonId, period, () =>
      this.lessonUncached(user, lessonId, period),
    );
  }

  private async lessonUncached(user: TenantUser, lessonId: string, period: Period) {
    const { lesson, course } = await this.access.assertManageLesson(user, lessonId);
    const t = user.tenantId;
    const video = lesson.videoId
      ? await this.prisma.video.findFirst({
          where: { id: lesson.videoId, tenantId: t },
          select: { durationS: true },
        })
      : null;
    const duration = video?.durationS ?? 0;
    const buckets = duration > 0 ? Math.ceil(duration / BUCKET_S) : 0;

    // WHERE comum das métricas por sessão (empresa + aula + período + mínimo de segundos)
    const sessions = Prisma.sql`ws.tenant_id = ${t} AND ws.lesson_id = ${lessonId}
      AND ws.watched_s >= ${MIN_VIEW_S} AND ws.started_at >= ${period.from} AND ws.started_at < ${period.to}
      AND ${wsStudent}`;

    const [summary, daily, progress, enrolled, retention, rates, qualities, devices] =
      await Promise.all([
        this.prisma.$queryRaw<{ views: number; uniques: number; watched: number }[]>`
        SELECT COUNT(*)::int AS views, COUNT(DISTINCT ws.user_id)::int AS uniques,
               COALESCE(SUM(ws.watched_s), 0)::float AS watched
        FROM watch_sessions ws WHERE ${sessions}`,
        this.prisma.$queryRaw<{ day: string; views: number; uniques: number; watched: number }[]>`
        SELECT to_char(ws.started_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS views,
               COUNT(DISTINCT ws.user_id)::int AS uniques, SUM(ws.watched_s)::float AS watched
        FROM watch_sessions ws WHERE ${sessions} GROUP BY 1`,
        this.prisma.$queryRaw<{ started: number; completions: number; avg_percent: number }[]>`
        SELECT COUNT(*) FILTER (WHERE percent > 0)::int AS started,
               COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completions,
               COALESCE(AVG(percent) FILTER (WHERE percent > 0), 0)::float AS avg_percent
        FROM lesson_progress lp WHERE lp.tenant_id = ${t} AND lp.lesson_id = ${lessonId} AND ${lpStudent}`,
        this.prisma.enrollment.count({
          where: { tenantId: t, courseId: course.id, ...activeEnrollment() },
        }),
        buckets === 0
          ? Promise.resolve([] as { bucket_s: number; viewers: number }[])
          : this.prisma.$queryRaw<{ bucket_s: number; viewers: number }[]>`
            SELECT (b.n * ${BUCKET_S}::int)::int AS bucket_s, COUNT(DISTINCT r.user_id)::int AS viewers
            FROM generate_series(0, ${buckets - 1}::int) AS b(n)
            LEFT JOIN watch_ranges r ON r.tenant_id = ${t} AND r.lesson_id = ${lessonId}
              AND ${rStudent} AND r.from_s < (b.n + 1) * ${BUCKET_S}::int AND r.to_s > b.n * ${BUCKET_S}::int
            GROUP BY b.n ORDER BY b.n`,
        this.prisma.$queryRaw<Weighted[]>`
        SELECT kv.key AS key, SUM(kv.value::float)::float AS seconds
        FROM watch_sessions ws, LATERAL jsonb_each_text(ws.rates_s) AS kv(key, value)
        WHERE ${sessions} AND ws.rates_s IS NOT NULL GROUP BY kv.key`,
        this.prisma.$queryRaw<Weighted[]>`
        SELECT kv.key AS key, SUM(kv.value::float)::float AS seconds
        FROM watch_sessions ws, LATERAL jsonb_each_text(ws.qualities_s) AS kv(key, value)
        WHERE ${sessions} AND ws.qualities_s IS NOT NULL GROUP BY kv.key`,
        this.prisma.$queryRaw<{ key: string; sessions: number; seconds: number }[]>`
        SELECT COALESCE(ws.device, 'desconhecido') AS key, COUNT(*)::int AS sessions,
               SUM(ws.watched_s)::float AS seconds
        FROM watch_sessions ws WHERE ${sessions} GROUP BY 1`,
      ]);

    const { views, uniques, watched } = summary[0];
    const { started, completions, avg_percent } = progress[0];
    const byDay = new Map(daily.map((d) => [d.day, d]));
    const points: RetentionPoint[] = retention.map((r) => ({
      bucketS: r.bucket_s,
      viewers: r.viewers,
    }));
    const deviceTotal = devices.reduce((s, d) => s + d.seconds, 0);

    return {
      lessonId,
      title: lesson.title,
      durationS: duration || null,
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      views,
      uniqueViewers: uniques,
      watchedS: round1(watched),
      avgWatchedPerViewerS: uniques ? round1(watched / uniques) : 0,
      enrolledStudents: enrolled,
      startedStudents: started,
      notStartedStudents: Math.max(0, enrolled - started),
      completions,
      completionRate: ratio(completions, started),
      avgPercentWatched: round1(avg_percent),
      daily: daysOf(period).map((day) => ({
        day,
        views: byDay.get(day)?.views ?? 0,
        uniqueViewers: byDay.get(day)?.uniques ?? 0,
        watchedS: round1(byDay.get(day)?.watched ?? 0),
      })),
      retention: { bucketSeconds: BUCKET_S, points },
      dropoffs: findDropoffs(points),
      playbackRates: withPercent(rates).map(({ key, ...r }) => ({ rate: Number(key), ...r })),
      qualities: withPercent(qualities).map(({ key, ...r }) => ({ quality: key, ...r })),
      devices: devices
        .map((d) => ({
          device: d.key,
          sessions: d.sessions,
          watchedS: round1(d.seconds),
          percent: pct(d.seconds, deviceTotal),
        }))
        .sort((a, b) => b.watchedS - a.watchedS),
    };
  }

  // ---------- curso ----------

  async course(user: TenantUser, courseId: string, period: Period) {
    await this.access.assertManageCourse(user, courseId);
    return this.cached('course', user.tenantId, courseId, period, () =>
      this.courseUncached(user, courseId, period),
    );
  }

  private async courseUncached(user: TenantUser, courseId: string, period: Period) {
    const course = await this.access.assertManageCourse(user, courseId);
    const t = user.tenantId;

    const [lessons, perLesson, progress, allStudents, active] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; title: string; status: string; module_title: string }[]>`
        SELECT l.id, l.title, l.status::text AS status, m.title AS module_title
        FROM lessons l JOIN modules m ON m.id = l.module_id
        WHERE l.tenant_id = ${t} AND m.course_id = ${courseId}
        ORDER BY m.position, l.position`,
      this.prisma.$queryRaw<
        { lesson_id: string; views: number; uniques: number; watched: number }[]
      >`
        SELECT ws.lesson_id, COUNT(*)::int AS views, COUNT(DISTINCT ws.user_id)::int AS uniques,
               SUM(ws.watched_s)::float AS watched
        FROM watch_sessions ws JOIN lessons l ON l.id = ws.lesson_id JOIN modules m ON m.id = l.module_id
        WHERE ws.tenant_id = ${t} AND m.course_id = ${courseId} AND ws.watched_s >= ${MIN_VIEW_S}
          AND ws.started_at >= ${period.from} AND ws.started_at < ${period.to} AND ${wsStudent}
        GROUP BY ws.lesson_id`,
      this.prisma.$queryRaw<
        { lesson_id: string; started: number; completions: number; avg_percent: number }[]
      >`
        SELECT lp.lesson_id, COUNT(*) FILTER (WHERE lp.percent > 0)::int AS started,
               COUNT(*) FILTER (WHERE lp.completed_at IS NOT NULL)::int AS completions,
               COALESCE(AVG(lp.percent) FILTER (WHERE lp.percent > 0), 0)::float AS avg_percent
        FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id JOIN modules m ON m.id = l.module_id
        WHERE lp.tenant_id = ${t} AND m.course_id = ${courseId} AND ${lpStudent}
        GROUP BY lp.lesson_id`,
      this.enrolledStudents(t, courseId),
      this.prisma.$queryRaw<{ active: number }[]>`
        SELECT COUNT(DISTINCT ws.user_id)::int AS active
        FROM watch_sessions ws JOIN lessons l ON l.id = ws.lesson_id JOIN modules m ON m.id = l.module_id
        WHERE ws.tenant_id = ${t} AND m.course_id = ${courseId} AND ws.watched_s >= ${MIN_VIEW_S}
          AND ws.started_at >= ${period.from} AND ws.started_at < ${period.to} AND ${wsStudent}`,
    ]);

    const truncated = allStudents.length > MAX_REPORT_STUDENTS;
    const students = truncated ? allStudents.slice(0, MAX_REPORT_STUDENTS) : allStudents;
    const publishedIds = lessons.filter((l) => l.status === 'published').map((l) => l.id);
    const done = await this.completedByUser(
      t,
      publishedIds,
      students.map((s) => s.id),
    );
    const perStudent = students.map((s) =>
      publishedIds.length ? (done.get(s.id)?.size ?? 0) / publishedIds.length : 0,
    );
    const finished = perStudent.filter((p) => p >= 1 && publishedIds.length > 0).length;

    const stats = new Map(perLesson.map((p) => [p.lesson_id, p]));
    const prog = new Map(progress.map((p) => [p.lesson_id, p]));
    const rows = lessons.map((l) => {
      const s = stats.get(l.id);
      const p = prog.get(l.id);
      return {
        lessonId: l.id,
        title: l.title,
        module: l.module_title,
        status: l.status,
        views: s?.views ?? 0,
        uniqueViewers: s?.uniques ?? 0,
        watchedS: round1(s?.watched ?? 0),
        startedStudents: p?.started ?? 0,
        completions: p?.completions ?? 0,
        completionRate: ratio(p?.completions ?? 0, p?.started ?? 0),
        avgPercentWatched: round1(p?.avg_percent ?? 0),
      };
    });
    const published = rows.filter((r) => r.status === 'published');
    const lowest = published
      .filter((r) => r.startedStudents > 0)
      .sort(
        (a, b) => a.completionRate - b.completionRate || b.startedStudents - a.startedStudents,
      )[0];
    const mostWatched = [...published].sort((a, b) => b.watchedS - a.watchedS)[0];

    return {
      courseId,
      title: course.title,
      period: { from: period.from.toISOString(), to: period.to.toISOString() },
      enrolledStudents: students.length,
      /** true quando há mais de ${MAX_REPORT_STUDENTS} alunos: os agregados por aluno cobrem só os primeiros */
      truncated,
      activeStudents: active[0]?.active ?? 0,
      totalWatchedS: round1(rows.reduce((s, r) => s + r.watchedS, 0)),
      avgProgressPercent: students.length
        ? round1((perStudent.reduce((s, p) => s + p, 0) / students.length) * 100)
        : 0,
      studentsCompleted: finished,
      completionRate: ratio(finished, students.length),
      highlights: {
        lowestCompletion: lowest
          ? {
              lessonId: lowest.lessonId,
              title: lowest.title,
              completionRate: lowest.completionRate,
            }
          : null,
        mostWatched:
          mostWatched?.watchedS > 0
            ? {
                lessonId: mostWatched.lessonId,
                title: mostWatched.title,
                watchedS: mostWatched.watchedS,
              }
            : null,
      },
      lessons: rows,
    };
  }

  /** Alunos matriculados sem atividade há `days` dias (ou que nunca começaram). */
  async inactive(user: TenantUser, courseId: string, days: number, limit = 1000) {
    const course = await this.access.assertManageCourse(user, courseId);
    const t = user.tenantId;
    const [allStudents, lessons, lastSeen] = await Promise.all([
      this.enrolledStudents(t, courseId),
      this.prisma.lesson.findMany({
        where: { tenantId: t, status: 'published', module: { courseId } },
        select: { id: true },
      }),
      this.prisma.$queryRaw<{ user_id: string; last_seen: Date }[]>`
        SELECT ws.user_id, MAX(ws.last_seen_at) AS last_seen
        FROM watch_sessions ws JOIN lessons l ON l.id = ws.lesson_id JOIN modules m ON m.id = l.module_id
        WHERE ws.tenant_id = ${t} AND m.course_id = ${courseId} GROUP BY ws.user_id`,
    ]);
    const students = allStudents.slice(0, MAX_REPORT_STUDENTS);
    const done = await this.completedByUser(
      t,
      lessons.map((l) => l.id),
      students.map((s) => s.id),
    );
    const last = new Map(lastSeen.map((r) => [r.user_id, r.last_seen]));
    const now = Date.now();
    const cutoff = now - days * DAY_MS;

    const list = students
      .map((s) => {
        const seen = last.get(s.id) ?? null;
        const completed = done.get(s.id)?.size ?? 0;
        return {
          userId: s.id,
          name: s.name,
          email: s.email,
          lastActivityAt: seen,
          daysInactive: seen ? Math.floor((now - seen.getTime()) / DAY_MS) : null,
          completedLessons: completed,
          totalLessons: lessons.length,
          progressPercent: lessons.length ? round1((completed / lessons.length) * 100) : 0,
        };
      })
      .filter((s) => !s.lastActivityAt || s.lastActivityAt.getTime() < cutoff)
      // quem nunca começou primeiro; depois o mais tempo parado
      .sort(
        (a, b) =>
          (a.lastActivityAt?.getTime() ?? -Infinity) - (b.lastActivityAt?.getTime() ?? -Infinity),
      );

    return {
      courseId,
      title: course.title,
      days,
      count: list.length,
      /** a lista é cortada em ${limit} linhas; count é o total antes do corte */
      truncated: list.length > limit || allStudents.length > MAX_REPORT_STUDENTS,
      students: list.slice(0, limit),
    };
  }

  // ---------- aluno ----------

  /**
   * O próprio aluno vê seus dados (`me`). Admin vê qualquer aluno da empresa; professor vê o aluno
   * apenas nos cursos que ele gerencia (e recebe 404 se não houver nenhum em comum).
   */
  async student(user: TenantUser, target: string) {
    const userId = target === 'me' ? user.id : target;
    const isSelf = userId === user.id;
    if (!isSelf && user.role !== 'admin' && user.role !== 'professor') {
      throw new ForbiddenException('Sem permissão para ver os dados de outro usuário');
    }
    const t = user.tenantId;
    const person = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: t },
      select: { id: true, name: true, email: true },
    });
    if (!person) throw new NotFoundException('Usuário não encontrado');

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: t,
        userId,
        // só matrícula vigente (revogada ou fora da janela não aparece)
        ...activeEnrollment(),
        course: {
          ...(isSelf ? { status: 'published' as const } : {}),
          ...(!isSelf && user.role === 'professor' ? { ownerId: user.id } : {}),
        },
      },
      select: { course: { select: { id: true, title: true } } },
    });
    if (!isSelf && enrollments.length === 0) throw new NotFoundException('Usuário não encontrado');

    const courseIds = enrollments.map((e) => e.course.id);
    const lessons = courseIds.length
      ? await this.prisma.lesson.findMany({
          where: { tenantId: t, status: 'published', module: { courseId: { in: courseIds } } },
          select: { id: true, module: { select: { courseId: true } } },
        })
      : [];
    const [progress, seen] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: {
          tenantId: t,
          userId,
          completedAt: { not: null },
          lessonId: { in: lessons.map((l) => l.id) },
        },
        select: { lessonId: true },
      }),
      this.prisma.$queryRaw<{ lesson_id: string; watched: number; last_seen: Date }[]>`
        SELECT lesson_id, SUM(watched_s)::float AS watched, MAX(last_seen_at) AS last_seen
        FROM watch_sessions WHERE tenant_id = ${t} AND user_id = ${userId} GROUP BY lesson_id`,
    ]);
    const completed = new Set(progress.map((p) => p.lessonId));
    const seenBy = new Map(seen.map((s) => [s.lesson_id, s]));

    const courses = enrollments.map(({ course }) => {
      const ls = lessons.filter((l) => l.module.courseId === course.id);
      const done = ls.filter((l) => completed.has(l.id)).length;
      const times = ls.map((l) => seenBy.get(l.id)?.last_seen).filter((d): d is Date => !!d);
      return {
        courseId: course.id,
        title: course.title,
        totalLessons: ls.length,
        completedLessons: done,
        progressPercent: ls.length ? round1((done / ls.length) * 100) : 0,
        watchedS: round1(ls.reduce((s, l) => s + (seenBy.get(l.id)?.watched ?? 0), 0)),
        lastActivityAt: times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null,
      };
    });
    const allTimes = courses.map((c) => c.lastActivityAt).filter((d): d is Date => !!d);
    return {
      userId: person.id,
      name: person.name,
      ...(isSelf || user.role === 'admin' || user.role === 'professor'
        ? { email: person.email }
        : {}),
      coursesEnrolled: courses.length,
      lessonsCompleted: courses.reduce((s, c) => s + c.completedLessons, 0),
      totalWatchedS: round1(courses.reduce((s, c) => s + c.watchedS, 0)),
      lastActivityAt: allTimes.length
        ? new Date(Math.max(...allTimes.map((d) => d.getTime())))
        : null,
      courses,
    };
  }

  // ---------- auxiliares ----------

  /**
   * Cache Redis (REPORT_CACHE_TTL_S, padrão 60 s; 0 desliga) dos relatórios pesados por aula/curso. A chave arredonda o período ao minuto
   * (o padrão "últimos 30 dias até agora" mudaria a cada requisição). Redis fora do ar = calcula direto.
   */
  private async cached<T>(
    kind: 'lesson' | 'course',
    tenantId: string,
    id: string,
    period: Period,
    compute: () => Promise<T>,
  ): Promise<T> {
    const ttl = this.env.REPORT_CACHE_TTL_S;
    if (ttl <= 0) return compute();
    const minute = (d: Date) => Math.floor(d.getTime() / 60_000);
    const key = `an:${kind}:${tenantId}:${id}:${minute(period.from)}:${minute(period.to)}`;
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      /* sem cache */
    }
    const value = await compute();
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl).catch(() => 0);
    return value;
  }

  private enrolledStudents(tenantId: string, courseId: string) {
    return this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        role: 'aluno',
        enrollments: { some: { tenantId, courseId, ...activeEnrollment() } },
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      // +1 só para saber se passou do teto (o excedente é descartado por quem chama)
      take: MAX_REPORT_STUDENTS + 1,
    });
  }

  /** userId → conjunto de aulas concluídas (entre as aulas informadas). */
  private async completedByUser(
    tenantId: string,
    lessonIds: string[],
    userIds: string[],
  ): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (lessonIds.length === 0 || userIds.length === 0) return map;
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        tenantId,
        completedAt: { not: null },
        lessonId: { in: lessonIds },
        userId: { in: userIds },
      },
      select: { userId: true, lessonId: true },
    });
    for (const r of rows)
      (map.get(r.userId) ?? map.set(r.userId, new Set()).get(r.userId)!).add(r.lessonId);
    return map;
  }
}

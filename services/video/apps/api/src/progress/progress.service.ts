import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { activeEnrollment } from '../access/enrollment-window';
import { TenantUser } from '../auth/auth.types';
import { Page, Pagination, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressConsolidator } from './progress.consolidator';

/**
 * Leituras de progresso. Por padrão são eventualmente consistentes (o consolidador grava a cada
 * ~5 s); o player pede `?consistent=1` para esvaziar a fila antes de ler (retomar de onde parou).
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly consolidator: ProgressConsolidator,
  ) {}

  /** Aluno vê o próprio progresso; quem gerencia o curso (dono/admin) pode consultar um aluno da empresa. */
  async lessonProgress(
    user: TenantUser,
    lessonId: string,
    targetUserId?: string,
    consistent = false,
  ) {
    if (consistent) await this.consolidator.flush();
    const { access } = await this.access.assertViewLesson(user, lessonId);
    const userId = await this.resolveTarget(user, access.canManage, targetUserId);

    const [progress, ranges] = await Promise.all([
      this.prisma.lessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
      }),
      this.prisma.watchRange.findMany({
        where: { tenantId: user.tenantId, userId, lessonId },
        orderBy: { fromS: 'asc' },
      }),
    ]);
    return {
      lessonId,
      userId,
      lastPos: progress?.lastPos ?? 0,
      maxPos: progress?.maxPos ?? 0,
      percent: progress?.percent ?? 0,
      completedAt: progress?.completedAt ?? null,
      ranges: ranges.map((r) => [r.fromS, r.toS]),
    };
  }

  /** Percentual por aula do curso e total (aulas concluídas / aulas publicadas). */
  async courseProgress(
    user: TenantUser,
    courseId: string,
    targetUserId?: string,
    consistent = false,
  ) {
    if (consistent) await this.consolidator.flush();
    const { canManage } = await this.access.assertViewCourse(user, courseId);
    const userId = await this.resolveTarget(user, canManage, targetUserId);

    const lessons = await this.prisma.lesson.findMany({
      where: { tenantId: user.tenantId, status: 'published', module: { courseId } },
      orderBy: [{ module: { position: 'asc' } }, { position: 'asc' }],
      select: { id: true, title: true, module: { select: { id: true, title: true } } },
    });
    const progress = await this.prisma.lessonProgress.findMany({
      where: { tenantId: user.tenantId, userId, lessonId: { in: lessons.map((l) => l.id) } },
    });
    const byLesson = new Map(progress.map((p) => [p.lessonId, p]));

    const items = lessons.map((l) => {
      const p = byLesson.get(l.id);
      return {
        lessonId: l.id,
        title: l.title,
        moduleId: l.module.id,
        moduleTitle: l.module.title,
        percent: p?.percent ?? 0,
        completed: !!p?.completedAt,
        lastPos: p?.lastPos ?? 0,
      };
    });
    const completed = items.filter((i) => i.completed).length;
    return {
      courseId,
      userId,
      totalLessons: items.length,
      completedLessons: completed,
      percent: items.length ? Math.round((completed / items.length) * 100) : 0,
      lessons: items,
    };
  }

  /** "Continuar assistindo": aulas começadas e não concluídas, as mais recentes primeiro. */
  async continueWatching(user: TenantUser, consistent = false) {
    if (consistent) await this.consolidator.flush();
    const rows = await this.prisma.lessonProgress.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        completedAt: null,
        lastPos: { gt: 5 },
        lesson: {
          status: 'published',
          module: {
            course: {
              status: 'published',
              enrollments: { some: { userId: user.id, ...activeEnrollment() } },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            module: { select: { course: { select: { id: true, title: true } } } },
          },
        },
      },
    });
    return rows.map((r) => ({
      lessonId: r.lessonId,
      lessonTitle: r.lesson.title,
      courseId: r.lesson.module.course.id,
      courseTitle: r.lesson.module.course.title,
      lastPos: r.lastPos,
      percent: r.percent,
      updatedAt: r.updatedAt,
    }));
  }

  /** Histórico de sessões de visualização do próprio usuário. */
  async history(user: TenantUser, pg: Pagination): Promise<Page<unknown>> {
    const where = { tenantId: user.tenantId, userId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.watchSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        ...skipTake(pg),
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              module: { select: { course: { select: { id: true, title: true } } } },
            },
          },
        },
      }),
      this.prisma.watchSession.count({ where }),
    ]);
    const data = rows.map((s) => ({
      sessionId: s.id,
      lessonId: s.lessonId,
      lessonTitle: s.lesson.title,
      courseId: s.lesson.module.course.id,
      courseTitle: s.lesson.module.course.title,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      watchedS: s.watchedS,
      avgRate: s.avgRate,
      device: s.device,
    }));
    return { data, page: pg.page, limit: pg.limit, total };
  }

  private async resolveTarget(
    user: TenantUser,
    canManage: boolean,
    targetUserId?: string,
  ): Promise<string> {
    if (!targetUserId || targetUserId === user.id) return user.id;
    if (!canManage)
      throw new ForbiddenException('Sem permissão para ver o progresso de outro usuário');
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado');
    return target.id;
  }
}

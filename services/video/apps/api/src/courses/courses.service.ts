import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { AccessService } from '../access/access.service';
import { activeEnrollment, isEnrollmentActive } from '../access/enrollment-window';
import { TenantUser } from '../auth/auth.types';
import { Page, Pagination, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { VideosService } from '../videos/videos.service';
import { CreateCourseDto, UpdateCourseDto } from './courses.dto';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly videos: VideosService,
  ) {}

  async list(user: TenantUser, pg: Pagination): Promise<Page<unknown>> {
    const where: Prisma.CourseWhereInput = { tenantId: user.tenantId };
    if (user.role === 'professor') where.ownerId = user.id;
    if (user.role === 'aluno') {
      where.status = 'published';
      where.enrollments = {
        some: { tenantId: user.tenantId, userId: user.id, ...activeEnrollment() },
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.course.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(pg) }),
      this.prisma.course.count({ where }),
    ]);
    return { data, page: pg.page, limit: pg.limit, total };
  }

  async create(user: TenantUser, dto: CreateCourseDto) {
    if (user.role !== 'admin' && user.role !== 'professor') {
      throw new ForbiddenException('Permissão insuficiente');
    }
    const ownerId = user.role === 'admin' && dto.ownerId ? dto.ownerId : user.id;
    await this.assertOwner(user.tenantId, ownerId);
    return this.prisma.course.create({
      data: {
        tenantId: user.tenantId,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        ownerId,
      },
    });
  }

  async get(user: TenantUser, id: string) {
    const { canManage } = await this.access.assertViewCourse(user, id);
    const course = await this.prisma.course.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              where: canManage ? undefined : { status: 'published' },
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });
    return course;
  }

  async update(user: TenantUser, id: string, dto: UpdateCourseDto) {
    await this.access.assertManageCourse(user, id);
    if (dto.ownerId !== undefined) {
      if (user.role !== 'admin') throw new ForbiddenException('Só admin altera o dono do curso');
      await this.assertOwner(user.tenantId, dto.ownerId);
    }
    return this.prisma.course.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        ownerId: dto.ownerId,
      },
    });
  }

  async remove(user: TenantUser, id: string): Promise<void> {
    await this.access.assertManageCourse(user, id);
    const videos = await this.videos.collect({
      tenantId: user.tenantId,
      lesson: { module: { courseId: id } },
    });
    await this.prisma.course.delete({ where: { id } });
    await this.videos.discardMany(videos); // GC: registro + arquivos do S3
  }

  async listEnrollments(
    user: TenantUser,
    courseId: string,
    pg: Pagination,
  ): Promise<Page<unknown>> {
    await this.access.assertManageCourse(user, courseId);
    const where = { tenantId: user.tenantId, courseId };
    const [data, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
        ...skipTake(pg),
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return { data, page: pg.page, limit: pg.limit, total };
  }

  async enroll(user: TenantUser, courseId: string, userId: string) {
    await this.access.assertManageCourse(user, courseId);
    const student = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: user.tenantId, deletedAt: null },
    });
    if (!student) throw new NotFoundException('Usuário não encontrado');
    if (student.role !== 'aluno') {
      throw new UnprocessableEntityException('Apenas alunos podem ser matriculados');
    }
    const current = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    // Matrícula vigente (inclusive a integrada, com prazo) não é tocada: matricular de novo não zera o prazo.
    if (current && isEnrollmentActive(current)) return current;
    return this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      // reativação manual explícita de uma matrícula revogada ou vencida: volta sem prazo
      update: { revokedAt: null, startsAt: null, endsAt: null },
      create: { tenantId: user.tenantId, userId, courseId },
    });
  }

  async unenroll(user: TenantUser, courseId: string, userId: string): Promise<void> {
    await this.access.assertManageCourse(user, courseId);
    // Revogação suave: o registro fica para histórico/auditoria e o acesso cai na hora.
    await this.prisma.enrollment.updateMany({
      where: { tenantId: user.tenantId, courseId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.redis.del(`ps:${userId}`);
  }

  /** Cursos do aluno com % de aulas concluídas. */
  async myCourses(user: TenantUser) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        course: { status: 'published' },
        ...activeEnrollment(),
      },
      include: {
        course: {
          include: {
            modules: {
              include: { lessons: { where: { status: 'published' }, select: { id: true } } },
            },
          },
        },
      },
    });
    const completed = await this.prisma.lessonProgress.findMany({
      where: { tenantId: user.tenantId, userId: user.id, completedAt: { not: null } },
      select: { lessonId: true },
    });
    const done = new Set(completed.map((c) => c.lessonId));

    return enrollments.map(({ course }) => {
      const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
      const completedCount = lessonIds.filter((id) => done.has(id)).length;
      return {
        id: course.id,
        title: course.title,
        description: course.description,
        totalLessons: lessonIds.length,
        completedLessons: completedCount,
        progressPercent: lessonIds.length
          ? Math.round((completedCount / lessonIds.length) * 100)
          : 0,
      };
    });
  }

  /** O dono precisa ser admin/professor da MESMA empresa. */
  private async assertOwner(tenantId: string, ownerId: string): Promise<void> {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, tenantId, deletedAt: null, role: { in: ['admin', 'professor'] } },
    });
    if (!owner) throw new UnprocessableEntityException('Dono inválido para esta empresa');
  }
}

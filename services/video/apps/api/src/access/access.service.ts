import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Course, Lesson, Module } from '@prisma/client';
import { TenantUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { activeEnrollment } from './enrollment-window';
import { canManageCourse, canViewCourse, canViewLesson } from './policy';

export interface CourseAccess {
  course: Course;
  enrolled: boolean;
  canManage: boolean;
}

/**
 * Carrega recursos SEMPRE dentro da empresa do usuário: recurso de outra empresa
 * é indistinguível de inexistente (404). Dentro da empresa, falta de permissão = 403.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async course(user: TenantUser, courseId: string): Promise<CourseAccess> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId: user.tenantId },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const enrolled = await this.isEnrolled(user, course.id);
    return { course, enrolled, canManage: canManageCourse(user, course) };
  }

  async assertManageCourse(user: TenantUser, courseId: string): Promise<Course> {
    const access = await this.course(user, courseId);
    if (!access.canManage) throw new ForbiddenException('Sem permissão para gerenciar este curso');
    return access.course;
  }

  async assertViewCourse(user: TenantUser, courseId: string): Promise<CourseAccess> {
    const access = await this.course(user, courseId);
    if (!canViewCourse(user, access.course, access.enrolled)) {
      throw new ForbiddenException('Sem acesso a este curso');
    }
    return access;
  }

  async module(user: TenantUser, moduleId: string): Promise<Module> {
    const mod = await this.prisma.module.findFirst({
      where: { id: moduleId, tenantId: user.tenantId },
    });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return mod;
  }

  /** Aula + acesso. Base do `canAccessLesson` usado por playback, notas e progresso. */
  async assertViewLesson(
    user: TenantUser,
    lessonId: string,
  ): Promise<{ lesson: Lesson; access: CourseAccess }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, tenantId: user.tenantId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    const access = await this.course(user, lesson.module.courseId);
    if (!canViewLesson(user, access.course, lesson.status, access.enrolled)) {
      throw new ForbiddenException('Sem acesso a esta aula');
    }
    return { lesson, access };
  }

  async assertManageLesson(
    user: TenantUser,
    lessonId: string,
  ): Promise<{ lesson: Lesson; course: Course }> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, tenantId: user.tenantId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    const course = await this.assertManageCourse(user, lesson.module.courseId);
    return { lesson, course };
  }

  private async isEnrolled(user: TenantUser, courseId: string): Promise<boolean> {
    const count = await this.prisma.enrollment.count({
      where: { tenantId: user.tenantId, userId: user.id, courseId, ...activeEnrollment() },
    });
    return count > 0;
  }
}

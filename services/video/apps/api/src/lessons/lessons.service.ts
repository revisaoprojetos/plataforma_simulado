import { Injectable } from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { TenantUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { VideosService } from '../videos/videos.service';
import { CreateLessonDto, CreateModuleDto, UpdateLessonDto, UpdateModuleDto } from './lessons.dto';

@Injectable()
export class LessonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly videos: VideosService,
  ) {}

  // ---- módulos ----

  async listModules(user: TenantUser, courseId: string) {
    const { canManage } = await this.access.assertViewCourse(user, courseId);
    return this.prisma.module.findMany({
      where: { tenantId: user.tenantId, courseId },
      orderBy: { position: 'asc' },
      include: {
        lessons: {
          where: canManage ? undefined : { status: 'published' },
          orderBy: { position: 'asc' },
        },
      },
    });
  }

  async createModule(user: TenantUser, courseId: string, dto: CreateModuleDto) {
    await this.access.assertManageCourse(user, courseId);
    const position =
      dto.position ??
      (await this.nextPosition(() =>
        this.prisma.module.aggregate({
          where: { tenantId: user.tenantId, courseId },
          _max: { position: true },
        }),
      ));
    return this.prisma.module.create({
      data: { tenantId: user.tenantId, courseId, title: dto.title, position },
    });
  }

  async updateModule(user: TenantUser, id: string, dto: UpdateModuleDto) {
    const mod = await this.access.module(user, id);
    await this.access.assertManageCourse(user, mod.courseId);
    return this.prisma.module.update({
      where: { id },
      data: { title: dto.title, position: dto.position },
    });
  }

  async deleteModule(user: TenantUser, id: string): Promise<void> {
    const mod = await this.access.module(user, id);
    await this.access.assertManageCourse(user, mod.courseId);
    const videos = await this.videos.collect({ tenantId: user.tenantId, lesson: { moduleId: id } });
    await this.prisma.module.delete({ where: { id } });
    await this.videos.discardMany(videos); // GC: registro + arquivos do S3
  }

  // ---- aulas ----

  async listLessons(user: TenantUser, moduleId: string) {
    const mod = await this.access.module(user, moduleId);
    const { canManage } = await this.access.assertViewCourse(user, mod.courseId);
    return this.prisma.lesson.findMany({
      where: {
        tenantId: user.tenantId,
        moduleId,
        ...(canManage ? {} : { status: 'published' as const }),
      },
      orderBy: { position: 'asc' },
    });
  }

  async createLesson(user: TenantUser, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.access.module(user, moduleId);
    await this.access.assertManageCourse(user, mod.courseId);
    const position =
      dto.position ??
      (await this.nextPosition(() =>
        this.prisma.lesson.aggregate({
          where: { tenantId: user.tenantId, moduleId },
          _max: { position: true },
        }),
      ));
    return this.prisma.lesson.create({
      data: { tenantId: user.tenantId, moduleId, title: dto.title, position, status: dto.status },
    });
  }

  async getLesson(user: TenantUser, id: string) {
    const { lesson } = await this.access.assertViewLesson(user, id);
    return lesson;
  }

  async updateLesson(user: TenantUser, id: string, dto: UpdateLessonDto) {
    await this.access.assertManageLesson(user, id);
    return this.prisma.lesson.update({
      where: { id },
      data: { title: dto.title, position: dto.position, status: dto.status },
    });
  }

  async deleteLesson(user: TenantUser, id: string): Promise<void> {
    await this.access.assertManageLesson(user, id);
    const videos = await this.videos.collect({ tenantId: user.tenantId, lesson: { id } });
    await this.prisma.lesson.delete({ where: { id } });
    await this.videos.discardMany(videos); // GC: registro + arquivos do S3
  }

  private async nextPosition(
    max: () => Promise<{ _max: { position: number | null } }>,
  ): Promise<number> {
    return ((await max())._max.position ?? 0) + 1;
  }
}

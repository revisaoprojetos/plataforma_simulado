import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service';
import { TenantUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

export const createNoteSchema = z.object({
  atS: z.number().finite().min(0).max(86_400),
  text: z.string().trim().min(1).max(2000),
});
export type CreateNoteDto = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = createNoteSchema.partial();
export type UpdateNoteDto = z.infer<typeof updateNoteSchema>;

const view = { id: true, lessonId: true, atS: true, text: true, createdAt: true } as const;

/** Anotações são privadas: cada usuário só enxerga as suas (nota de outro usuário = 404). */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: TenantUser, lessonId: string) {
    await this.access.assertViewLesson(user, lessonId);
    return this.prisma.note.findMany({
      where: { tenantId: user.tenantId, userId: user.id, lessonId },
      orderBy: { atS: 'asc' },
      select: view,
    });
  }

  async create(user: TenantUser, lessonId: string, dto: CreateNoteDto) {
    const { lesson } = await this.access.assertViewLesson(user, lessonId);
    await this.assertWithinVideo(user, lesson.videoId, dto.atS);
    return this.prisma.note.create({
      data: { tenantId: user.tenantId, userId: user.id, lessonId, atS: dto.atS, text: dto.text },
      select: view,
    });
  }

  async update(user: TenantUser, id: string, dto: UpdateNoteDto) {
    const note = await this.own(user, id);
    if (dto.atS !== undefined) {
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: note.lessonId, tenantId: user.tenantId },
        select: { videoId: true },
      });
      await this.assertWithinVideo(user, lesson?.videoId ?? null, dto.atS);
    }
    return this.prisma.note.update({
      where: { id },
      data: { atS: dto.atS, text: dto.text },
      select: view,
    });
  }

  async remove(user: TenantUser, id: string): Promise<void> {
    await this.own(user, id);
    await this.prisma.note.delete({ where: { id } });
  }

  private async own(user: TenantUser, id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.id },
    });
    if (!note) throw new NotFoundException('Anotação não encontrada');
    return note;
  }

  private async assertWithinVideo(user: TenantUser, videoId: string | null, atS: number) {
    if (!videoId) return;
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, tenantId: user.tenantId },
      select: { durationS: true },
    });
    if (video?.durationS && atS > video.durationS) {
      throw new UnprocessableEntityException('O instante está depois do fim do vídeo');
    }
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccessService } from '../access/access.service';
import { TenantUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PutChaptersDto, TranscriptQuery } from './content.dto';
import { parseVtt } from './vtt';

export const subtitleKey = (tenantId: string, lessonId: string, lang: string) =>
  `tenants/${tenantId}/subtitles/${lessonId}/${lang}.vtt`;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
  ) {}

  // ---------- legendas ----------

  async listSubtitles(user: TenantUser, lessonId: string) {
    await this.access.assertViewLesson(user, lessonId);
    return this.prisma.subtitle.findMany({
      where: { tenantId: user.tenantId, lessonId },
      select: { lang: true },
      orderBy: { lang: 'asc' },
    });
  }

  /**
   * Guarda o .vtt no S3 e popula a transcrição (uma fonte só: a legenda).
   * Reenviar o mesmo idioma substitui arquivo e transcrição.
   */
  async putSubtitle(user: TenantUser, lessonId: string, lang: string, content: string) {
    const { lesson } = await this.access.assertManageLesson(user, lessonId);
    if (!lesson.videoId) {
      throw new ConflictException('Envie o vídeo da aula antes das legendas');
    }
    let cues;
    try {
      cues = parseVtt(content);
    } catch (e) {
      throw new BadRequestException(`WebVTT inválido: ${(e as Error).message}`);
    }

    await this.storage.put(subtitleKey(user.tenantId, lessonId, lang), content, 'text/vtt');
    await this.prisma.$transaction([
      this.prisma.subtitle.upsert({
        where: { lessonId_lang: { lessonId, lang } },
        create: {
          tenantId: user.tenantId,
          lessonId,
          lang,
          s3Key: subtitleKey(user.tenantId, lessonId, lang),
        },
        update: { s3Key: subtitleKey(user.tenantId, lessonId, lang) },
      }),
      this.prisma.transcriptSegment.deleteMany({
        where: { tenantId: user.tenantId, videoId: lesson.videoId, lang },
      }),
      this.prisma.transcriptSegment.createMany({
        data: cues.map((c) => ({
          tenantId: user.tenantId,
          videoId: lesson.videoId!,
          lang,
          startS: c.startS,
          endS: c.endS,
          text: c.text,
        })),
      }),
    ]);
    return { lang, cues: cues.length };
  }

  async deleteSubtitle(user: TenantUser, lessonId: string, lang: string): Promise<void> {
    const { lesson } = await this.access.assertManageLesson(user, lessonId);
    const sub = await this.prisma.subtitle.findFirst({
      where: { tenantId: user.tenantId, lessonId, lang },
    });
    if (!sub) throw new NotFoundException('Legenda não encontrada');
    await this.prisma.$transaction([
      this.prisma.subtitle.delete({ where: { id: sub.id } }),
      ...(lesson.videoId
        ? [
            this.prisma.transcriptSegment.deleteMany({
              where: { tenantId: user.tenantId, videoId: lesson.videoId, lang },
            }),
          ]
        : []),
    ]);
    await this.storage.delete(sub.s3Key).catch(() => undefined);
  }

  // ---------- transcrição ----------

  async transcript(user: TenantUser, lessonId: string, query: TranscriptQuery) {
    const { lesson } = await this.access.assertViewLesson(user, lessonId);
    const subs = await this.prisma.subtitle.findMany({
      where: { tenantId: user.tenantId, lessonId },
      select: { lang: true },
      orderBy: { lang: 'asc' },
    });
    const languages = subs.map((s) => s.lang);
    const lang = query.lang ?? languages[0];
    if (!lesson.videoId || !lang || !languages.includes(lang)) {
      return { lang: lang ?? null, languages, segments: [] };
    }

    const where: Prisma.TranscriptSegmentWhereInput = {
      tenantId: user.tenantId,
      videoId: lesson.videoId,
      lang,
      ...(query.q && { text: { contains: query.q, mode: 'insensitive' } }),
      // trechos que se sobrepõem à janela pedida
      ...(query.from !== undefined && { endS: { gt: query.from } }),
      ...(query.to !== undefined && { startS: { lt: query.to } }),
    };
    const segments = await this.prisma.transcriptSegment.findMany({
      where,
      orderBy: { startS: 'asc' },
      take: 5000,
      select: { startS: true, endS: true, text: true },
    });
    return { lang, languages, segments };
  }

  // ---------- capítulos ----------

  async chapters(user: TenantUser, lessonId: string) {
    await this.access.assertViewLesson(user, lessonId);
    return this.prisma.chapter.findMany({
      where: { tenantId: user.tenantId, lessonId },
      orderBy: { startS: 'asc' },
      select: { startS: true, title: true },
    });
  }

  /** Substitui todos os capítulos da aula. */
  async putChapters(user: TenantUser, lessonId: string, dto: PutChaptersDto) {
    const { lesson } = await this.access.assertManageLesson(user, lessonId);
    const video = lesson.videoId
      ? await this.prisma.video.findFirst({
          where: { id: lesson.videoId, tenantId: user.tenantId },
          select: { durationS: true },
        })
      : null;
    const sorted = [...dto.chapters].sort((a, b) => a.startS - b.startS);
    if (new Set(sorted.map((c) => c.startS)).size !== sorted.length) {
      throw new UnprocessableEntityException('Dois capítulos começam no mesmo instante');
    }
    if (video?.durationS && sorted.some((c) => c.startS >= video.durationS!)) {
      throw new UnprocessableEntityException('Capítulo começa depois do fim do vídeo');
    }
    await this.prisma.$transaction([
      this.prisma.chapter.deleteMany({ where: { tenantId: user.tenantId, lessonId } }),
      this.prisma.chapter.createMany({
        data: sorted.map((c) => ({
          tenantId: user.tenantId,
          lessonId,
          startS: c.startS,
          title: c.title,
        })),
      }),
    ]);
    return sorted;
  }
}

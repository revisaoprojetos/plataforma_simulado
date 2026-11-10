import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Video } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { TenantUser } from '../auth/auth.types';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TranscodeQueue } from '../queue/transcode.queue';
import { StorageService } from '../storage/storage.service';
import { magicProblem } from './magic';
import { CompleteUploadDto, CreateUploadDto } from './videos.dto';

const MiB = 1024 * 1024;
const MIN_PART_SIZE = 16 * MiB; // S3 exige >= 5 MiB (exceto a última parte)
const MAX_PARTS = 10_000;

type VideoWithLesson = Video & { lesson: { id: string } | null };

export const originalKey = (tenantId: string, videoId: string, ext: string) =>
  `tenants/${tenantId}/originals/${videoId}/source${ext}`;
export const originalsPrefix = (tenantId: string, videoId: string) =>
  `tenants/${tenantId}/originals/${videoId}/`;
export const videoPrefix = (tenantId: string, videoId: string) =>
  `tenants/${tenantId}/videos/${videoId}/`;

export function planParts(size: number): { partSize: number; partCount: number } {
  const partSize = Math.max(MIN_PART_SIZE, Math.ceil(size / MAX_PARTS / MiB) * MiB);
  return { partSize, partCount: Math.max(1, Math.ceil(size / partSize)) };
}

@Injectable()
export class VideosService implements OnModuleInit, OnModuleDestroy {
  private sweepTimer?: NodeJS.Timeout;

  private readonly log = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly queue: TranscodeQueue,
    @Inject(CONFIG) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    const every = this.env.UPLOAD_SWEEP_INTERVAL_MS;
    if (every > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweepAbandonedUploads().catch((e: Error) =>
          this.log.error(`Varredura de uploads falhou: ${e.message}`),
        );
      }, every);
      this.sweepTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ---------- upload ----------

  async createUpload(user: TenantUser, dto: CreateUploadDto) {
    if (dto.size > this.env.MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `Arquivo maior que o limite de ${this.env.MAX_UPLOAD_BYTES} bytes`,
      );
    }
    const { lesson } = await this.access.assertManageLesson(user, dto.lessonId);

    const previous = lesson.videoId
      ? await this.prisma.video.findFirst({
          where: { id: lesson.videoId, tenantId: user.tenantId },
        })
      : null;
    if (previous && !['uploading', 'uploaded', 'failed'].includes(previous.status)) {
      throw new ConflictException('A aula já possui um vídeo; remova-o antes de enviar outro');
    }
    await this.assertQuota(user.tenantId, dto.size, previous);

    const videoId = randomUUID();
    const ext = dto.filename.slice(dto.filename.lastIndexOf('.')).toLowerCase();
    const key = originalKey(user.tenantId, videoId, ext);
    const { partSize, partCount } = planParts(dto.size);

    const uploadId = await this.storage.createMultipart(key, dto.contentType);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.video.create({
          data: {
            id: videoId,
            tenantId: user.tenantId,
            status: 'uploading',
            sourceKey: key,
            originalName: dto.filename,
            contentType: dto.contentType,
            sizeBytes: BigInt(dto.size),
            uploadId,
            partSize,
            createdById: user.id,
          },
        });
        await tx.lesson.update({ where: { id: lesson.id }, data: { videoId } });
        if (previous) await tx.video.delete({ where: { id: previous.id } });
      });
    } catch (e) {
      await this.storage.abortMultipart(key, uploadId).catch(() => undefined);
      throw e;
    }
    if (previous) await this.discardStorage(previous);

    const parts = await this.signParts(key, uploadId, range(1, partCount));
    return { videoId, uploadId, partSize, partCount, parts };
  }

  async signPartsFor(user: TenantUser, videoId: string, partNumbers: number[]) {
    const video = await this.loadUploading(user, videoId);
    const { partCount } = planParts(Number(video.sizeBytes));
    if (partNumbers.some((n) => n > partCount)) {
      throw new UnprocessableEntityException(`Este arquivo tem ${partCount} parte(s)`);
    }
    return { parts: await this.signParts(video.sourceKey, video.uploadId!, partNumbers) };
  }

  async listUploadedParts(user: TenantUser, videoId: string) {
    const video = await this.loadUploading(user, videoId);
    const { partSize, partCount } = planParts(Number(video.sizeBytes));
    const uploaded = await this.storage.listParts(video.sourceKey, video.uploadId!);
    return { partSize, partCount, uploaded };
  }

  async complete(user: TenantUser, videoId: string, dto: CompleteUploadDto) {
    const video = await this.load(user, videoId);
    if (video.status !== 'uploading') {
      if (['queued', 'processing', 'ready'].includes(video.status)) return this.view(video); // idempotente
      throw new ConflictException(`Vídeo em estado "${video.status}" não pode ser finalizado`);
    }

    const { partCount } = planParts(Number(video.sizeBytes));
    const numbers = dto.parts.map((p) => p.partNumber).sort((a, b) => a - b);
    const complete = numbers.length === partCount && numbers.every((n, i) => n === i + 1);
    if (!complete) {
      throw new UnprocessableEntityException(`Envie as ${partCount} parte(s), de 1 a ${partCount}`);
    }

    // Só uma requisição concorrente "ganha" a finalização.
    const claimed = await this.prisma.video.updateMany({
      where: { id: video.id, status: 'uploading' },
      data: { status: 'queued' },
    });
    if (claimed.count === 0) return this.view(await this.load(user, videoId));

    try {
      await this.storage.completeMultipart(video.sourceKey, video.uploadId!, dto.parts);
      const size = await this.storage.size(video.sourceKey);
      if (size !== Number(video.sizeBytes)) {
        await this.storage.delete(video.sourceKey).catch(() => undefined);
        throw new UnprocessableEntityException(
          `Tamanho enviado (${size}) difere do declarado (${video.sizeBytes})`,
        );
      }
      // Assinatura do arquivo: barra o que claramente não é vídeo (o ffprobe do worker é a 2ª barreira).
      const head = await this.storage.getRange(video.sourceKey, 0, 4095);
      const problem = magicProblem(head, video.originalName);
      if (problem) {
        await this.storage.delete(video.sourceKey).catch(() => undefined);
        await this.prisma.video.update({ where: { id: video.id }, data: { error: problem } });
        throw new UnprocessableEntityException(`Arquivo recusado: ${problem}`);
      }
    } catch (e) {
      await this.prisma.video.update({
        where: { id: video.id },
        data: { status: e instanceof UnprocessableEntityException ? 'failed' : 'uploading' },
      });
      if (e instanceof UnprocessableEntityException) throw e;
      throw new UnprocessableEntityException(
        `Falha ao finalizar o upload: ${(e as Error).message}`,
      );
    }

    await this.prisma.video.update({
      where: { id: video.id },
      data: { uploadId: null, error: null },
    });
    return this.view(await this.enqueue(user, video.id));
  }

  async abort(user: TenantUser, videoId: string): Promise<void> {
    const video = await this.load(user, videoId);
    if (video.status !== 'uploading') throw new ConflictException('Não há upload em andamento');
    await this.discard(video);
  }

  // ---------- vídeo ----------

  async get(user: TenantUser, id: string) {
    return this.view(await this.load(user, id));
  }

  async reprocess(user: TenantUser, id: string) {
    const video = await this.load(user, id);
    if (!['uploaded', 'failed', 'ready'].includes(video.status)) {
      throw new ConflictException(`Vídeo em estado "${video.status}" não pode ser reprocessado`);
    }
    await this.prisma.video.update({ where: { id }, data: { status: 'queued', error: null } });
    return this.view(await this.enqueue(user, id));
  }

  async remove(user: TenantUser, id: string): Promise<void> {
    const video = await this.load(user, id);
    if (video.status === 'processing') throw new ConflictException('Vídeo em processamento');
    await this.discard(video);
  }

  // ---------- limpeza (GC) ----------

  /** Vídeos (de qualquer estado) das aulas que casam com o filtro — chame ANTES de excluir as aulas. */
  collect(where: Prisma.VideoWhereInput): Promise<Video[]> {
    return this.prisma.video.findMany({ where });
  }

  /**
   * Apaga registro e arquivos de vídeos cujas aulas acabaram de ser excluídas (aula, módulo ou curso).
   * Falha no storage não desfaz nada: o lixo é registrado e pega pelo `s3:audit`.
   */
  async discardMany(videos: Video[]): Promise<void> {
    if (videos.length === 0) return;
    await this.prisma.video.deleteMany({ where: { id: { in: videos.map((v) => v.id) } } });
    for (const v of videos) await this.discardStorage(v);
  }

  /**
   * Uploads multipart abandonados (iniciados e nunca finalizados) há mais de UPLOAD_EXPIRY_HOURS:
   * aborta no S3, apaga o registro e solta a aula. Devolve quantos foram removidos.
   */
  async sweepAbandonedUploads(now: Date = new Date(), limit = 200): Promise<number> {
    const cutoff = new Date(now.getTime() - this.env.UPLOAD_EXPIRY_HOURS * 3_600_000);
    const stale = await this.prisma.video.findMany({
      where: { status: 'uploading', createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const video of stale) {
      // outra réplica pode ter removido o mesmo vídeo agora: ignorar e seguir
      await this.discard(video).catch((e: Error) =>
        this.log.warn(`Upload abandonado ${video.id} não removido: ${e.message}`),
      );
    }
    if (stale.length) this.log.log(`Uploads abandonados removidos: ${stale.length}`);
    return stale.length;
  }

  // ---------- internos ----------

  /** Cota por empresa: soma dos originais já enviados (menos o vídeo que este upload substitui). */
  private async assertQuota(tenantId: string, size: number, previous: Video | null) {
    const max = this.env.MAX_TENANT_STORAGE_BYTES;
    if (!max) return;
    const used = await this.prisma.video.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    });
    const current = Number(used._sum.sizeBytes ?? 0n) - (previous ? Number(previous.sizeBytes) : 0);
    if (current + size > max) {
      throw new PayloadTooLargeException(
        `Cota de armazenamento da empresa excedida (${current + size} de ${max} bytes)`,
      );
    }
  }

  /** Carrega o vídeo na empresa do usuário e exige permissão de gerenciar a aula dona. */
  private async load(user: TenantUser, id: string): Promise<VideoWithLesson> {
    const video = await this.prisma.video.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lesson: { select: { id: true } } },
    });
    if (!video) throw new NotFoundException('Vídeo não encontrado');
    if (video.lesson) await this.access.assertManageLesson(user, video.lesson.id);
    else if (user.role !== 'admin') throw new NotFoundException('Vídeo não encontrado');
    return video;
  }

  private async loadUploading(user: TenantUser, id: string): Promise<VideoWithLesson> {
    const video = await this.load(user, id);
    if (video.status !== 'uploading' || !video.uploadId) {
      throw new ConflictException('Não há upload em andamento');
    }
    return video;
  }

  private async enqueue(user: TenantUser, id: string): Promise<VideoWithLesson> {
    try {
      await this.queue.enqueue({ videoId: id, tenantId: user.tenantId });
    } catch (e) {
      this.log.error(`Falha ao enfileirar ${id}: ${(e as Error).message}`);
      // O original está salvo; "uploaded" permite reprocessar quando a fila voltar.
      await this.prisma.video.update({ where: { id }, data: { status: 'uploaded' } });
      throw new ServiceUnavailableException('Fila indisponível; use /reprocess em instantes');
    }
    return this.load(user, id);
  }

  private async signParts(key: string, uploadId: string, numbers: number[]) {
    return Promise.all(
      numbers.map(async (partNumber) => ({
        partNumber,
        url: await this.storage.presignPart(key, uploadId, partNumber, 2 * 3600),
      })),
    );
  }

  /** Remove registro, vínculo com a aula e todos os arquivos do vídeo. */
  private async discard(video: Video): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.lesson.updateMany({ where: { videoId: video.id }, data: { videoId: null } }),
      this.prisma.video.delete({ where: { id: video.id } }),
    ]);
    await this.discardStorage(video);
  }

  private async discardStorage(video: Video): Promise<void> {
    try {
      if (video.uploadId) await this.storage.abortMultipart(video.sourceKey, video.uploadId);
      await this.storage.deletePrefix(originalsPrefix(video.tenantId, video.id));
      await this.storage.deletePrefix(videoPrefix(video.tenantId, video.id));
    } catch (e) {
      // Registro já removido; sobra lixo no bucket, que não deve impedir a operação.
      this.log.warn(`Limpeza parcial do vídeo ${video.id}: ${(e as Error).message}`);
    }
  }

  private view(video: VideoWithLesson) {
    return {
      id: video.id,
      status: video.status,
      lessonId: video.lesson?.id ?? null,
      originalName: video.originalName,
      contentType: video.contentType,
      sizeBytes: Number(video.sizeBytes),
      durationS: video.durationS,
      renditions: video.renditions as Prisma.JsonValue,
      error: video.error,
      createdAt: video.createdAt,
    };
  }
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

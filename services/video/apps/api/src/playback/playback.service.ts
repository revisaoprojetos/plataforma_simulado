import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Video } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AccessService } from '../access/access.service';
import { TenantUser } from '../auth/auth.types';
import { ttlToSeconds } from '../auth/ttl';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { rewriteMaster, rewriteSpriteVtt, rewriteVariant, segmentNames } from './manifest';
import { hostOf, isOriginAllowed, watermarkText } from './origin';
import { PlaybackClaims, PlaybackTokenService } from './playback-token.service';
import { MetricsService } from '../observability/metrics.service';
import { ProgressEvents } from '../progress/progress.events';
import { SessionStore } from './session.store';

/** Chaves do vídeo no S3 (sempre sob o prefixo da empresa; o tenant vem do token, nunca da URL). */
const hlsKey = (tenantId: string, videoId: string, rest: string) =>
  `tenants/${tenantId}/videos/${videoId}/${rest}`;

/** Validade do cache de `readyVideo` e seu tamanho máximo (entradas). */
export const READY_CACHE_MS = 10_000;
const READY_CACHE_MAX = 2000;

export interface PlaybackResponse {
  sessionId: string;
  playbackToken: string;
  expiresAt: string;
  expiresIn: number;
  manifestUrl: string;
  spriteVttUrl: string;
  posterUrl: string;
  durationS: number | null;
  renditions: unknown;
  watermark: { text: string };
  resumeAt: number;
  /** legendas disponíveis; a URL já leva o token de playback */
  subtitles: { lang: string; url: string }[];
  chapters: { startS: number; title: string }[];
}

@Injectable()
export class PlaybackService {
  private readonly sessionTtlMs: number;
  private readonly readyCache = new Map<string, { at: number; video: Video }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly tokens: PlaybackTokenService,
    private readonly sessions: SessionStore,
    private readonly events: ProgressEvents,
    private readonly metrics: MetricsService,
    @Inject(CONFIG) private readonly env: Env,
  ) {
    // A sessão sobrevive a um ciclo de renovação perdido; depois disso libera o "assento".
    this.sessionTtlMs = this.tokens.ttlSeconds * 2 * 1000;
  }

  /** Abre uma sessão de reprodução da aula. O id é gerado aqui: nunca vem do cliente. */
  async start(
    user: TenantUser,
    lessonId: string,
    origin: string | undefined,
  ): Promise<PlaybackResponse> {
    return this.issue(user.id, lessonId, origin, randomUUID(), false);
  }

  /** Renova o token sem trocar de sessão; falha se a sessão foi encerrada ou o acesso mudou. */
  async renew(claims: PlaybackClaims, origin: string | undefined): Promise<PlaybackResponse> {
    return this.issue(claims.sub, claims.lid, origin, claims.sid, true);
  }

  async end(claims: PlaybackClaims): Promise<void> {
    await this.sessions.release(claims.sub, claims.sid);
    // Fecha o registro de visualização (a consolidação grava o horário de término).
    await this.events.pushEnd({
      tid: claims.tid,
      uid: claims.sub,
      lid: claims.lid,
      sid: claims.sid,
    });
  }

  // ---------- HLS (autorizado pelo token de playback) ----------

  async master(claims: PlaybackClaims, token: string): Promise<string> {
    await this.readyVideo(claims);
    const text = await this.readText(hlsKey(claims.tid, claims.vid, 'hls/master.m3u8'));
    return rewriteMaster(text, token);
  }

  async variant(claims: PlaybackClaims, token: string, rendition: string): Promise<string> {
    const video = await this.readyVideo(claims);
    const known = (video.renditions as { name: string }[] | null)?.map((r) => r.name) ?? [];
    if (!known.includes(rendition)) throw new NotFoundException('Qualidade não encontrada');

    const base = `hls/${rendition}/`;
    const text = await this.readText(hlsKey(claims.tid, claims.vid, `${base}index.m3u8`));
    const ttl = ttlToSeconds(this.env.HLS_SEGMENT_URL_TTL);
    const signed = new Map<string, string>();
    await Promise.all(
      [...new Set(segmentNames(text))].map(async (name) => {
        signed.set(
          name,
          await this.storage.presignGet(hlsKey(claims.tid, claims.vid, base + name), ttl),
        );
      }),
    );
    const keyUrl = `/v1/hls/key/${claims.vid}?t=${encodeURIComponent(token)}`;
    try {
      return rewriteVariant(text, keyUrl, signed);
    } catch {
      throw new NotFoundException('Playlist inválida');
    }
  }

  /** Arquivo .vtt da legenda da aula do token (nunca de outra aula, nem de outra empresa). */
  async subtitleVtt(claims: PlaybackClaims, lang: string): Promise<string> {
    await this.readyVideo(claims);
    const sub = await this.prisma.subtitle.findFirst({
      where: { tenantId: claims.tid, lessonId: claims.lid, lang },
    });
    if (!sub) throw new NotFoundException('Legenda não encontrada');
    return this.readText(sub.s3Key);
  }

  async key(claims: PlaybackClaims): Promise<Buffer> {
    await this.readyVideo(claims);
    return this.storage.get(hlsKey(claims.tid, claims.vid, 'hls/key.bin'));
  }

  async spriteVtt(claims: PlaybackClaims): Promise<string> {
    await this.readyVideo(claims);
    const text = await this.readText(hlsKey(claims.tid, claims.vid, 'thumbs/sprite.vtt'));
    const url = await this.storage.presignGet(
      hlsKey(claims.tid, claims.vid, 'thumbs/sprite.jpg'),
      ttlToSeconds(this.env.HLS_SEGMENT_URL_TTL),
    );
    return rewriteSpriteVtt(text, url);
  }

  // ---------- internos ----------

  private async issue(
    userId: string,
    lessonId: string,
    origin: string | undefined,
    sessionId: string,
    requireExistingSession: boolean,
  ): Promise<PlaybackResponse> {
    // Reconsulta usuário, empresa e matrícula a cada emissão/renovação (o JWT de acesso pode estar velho).
    const row = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { tenant: true },
    });
    if (!row?.tenant) throw new ForbiddenException('Rota exclusiva de usuários de uma empresa');
    if (row.tenant.status !== 'active') throw new ForbiddenException('Empresa suspensa');
    const actor: TenantUser = {
      id: row.id,
      tenantId: row.tenant.id,
      role: row.role,
      email: row.email,
    };

    const { lesson } = await this.access.assertViewLesson(actor, lessonId);
    const video = lesson.videoId
      ? await this.prisma.video.findFirst({
          where: { id: lesson.videoId, tenantId: actor.tenantId },
        })
      : null;
    if (!video || video.status !== 'ready') {
      throw new ConflictException('O vídeo desta aula ainda não está disponível');
    }

    if (
      !isOriginAllowed(origin, row.tenant.allowedDomains, {
        denyEmpty: this.env.NODE_ENV === 'production',
      })
    ) {
      throw new ForbiddenException('Domínio não autorizado para esta empresa');
    }

    // Limite de telas simultâneas vale para alunos; professores/admins fazem preview à vontade.
    const limit = actor.role === 'aluno' ? this.env.MAX_CONCURRENT_STREAMS : 1000;
    if (requireExistingSession) {
      if (!(await this.sessions.touch(actor.id, sessionId, this.sessionTtlMs))) {
        throw new ConflictException('Sessão de reprodução encerrada');
      }
    } else if (!(await this.sessions.acquire(actor.id, sessionId, limit, this.sessionTtlMs))) {
      throw new ConflictException('Limite de sessões simultâneas atingido');
    }

    if (!requireExistingSession) this.metrics.playbackStarted.inc();
    const { token, expiresAt } = await this.tokens.sign({
      sub: actor.id,
      tid: actor.tenantId,
      vid: video.id,
      lid: lesson.id,
      sid: sessionId,
      dom: row.tenant.allowedDomains.length > 0 ? hostOf(origin) : null,
    });
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId: actor.id, lessonId: lesson.id } },
    });
    const t = encodeURIComponent(token);
    const [subtitles, chapters] = await Promise.all([
      this.prisma.subtitle.findMany({
        where: { tenantId: actor.tenantId, lessonId: lesson.id },
        select: { lang: true },
        orderBy: { lang: 'asc' },
      }),
      this.prisma.chapter.findMany({
        where: { tenantId: actor.tenantId, lessonId: lesson.id },
        select: { startS: true, title: true },
        orderBy: { startS: 'asc' },
      }),
    ]);
    return {
      sessionId,
      playbackToken: token,
      expiresAt: expiresAt.toISOString(),
      expiresIn: this.tokens.ttlSeconds,
      manifestUrl: `/v1/hls/${video.id}/master.m3u8?t=${t}`,
      spriteVttUrl: `/v1/hls/${video.id}/sprite.vtt?t=${t}`,
      posterUrl: await this.storage.presignGet(
        hlsKey(actor.tenantId, video.id, 'thumbs/poster.jpg'),
        ttlToSeconds(this.env.HLS_SEGMENT_URL_TTL),
      ),
      durationS: video.durationS,
      renditions: video.renditions,
      watermark: { text: watermarkText(row.name, row.email) },
      subtitles: subtitles.map((x) => ({
        lang: x.lang,
        url: `/v1/hls/${video.id}/subtitles/${x.lang}.vtt?t=${t}`,
      })),
      chapters,
      // Quem já chegou ao fim volta ao começo; senão retoma de onde parou.
      resumeAt:
        progress && !(video.durationS && progress.lastPos >= video.durationS - 5)
          ? progress.lastPos
          : 0,
    };
  }

  /**
   * Vídeo pronto da empresa do token. Manifest, chave e cada variante passam por aqui: um cache curto
   * em memória (por réplica) evita 1 consulta ao Postgres por requisição HLS. Só acerto é guardado;
   * excluir/reprocessar o vídeo vale em até READY_CACHE_MS (a chave/segmentos já são por token).
   */
  private async readyVideo(claims: PlaybackClaims) {
    const k = `${claims.tid}:${claims.vid}`;
    const now = Date.now();
    const hit = this.readyCache.get(k);
    if (hit && now - hit.at < READY_CACHE_MS) return hit.video;
    const video = await this.prisma.video.findFirst({
      where: { id: claims.vid, tenantId: claims.tid, status: 'ready' },
    });
    if (!video) {
      this.readyCache.delete(k);
      throw new NotFoundException('Vídeo não encontrado');
    }
    if (this.readyCache.size >= READY_CACHE_MAX) {
      // descarta o mais antigo (Map preserva a ordem de inserção)
      const oldest = this.readyCache.keys().next().value;
      if (oldest !== undefined) this.readyCache.delete(oldest);
    }
    this.readyCache.set(k, { at: now, video });
    return video;
  }

  private async readText(key: string): Promise<string> {
    try {
      return (await this.storage.get(key)).toString('utf8');
    } catch {
      throw new NotFoundException('Arquivo do vídeo não encontrado');
    }
  }
}

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { runScript } from '../redis/script';
import { PlaybackClaims } from '../playback/playback-token.service';
import { MetricsService } from '../observability/metrics.service';
import { EVENTS_KEY, MAX_QUEUE_LENGTH } from './progress.events';

export interface HeartbeatInput {
  /** contador crescente por sessão; repetido ou menor que o último = ignorado (idempotência) */
  seq: number;
  position: number;
  rate: number;
  quality?: string;
  device?: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Atômico no Redis (Lua): confere a ordem, decide se o trecho entre este heartbeat e o anterior
 * foi realmente assistido e enfileira o evento. Retorna 1 (aceito), 0 (duplicado/fora de ordem),
 * 3 (rápido demais) ou 2 (fila cheia).
 *
 * Regra do trecho: avanço positivo e compatível com `velocidade × tempo real decorrido + 2 s`
 * → conta [posição anterior, posição atual]. Avanço maior (seek para frente), retrocesso, pausa
 * ou lacuna > 90 s entre heartbeats → não conta. O relógio é o do servidor, não o do cliente.
 */
const HEARTBEAT = `
local st, q = KEYS[1], KEYS[2]
local now, seq, pos, rate = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local ttl, maxq, base = tonumber(ARGV[5]), tonumber(ARGV[6]), ARGV[7]

local last = redis.call('HMGET', st, 'seq', 'pos', 't', 'rate')
local lseq = tonumber(last[1])
if lseq and seq <= lseq then return 0 end
local from, to = -1, -1
if lseq then
  local lpos, lt, lrate = tonumber(last[2]), tonumber(last[3]), tonumber(last[4])
  if now - lt < 500 then return 3 end
  local dt = (now - lt) / 1000
  local d = pos - lpos
  if d > 0 and dt <= 90 and d <= math.max(rate, lrate) * dt + 2.0 then from = lpos; to = pos end
end
redis.call('HSET', st, 'seq', seq, 'pos', pos, 't', now, 'rate', rate)
redis.call('PEXPIRE', st, ttl)
if redis.call('LLEN', q) >= maxq then return 2 end
local ev = cjson.decode(base)
ev.pos = pos; ev.rate = rate; ev.ts = now; ev.from = from; ev.to = to
redis.call('RPUSH', q, cjson.encode(ev))
return 1
`;

@Injectable()
export class HeartbeatService {
  private readonly log = new Logger(HeartbeatService.name);
  private lastFullWarn = 0;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  /** `nowMs` existe para os testes controlarem o relógio. */
  async record(claims: PlaybackClaims, input: HeartbeatInput, nowMs = Date.now()): Promise<number> {
    const dur = await this.durationFor(claims);
    const position = Math.min(Math.max(0, input.position), dur);
    const base = {
      type: 'hb',
      tid: claims.tid,
      uid: claims.sub,
      lid: claims.lid,
      sid: claims.sid,
      dur,
      q: input.quality,
      dev: input.device,
    };
    const result = (await runScript(
      this.redis,
      HEARTBEAT,
      2,
      `hb:${claims.sid}`,
      EVENTS_KEY,
      nowMs,
      input.seq,
      position,
      input.rate,
      STATE_TTL_MS,
      MAX_QUEUE_LENGTH,
      JSON.stringify(base),
    )) as number;
    if (result === 2 && nowMs - this.lastFullWarn > 60_000) {
      this.lastFullWarn = nowMs;
      this.log.error(
        'Fila de heartbeats CHEIA: eventos novos estão sendo descartados (consolidador parado?)',
      );
    }
    // 1 aceito · 0 duplicado/fora de ordem · 3 rápido demais · 2 fila cheia
    this.metrics.heartbeats.inc({
      result: ['ignored', 'accepted', 'queue_full', 'too_fast'][result] ?? 'unknown',
    });
    return result;
  }

  /** Duração do vídeo da sessão; cacheada no Redis para o heartbeat não ir ao banco toda vez. */
  private async durationFor(claims: PlaybackClaims): Promise<number> {
    const local = this.durations.get(claims.vid);
    if (local && local.expires > Date.now()) return local.value;

    const key = `pm:${claims.sid}`;
    const cached = await this.redis.get(key);
    if (cached) return this.remember(claims.vid, Number(cached));

    const video = await this.prisma.video.findFirst({
      where: { id: claims.vid, tenantId: claims.tid, status: 'ready' },
      select: { durationS: true },
    });
    if (!video?.durationS) throw new ConflictException('Vídeo indisponível');
    await this.redis.set(key, String(video.durationS), 'PX', STATE_TTL_MS);
    return this.remember(claims.vid, video.durationS);
  }

  /** Cache local (limitado) da duração por vídeo. Reprocessar um vídeo não muda a duração do original. */
  private readonly durations = new Map<string, { value: number; expires: number }>();
  private remember(videoId: string, value: number): number {
    if (this.durations.size >= 5000)
      this.durations.delete(this.durations.keys().next().value as string);
    this.durations.set(videoId, { value, expires: Date.now() + 10 * 60 * 1000 });
    return value;
  }
}

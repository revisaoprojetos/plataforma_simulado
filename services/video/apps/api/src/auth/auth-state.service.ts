import { Inject, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

/** Quanto tempo um "usuário ativo" vale no cache (revogação efetiva em até este prazo). */
export const AUTH_STATE_TTL_S = 20;
/** Estado negativo vale menos: reativar alguém não deve esperar o cache vencer por muito tempo. */
export const AUTH_STATE_DENY_TTL_S = 5;

export interface AuthState {
  /** conta existe, não foi removida/desativada e a empresa (se houver) está ativa */
  ok: boolean;
  role: Role | null;
}

const key = (userId: string) => `au:${userId}`;

/**
 * Estado atual do usuário para o guard JWT. O JWT de acesso vive 15 min; sem esta checagem, quem
 * foi desativado (ou cuja empresa foi suspensa) continuaria entrando até o token expirar.
 * Cache curto no Redis para não ir ao Postgres em toda requisição.
 */
@Injectable()
export class AuthStateService {
  private readonly log = new Logger(AuthStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async get(userId: string): Promise<AuthState> {
    try {
      const hit = await this.redis.get(key(userId));
      if (hit) return JSON.parse(hit) as AuthState;
    } catch (e) {
      this.log.warn(`Cache de estado indisponível: ${(e as Error).message}`);
    }
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, role: true, tenant: { select: { status: true } } },
    });
    const state: AuthState = {
      ok: !!row && !row.deletedAt && (row.tenant === null || row.tenant.status === 'active'),
      role: row?.role ?? null,
    };
    await this.redis
      .set(
        key(userId),
        JSON.stringify(state),
        'EX',
        state.ok ? AUTH_STATE_TTL_S : AUTH_STATE_DENY_TTL_S,
      )
      .catch(() => 0);
    return state;
  }

  /**
   * Revogação imediata: limpa o cache de estado, as sessões de reprodução (`ps:`) e, opcionalmente,
   * os refresh tokens (desativação, troca de senha, exclusão).
   */
  async revoke(userId: string, opts: { refreshTokens?: boolean } = {}): Promise<void> {
    if (opts.refreshTokens) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.redis.del(key(userId), `ps:${userId}`);
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(key(userId)).catch(() => 0);
  }
}

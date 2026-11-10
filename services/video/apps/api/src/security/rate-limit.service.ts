import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { TooManyRequestsException } from '../common/app-exception.filter';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { MetricsService } from '../observability/metrics.service';
import { REDIS } from '../redis/redis.module';
import { runScript } from '../redis/script';

export interface Policy {
  /** requisições permitidas por janela */
  limit: number;
  /** tamanho da janela, em segundos */
  windowS: number;
}

/**
 * Políticas por tipo de rota. A chave de contagem muda conforme o caso:
 * IP (rotas anônimas), usuário (rotas autenticadas), conta alvo (login) ou sessão de reprodução.
 */
export const POLICIES = {
  /** qualquer rota autenticada sem política própria — por usuário */
  default: { limit: 600, windowS: 60 },
  /** tentativas de login — por IP */
  loginIp: { limit: 30, windowS: 600 },
  /**
   * tentativas de login numa conta VINDAS DO MESMO IP (empresa + e-mail + IP): freia força bruta sem
   * deixar um atacante trancar a conta da vítima a partir do próprio IP.
   */
  loginAccountIp: { limit: 8, windowS: 900 },
  /** teto GLOBAL por conta (todos os IPs somados): barra força bruta distribuída */
  loginAccount: { limit: 60, windowS: 900 },
  /** renovação de login — por IP */
  refresh: { limit: 60, windowS: 600 },
  /** abertura de playback — por usuário */
  playbackStart: { limit: 60, windowS: 60 },
  /** manifests, chaves, legendas, heartbeat e renovação — por sessão de reprodução */
  playbackSession: { limit: 300, windowS: 60 },
  /** upload e gestão de vídeos — por usuário */
  upload: { limit: 120, windowS: 60 },
  /** relatórios (SQL pesado) — por usuário */
  analytics: { limit: 60, windowS: 60 },
  /** API de integração (matrícula e sessão de aluno) — por chave de integração */
  integration: { limit: 600, windowS: 60 },
  /** definição de senha pelo token de primeiro acesso — por IP */
  firstAccess: { limit: 20, windowS: 600 },
  /** chamadas ao servidor MCP — por token pessoal (ou por usuário, se entrou com JWT) */
  mcp: { limit: 120, windowS: 60 },
  /** exportação/exclusão de dados pessoais — por usuário */
  privacy: { limit: 5, windowS: 3600 },
} as const satisfies Record<string, Policy>;

export type PolicyName = keyof typeof POLICIES;

/**
 * Políticas de autenticação: se o Redis cair, NEGAM (falham fechado). Sem contador, liberar tentativas
 * de login ilimitadas é pior do que indisponibilizar o login por alguns instantes. As demais liberam.
 */
export const FAIL_CLOSED: ReadonlySet<PolicyName> = new Set<PolicyName>([
  'loginIp',
  'loginAccountIp',
  'loginAccount',
  'refresh',
  'firstAccess',
]);

// Contador de janela fixa, atômico: INCR e, se for o primeiro, define a expiração.
const HIT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { n, redis.call('PTTL', KEYS[1]) }
`;

export interface Hit {
  allowed: boolean;
  /** true quando o Redis falhou e a decisão veio da política de falha (aberta ou fechada) */
  degraded?: boolean;
  count: number;
  retryAfterS: number;
}

@Injectable()
export class RateLimitService {
  private readonly log = new Logger(RateLimitService.name);
  /** contadores por política, para a métrica `rate_limited_total` */
  readonly blocked = new Map<PolicyName, number>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly env: Pick<Env, 'RATE_LIMIT_ENABLED'>,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /** Conta uma requisição. Se o Redis falhar: rotas de login negam; as demais liberam (e avisam no log). */
  async hit(policy: PolicyName, key: string): Promise<Hit> {
    if (!this.env.RATE_LIMIT_ENABLED) return { allowed: true, count: 0, retryAfterS: 0 };
    const { limit, windowS } = POLICIES[policy];
    try {
      const [count, pttl] = (await runScript(
        this.redis,
        HIT,
        1,
        `rl:${policy}:${key}`,
        windowS * 1000,
      )) as [number, number];
      const allowed = count <= limit;
      if (!allowed) {
        this.blocked.set(policy, (this.blocked.get(policy) ?? 0) + 1);
        this.metrics?.rateLimited.inc({ policy });
      }
      return { allowed, count, retryAfterS: Math.max(1, Math.ceil(pttl / 1000)) };
    } catch (e) {
      const closed = FAIL_CLOSED.has(policy);
      this.log.error(
        `Redis indisponível; limite "${policy}" ${closed ? 'NEGA (falha fechada)' : 'ignorado'}: ${(e as Error).message}`,
      );
      return { allowed: !closed, degraded: true, count: 0, retryAfterS: closed ? 30 : 0 };
    }
  }

  /** Igual a `hit`, mas lança 429 (com Retry-After) quando estoura. */
  async enforce(policy: PolicyName, key: string): Promise<void> {
    const r = await this.hit(policy, key);
    if (!r.allowed && r.degraded) {
      throw new ServiceUnavailableException(
        'Serviço temporariamente indisponível. Tente em instantes.',
      );
    }
    if (!r.allowed) {
      throw new TooManyRequestsException(
        'Muitas requisições. Aguarde um pouco e tente novamente.',
        r.retryAfterS,
      );
    }
  }

  /** Zera um contador (ex.: login bem-sucedido limpa as tentativas erradas da conta). */
  async reset(policy: PolicyName, key: string): Promise<void> {
    await this.redis.del(`rl:${policy}:${key}`).catch(() => undefined);
  }
}

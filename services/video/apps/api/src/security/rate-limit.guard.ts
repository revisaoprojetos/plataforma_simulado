import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth/auth.types';
import { PolicyName, RateLimitService } from './rate-limit.service';

const POLICY = 'rateLimitPolicy';
const SKIP = 'skipRateLimit';

/** Escolhe a política desta rota (padrão: `default`, por usuário). */
export const RateLimit = (policy: PolicyName) => SetMetadata(POLICY, policy);
/** Rotas com limite próprio (login, entrega de vídeo por sessão) ou de infraestrutura (health). */
export const SkipRateLimit = () => SetMetadata(SKIP, true);

/**
 * Limite por usuário nas rotas autenticadas (por IP quando anônimo). Roda depois da autenticação,
 * por isso conhece `req.user`. Rotas públicas de entrega de vídeo usam o limite por sessão.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP, targets)) return true;

    const policy = this.reflector.getAllAndOverride<PolicyName>(POLICY, targets) ?? 'default';
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser; ip?: string }>();
    await this.limiter.enforce(policy, req.user?.id ?? `ip:${req.ip ?? 'desconhecido'}`);
    return true;
  }
}

import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from '../security/rate-limit.service';
import { hostOf } from './origin';
import { PlaybackClaims, PlaybackTokenService } from './playback-token.service';
import { SessionStore } from './session.store';

export interface PlaybackContext {
  claims: PlaybackClaims;
  token: string;
}

/** Rotas que cuidam sozinhas da sessão (renovar e encerrar). */
export const SKIP_SESSION_CHECK = 'skipSessionCheck';
export const SkipSessionCheck = () => SetMetadata(SKIP_SESSION_CHECK, true);

export const Playback = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlaybackContext =>
    ctx.switchToHttp().getRequest<{ playback: PlaybackContext }>().playback,
);

type Req = {
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  playback?: PlaybackContext;
};

/**
 * Autentica as rotas de entrega (/hls/*, renew, end) pelo token de playback — via `?t=` (hls.js, Safari)
 * ou `Authorization: Bearer`. Confere vídeo da URL, sessão ativa e o site de origem.
 */
@Injectable()
export class PlaybackTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: PlaybackTokenService,
    private readonly sessions: SessionStore,
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Req>();
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const token = req.query.t ?? bearer;
    if (!token) throw new UnauthorizedException('Token de playback ausente');
    const claims = await this.tokens.verify(token);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SESSION_CHECK, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    // Limite por sessão (um player legítimo fica muito abaixo) e "sessão ainda ativa?" são
    // independentes: vão ao Redis juntos, numa ida só. Se o limite estourar, vale o 429.
    const [, active] = await Promise.all([
      this.limiter.enforce('playbackSession', claims.sid),
      skip ? Promise.resolve(true) : this.sessions.isActive(claims.sub, claims.sid),
    ]);

    if (req.params.videoId && req.params.videoId !== claims.vid) {
      throw new ForbiddenException('Token não vale para este vídeo');
    }
    // O token só serve no site para o qual foi emitido (um token vazado não roda em outro domínio).
    const origin = hostOf(req.headers.origin);
    if (claims.dom && origin && origin !== claims.dom) {
      throw new ForbiddenException('Origem não autorizada para este token');
    }
    if (!active) throw new UnauthorizedException('Sessão de reprodução encerrada');
    req.playback = { claims, token };
    return true;
  }
}

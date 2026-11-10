import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { McpPrincipal, McpTokensService } from '../mcp/mcp-tokens.service';
import { looksLikeMcpToken } from '../mcp/token';
import { RateLimitService } from '../security/rate-limit.service';

/**
 * Chave de integração = token pessoal de um admin com o escopo `access:manage`. O sistema de
 * origem (área de membros, checkout) a usa de servidor para servidor. JWT de login não vale aqui.
 * Com a trava global desligada a rota responde 404, como se não existisse.
 */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private readonly env: Env,
    private readonly tokens: McpTokensService,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.env.ACCESS_ENDPOINT_ENABLED) throw new NotFoundException();

    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; integration?: McpPrincipal }>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException();
    const raw = header.slice(7).trim();

    const principal = looksLikeMcpToken(raw) ? await this.tokens.authenticate(raw) : null;
    if (!principal?.tokenId || !principal.scopes.includes('access:manage')) {
      throw new UnauthorizedException();
    }
    await this.limiter.enforce('integration', principal.tokenId);
    req.integration = principal;
    return true;
  }
}

export const Integration = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): McpPrincipal =>
    ctx.switchToHttp().getRequest<{ integration: McpPrincipal }>().integration,
);

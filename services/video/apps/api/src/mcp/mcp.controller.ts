import { Controller, Delete, Get, Headers, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtPayload } from '../auth/auth.types';
import { Public } from '../auth/decorators';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { RateLimitService } from '../security/rate-limit.service';
import { McpPrincipal, McpTokensService, allowedScopes } from './mcp-tokens.service';
import { McpService } from './mcp.service';
import { looksLikeMcpToken } from './token';

/**
 * `POST /mcp` — Streamable HTTP, stateless. Autenticação própria (token pessoal `gvmcp_…` ou o
 * JWT de login) e limite por token; as tools chamam os mesmos services da REST.
 */
@ApiExcludeController()
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcp: McpService,
    private readonly tokens: McpTokensService,
    private readonly limiter: RateLimitService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly env: Env,
  ) {}

  @Post()
  @Public()
  @SkipRateLimit()
  @HttpCode(200)
  async post(
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const principal = await this.authenticate(authorization);
    if (!principal) {
      res
        .status(401)
        .set('WWW-Authenticate', 'Bearer realm="mcp"')
        .json({ error: 'Não autorizado' });
      return;
    }
    await this.limiter.enforce('mcp', principal.tokenId ?? principal.user.id);
    await this.mcp.handle(principal, req, res, req.body);
  }

  // Modo stateless: não há stream de servidor nem sessão para encerrar.
  @Get()
  @Public()
  @SkipRateLimit()
  notAllowedGet(@Res() res: Response): void {
    res.status(405).set('Allow', 'POST').json({ error: 'Use POST' });
  }

  @Delete()
  @Public()
  @SkipRateLimit()
  notAllowedDelete(@Res() res: Response): void {
    res.status(405).set('Allow', 'POST').json({ error: 'Use POST' });
  }

  private async authenticate(header: string | undefined): Promise<McpPrincipal | null> {
    if (!header?.startsWith('Bearer ')) return null;
    const raw = header.slice(7).trim();
    if (looksLikeMcpToken(raw)) return this.tokens.authenticate(raw);

    try {
      const p = await this.jwt.verifyAsync<JwtPayload>(raw, { secret: this.env.JWT_ACCESS_SECRET });
      if (!p.tid || p.role === 'platform_admin') return null;
      return {
        user: { id: p.sub, tenantId: p.tid, role: p.role, email: p.email },
        scopes: allowedScopes(p.role),
        tokenId: null,
        via: 'jwt',
      };
    } catch {
      return null;
    }
  }
}

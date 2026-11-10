import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { McpPrincipal } from '../mcp/mcp-tokens.service';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { RateLimitService } from '../security/rate-limit.service';
import {
  EnrollDto,
  enrollSchema,
  FirstAccessDto,
  firstAccessSchema,
  RevokeDto,
  revokeSchema,
  SessionDto,
  sessionSchema,
} from './access-integration.dto';
import { AccessIntegrationService } from './access-integration.service';
import { Integration, IntegrationKeyGuard } from './integration-key.guard';

/**
 * API para o sistema de origem (área de membros, checkout), de servidor para servidor, com a
 * chave de integração. O aluno não conhece nem chama esta API.
 */
@ApiTags('access')
@ApiBearerAuth()
@Public()
@SkipRateLimit()
@UseGuards(IntegrationKeyGuard)
@Controller('access')
export class AccessIntegrationController {
  constructor(private readonly access: AccessIntegrationService) {}

  @Post('enrollments')
  async enroll(
    @Integration() p: McpPrincipal,
    @Body(new ZodPipe(enrollSchema)) dto: EnrollDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.access.enroll(p, dto);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Post('enrollments/revoke')
  @HttpCode(204)
  revoke(@Integration() p: McpPrincipal, @Body(new ZodPipe(revokeSchema)) dto: RevokeDto) {
    return this.access.revoke(p, dto);
  }

  @Post('sessions')
  @HttpCode(200)
  session(@Integration() p: McpPrincipal, @Body(new ZodPipe(sessionSchema)) dto: SessionDto) {
    return this.access.session(p, dto);
  }
}

/** Cenário de login direto: o aluno define a senha com o token de uso único. */
@ApiTags('auth')
@Public()
@SkipRateLimit()
@Controller('auth')
export class FirstAccessController {
  constructor(
    private readonly access: AccessIntegrationService,
    private readonly limiter: RateLimitService,
  ) {}

  @Post('first-access')
  @HttpCode(204)
  async redeem(
    @Body(new ZodPipe(firstAccessSchema)) dto: FirstAccessDto,
    @Req() req: { ip?: string },
  ): Promise<void> {
    await this.limiter.enforce('firstAccess', req.ip ?? 'desconhecido');
    await this.access.redeemFirstAccess(dto.token, dto.password);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantUser } from '../auth/auth.types';
import { Roles, Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { RateLimit } from '../security/rate-limit.guard';
import { PrivacyService } from './privacy.service';

/**
 * Confirmação da autoexclusão: conta com senha informa a senha; conta SEM senha (aluno criado pela
 * API de integração, que entra por sessão do sistema de origem) confirma digitando o próprio e-mail.
 */
const selfDeleteSchema = z
  .object({
    password: z.string().min(1).max(128).optional(),
    confirm: z.string().trim().min(3).max(254).optional(),
  })
  .refine((v) => v.password !== undefined || v.confirm !== undefined, {
    message: 'Informe a senha (ou, em conta sem senha, confirme com o seu e-mail)',
  });
const eraseQuerySchema = z.object({ mode: z.enum(['anonymize', 'erase']).default('anonymize') });
type SelfDelete = z.infer<typeof selfDeleteSchema>;
type EraseQuery = z.infer<typeof eraseQuerySchema>;

/** Direitos do titular (LGPD). Limitado a poucas chamadas por hora por usuário. */
@ApiTags('privacy')
@ApiBearerAuth()
@RateLimit('privacy')
@Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Cópia dos próprios dados. */
  @Get('me/data-export')
  @Header('Content-Disposition', 'attachment; filename="meus-dados.json"')
  @Header('Cache-Control', 'no-store')
  exportMine(@Tenant() user: TenantUser) {
    return this.privacy.exportData(user.tenantId, user.id);
  }

  /** Exclusão da própria conta (anonimização), confirmada com a senha (ou com o e-mail, se a conta não tem senha). */
  @Delete('me')
  @HttpCode(204)
  eraseMine(@Tenant() user: TenantUser, @Body(new ZodPipe(selfDeleteSchema)) dto: SelfDelete) {
    return this.privacy.eraseSelf(user, dto);
  }

  /** Cópia dos dados de um usuário da empresa, a pedido do titular. */
  @Roles('admin')
  @Get('users/:id/data-export')
  @Header('Cache-Control', 'no-store')
  exportUser(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacy.exportData(user.tenantId, id);
  }

  /** `?mode=anonymize` (padrão) mantém estatísticas sem identificação; `?mode=erase` apaga tudo. */
  @Roles('admin')
  @Delete('users/:id')
  @HttpCode(204)
  eraseUser(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(eraseQuerySchema)) q: EraseQuery,
  ) {
    return this.privacy.eraseUser(user, id, q.mode);
  }
}

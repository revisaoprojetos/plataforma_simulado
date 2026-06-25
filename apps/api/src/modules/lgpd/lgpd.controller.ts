import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { LgpdService } from './lgpd.service.js'
import { AcceptConsentDto } from './dto/accept-consent.dto.js'
import { CreateSolicitacaoDto } from './dto/create-solicitacao.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type AuthRequest = Request & { user?: { id: string }; tenantId: string }

@ApiTags('lgpd')
@Controller('lgpd')
export class LgpdController {
  constructor(private readonly lgpdService: LgpdService) {}

  // ─── Rotas do usuário (exige auth mas não tenant) ───────────────────

  @Get('consent/check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verifica se o usuário precisa consentir' })
  checkConsent(@Req() req: AuthRequest) {
    return this.lgpdService.checkConsent(req.user!.id)
  }

  @Post('consent')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Aceitar política de privacidade' })
  acceptConsent(@Req() req: AuthRequest, @Body() dto: AcceptConsentDto) {
    const ip = req.ip ?? req.socket.remoteAddress ?? ''
    const userAgent = (req.headers['user-agent'] as string) ?? ''
    return this.lgpdService.acceptConsent(req.user!.id, dto, ip, userAgent)
  }

  @Get('consent/history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Histórico de consentimentos do usuário' })
  getConsentHistory(@Req() req: AuthRequest) {
    return this.lgpdService.getConsentHistory(req.user!.id)
  }

  @Post('solicitacoes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar solicitação LGPD (acesso/exclusão/portabilidade)' })
  createSolicitacao(@Req() req: AuthRequest, @Body() dto: CreateSolicitacaoDto) {
    return this.lgpdService.createSolicitacao(req.user!.id, dto)
  }

  @Get('solicitacoes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Minhas solicitações LGPD' })
  getSolicitacoes(@Req() req: AuthRequest) {
    return this.lgpdService.getSolicitacoes(req.user!.id)
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exportar todos os meus dados (portabilidade)' })
  exportData(@Req() req: AuthRequest) {
    return this.lgpdService.exportUserData(req.user!.id)
  }

  // ─── Rotas admin ────────────────────────────────────────────────────

  @Get('admin/solicitacoes')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('configuracoes:manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Listar solicitações LGPD pendentes' })
  listPending(@Req() req: AuthRequest) {
    return this.lgpdService.listPendingSolicitacoes(req.tenantId)
  }

  @Patch('admin/solicitacoes/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('configuracoes:manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Processar solicitação LGPD' })
  processSolicitacao(
    @Param('id') id: string,
    @Body() body: { status: 'processado' | 'rejeitado' },
  ) {
    return this.lgpdService.processSolicitacao(id, body.status)
  }
}

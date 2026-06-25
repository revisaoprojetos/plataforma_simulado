import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { WebhooksService } from './webhooks.service.js'
import { CreateWebhookDto } from './dto/create-webhook.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string }

@ApiTags('webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Get()
  @RequirePermission('configuracoes:view')
  @ApiOperation({ summary: 'Listar webhooks do tenant' })
  listar(@Req() req: TenantRequest) {
    return this.webhooksService.listar(req.tenantId)
  }

  @Post()
  @RequirePermission('configuracoes:manage')
  @ApiOperation({ summary: 'Criar webhook' })
  criar(@Req() req: TenantRequest, @Body() dto: CreateWebhookDto) {
    return this.webhooksService.criar(req.tenantId, dto)
  }

  @Delete(':id')
  @RequirePermission('configuracoes:manage')
  @ApiOperation({ summary: 'Desativar webhook' })
  desativar(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.webhooksService.desativar(id, req.tenantId)
  }

  @Post('test/:id')
  @RequirePermission('configuracoes:manage')
  @ApiOperation({ summary: 'Disparar teste de webhook' })
  testar(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.webhooksService.testar(id, req.tenantId)
  }
}

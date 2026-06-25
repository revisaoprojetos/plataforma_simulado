import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { Request } from 'express'
import { AuditService } from './audit.service.js'
import type { ListAuditLogsFilter } from './audit.service.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string }

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('auditoria:view')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Listar registros de auditoria com filtros' })
  @ApiQuery({ name: 'actor_user_id', required: false })
  @ApiQuery({ name: 'tabela', required: false })
  @ApiQuery({ name: 'operacao', required: false })
  @ApiQuery({ name: 'data_inicio', required: false })
  @ApiQuery({ name: 'data_fim', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Req() req: TenantRequest, @Query() filter: ListAuditLogsFilter) {
    return this.auditService.findAll(req.tenantId, filter)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de um registro de auditoria' })
  findOne(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.auditService.findOne(id, req.tenantId)
  }
}

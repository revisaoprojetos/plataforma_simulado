import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { ApiKeysService } from './api-keys.service.js'
import { CreateApiKeyDto } from './dto/create-api-key.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type AuthRequest = Request & { tenantId: string; user: { id: string } }

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @RequirePermission('api_keys:manage')
  @ApiOperation({ summary: 'Listar API keys do tenant' })
  listar(@Req() req: AuthRequest) {
    return this.apiKeysService.listar(req.tenantId)
  }

  @Post()
  @RequirePermission('api_keys:manage')
  @ApiOperation({ summary: 'Criar nova API key (retorna key_completa apenas uma vez)' })
  criar(@Req() req: AuthRequest, @Body() dto: CreateApiKeyDto) {
    return this.apiKeysService.criar(req.tenantId, req.user.id, dto)
  }

  @Delete(':id')
  @RequirePermission('api_keys:manage')
  @ApiOperation({ summary: 'Revogar API key' })
  revogar(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.apiKeysService.revogar(id, req.tenantId)
  }
}

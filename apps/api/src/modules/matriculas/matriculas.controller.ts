import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { MatriculasService } from './matriculas.service.js'
import { CreateMatriculaDto } from './dto/create-matricula.dto.js'
import { UpdateMatriculaDto } from './dto/update-matricula.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string }

@ApiTags('matriculas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('matriculas')
export class MatriculasController {
  constructor(private readonly matriculasService: MatriculasService) {}

  @Get()
  @RequirePermission('matriculas:view')
  @ApiOperation({ summary: 'Listar matrículas com filtros' })
  findAll(
    @Req() req: TenantRequest,
    @Query() filter: { estudante_id?: string; status?: string; page?: string; limit?: string },
  ) {
    return this.matriculasService.findAll(req.tenantId, {
      ...filter,
      page: filter.page ? Number(filter.page) : 1,
      limit: filter.limit ? Number(filter.limit) : 50,
    })
  }

  @Get(':id')
  @RequirePermission('matriculas:view')
  @ApiOperation({ summary: 'Detalhes de uma matrícula' })
  findOne(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.matriculasService.findOne(id, req.tenantId)
  }

  @Post()
  @RequirePermission('matriculas:create')
  @ApiOperation({ summary: 'Criar matrícula' })
  create(@Req() req: TenantRequest, @Body() dto: CreateMatriculaDto) {
    return this.matriculasService.create(req.tenantId, dto)
  }

  @Put(':id')
  @RequirePermission('matriculas:update')
  @ApiOperation({ summary: 'Atualizar matrícula' })
  update(@Param('id') id: string, @Req() req: TenantRequest, @Body() dto: UpdateMatriculaDto) {
    return this.matriculasService.update(id, req.tenantId, dto)
  }

  @Delete(':id')
  @RequirePermission('matriculas:delete')
  @ApiOperation({ summary: 'Cancelar matrícula' })
  cancel(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.matriculasService.cancel(id, req.tenantId)
  }

  @Post('expire-overdue')
  @RequirePermission('matriculas:manage')
  @ApiOperation({ summary: '[Admin] Expirar matrículas vencidas' })
  expireOverdue(@Req() req: TenantRequest) {
    return this.matriculasService.expireOverdue(req.tenantId)
  }
}

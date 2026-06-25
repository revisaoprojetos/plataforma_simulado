import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { SimuladosService } from './simulados.service.js'
import { CreateSimuladoDto } from './dto/create-simulado.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string; user?: { id: string } }

@ApiTags('simulados')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('simulados')
export class SimuladosController {
  constructor(private readonly simuladosService: SimuladosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar simulados do tenant' })
  findAll(@Req() req: TenantRequest) {
    return this.simuladosService.findAll(req.tenantId)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes do simulado com questões' })
  findOne(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.simuladosService.findOne(id, req.tenantId)
  }

  @Post()
  @RequirePermission('simulados:create')
  @ApiOperation({ summary: 'Criar simulado' })
  create(@Body() dto: CreateSimuladoDto, @Req() req: TenantRequest) {
    return this.simuladosService.create(req.tenantId, req.user!.id, dto)
  }

  @Put(':id')
  @RequirePermission('simulados:update')
  @ApiOperation({ summary: 'Editar simulado' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSimuladoDto>,
    @Req() req: TenantRequest,
  ) {
    return this.simuladosService.update(id, req.tenantId, dto)
  }

  @Delete(':id')
  @RequirePermission('simulados:delete')
  @ApiOperation({ summary: 'Excluir simulado (apenas rascunhos)' })
  remove(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.simuladosService.remove(id, req.tenantId)
  }

  @Post(':id/publish')
  @RequirePermission('simulados:update')
  @ApiOperation({ summary: 'Publicar simulado (valida questões e datas)' })
  publish(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.simuladosService.publish(id, req.tenantId)
  }

  @Get(':id/sessoes')
  @RequirePermission('simulados:view')
  @ApiOperation({ summary: 'Listar sessões de prova do simulado' })
  getSessoes(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.simuladosService.getSessoes(id, req.tenantId)
  }
}

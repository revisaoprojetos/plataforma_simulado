import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { QuestoesService } from './questoes.service.js'
import { CreateQuestaoDto } from './dto/create-questao.dto.js'
import { ListQuestoesDto } from './dto/list-questoes.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string; user?: { id: string } }

@ApiTags('questoes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('questoes')
export class QuestoesController {
  constructor(private readonly questoesService: QuestoesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar questões paginadas com filtros' })
  findAll(@Req() req: TenantRequest, @Query() filters: ListQuestoesDto) {
    return this.questoesService.findAll(req.tenantId, filters)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes de uma questão com alternativas' })
  findOne(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.questoesService.findOne(id, req.tenantId)
  }

  @Post()
  @RequirePermission('questoes:create')
  @ApiOperation({ summary: 'Criar questão' })
  create(@Body() dto: CreateQuestaoDto, @Req() req: TenantRequest) {
    return this.questoesService.create(req.tenantId, req.user!.id, dto)
  }

  @Put(':id')
  @RequirePermission('questoes:update')
  @ApiOperation({ summary: 'Editar questão' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateQuestaoDto>,
    @Req() req: TenantRequest,
  ) {
    return this.questoesService.update(id, req.tenantId, dto)
  }

  @Delete(':id')
  @RequirePermission('questoes:delete')
  @ApiOperation({ summary: 'Arquivar questão (soft delete)' })
  remove(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.questoesService.softDelete(id, req.tenantId)
  }
}

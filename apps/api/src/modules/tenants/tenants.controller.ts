import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { TenantsService } from './tenants.service.js'
import { CreateTenantDto } from './dto/create-tenant.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @RequirePermission('tenants:view')
  @ApiOperation({ summary: 'Listar todos os tenants' })
  findAll() {
    return this.tenantsService.findAll()
  }

  @Get(':id')
  @RequirePermission('tenants:view')
  @ApiOperation({ summary: 'Detalhes de um tenant' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id)
  }

  @Post()
  @RequirePermission('tenants:create')
  @ApiOperation({ summary: 'Criar novo tenant' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto)
  }

  @Put(':id')
  @RequirePermission('tenants:update')
  @ApiOperation({ summary: 'Atualizar tenant' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateTenantDto>) {
    return this.tenantsService.update(id, dto)
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { UsersService } from './users.service.js'
import { CreateUserDto } from './dto/create-user.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string }

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Listar usuários do tenant' })
  findAll(@Req() req: TenantRequest) {
    return this.usersService.findAll(req.tenantId)
  }

  @Get(':id')
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Detalhes de um usuário' })
  findOne(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.usersService.findOne(id, req.tenantId)
  }

  @Post()
  @RequirePermission('users:create')
  @ApiOperation({ summary: 'Criar usuário no tenant (admin cria, sem auto-registro)' })
  create(@Body() dto: CreateUserDto, @Req() req: TenantRequest) {
    return this.usersService.create(dto, req.tenantId)
  }

  @Patch(':id/deactivate')
  @RequirePermission('users:update')
  @ApiOperation({ summary: 'Desativar acesso do usuário no tenant' })
  deactivate(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.usersService.deactivate(id, req.tenantId)
  }
}

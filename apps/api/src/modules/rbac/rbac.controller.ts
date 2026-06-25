import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { RbacService } from './rbac.service.js'
import { CreateRoleDto } from './dto/create-role.dto.js'
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'
import { PermissionsGuard } from '../../common/guards/permissions.guard.js'
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js'

type TenantRequest = Request & { tenantId: string; user?: { id: string } }

@ApiTags('rbac')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('matrix')
  @RequirePermission('rbac:view')
  @ApiOperation({ summary: 'Matriz perfis × permissões' })
  getMatrix(@Req() req: TenantRequest) {
    return this.rbacService.getPermissionsMatrix(req.tenantId)
  }

  @Get('roles')
  @RequirePermission('rbac:view')
  @ApiOperation({ summary: 'Listar perfis do tenant' })
  getRoles(@Req() req: TenantRequest) {
    return this.rbacService.getRoles(req.tenantId)
  }

  @Post('roles')
  @RequirePermission('rbac:manage')
  @ApiOperation({ summary: 'Criar perfil customizado' })
  createRole(@Req() req: TenantRequest, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(req.tenantId, dto)
  }

  @Delete('roles/:id')
  @RequirePermission('rbac:manage')
  @ApiOperation({ summary: 'Remover perfil customizado' })
  deleteRole(@Param('id') id: string, @Req() req: TenantRequest) {
    return this.rbacService.deleteRole(id, req.tenantId)
  }

  @Get('permissions')
  @RequirePermission('rbac:view')
  @ApiOperation({ summary: 'Catálogo de permissões' })
  getPermissions() {
    return this.rbacService.getPermissions()
  }

  @Put('roles/:id/permissions')
  @RequirePermission('rbac:manage')
  @ApiOperation({ summary: 'Atribuir permissões a um perfil' })
  setRolePermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.rbacService.setRolePermissions(id, dto)
  }

  @Get('users/:userId/roles')
  @RequirePermission('rbac:view')
  @ApiOperation({ summary: 'Perfis de um usuário no tenant' })
  getUserRoles(@Param('userId') userId: string, @Req() req: TenantRequest) {
    return this.rbacService.getUserRoles(userId, req.tenantId)
  }

  @Put('users/:userId/roles')
  @RequirePermission('rbac:manage')
  @ApiOperation({ summary: 'Definir perfis de um usuário no tenant' })
  setUserRoles(
    @Param('userId') userId: string,
    @Req() req: TenantRequest,
    @Body() body: { role_ids: string[] },
  ) {
    return this.rbacService.setUserRoles(userId, req.tenantId, body.role_ids)
  }

  @Post('seed')
  @RequirePermission('tenants:manage')
  @ApiOperation({ summary: 'Seed de perfis e permissões padrão do tenant' })
  seedRoles(@Req() req: TenantRequest) {
    return this.rbacService.seedTenantRoles(req.tenantId)
  }
}

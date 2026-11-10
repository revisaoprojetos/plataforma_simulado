import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Roles, Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  CreateTenantDto,
  createTenantSchema,
  UpdateTenantDto,
  updateTenantSchema,
} from './tenants.dto';
import { TenantsService } from './tenants.service';

@ApiTags('platform')
@ApiBearerAuth()
@Controller()
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Roles('platform_admin')
  @Post('platform/tenants')
  create(@Body(new ZodPipe(createTenantSchema)) dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Roles('platform_admin')
  @Get('platform/tenants')
  list() {
    return this.tenants.list();
  }

  @Roles('platform_admin')
  @Patch('platform/tenants/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTenantSchema)) dto: UpdateTenantDto,
  ) {
    return this.tenants.update(id, dto);
  }

  @Get('tenant')
  current(@Tenant() user: TenantUser) {
    return this.tenants.current(user.tenantId);
  }
}

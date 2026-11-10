import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Roles, Tenant } from '../auth/decorators';
import { z } from 'zod';
import { paginationSchema } from '../common/pagination';
import { ZodPipe } from '../common/zod.pipe';
import { CreateUserDto, createUserSchema, UpdateUserDto, updateUserSchema } from './users.dto';
import { UsersService } from './users.service';

const listUsersSchema = paginationSchema.extend({ q: z.string().trim().max(100).optional() });
type ListUsersQuery = z.infer<typeof listUsersSchema>;

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles('admin')
  @Post()
  create(@Tenant() actor: TenantUser, @Body(new ZodPipe(createUserSchema)) dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Roles('admin', 'professor')
  @Get()
  list(@Tenant() actor: TenantUser, @Query(new ZodPipe(listUsersSchema)) query: ListUsersQuery) {
    const { q, ...pg } = query;
    return this.users.list(actor, pg, q);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Tenant() actor: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }
}

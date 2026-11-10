import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser, TenantUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

const userFrom = (ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  userFrom(ctx),
);

/** Usuário de empresa. platform_admin não tem empresa e não acessa rotas de negócio. */
export const Tenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): TenantUser => {
  const user = userFrom(ctx);
  if (!user.tenantId) throw new ForbiddenException('Rota exclusiva de usuários de uma empresa');
  return user as TenantUser;
});

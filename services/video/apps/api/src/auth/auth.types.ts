import { Role } from '@prisma/client';

/** Usuário autenticado (vem do JWT). `tenantId` é nulo apenas para platform_admin. */
export interface AuthUser {
  id: string;
  tenantId: string | null;
  role: Role;
  email: string;
}

/** Usuário de uma empresa — toda rota de negócio opera com este tipo. */
export interface TenantUser extends AuthUser {
  tenantId: string;
}

export interface JwtPayload {
  sub: string;
  tid: string | null;
  role: Role;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

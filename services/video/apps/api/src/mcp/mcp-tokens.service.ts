import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { TenantUser } from '../auth/auth.types';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { isScope, SCOPES, Scope } from './scopes';
import { generateToken, hashToken } from './token';

export const MAX_ACTIVE_TOKENS = 10;
const MAX_DAYS = 365;
const DAY_MS = 86_400_000;
const TOUCH_EVERY_MS = 60_000;

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length),
  expiresInDays: z.number().int().min(1).max(MAX_DAYS).default(90),
});
export type CreateTokenDto = z.infer<typeof createTokenSchema>;

/** Aluno não gerencia nada (sem analytics); a chave de integração é só de admin. */
export function allowedScopes(role: Role): readonly Scope[] {
  if (role === 'aluno')
    return SCOPES.filter((s) => s !== 'analytics:read' && s !== 'access:manage');
  if (role !== 'admin') return SCOPES.filter((s) => s !== 'access:manage');
  return SCOPES;
}

/** Quem está falando com o MCP: um usuário de uma empresa e o que o token deixa fazer. */
export interface McpPrincipal {
  user: TenantUser;
  scopes: readonly string[];
  tokenId: string | null;
  via: 'token' | 'jwt';
}

@Injectable()
export class McpTokensService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly env: Env,
  ) {}

  async create(user: TenantUser, dto: CreateTokenDto) {
    const forbidden = dto.scopes.filter((s) => !allowedScopes(user.role).includes(s));
    if (forbidden.length) {
      throw new ForbiddenException(
        `Escopo não permitido para o seu papel: ${forbidden.join(', ')}`,
      );
    }
    const active = await this.prisma.apiToken.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active >= MAX_ACTIVE_TOKENS) {
      throw new UnprocessableEntityException(
        `Limite de ${MAX_ACTIVE_TOKENS} tokens ativos; revogue algum antes`,
      );
    }
    const { token, prefix } = generateToken();
    const row = await this.prisma.apiToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        name: dto.name,
        prefix,
        tokenHash: hashToken(token, this.env.JWT_REFRESH_SECRET),
        scopes: [...new Set(dto.scopes)],
        expiresAt: new Date(Date.now() + dto.expiresInDays * DAY_MS),
      },
    });
    // O valor completo só existe nesta resposta.
    return { id: row.id, name: row.name, token, scopes: row.scopes, expiresAt: row.expiresAt };
  }

  list(user: TenantUser) {
    return this.prisma.apiToken.findMany({
      where: { tenantId: user.tenantId, userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(user: TenantUser, id: string): Promise<void> {
    const res = await this.prisma.apiToken.updateMany({
      where: { id, tenantId: user.tenantId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Token não encontrado');
  }

  /** Revoga todos os tokens do usuário (anonimização/exclusão LGPD). */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.apiToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Resolve o token a cada requisição (sem cache): revogar, suspender a empresa ou excluir o
   * usuário corta o acesso na hora. `null` = qualquer motivo de recusa (o cliente não distingue).
   */
  async authenticate(raw: string): Promise<McpPrincipal | null> {
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: hashToken(raw, this.env.JWT_REFRESH_SECRET) },
      include: {
        user: { select: { id: true, tenantId: true, role: true, email: true, deletedAt: true } },
        tenant: { select: { status: true } },
      },
    });
    if (!row || row.revokedAt || row.expiresAt <= new Date()) return null;
    const u = row.user;
    if (u.deletedAt || u.tenantId !== row.tenantId || row.tenant.status !== 'active') return null;
    if (u.role === 'platform_admin') return null;

    const now = Date.now();
    if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      void this.prisma.apiToken
        .update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } })
        .catch(() => undefined);
    }
    return {
      user: { id: u.id, tenantId: row.tenantId, role: u.role, email: u.email },
      // só os escopos que o papel atual ainda permite (o papel pode ter sido rebaixado depois)
      scopes: row.scopes.filter(isScope).filter((s) => allowedScopes(u.role).includes(s)),
      tokenId: row.id,
      via: 'token',
    };
  }
}

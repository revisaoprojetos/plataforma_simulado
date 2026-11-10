import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthStateService } from '../auth/auth-state.service';
import { TenantUser } from '../auth/auth.types';
import { Page, Pagination, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authState: AuthStateService,
  ) {}

  async create(actor: TenantUser, dto: CreateUserDto) {
    const exists = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, email: dto.email },
    });
    if (exists) throw new ConflictException('E-mail já cadastrado nesta empresa');
    return this.prisma.user.create({
      data: {
        tenantId: actor.tenantId,
        email: dto.email,
        name: dto.name,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
      },
      select: publicSelect,
    });
  }

  /** Admin vê todos da empresa; professor vê só alunos matriculados nos seus cursos. */
  async list(actor: TenantUser, pg: Pagination, q?: string): Promise<Page<unknown>> {
    if (actor.role !== 'admin' && actor.role !== 'professor') {
      throw new ForbiddenException('Permissão insuficiente');
    }
    const where: Prisma.UserWhereInput = {
      tenantId: actor.tenantId,
      deletedAt: null,
      // busca por nome ou e-mail (sem diferenciar maiúsculas)
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      }),
      ...(actor.role === 'professor' && {
        enrollments: { some: { tenantId: actor.tenantId, course: { ownerId: actor.id } } },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: publicSelect,
        orderBy: { name: 'asc' },
        ...skipTake(pg),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, page: pg.page, limit: pg.limit, total };
  }

  async update(actor: TenantUser, id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId: actor.tenantId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.id === actor.id && (dto.active === false || (dto.role && dto.role !== user.role))) {
      throw new ForbiddenException('Você não pode desativar ou rebaixar a si mesmo');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role,
        ...(dto.password && {
          passwordHash: await argon2.hash(dto.password, { type: argon2.argon2id }),
        }),
        ...(dto.active !== undefined && { deletedAt: dto.active ? null : new Date() }),
      },
      select: publicSelect,
    });
    // Revogação imediata: desativar ou trocar a senha derruba refresh tokens e telas abertas (`ps:`);
    // qualquer mudança de estado/papel zera o cache de estado do guard JWT.
    const kicked = dto.active === false || !!dto.password;
    if (kicked) await this.authState.revoke(id, { refreshTokens: true });
    else if (dto.active !== undefined || dto.role) await this.authState.invalidate(id);
    return updated;
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './tenants.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    if (await this.prisma.tenant.findUnique({ where: { slug: dto.slug } })) {
      throw new ConflictException('Já existe uma empresa com este slug');
    }
    const passwordHash = await argon2.hash(dto.admin.password, { type: argon2.argon2id });
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { slug: dto.slug, name: dto.name, allowedDomains: dto.allowedDomains },
      });
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.admin.email,
          name: dto.admin.name,
          role: 'admin',
          passwordHash,
        },
        select: { id: true, email: true, name: true, role: true },
      });
      return { ...tenant, admin };
    });
  }

  list() {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async update(id: string, dto: UpdateTenantDto) {
    const data: Prisma.TenantUpdateInput = {
      name: dto.name,
      status: dto.status,
      allowedDomains: dto.allowedDomains,
      accessEndpointEnabled: dto.accessEndpointEnabled,
    };
    try {
      return await this.prisma.tenant.update({ where: { id }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('Empresa não encontrada');
      }
      throw e;
    }
  }

  async current(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true, status: true, allowedDomains: true },
    });
    if (!tenant) throw new NotFoundException('Empresa não encontrada');
    return tenant;
  }
}

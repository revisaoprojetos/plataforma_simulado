import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload, TokenPair } from './auth.types';
import { LoginDto } from './auth.dto';
import { ttlToSeconds } from './ttl';

const INVALID = 'Credenciais inválidas';

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(CONFIG) private readonly env: Env,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.findLoginUser(dto);
    // Sempre verifica um hash (mesmo sem usuário) para não vazar existência por tempo de resposta.
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, dto.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException(INVALID);
    return this.issue(user);
  }

  async refresh(token: string): Promise<TokenPair> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: { include: { tenant: true } } },
    });
    if (!row) throw new UnauthorizedException();

    if (row.revokedAt) {
      // Reuso de token já rotacionado: possível roubo → derruba a família inteira.
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException();
    }
    const { user } = row;
    const tenantBlocked = user.tenant !== null && user.tenant.status !== 'active';
    if (row.expiresAt < new Date() || user.deletedAt || tenantBlocked) {
      throw new UnauthorizedException();
    }

    // Só uma requisição concorrente consegue "gastar" o token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException();
    }
    return this.issue(user, row.familyId);
  }

  async logout(token: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (row) await this.revokeFamily(row.familyId);
  }

  async me(user: AuthUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    if (!row || row.deletedAt) throw new UnauthorizedException();
    return { id: row.id, email: row.email, name: row.name, role: row.role, tenant: row.tenant };
  }

  private async findLoginUser(dto: LoginDto) {
    if (!dto.tenant) {
      return this.prisma.user.findFirst({
        where: { tenantId: null, role: 'platform_admin', email: dto.email, deletedAt: null },
      });
    }
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenant } });
    if (!tenant || tenant.status !== 'active') return null;
    return this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: dto.email, deletedAt: null },
    });
  }

  /**
   * Sessão curta emitida por um sistema integrado em nome do aluno que ele já autenticou.
   * Sem refresh: o sistema pede outra quando precisar.
   */
  async issueSessionFor(user: {
    id: string;
    tenantId: string | null;
    role: AuthUser['role'];
    email: string;
  }): Promise<{ accessToken: string; expiresIn: number }> {
    const expiresIn = ttlToSeconds(this.env.JWT_ACCESS_TTL);
    const payload: JwtPayload = {
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn,
    });
    return { accessToken, expiresIn };
  }

  private async issue(
    user: { id: string; tenantId: string | null; role: AuthUser['role']; email: string },
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const expiresIn = ttlToSeconds(this.env.JWT_ACCESS_TTL);
    const payload: JwtPayload = {
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn,
    });

    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ttlToSeconds(this.env.JWT_REFRESH_TTL) * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn };
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.env.JWT_REFRESH_SECRET).update(token).digest('hex');
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    return this.dummyHash;
  }
}

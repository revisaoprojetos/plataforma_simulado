import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { McpAuditService } from '../mcp/mcp-audit.service';
import { McpPrincipal } from '../mcp/mcp-tokens.service';
import { hashToken } from '../mcp/token';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { EnrollDto, RevokeDto, SessionDto } from './access-integration.dto';
import { hasWindowInput, resolveWindow } from './window';

export const FIRST_ACCESS_TTL_MS = 7 * 86_400_000;

/** Hash que nenhum login consegue verificar: o aluno só entra pelo sistema que o integrou. */
const noLoginHash = () => `!sem-login:${randomBytes(24).toString('hex')}`;
const hasNoPassword = (hash: string) => hash.startsWith('!');
const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const AUDIT = { via: 'access-api' } as const;

@Injectable()
export class AccessIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: McpAuditService,
    @Inject(CONFIG) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Matricula o aluno (criando-o se preciso) e devolve o estado resultante. */
  async enroll(p: McpPrincipal, dto: EnrollDto) {
    const tenantId = p.user.tenantId;
    await this.assertTenantEnabled(tenantId);

    const course = await this.prisma.course.findFirst({
      where: { id: dto.courseId, tenantId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    const window = resolveWindow(dto);

    // Mesma externalRef = mesma matrícula: devolve o que já existe, sem renovar o prazo.
    if (dto.externalRef) {
      const prior = await this.prisma.enrollment.findUnique({
        where: { tenantId_externalRef: { tenantId, externalRef: dto.externalRef } },
        include: { user: { select: { email: true } } },
      });
      if (prior) {
        if (prior.courseId !== course.id || prior.user.email !== dto.email) {
          throw new ConflictException('externalRef já usado em outra matrícula');
        }
        await this.audit.record(p, 'access.enroll.replay', { externalRef: dto.externalRef }, true, {
          ...AUDIT,
          detail: { enrollmentId: prior.id, userId: prior.userId, courseId: course.id },
        });
        return this.result(prior, { userCreated: false, created: false, replayed: true });
      }
    }

    const { user, userCreated } = await this.ensureStudent(tenantId, dto);
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: course.id } },
    });
    // Chamada "pelada" (sem datas e sem externalRef) sobre matrícula existente NÃO mexe no prazo
    // nem reativa por conta própria: só `reactivate: true` tira a revogação (a janela é mantida).
    const bare = !!existing && !hasWindowInput(dto) && !dto.externalRef;
    const data = bare
      ? { ...(dto.reactivate && { revokedAt: null }) }
      : {
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          revokedAt: null,
          ...(dto.externalRef && { externalRef: dto.externalRef }),
        };
    let enrollment;
    try {
      // upsert: duas chamadas simultâneas para o mesmo aluno/curso convergem para uma matrícula
      enrollment = await this.prisma.enrollment.upsert({
        where: { userId_courseId: { userId: user.id, courseId: course.id } },
        create: {
          tenantId,
          userId: user.id,
          courseId: course.id,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          ...(dto.externalRef && { externalRef: dto.externalRef }),
        },
        update: data,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('externalRef já usado em outra matrícula');
      }
      throw e;
    }

    const firstAccess =
      dto.issueFirstAccess && hasNoPassword(user.passwordHash)
        ? await this.issueFirstAccess(tenantId, user.id)
        : null;

    await this.audit.record(p, 'access.enroll', { externalRef: dto.externalRef ?? null }, true, {
      ...AUDIT,
      detail: {
        enrollmentId: enrollment.id,
        userId: user.id,
        courseId: course.id,
        userCreated,
        created: !existing,
        startsAt: enrollment.startsAt?.toISOString() ?? null,
        endsAt: enrollment.endsAt?.toISOString() ?? null,
        bare,
        reactivate: dto.reactivate ?? false,
        externalRef: dto.externalRef ?? null,
        firstAccessIssued: !!firstAccess,
      },
    });
    return {
      ...this.result(enrollment, { userCreated, created: !existing, replayed: false }),
      firstAccess,
    };
  }

  /** Encerra o acesso do aluno ao curso (o registro fica para histórico). Repetir é inofensivo. */
  async revoke(p: McpPrincipal, dto: RevokeDto): Promise<void> {
    const tenantId = p.user.tenantId;
    await this.assertTenantEnabled(tenantId);
    const user = await this.findStudent(tenantId, dto);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId: dto.courseId } },
    });
    if (!enrollment || enrollment.tenantId !== tenantId) {
      throw new NotFoundException('Matrícula não encontrada');
    }
    if (!enrollment.revokedAt) {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { revokedAt: new Date() },
      });
      // Corta as telas abertas agora (o token de playback deixa de renovar de qualquer jeito).
      await this.redis.del(`ps:${user.id}`);
    }
    await this.audit.record(p, 'access.revoke', {}, true, {
      ...AUDIT,
      detail: { enrollmentId: enrollment.id, userId: user.id, courseId: dto.courseId },
    });
  }

  /** Sessão curta em nome do aluno, para o sistema de origem falar com a API por ele. */
  async session(p: McpPrincipal, dto: SessionDto) {
    const tenantId = p.user.tenantId;
    await this.assertTenantEnabled(tenantId);
    const user = await this.findStudent(tenantId, dto);
    const session = await this.auth.issueSessionFor({
      id: user.id,
      tenantId,
      role: user.role,
      email: user.email,
    });
    await this.audit.record(p, 'access.session', {}, true, {
      ...AUDIT,
      detail: { userId: user.id },
    });
    return { ...session, tokenType: 'Bearer' as const, user: { id: user.id, name: user.name } };
  }

  /** O aluno (cenário de login direto) define a senha com o token de uso único. */
  async redeemFirstAccess(token: string, password: string): Promise<void> {
    if (!this.env.ACCESS_ENDPOINT_ENABLED) throw new NotFoundException();
    const row = await this.prisma.firstAccessToken.findUnique({
      where: { tokenHash: hashToken(token, this.env.JWT_REFRESH_SECRET) },
      include: {
        user: true,
        tenant: { select: { status: true, accessEndpointEnabled: true } },
      },
    });
    const invalid =
      !row ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      row.user.deletedAt ||
      row.tenant.status !== 'active' ||
      !row.tenant.accessEndpointEnabled ||
      !hasNoPassword(row.user.passwordHash);
    if (invalid) throw new UnauthorizedException('Token inválido ou expirado');

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.firstAccessToken.updateMany({
        where: { userId: row.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.audit.record(
      { user: { ...row.user, tenantId: row.tenantId, role: row.user.role }, tokenId: null },
      'access.first-access',
      {},
      true,
      { via: 'first-access', detail: { userId: row.userId } },
    );
  }

  // ---------- auxiliares ----------

  private async assertTenantEnabled(tenantId: string): Promise<void> {
    const t = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { accessEndpointEnabled: true },
    });
    if (!t?.accessEndpointEnabled) throw new NotFoundException();
  }

  private async findStudent(
    tenantId: string,
    by: { email?: string; externalId?: string },
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        ...(by.email ? { email: by.email } : { externalId: by.externalId }),
      },
    });
    if (!user) throw new NotFoundException('Aluno não encontrado');
    if (user.role !== 'aluno') {
      throw new UnprocessableEntityException('Apenas alunos podem ser usados por esta API');
    }
    return user;
  }

  /** Acha o aluno pelo e-mail ou o cria sem senha utilizável. Nunca altera quem já existe (exceto o externalId vazio). */
  private async ensureStudent(
    tenantId: string,
    dto: EnrollDto,
  ): Promise<{ user: User; userCreated: boolean }> {
    const byEmail = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
    if (byEmail) {
      if (byEmail.deletedAt) throw new UnprocessableEntityException('Conta removida');
      if (byEmail.role !== 'aluno') {
        throw new UnprocessableEntityException('Apenas alunos podem ser matriculados');
      }
      if (dto.externalId && byEmail.externalId && byEmail.externalId !== dto.externalId) {
        throw new ConflictException('Este e-mail já está vinculado a outro externalId');
      }
      if (dto.externalId && !byEmail.externalId) {
        try {
          const user = await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { externalId: dto.externalId },
          });
          return { user, userCreated: false };
        } catch (e) {
          if (isUniqueViolation(e))
            throw new ConflictException('externalId já pertence a outro aluno');
          throw e;
        }
      }
      return { user: byEmail, userCreated: false };
    }

    if (dto.externalId) {
      const owner = await this.prisma.user.findFirst({
        where: { tenantId, externalId: dto.externalId },
        select: { id: true },
      });
      if (owner) throw new ConflictException('externalId já pertence a outro aluno');
    }
    if (!dto.name) throw new BadRequestException('name é obrigatório para criar o aluno');
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email: dto.email,
          name: dto.name,
          role: 'aluno',
          externalId: dto.externalId,
          passwordHash: noLoginHash(),
        },
      });
      return { user, userCreated: true };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // chamada concorrente criou o mesmo aluno: usa o que já existe
      const user = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
      if (!user) throw new ConflictException('externalId já pertence a outro aluno');
      return { user, userCreated: false };
    }
  }

  private async issueFirstAccess(tenantId: string, userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + FIRST_ACCESS_TTL_MS);
    await this.prisma.$transaction([
      // só o token mais recente vale
      this.prisma.firstAccessToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.firstAccessToken.create({
        data: {
          tenantId,
          userId,
          tokenHash: hashToken(token, this.env.JWT_REFRESH_SECRET),
          expiresAt,
        },
      }),
    ]);
    return { token, expiresAt };
  }

  private result(
    e: {
      id: string;
      userId: string;
      courseId: string;
      startsAt: Date | null;
      endsAt: Date | null;
      revokedAt: Date | null;
      externalRef: string | null;
    },
    flags: { userCreated: boolean; created: boolean; replayed: boolean },
  ) {
    return {
      enrollmentId: e.id,
      userId: e.userId,
      courseId: e.courseId,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      revoked: !!e.revokedAt,
      externalRef: e.externalRef,
      ...flags,
      firstAccess: null as { token: string; expiresAt: Date } | null,
    };
  }
}

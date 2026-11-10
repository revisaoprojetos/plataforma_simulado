import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { TenantUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

export type EraseMode = 'anonymize' | 'erase';

/**
 * Direitos do titular (LGPD): cópia dos dados e eliminação.
 *
 * - **anonymize** (padrão): remove tudo que identifica a pessoa (nome, e-mail, senha, anotações,
 *   logins) e mantém o histórico de visualização sem identificação, preservando as estatísticas
 *   agregadas dos cursos.
 * - **erase**: apaga também o histórico (sessões, trechos, progresso, matrículas).
 */
@Injectable()
export class PrivacyService {
  private readonly log = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Tudo o que a plataforma guarda sobre a pessoa, em JSON (sem senha, hashes nem tokens). */
  async exportData(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: { tenant: { select: { slug: true, name: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const [enrollments, progress, ranges, sessions, notes] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { tenantId, userId },
        select: { course: { select: { id: true, title: true } } },
      }),
      this.prisma.lessonProgress.findMany({
        where: { tenantId, userId },
        include: { lesson: { select: { title: true } } },
      }),
      this.prisma.watchRange.findMany({ where: { tenantId, userId }, orderBy: { fromS: 'asc' } }),
      this.prisma.watchSession.findMany({
        where: { tenantId, userId },
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.note.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'asc' } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        tenant: user.tenant,
      },
      enrollments: enrollments.map((e) => ({ courseId: e.course.id, courseTitle: e.course.title })),
      progress: progress.map((p) => ({
        lessonId: p.lessonId,
        lessonTitle: p.lesson.title,
        lastPos: p.lastPos,
        maxPos: p.maxPos,
        percent: p.percent,
        completedAt: p.completedAt,
        updatedAt: p.updatedAt,
      })),
      watchedRanges: ranges.map((r) => ({ lessonId: r.lessonId, fromS: r.fromS, toS: r.toS })),
      sessions: sessions.map((s) => ({
        id: s.id,
        lessonId: s.lessonId,
        startedAt: s.startedAt,
        lastSeenAt: s.lastSeenAt,
        endedAt: s.endedAt,
        watchedS: s.watchedS,
        avgRate: s.avgRate,
        device: s.device,
        secondsByRate: s.ratesS,
        secondsByQuality: s.qualitiesS,
      })),
      notes: notes.map((n) => ({
        id: n.id,
        lessonId: n.lessonId,
        atS: n.atS,
        text: n.text,
        createdAt: n.createdAt,
      })),
    };
  }

  /**
   * Autoexclusão. Conta com senha: exige a senha. Conta sem senha (aluno da integração): exige
   * `confirm` igual ao e-mail da conta. Admin também usa para a própria conta (mesmas travas).
   */
  async eraseSelf(
    actor: TenantUser,
    proof: { password?: string; confirm?: string },
  ): Promise<void> {
    const me = await this.prisma.user.findFirst({
      where: { id: actor.id, tenantId: actor.tenantId, deletedAt: null },
    });
    if (!me) throw new NotFoundException('Usuário não encontrado');
    if (me.passwordHash.startsWith('!')) {
      if (proof.confirm?.toLowerCase() !== me.email.toLowerCase()) {
        throw new BadRequestException('Confirme digitando o e-mail da conta');
      }
    } else {
      if (proof.password === undefined) throw new BadRequestException('Informe a senha');
      if (!(await argon2.verify(me.passwordHash, proof.password).catch(() => false))) {
        throw new ForbiddenException('Senha incorreta');
      }
    }
    await this.remove(actor, actor.id, 'anonymize');
  }

  /** Remoção feita por um admin da empresa sobre outro usuário da mesma empresa. */
  async eraseUser(actor: TenantUser, targetId: string, mode: EraseMode): Promise<void> {
    if (targetId === actor.id) {
      throw new ConflictException('Para excluir a própria conta use DELETE /v1/me');
    }
    await this.remove(actor, targetId, mode);
  }

  private async remove(actor: TenantUser, targetId: string, mode: EraseMode): Promise<void> {
    const t = actor.tenantId;
    const user = await this.prisma.user.findFirst({ where: { id: targetId, tenantId: t } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'platform_admin') throw new ForbiddenException('Operação não permitida');

    // Trava 1: quem é dono de curso precisa transferir antes (senão o curso fica sem responsável).
    const owned = await this.prisma.course.count({ where: { tenantId: t, ownerId: targetId } });
    if (owned > 0) {
      throw new ConflictException(
        `Transfira os ${owned} curso(s) deste usuário antes de removê-lo`,
      );
    }
    // Trava 2: a empresa não pode ficar sem administrador.
    if (user.role === 'admin' && !user.deletedAt) {
      const admins = await this.prisma.user.count({
        where: { tenantId: t, role: 'admin', deletedAt: null },
      });
      if (admins <= 1)
        throw new ConflictException('A empresa precisa de ao menos um administrador');
    }

    if (mode === 'erase') {
      // Cascata do banco leva sessões, trechos, progresso, anotações, matrículas e logins.
      await this.prisma.user.delete({ where: { id: targetId } });
    } else {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: targetId },
          data: {
            name: 'Usuário removido',
            email: `removido-${targetId}@anonimo.invalid`,
            // Valor que nenhum login consegue verificar (não é um hash argon2 válido).
            passwordHash: `!${randomBytes(24).toString('hex')}`,
            deletedAt: user.deletedAt ?? new Date(),
            // identificador no sistema de origem também é dado pessoal (e libera o valor único)
            externalId: null,
          },
        }),
        this.prisma.firstAccessToken.deleteMany({ where: { userId: targetId } }),
        // externalRef (id do pedido) identifica a compra de alguém: limpa e libera o valor único
        this.prisma.enrollment.updateMany({
          where: { tenantId: t, userId: targetId },
          data: { externalRef: null },
        }),
        this.prisma.note.deleteMany({ where: { tenantId: t, userId: targetId } }),
        this.prisma.refreshToken.deleteMany({ where: { userId: targetId } }),
        this.prisma.apiToken.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    }
    // Corta as sessões de reprodução abertas (os tokens de playback deixam de valer na hora).
    await this.redis.del(`ps:${targetId}`, `au:${targetId}`);

    // Trilha de auditoria sem dados pessoais: quem, o quê, quando (o log carrega o correlationId).
    this.log.log(
      JSON.stringify({ event: 'lgpd.removal', mode, actorId: actor.id, targetId, tenantId: t }),
    );
  }
}

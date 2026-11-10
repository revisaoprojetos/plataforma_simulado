import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { McpPrincipal } from './mcp-tokens.service';

/** Hash dos argumentos: prova "o que foi pedido" sem guardar texto de anotações ou buscas. */
export const hashArgs = (args: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(args ?? null))
    .digest('hex');

@Injectable()
export class McpAuditService {
  private readonly log = new Logger(McpAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nunca derruba a chamada: se a auditoria falhar, registra o erro no log e segue. */
  async record(
    p: Pick<McpPrincipal, 'user' | 'tokenId'>,
    tool: string,
    args: unknown,
    ok: boolean,
    extra: { via?: string; detail?: Prisma.InputJsonValue } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: p.user.tenantId,
          actorId: p.user.id,
          tokenId: p.tokenId,
          via: extra.via ?? 'mcp',
          tool,
          argsHash: hashArgs(args),
          ok,
          detail: extra.detail,
        },
      });
    } catch (e) {
      this.log.error(`falha ao gravar auditoria de "${tool}": ${(e as Error).message}`);
    }
  }
}

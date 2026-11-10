import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TTL_MS = 30_000;

/**
 * Domínios (allowedDomains) de todas as empresas ativas, para o CORS dinâmico.
 * Cache em memória de 30 s por réplica: o CORS roda em toda requisição e não vai ao banco a cada uma.
 */
@Injectable()
export class TenantOriginsService {
  private cache?: { at: number; hosts: string[] };
  private pending?: Promise<string[]>;

  constructor(private readonly prisma: PrismaService) {}

  async hosts(now: number = Date.now()): Promise<string[]> {
    if (this.cache && now - this.cache.at < TTL_MS) return this.cache.hosts;
    this.pending ??= this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  invalidate(): void {
    this.cache = undefined;
  }

  private async load(): Promise<string[]> {
    const rows = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { allowedDomains: true },
    });
    const hosts = [...new Set(rows.flatMap((r) => r.allowedDomains))];
    this.cache = { at: Date.now(), hosts };
    return hosts;
  }
}

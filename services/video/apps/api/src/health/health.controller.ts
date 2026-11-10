import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { Public } from '../auth/decorators';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { StorageService } from '../storage/storage.service';

type Check = 'up' | 'down';

@Public()
@SkipRateLimit()
@ApiTags('ops')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: o processo responde. Não consulta dependências (usado pelo HEALTHCHECK do Docker). */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: banco, Redis e S3 respondem. 503 se qualquer um estiver fora. */
  @Get()
  async check() {
    const [db, redis, s3] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.ping()),
      this.probe(() => this.storage.ping()),
    ]);
    const body = {
      status: db === 'up' && redis === 'up' && s3 === 'up' ? 'ok' : 'degraded',
      db,
      redis,
      s3,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }

  private async probe(fn: () => Promise<unknown>): Promise<Check> {
    try {
      await fn();
      return 'up';
    } catch {
      return 'down';
    }
  }
}

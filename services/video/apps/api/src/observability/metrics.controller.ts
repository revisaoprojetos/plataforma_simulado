import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { MetricsService } from './metrics.service';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * `GET /metrics` para o Prometheus. Sem `METRICS_TOKEN` configurado o endpoint não existe (404);
 * com ele, exige `Authorization: Bearer <token>`. Nunca exponha sem token na internet.
 */
@ApiExcludeController()
@Public()
@SkipRateLimit()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(CONFIG) private readonly env: Pick<Env, 'METRICS_TOKEN'>,
  ) {}

  @Get()
  async scrape(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) res: { set(headers: Record<string, string>): void },
  ): Promise<string> {
    const token = this.env.METRICS_TOKEN;
    if (!token) throw new NotFoundException();
    if (!auth?.startsWith('Bearer ') || !same(auth.slice(7), token)) {
      throw new UnauthorizedException();
    }
    const { contentType, body } = await this.metrics.render();
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    return body;
  }
}

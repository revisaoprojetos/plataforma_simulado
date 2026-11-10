import { Global, Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CONFIG } from '../config/config.module';
import { Env } from '../config/env';
import { buildLoggerParams } from './logging';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  imports: [
    // Logs JSON com correlationId; o nível vem de LOG_LEVEL (testes usam "silent").
    LoggerModule.forRootAsync({
      inject: [CONFIG],
      // O heartbeat (o tráfego mais volumoso: milhares por segundo) não passa pelo logger de
      // requisições — criar um logger filho por chamada custa CPU. Falhas dele aparecem nas
      // métricas (http_request_duration_seconds por status, heartbeats_total, rate_limited_total).
      useFactory: (env: Env) => ({
        ...buildLoggerParams(env),
        exclude: [{ method: RequestMethod.POST, path: 'v1/progress/heartbeat' }],
      }),
    }),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}

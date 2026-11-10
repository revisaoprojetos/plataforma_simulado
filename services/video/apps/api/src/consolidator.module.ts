import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { ObservabilityModule } from './observability/observability.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgressConsolidator } from './progress/progress.consolidator';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

/**
 * Módulo mínimo do processo dedicado à consolidação dos heartbeats (sem HTTP, sem autenticação):
 * só banco, Redis, métricas e o consolidador. Mantém o trabalho pesado de escrita fora do
 * processo que atende os jogadores.
 */
@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, QueueModule, ObservabilityModule],
  providers: [ProgressConsolidator],
})
export class ConsolidatorModule {}

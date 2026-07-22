import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { RelatoriosController } from './relatorios/relatorios.controller'

@Module({
  controllers: [HealthController, RelatoriosController],
})
export class AppModule {}

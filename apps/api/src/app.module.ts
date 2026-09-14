import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { RelatoriosController } from './relatorios/relatorios.controller'
import { SimuladosController } from './simulados/simulados.controller'

@Module({
  controllers: [HealthController, RelatoriosController, SimuladosController],
})
export class AppModule {}

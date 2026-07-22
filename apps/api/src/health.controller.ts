import { Controller, Get } from '@nestjs/common'
import { sqlDisponivel, poolStats } from 'data'

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, sql: sqlDisponivel() }
  }

  /** Observabilidade (Fase 4): estado do pool de conexões da API. */
  @Get('metrics')
  metrics() {
    return { sql: sqlDisponivel(), pool: poolStats(), uptimeSeg: Math.round(process.uptime()) }
  }
}

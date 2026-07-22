import { Controller, Get } from '@nestjs/common'
import { sqlDisponivel } from 'data'

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { ok: true, sql: sqlDisponivel() }
  }
}

import { Controller, Get } from '@nestjs/common'
import { SupabaseService } from './modules/supabase/supabase.service.js'

@Controller()
export class AppController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  @Get('health/ready')
  async readiness() {
    try {
      await this.supabase.getClient().from('tenants').select('id').limit(1)
      return { status: 'ready', db: 'connected', timestamp: new Date().toISOString() }
    } catch {
      return { status: 'degraded', db: 'disconnected', timestamp: new Date().toISOString() }
    }
  }
}

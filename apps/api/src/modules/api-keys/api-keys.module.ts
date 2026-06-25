import { Module } from '@nestjs/common'
import { ApiKeysService } from './api-keys.service.js'
import { ApiKeysController } from './api-keys.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}

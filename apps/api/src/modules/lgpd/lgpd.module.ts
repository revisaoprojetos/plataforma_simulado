import { Module } from '@nestjs/common'
import { LgpdService } from './lgpd.service.js'
import { LgpdController } from './lgpd.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [LgpdController],
  providers: [LgpdService],
  exports: [LgpdService],
})
export class LgpdModule {}

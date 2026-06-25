import { Module } from '@nestjs/common'
import { GradingService } from './grading.service.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  providers: [GradingService],
  exports: [GradingService],
})
export class GradingModule {}

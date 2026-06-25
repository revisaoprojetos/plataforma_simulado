import { Module } from '@nestjs/common'
import { AuditService } from './audit.service.js'
import { AuditController } from './audit.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

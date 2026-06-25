import { Module } from '@nestjs/common'
import { ImportService } from './import.service.js'
import { ImportController } from './import.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'
import { ApiKeyGuard } from '../../common/guards/api-key.guard.js'

@Module({
  imports: [SupabaseModule],
  controllers: [ImportController],
  providers: [ImportService, ApiKeyGuard],
  exports: [ImportService],
})
export class ImportModule {}

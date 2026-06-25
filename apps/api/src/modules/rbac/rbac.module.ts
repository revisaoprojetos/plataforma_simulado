import { Module } from '@nestjs/common'
import { RbacService } from './rbac.service.js'
import { RbacController } from './rbac.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [RbacController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}

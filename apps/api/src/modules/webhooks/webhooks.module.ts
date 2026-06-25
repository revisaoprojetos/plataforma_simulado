import { Module } from '@nestjs/common'
import { WebhooksService } from './webhooks.service.js'
import { WebhooksController } from './webhooks.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

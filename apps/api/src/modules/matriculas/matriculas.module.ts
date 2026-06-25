import { Module } from '@nestjs/common'
import { MatriculasService } from './matriculas.service.js'
import { MatriculasController } from './matriculas.controller.js'
import { SupabaseModule } from '../supabase/supabase.module.js'

@Module({
  imports: [SupabaseModule],
  controllers: [MatriculasController],
  providers: [MatriculasService],
  exports: [MatriculasService],
})
export class MatriculasModule {}

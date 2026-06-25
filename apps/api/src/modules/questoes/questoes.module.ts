import { Module } from '@nestjs/common'
import { QuestoesService } from './questoes.service.js'
import { QuestoesController } from './questoes.controller.js'

@Module({
  providers: [QuestoesService],
  controllers: [QuestoesController],
  exports: [QuestoesService],
})
export class QuestoesModule {}

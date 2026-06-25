import { Module } from '@nestjs/common'
import { SimuladosService } from './simulados.service.js'
import { SimuladosController } from './simulados.controller.js'

@Module({
  providers: [SimuladosService],
  controllers: [SimuladosController],
  exports: [SimuladosService],
})
export class SimuladosModule {}

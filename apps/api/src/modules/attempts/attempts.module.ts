import { Module } from '@nestjs/common'
import { AttemptsService } from './attempts.service.js'
import { AttemptsController } from './attempts.controller.js'

@Module({
  providers: [AttemptsService],
  controllers: [AttemptsController],
  exports: [AttemptsService],
})
export class AttemptsModule {}

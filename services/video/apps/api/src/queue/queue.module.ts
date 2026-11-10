import { Global, Module } from '@nestjs/common';
import { BullTranscodeQueue, TranscodeQueue } from './transcode.queue';

@Global()
@Module({
  providers: [{ provide: TranscodeQueue, useClass: BullTranscodeQueue }],
  exports: [TranscodeQueue],
})
export class QueueModule {}

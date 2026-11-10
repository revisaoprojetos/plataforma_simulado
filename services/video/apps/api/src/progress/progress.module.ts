import { Module } from '@nestjs/common';
import { PlaybackModule } from '../playback/playback.module';
import { HeartbeatService } from './heartbeat.service';
import { ProgressConsolidator } from './progress.consolidator';
import { HeartbeatController, ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [PlaybackModule],
  controllers: [HeartbeatController, ProgressController],
  providers: [HeartbeatService, ProgressConsolidator, ProgressService],
  exports: [ProgressConsolidator, ProgressService],
})
export class ProgressModule {}

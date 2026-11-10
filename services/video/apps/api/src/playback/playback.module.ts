import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlaybackTokenGuard } from './playback-token.guard';
import { PlaybackTokenService } from './playback-token.service';
import { HlsController, PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { SessionStore } from './session.store';
import { TenantOriginsService } from './tenant-origins.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [PlaybackController, HlsController],
  providers: [
    PlaybackService,
    PlaybackTokenService,
    SessionStore,
    PlaybackTokenGuard,
    TenantOriginsService,
  ],
  exports: [PlaybackTokenService, SessionStore, PlaybackTokenGuard, TenantOriginsService],
})
export class PlaybackModule {}

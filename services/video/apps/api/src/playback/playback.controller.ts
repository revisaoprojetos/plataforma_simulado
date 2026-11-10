import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantUser } from '../auth/auth.types';
import { Public, Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  Playback,
  PlaybackContext,
  PlaybackTokenGuard,
  SkipSessionCheck,
} from './playback-token.guard';
import { RateLimit, SkipRateLimit } from '../security/rate-limit.guard';
import { PlaybackService } from './playback.service';

// Aceita (e descarta) um sessionId legado: o id da sessão é SEMPRE gerado no servidor.
const startSchema = z.object({ sessionId: z.unknown().optional() }).strip();
type StartDto = z.infer<typeof startSchema>;

/** Emissão do playback (autenticado como usuário). */
@ApiTags('playback')
@ApiBearerAuth()
@Controller()
export class PlaybackController {
  constructor(private readonly playback: PlaybackService) {}

  @RateLimit('playbackStart')
  @Post('lessons/:lessonId/playback')
  @HttpCode(200)
  start(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Headers('origin') origin: string | undefined,
    @Body(new ZodPipe(startSchema)) _dto: StartDto,
  ) {
    return this.playback.start(user, lessonId, origin);
  }
}

/** Entrega (autenticada pelo token de playback, não pelo JWT do usuário). */
@ApiTags('playback')
@Public()
@SkipRateLimit()
@UseGuards(PlaybackTokenGuard)
@Controller()
export class HlsController {
  constructor(private readonly playback: PlaybackService) {}

  @Post('playback/renew')
  @HttpCode(200)
  @SkipSessionCheck()
  renew(@Playback() p: PlaybackContext, @Headers('origin') origin: string | undefined) {
    return this.playback.renew(p.claims, origin);
  }

  @Post('playback/end')
  @HttpCode(204)
  @SkipSessionCheck()
  end(@Playback() p: PlaybackContext) {
    return this.playback.end(p.claims);
  }

  // A chave vem antes das rotas "hls/:videoId/..." para o segmento literal "key" não ser lido como id.
  @Get('hls/key/:videoId')
  @Header('Content-Type', 'application/octet-stream')
  @Header('Cache-Control', 'no-store')
  async key(@Playback() p: PlaybackContext, @Param('videoId', ParseUUIDPipe) _videoId: string) {
    // StreamableFile: devolver o Buffer direto faria o Nest serializá-lo como JSON.
    return new StreamableFile(await this.playback.key(p.claims));
  }

  @Get('hls/:videoId/master.m3u8')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  async master(@Playback() p: PlaybackContext, @Param('videoId', ParseUUIDPipe) _videoId: string) {
    return this.playback.master(p.claims, p.token);
  }

  @Get('hls/:videoId/sprite.vtt')
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async sprite(@Playback() p: PlaybackContext, @Param('videoId', ParseUUIDPipe) _videoId: string) {
    return this.playback.spriteVtt(p.claims);
  }

  @Get('hls/:videoId/subtitles/:file')
  @Header('Content-Type', 'text/vtt; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async subtitle(
    @Playback() p: PlaybackContext,
    @Param('videoId', ParseUUIDPipe) _videoId: string,
    @Param('file') file: string,
  ) {
    const lang = /^([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?).vtt$/.exec(file)?.[1];
    if (!lang) throw new NotFoundException('Legenda não encontrada');
    return this.playback.subtitleVtt(p.claims, lang);
  }

  @Get('hls/:videoId/:rendition/index.m3u8')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  async variant(
    @Playback() p: PlaybackContext,
    @Param('videoId', ParseUUIDPipe) _videoId: string,
    @Param('rendition') rendition: string,
  ) {
    return this.playback.variant(p.claims, p.token, rendition);
  }
}

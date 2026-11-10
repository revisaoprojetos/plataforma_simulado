import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { TenantUser } from '../auth/auth.types';
import { Public, Tenant } from '../auth/decorators';
import { Pagination, paginationSchema } from '../common/pagination';
import { ZodPipe } from '../common/zod.pipe';
import { Playback, PlaybackContext, PlaybackTokenGuard } from '../playback/playback-token.guard';
import { SkipRateLimit } from '../security/rate-limit.guard';
import { HeartbeatService } from './heartbeat.service';
import { ProgressService } from './progress.service';

const heartbeatSchema = z.object({
  seq: z.number().int().min(0).max(2_000_000_000),
  position: z.number().finite().min(0).max(86_400),
  rate: z.number().finite().min(0.25).max(4),
  quality: z.string().trim().max(20).optional(),
  device: z.string().trim().max(40).optional(),
});
type HeartbeatDto = z.infer<typeof heartbeatSchema>;

/** `consistent=1`: esvazia a fila de heartbeats antes de ler (uso do player; relatórios não usam). */
const consistentFlag = z
  .enum(['1', 'true'])
  .optional()
  .transform((v) => v !== undefined);
const targetSchema = z.object({ userId: z.string().uuid().optional(), consistent: consistentFlag });
const consistentSchema = z.object({ consistent: consistentFlag });
type TargetQuery = z.infer<typeof targetSchema>;

/** Heartbeat do player: autenticado pelo token de playback (que já amarra usuário, aula e sessão). */
@ApiTags('progress')
@Public()
@SkipRateLimit()
@UseGuards(PlaybackTokenGuard)
@Controller('progress')
export class HeartbeatController {
  constructor(private readonly heartbeats: HeartbeatService) {}

  @Post('heartbeat')
  @HttpCode(204)
  async heartbeat(
    @Playback() p: PlaybackContext,
    @Body(new ZodPipe(heartbeatSchema)) dto: HeartbeatDto,
  ): Promise<void> {
    await this.heartbeats.record(p.claims, dto);
  }
}

@ApiTags('progress')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('lessons/:id/progress')
  lesson(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(targetSchema)) q: TargetQuery,
  ) {
    return this.progress.lessonProgress(user, id, q.userId, q.consistent);
  }

  @Get('courses/:id/progress')
  course(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(targetSchema)) q: TargetQuery,
  ) {
    return this.progress.courseProgress(user, id, q.userId, q.consistent);
  }

  @Get('me/continue-watching')
  continueWatching(
    @Tenant() user: TenantUser,
    @Query(new ZodPipe(consistentSchema)) q: { consistent: boolean },
  ) {
    return this.progress.continueWatching(user, q.consistent);
  }

  @Get('me/history')
  history(@Tenant() user: TenantUser, @Query(new ZodPipe(paginationSchema)) pg: Pagination) {
    return this.progress.history(user, pg);
  }
}

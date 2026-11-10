import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Roles, Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  CompleteUploadDto,
  completeUploadSchema,
  CreateUploadDto,
  createUploadSchema,
  SignPartsDto,
  signPartsSchema,
} from './videos.dto';
import { RateLimit } from '../security/rate-limit.guard';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth()
@Roles('professor', 'admin')
@RateLimit('upload')
@Controller()
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post('uploads')
  createUpload(
    @Tenant() user: TenantUser,
    @Body(new ZodPipe(createUploadSchema)) dto: CreateUploadDto,
  ) {
    return this.videos.createUpload(user, dto);
  }

  @Post('uploads/:videoId/parts')
  @HttpCode(200)
  signParts(
    @Tenant() user: TenantUser,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body(new ZodPipe(signPartsSchema)) dto: SignPartsDto,
  ) {
    return this.videos.signPartsFor(user, videoId, dto.partNumbers);
  }

  @Get('uploads/:videoId/parts')
  listParts(@Tenant() user: TenantUser, @Param('videoId', ParseUUIDPipe) videoId: string) {
    return this.videos.listUploadedParts(user, videoId);
  }

  @Post('uploads/:videoId/complete')
  @HttpCode(202)
  complete(
    @Tenant() user: TenantUser,
    @Param('videoId', ParseUUIDPipe) videoId: string,
    @Body(new ZodPipe(completeUploadSchema)) dto: CompleteUploadDto,
  ) {
    return this.videos.complete(user, videoId, dto);
  }

  @Delete('uploads/:videoId')
  @HttpCode(204)
  abort(@Tenant() user: TenantUser, @Param('videoId', ParseUUIDPipe) videoId: string) {
    return this.videos.abort(user, videoId);
  }

  @Get('videos/:id')
  get(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.videos.get(user, id);
  }

  @Post('videos/:id/reprocess')
  @HttpCode(202)
  reprocess(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.videos.reprocess(user, id);
  }

  @Delete('videos/:id')
  @HttpCode(204)
  remove(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.videos.remove(user, id);
  }
}

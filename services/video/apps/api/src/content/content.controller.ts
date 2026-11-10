import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Roles, Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  lang as langSchema,
  PutChaptersDto,
  putChaptersSchema,
  TranscriptQuery,
  transcriptQuerySchema,
  UploadSubtitleDto,
  uploadSubtitleSchema,
} from './content.dto';
import { ContentService } from './content.service';

@ApiTags('content')
@ApiBearerAuth()
@Controller('lessons/:lessonId')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('subtitles')
  listSubtitles(@Tenant() user: TenantUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.content.listSubtitles(user, lessonId);
  }

  @Roles('professor', 'admin')
  @Post('subtitles')
  upload(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodPipe(uploadSubtitleSchema)) dto: UploadSubtitleDto,
  ) {
    return this.content.putSubtitle(user, lessonId, dto.lang, dto.content);
  }

  @Roles('professor', 'admin')
  @Delete('subtitles/:lang')
  @HttpCode(204)
  removeSubtitle(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Param('lang', new ZodPipe(langSchema)) lang: string,
  ) {
    return this.content.deleteSubtitle(user, lessonId, lang);
  }

  @Get('transcript')
  transcript(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Query(new ZodPipe(transcriptQuerySchema)) query: TranscriptQuery,
  ) {
    return this.content.transcript(user, lessonId, query);
  }

  @Get('chapters')
  chapters(@Tenant() user: TenantUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.content.chapters(user, lessonId);
  }

  @Roles('professor', 'admin')
  @Put('chapters')
  putChapters(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodPipe(putChaptersSchema)) dto: PutChaptersDto,
  ) {
    return this.content.putChapters(user, lessonId, dto);
  }
}

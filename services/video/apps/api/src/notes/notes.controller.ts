import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Tenant } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import {
  CreateNoteDto,
  createNoteSchema,
  NotesService,
  UpdateNoteDto,
  updateNoteSchema,
} from './notes.service';

@ApiTags('notes')
@ApiBearerAuth()
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('lessons/:lessonId/notes')
  list(@Tenant() user: TenantUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.notes.list(user, lessonId);
  }

  @Post('lessons/:lessonId/notes')
  create(
    @Tenant() user: TenantUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodPipe(createNoteSchema)) dto: CreateNoteDto,
  ) {
    return this.notes.create(user, lessonId, dto);
  }

  @Patch('notes/:id')
  update(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateNoteSchema)) dto: UpdateNoteDto,
  ) {
    return this.notes.update(user, id, dto);
  }

  @Delete('notes/:id')
  @HttpCode(204)
  remove(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.remove(user, id);
  }
}

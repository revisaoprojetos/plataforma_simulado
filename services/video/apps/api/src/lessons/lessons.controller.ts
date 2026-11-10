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
  CreateLessonDto,
  createLessonSchema,
  CreateModuleDto,
  createModuleSchema,
  UpdateLessonDto,
  updateLessonSchema,
  UpdateModuleDto,
  updateModuleSchema,
} from './lessons.dto';
import { LessonsService } from './lessons.service';

@ApiTags('lessons')
@ApiBearerAuth()
@Controller()
export class LessonsController {
  constructor(private readonly lessons: LessonsService) {}

  @Get('courses/:courseId/modules')
  listModules(@Tenant() user: TenantUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.lessons.listModules(user, courseId);
  }

  @Post('courses/:courseId/modules')
  createModule(
    @Tenant() user: TenantUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body(new ZodPipe(createModuleSchema)) dto: CreateModuleDto,
  ) {
    return this.lessons.createModule(user, courseId, dto);
  }

  @Patch('modules/:id')
  updateModule(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateModuleSchema)) dto: UpdateModuleDto,
  ) {
    return this.lessons.updateModule(user, id, dto);
  }

  @Delete('modules/:id')
  @HttpCode(204)
  deleteModule(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.deleteModule(user, id);
  }

  @Get('modules/:moduleId/lessons')
  listLessons(@Tenant() user: TenantUser, @Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.lessons.listLessons(user, moduleId);
  }

  @Post('modules/:moduleId/lessons')
  createLesson(
    @Tenant() user: TenantUser,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body(new ZodPipe(createLessonSchema)) dto: CreateLessonDto,
  ) {
    return this.lessons.createLesson(user, moduleId, dto);
  }

  @Get('lessons/:id')
  getLesson(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.getLesson(user, id);
  }

  @Patch('lessons/:id')
  updateLesson(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateLessonSchema)) dto: UpdateLessonDto,
  ) {
    return this.lessons.updateLesson(user, id, dto);
  }

  @Delete('lessons/:id')
  @HttpCode(204)
  deleteLesson(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lessons.deleteLesson(user, id);
  }
}

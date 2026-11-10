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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantUser } from '../auth/auth.types';
import { Tenant } from '../auth/decorators';
import { Pagination, paginationSchema } from '../common/pagination';
import { ZodPipe } from '../common/zod.pipe';
import {
  CreateCourseDto,
  createCourseSchema,
  EnrollDto,
  enrollSchema,
  UpdateCourseDto,
  updateCourseSchema,
} from './courses.dto';
import { CoursesService } from './courses.service';

@ApiTags('courses')
@ApiBearerAuth()
@Controller()
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get('courses')
  list(@Tenant() user: TenantUser, @Query(new ZodPipe(paginationSchema)) pg: Pagination) {
    return this.courses.list(user, pg);
  }

  @Post('courses')
  create(@Tenant() user: TenantUser, @Body(new ZodPipe(createCourseSchema)) dto: CreateCourseDto) {
    return this.courses.create(user, dto);
  }

  @Get('courses/:id')
  get(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.get(user, id);
  }

  @Patch('courses/:id')
  update(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateCourseSchema)) dto: UpdateCourseDto,
  ) {
    return this.courses.update(user, id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(204)
  remove(@Tenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.remove(user, id);
  }

  @Get('courses/:id/enrollments')
  listEnrollments(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodPipe(paginationSchema)) pg: Pagination,
  ) {
    return this.courses.listEnrollments(user, id, pg);
  }

  @Post('courses/:id/enrollments')
  enroll(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(enrollSchema)) dto: EnrollDto,
  ) {
    return this.courses.enroll(user, id, dto.userId);
  }

  @Delete('courses/:id/enrollments/:userId')
  @HttpCode(204)
  unenroll(
    @Tenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.courses.unenroll(user, id, userId);
  }

  @Get('me/courses')
  myCourses(@Tenant() user: TenantUser) {
    return this.courses.myCourses(user);
  }
}

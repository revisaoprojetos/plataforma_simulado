import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ContentModule } from '../content/content.module';
import { CoursesModule } from '../courses/courses.module';
import { LessonsModule } from '../lessons/lessons.module';
import { NotesModule } from '../notes/notes.module';
import { ProgressModule } from '../progress/progress.module';
import { McpAuditService } from './mcp-audit.service';
import { McpTokensController } from './mcp-tokens.controller';
import { McpTokensService } from './mcp-tokens.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [
    JwtModule.register({}),
    CoursesModule,
    LessonsModule,
    ContentModule,
    ProgressModule,
    AnalyticsModule,
    NotesModule,
  ],
  controllers: [McpController, McpTokensController],
  providers: [McpService, McpTokensService, McpAuditService],
  exports: [McpTokensService, McpAuditService],
})
export class McpModule {}

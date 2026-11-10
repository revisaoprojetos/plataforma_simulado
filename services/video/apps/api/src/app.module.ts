import { Module } from '@nestjs/common';
import { AccessIntegrationModule } from './access-integration/access-integration.module';
import { AccessModule } from './access/access.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { ContentModule } from './content/content.module';
import { CoursesModule } from './courses/courses.module';
import { HealthController } from './health/health.controller';
import { LessonsModule } from './lessons/lessons.module';
import { McpModule } from './mcp/mcp.module';
import { PrivacyModule } from './privacy/privacy.module';
import { QueueModule } from './queue/queue.module';
import { NotesModule } from './notes/notes.module';
import { ObservabilityModule } from './observability/observability.module';
import { PlaybackModule } from './playback/playback.module';
import { ProgressEventsModule } from './progress/progress.events';
import { ProgressModule } from './progress/progress.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SecurityModule } from './security/security.module';
import { StorageModule } from './storage/storage.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ObservabilityModule,
    RedisModule,
    StorageModule,
    QueueModule,
    AccessModule,
    AuthModule,
    SecurityModule, // depois do Auth: o limite por usuário precisa de req.user
    TenantsModule,
    UsersModule,
    CoursesModule,
    LessonsModule,
    VideosModule,
    PlaybackModule,
    ContentModule,
    NotesModule,
    AnalyticsModule,
    PrivacyModule,
    ProgressEventsModule,
    ProgressModule,
    McpModule,
    AccessIntegrationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

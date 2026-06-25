import {
  Module,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common'
import { AppController } from './app.controller.js'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { SupabaseModule } from './modules/supabase/supabase.module.js'
import { AuthModule } from './modules/auth/auth.module.js'
import { TenantsModule } from './modules/tenants/tenants.module.js'
import { UsersModule } from './modules/users/users.module.js'
import { QuestoesModule } from './modules/questoes/questoes.module.js'
import { SimuladosModule } from './modules/simulados/simulados.module.js'
import { AttemptsModule } from './modules/attempts/attempts.module.js'
import { RbacModule } from './modules/rbac/rbac.module.js'
import { AuditModule } from './modules/audit/audit.module.js'
import { LgpdModule } from './modules/lgpd/lgpd.module.js'
import { MatriculasModule } from './modules/matriculas/matriculas.module.js'
import { GradingModule } from './modules/grading/grading.module.js'
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js'
import { ImportModule } from './modules/import/import.module.js'
import { WebhooksModule } from './modules/webhooks/webhooks.module.js'
import { TenantMiddleware } from './common/middleware/tenant.middleware.js'
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    SupabaseModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    QuestoesModule,
    SimuladosModule,
    AttemptsModule,
    RbacModule,
    AuditModule,
    LgpdModule,
    MatriculasModule,
    GradingModule,
    ApiKeysModule,
    ImportModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST },
        { path: 'auth/embed/identify', method: RequestMethod.POST },
        { path: 'lgpd/consent', method: RequestMethod.POST },
        { path: 'lgpd/consent/check', method: RequestMethod.GET },
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
        { path: 'docs', method: RequestMethod.GET },
        { path: 'docs/(.*)', method: RequestMethod.GET },
        { path: 'import/(.*)', method: RequestMethod.POST },
      )
      .forRoutes('*')
  }
}

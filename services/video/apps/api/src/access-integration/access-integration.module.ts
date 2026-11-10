import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { McpModule } from '../mcp/mcp.module';
import {
  AccessIntegrationController,
  FirstAccessController,
} from './access-integration.controller';
import { AccessIntegrationService } from './access-integration.service';
import { IntegrationKeyGuard } from './integration-key.guard';

/**
 * API de integração: matrícula genérica e sessão do aluno para sistemas externos.
 * Sempre carregada, mas inerte: sem `ACCESS_ENDPOINT_ENABLED` e sem a empresa habilitada
 * pelo operador, todas as rotas respondem 404.
 */
@Module({
  imports: [AuthModule, McpModule],
  controllers: [AccessIntegrationController, FirstAccessController],
  providers: [AccessIntegrationService, IntegrationKeyGuard],
})
export class AccessIntegrationModule {}

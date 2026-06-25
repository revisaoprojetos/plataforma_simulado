import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { Request } from 'express'
import { ImportService } from './import.service.js'
import { ImportQuestoesDto } from './dto/import-questoes.dto.js'
import { ApiKeyGuard, ApiKeyRequest } from '../../common/guards/api-key.guard.js'

type ImportRequest = Request & ApiKeyRequest

@ApiTags('import')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('questoes')
  @ApiOperation({ summary: 'Importar questões via API key (upsert por external_id)' })
  importarQuestoes(@Req() req: ImportRequest, @Body() dto: ImportQuestoesDto) {
    const tenantId = req.tenantId!
    const escopos = req.apiKey?.escopos ?? []
    return this.importService.importarQuestoes(tenantId, dto, escopos)
  }
}

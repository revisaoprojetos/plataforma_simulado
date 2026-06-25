import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { Request } from 'express'
import { AttemptsService } from './attempts.service.js'
import { OpenSessaoDto } from './dto/open-sessao.dto.js'
import { SaveRespostaDto } from './dto/save-resposta.dto.js'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js'

type TenantRequest = Request & { tenantId: string; user?: { id: string } }

@ApiTags('sessoes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AttemptsController {
  constructor(private readonly attemptsService: AttemptsService) {}

  @Post('simulados/:simuladoId/sessoes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Abrir sessão de prova para o aluno' })
  openSessao(
    @Param('simuladoId') simuladoId: string,
    @Body() dto: OpenSessaoDto,
    @Req() req: TenantRequest,
  ) {
    return this.attemptsService.openSessao(
      simuladoId,
      req.user!.id,
      req.tenantId,
      dto,
    )
  }

  @Post('sessoes/:sessaoId/respostas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Auto-save de resposta (upsert idempotente)' })
  saveResposta(
    @Param('sessaoId') sessaoId: string,
    @Body() dto: SaveRespostaDto,
    @Req() req: TenantRequest,
  ) {
    return this.attemptsService.saveResposta(
      sessaoId,
      req.user!.id,
      req.tenantId,
      dto,
    )
  }

  @Post('sessoes/:sessaoId/finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerrar sessão e calcular nota' })
  finalizeSessao(
    @Param('sessaoId') sessaoId: string,
    @Req() req: TenantRequest,
  ) {
    return this.attemptsService.finalizeSessao(
      sessaoId,
      req.user!.id,
      req.tenantId,
    )
  }

  @Get('sessoes/:sessaoId')
  @ApiOperation({ summary: 'Estado atual da sessão (questões, respostas, tempo)' })
  getSessaoState(
    @Param('sessaoId') sessaoId: string,
    @Req() req: TenantRequest,
  ) {
    return this.attemptsService.getSessaoState(
      sessaoId,
      req.user!.id,
      req.tenantId,
    )
  }
}

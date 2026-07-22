import { BadRequestException, Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common'
import {
  resumosSimuladosRows,
  relatorioEstudanteSql,
  relatorioGraficoSql,
  relatorioDisciplinaSql,
} from 'data'

/**
 * Relatórios servidos pela API dedicada. Protegido por segredo interno (server-to-server:
 * só o app Next chama, com o header x-api-secret). A permissão do usuário já é validada no
 * Next ANTES de chamar a API — aqui é uma fronteira interna confiável (como os crons).
 *
 * Cada método devolve as LINHAS/DADOS CRUS; a montagem (visual, KPIs, gráficos) fica no Next,
 * que também trata `null`/`data:null` caindo no fallback PostgREST.
 */
@Controller('v1/relatorios')
export class RelatoriosController {
  private gate(secret?: string): void {
    const esperado = process.env.API_INTERNAL_SECRET
    if (!esperado || secret !== esperado) throw new UnauthorizedException('segredo inválido')
  }

  @Get('resumos')
  async resumos(@Query('tenantId') tenantId: string, @Headers('x-api-secret') secret?: string) {
    this.gate(secret)
    if (!tenantId) throw new BadRequestException('tenantId é obrigatório')
    return { rows: await resumosSimuladosRows(tenantId) }
  }

  @Get('estudante')
  async estudante(@Query('estId') estId: string, @Query('tenantId') tenantId: string, @Headers('x-api-secret') secret?: string) {
    this.gate(secret)
    if (!estId || !tenantId) throw new BadRequestException('estId e tenantId são obrigatórios')
    return { data: await relatorioEstudanteSql(estId, tenantId) }
  }

  @Get('graficos')
  async graficos(@Query('tenantId') tenantId: string, @Headers('x-api-secret') secret?: string) {
    this.gate(secret)
    if (!tenantId) throw new BadRequestException('tenantId é obrigatório')
    return { data: await relatorioGraficoSql(tenantId) }
  }

  @Get('disciplina')
  async disciplina(@Query('discId') discId: string, @Query('tenantId') tenantId: string, @Headers('x-api-secret') secret?: string) {
    this.gate(secret)
    if (!discId || !tenantId) throw new BadRequestException('discId e tenantId são obrigatórios')
    return { data: await relatorioDisciplinaSql(discId, tenantId) }
  }
}

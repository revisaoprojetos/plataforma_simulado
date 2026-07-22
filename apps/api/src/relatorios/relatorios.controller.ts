import { BadRequestException, Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common'
import { resumosSimuladosRows } from 'data'

/**
 * Relatórios servidos pela API dedicada. Protegido por segredo interno (server-to-server:
 * só o app Next chama, com o header x-api-secret). A permissão do usuário já é validada no
 * Next ANTES de chamar a API — aqui é uma fronteira interna confiável (como os crons).
 */
@Controller('v1/relatorios')
export class RelatoriosController {
  private autorizado(secret?: string): boolean {
    const esperado = process.env.API_INTERNAL_SECRET
    return !!esperado && secret === esperado
  }

  @Get('resumos')
  async resumos(@Query('tenantId') tenantId: string, @Headers('x-api-secret') secret?: string) {
    if (!this.autorizado(secret)) throw new UnauthorizedException('segredo inválido')
    if (!tenantId) throw new BadRequestException('tenantId é obrigatório')
    // resumosSimuladosRows devolve null se o SQL direto estiver indisponível → o Next cai no fallback.
    const rows = await resumosSimuladosRows(tenantId)
    return { rows }
  }
}

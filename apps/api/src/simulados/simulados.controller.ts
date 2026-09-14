import { BadRequestException, Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { reordenarProvaSql } from 'data'

/**
 * Escritas de simulado servidas pela API dedicada (strangler — Fase 7). Fronteira interna confiável:
 * o Next valida permissão + ownership (tenant) do usuário ANTES de chamar, e a chamada é
 * server-to-server autenticada por `x-api-secret`. A API só executa o SQL (via pacote `data`).
 *
 * Primeiro vertical: reordenar a prova em UMA query (substitui os N updates do PostgREST).
 */
@Controller('v1/simulados')
export class SimuladosController {
  private gate(secret?: string): void {
    const esperado = process.env.API_INTERNAL_SECRET
    if (!esperado || secret !== esperado) throw new UnauthorizedException('segredo inválido')
  }

  @Post('prova/reordenar')
  async reordenar(
    @Body() body: { tenantId?: string; simuladoId?: string; ordem?: string[] },
    @Headers('x-api-secret') secret?: string,
  ) {
    this.gate(secret)
    const { tenantId, simuladoId, ordem } = body ?? {}
    if (!tenantId || !simuladoId || !Array.isArray(ordem)) {
      throw new BadRequestException('tenantId, simuladoId e ordem[] são obrigatórios')
    }
    const n = await reordenarProvaSql(tenantId, simuladoId, ordem)
    // n === null → SQL direto indisponível na API → sinaliza fallback p/ o Next fazer local.
    if (n === null) return { ok: false, fallback: true }
    return { ok: true, afetados: n }
  }
}

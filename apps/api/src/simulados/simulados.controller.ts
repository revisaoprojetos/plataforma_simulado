import { BadRequestException, Body, Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common'
import { reordenarProvaSql, estudantesLinkadosSql, relatorioRespostasAggSql } from 'data'

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

  /** Estudantes matriculados de um simulado (situação + nota), em 1 query com JOIN — escala pelos
   * matriculados, não pelos alunos do tenant. Devolve rows crus; o Next monta o formato. */
  @Get('estudantes')
  async estudantes(
    @Query('tenantId') tenantId: string,
    @Query('simuladoId') simuladoId: string,
    @Headers('x-api-secret') secret?: string,
  ) {
    this.gate(secret)
    if (!tenantId || !simuladoId) throw new BadRequestException('tenantId e simuladoId são obrigatórios')
    return { rows: await estudantesLinkadosSql(tenantId, simuladoId) }
  }

  /** Respostas objetivas agregadas por questão (total/erros/acertos) — para o relatório do simulado. */
  @Get('relatorio-respostas')
  async relatorioRespostas(
    @Query('tenantId') tenantId: string,
    @Query('simuladoId') simuladoId: string,
    @Headers('x-api-secret') secret?: string,
  ) {
    this.gate(secret)
    if (!tenantId || !simuladoId) throw new BadRequestException('tenantId e simuladoId são obrigatórios')
    return { rows: await relatorioRespostasAggSql(tenantId, simuladoId) }
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

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'

export interface GradingResult {
  sessao_id: string
  nota: number
  total_questoes: number
  total_corretas: number
  posicao_ranking?: number
}

@Injectable()
export class GradingService {
  constructor(private readonly supabase: SupabaseService) {}

  // Calculate and persist score for a single session
  async gradeSession(sessaoId: string, tenantId: string): Promise<GradingResult> {
    const { data: respostas } = await this.supabase.getClient()
      .from('respostas_objetivas')
      .select('correta, pontuacao, questao_id')
      .eq('sessao_id', sessaoId)
      .eq('tenant_id', tenantId)

    const total = respostas?.length ?? 0
    const corretas = respostas?.filter(r => r.correta).length ?? 0
    const nota = total > 0 ? parseFloat(((corretas / total) * 10).toFixed(2)) : 0

    const { error } = await this.supabase.getClient()
      .from('sessoes_prova')
      .update({ nota, status: 'finalizada', finalizado_em: new Date().toISOString() })
      .eq('id', sessaoId)
      .eq('tenant_id', tenantId)

    if (error) throw new BadRequestException(error.message)

    return { sessao_id: sessaoId, nota, total_questoes: total, total_corretas: corretas }
  }

  // Recalculate ranking for all finalized sessions in a simulado
  async recalcRanking(simuladoId: string, tenantId: string) {
    const { data: sessoes, error } = await this.supabase.getClient()
      .from('sessoes_prova')
      .select('id, nota')
      .eq('simulado_id', simuladoId)
      .eq('tenant_id', tenantId)
      .eq('status', 'finalizada')
      .eq('is_teste', false)
      .not('nota', 'is', null)
      .order('nota', { ascending: false })

    if (error) throw new BadRequestException(error.message)
    if (!sessoes?.length) return { ranked: 0 }

    // Assign ranking (ties get same position)
    let rank = 1
    let prevNota: number | null = null

    const updates: Array<{ id: string; posicao_ranking: number }> = []
    for (let i = 0; i < sessoes.length; i++) {
      const s = sessoes[i]
      const nota = s.nota as number
      if (prevNota !== null && nota < prevNota) rank = i + 1
      updates.push({ id: s.id, posicao_ranking: rank })
      prevNota = nota
    }

    // Batch update in chunks of 50
    for (let i = 0; i < updates.length; i += 50) {
      const chunk = updates.slice(i, i + 50)
      for (const u of chunk) {
        await this.supabase.getClient()
          .from('sessoes_prova')
          .update({ posicao_ranking: u.posicao_ranking })
          .eq('id', u.id)
      }
    }

    return { ranked: updates.length }
  }

  // Re-grade all sessions in a simulado after an annulment or gabarito change
  async regrade(simuladoId: string, questaoId: string, tenantId: string, politica: 'pontua_todos' | 'descarta') {
    // Get all affected responses
    const { data: respostas } = await this.supabase.getClient()
      .from('respostas_objetivas')
      .select('id, sessao_id, alternativa_id, correta, pontuacao, snapshot_gabarito')
      .eq('questao_id', questaoId)
      .eq('tenant_id', tenantId)

    if (!respostas?.length) return { regraded: 0 }

    // Get affected sessions for before-snapshot
    const sessaoIds = [...new Set(respostas.map(r => r.sessao_id as string))]
    const { data: sessoesBefore } = await this.supabase.getClient()
      .from('sessoes_prova')
      .select('id, nota, posicao_ranking, estudante_id')
      .in('id', sessaoIds)

    const sessaoBeforeMap = new Map(
      (sessoesBefore ?? []).map(s => [s.id, { nota: s.nota, rank: s.posicao_ranking }])
    )

    // Update individual responses based on policy
    for (const resposta of respostas) {
      let novaCorreta = false
      let novaPontuacao = 0

      if (politica === 'pontua_todos') {
        novaCorreta = true
        novaPontuacao = 1
      } else {
        // descarta: correta=false, pontuacao=0 (question excluded from scoring)
        novaCorreta = false
        novaPontuacao = 0
      }

      await this.supabase.getClient()
        .from('respostas_objetivas')
        .update({ correta: novaCorreta, pontuacao: novaPontuacao })
        .eq('id', resposta.id)
    }

    // Recalculate notes for each affected session
    for (const sessaoId of sessaoIds) {
      await this.gradeSession(sessaoId, tenantId)
    }

    // Recalculate ranking
    await this.recalcRanking(simuladoId, tenantId)

    // Get new session states
    const { data: sessoesAfter } = await this.supabase.getClient()
      .from('sessoes_prova')
      .select('id, nota, posicao_ranking, estudante_id')
      .in('id', sessaoIds)

    // Build impacto records
    const impactos = (sessoesAfter ?? []).map(sa => {
      const before = sessaoBeforeMap.get(sa.id) ?? { nota: 0, rank: null }
      const notaAntes = before.nota as number ?? 0
      const notaDepois = sa.nota as number ?? 0
      const delta = notaDepois - notaAntes
      let classificacao: 'beneficiado' | 'prejudicado' | 'neutro' = 'neutro'
      if (delta > 0) classificacao = 'beneficiado'
      else if (delta < 0) classificacao = 'prejudicado'

      return {
        estudante_id: sa.estudante_id,
        nota_antes: notaAntes,
        nota_depois: notaDepois,
        delta,
        ranking_antes: before.rank ?? null,
        ranking_depois: sa.posicao_ranking ?? null,
        classificacao,
        tenant_id: tenantId,
      }
    })

    return { regraded: respostas.length, sessoes_afetadas: sessaoIds.length, impactos }
  }

  // Trigger re-grading via anulação
  async anularQuestao(
    simuladoId: string,
    questaoId: string,
    tenantId: string,
    motivo: string,
    executadoPor: string,
    politica: 'pontua_todos' | 'descarta' = 'pontua_todos',
  ) {
    // Mark question as anulada in simulado_questoes
    await this.supabase.getClient()
      .from('simulado_questoes')
      .update({ anulada: true })
      .eq('simulado_id', simuladoId)
      .eq('questao_id', questaoId)

    // Run re-grading
    const result = await this.regrade(simuladoId, questaoId, tenantId, politica)

    // Save recorrecao record
    const { data: recorrecao } = await this.supabase.getClient()
      .from('recorrecoes')
      .insert({
        simulado_id: simuladoId,
        questao_id: questaoId,
        tipo: 'anulacao',
        motivo,
        politica,
        executado_por: executadoPor,
        tenant_id: tenantId,
        executado_em: new Date().toISOString(),
      })
      .select('id')
      .single()

    // Save impacto records
    if (recorrecao && result.impactos?.length) {
      const impactoRows = result.impactos.map(i => ({
        ...i,
        recorrecao_id: recorrecao.id,
      }))
      await this.supabase.getClient().from('recorrecao_impactos').insert(impactoRows)
    }

    return { ...result, recorrecao_id: recorrecao?.id }
  }

  // Get recorreção impacts for admin report
  async getRecorrecaoImpactos(recorrecaoId: string, tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('recorrecao_impactos')
      .select('*, estudantes(nome, email)')
      .eq('recorrecao_id', recorrecaoId)
      .order('delta', { ascending: false })
    return data ?? []
  }

  async listRecorrecoes(simuladoId: string, tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('recorrecoes')
      .select('id, questao_id, tipo, motivo, politica, executado_em')
      .eq('simulado_id', simuladoId)
      .eq('tenant_id', tenantId)
      .order('executado_em', { ascending: false })
    return data ?? []
  }
}

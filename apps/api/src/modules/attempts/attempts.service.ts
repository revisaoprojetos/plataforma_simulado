import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { OpenSessaoDto } from './dto/open-sessao.dto.js'
import { SaveRespostaDto } from './dto/save-resposta.dto.js'
import { deterministicShuffle } from './shuffle.util.js'

interface Alternativa {
  id: string
  texto: string
  correta: boolean
  ordem: number
}

interface QuestaoRow {
  questao_id: string
  ordem: number
  peso: number
  anulada: boolean
  questoes: {
    id: string
    enunciado: string
    tipo: string
    alternativas: Alternativa[]
  }
}

@Injectable()
export class AttemptsService {
  constructor(private readonly supabase: SupabaseService) {}

  // ─── Open session ──────────────────────────────────────────────────────────

  async openSessao(
    simuladoId: string,
    estudanteId: string,
    tenantId: string,
    dto: OpenSessaoDto,
  ) {
    // 1. Load the simulado
    const { data: simulado, error: simErr } = await this.supabase
      .getClient()
      .from('simulados')
      .select('id, status, modo_aplicacao, data_inicio, data_fim, tempo_limite_min, regras, tenant_id')
      .eq('id', simuladoId)
      .eq('tenant_id', tenantId)
      .single()

    if (simErr || !simulado) throw new NotFoundException('Simulado não encontrado')

    if (simulado.status !== 'publicado') {
      throw new BadRequestException('Simulado não está publicado')
    }

    const now = new Date()

    // 2. Validate window for janela_fixa
    if (simulado.modo_aplicacao === 'janela_fixa') {
      if (simulado.data_inicio && now < new Date(simulado.data_inicio)) {
        throw new BadRequestException('Simulado ainda não abriu')
      }
      if (simulado.data_fim && now >= new Date(simulado.data_fim)) {
        throw new BadRequestException('Janela do simulado encerrada')
      }
    }

    // 3. Check active matricula (unless it's a test session)
    if (!dto.is_teste) {
      const { data: matricula } = await this.supabase
        .getClient()
        .from('matriculas')
        .select('id, status, validade')
        .eq('estudante_id', estudanteId)
        .eq('tenant_id', tenantId)
        .eq('status', 'ativa')
        .single()

      if (!matricula) {
        throw new ForbiddenException('Matrícula ativa não encontrada')
      }

      if (matricula.validade && new Date(matricula.validade) < now) {
        throw new ForbiddenException('Matrícula expirada')
      }
    }

    // 4. Check retentativas
    const regras = (simulado.regras as {
      retentativas?: number | 'ilimitado'
      politica_nota?: string
      embaralhar_questoes?: boolean
      embaralhar_alternativas?: boolean
    }) ?? {}

    const { data: prevSessoes } = await this.supabase
      .getClient()
      .from('sessoes_prova')
      .select('id, status, tentativa_num')
      .eq('simulado_id', simuladoId)
      .eq('estudante_id', estudanteId)
      .eq('is_teste', dto.is_teste ?? false)

    const retentativas = regras.retentativas ?? 1
    if (retentativas !== 'ilimitado') {
      const completed = (prevSessoes ?? []).filter(
        (s) => s.status === 'finalizada',
      ).length
      if (completed >= retentativas) {
        throw new BadRequestException('Número máximo de tentativas atingido')
      }
    }

    const tentativaNum = (prevSessoes ?? []).length + 1

    // 5. Create sessao_prova
    const { data: sessao, error: sessaoErr } = await this.supabase
      .getClient()
      .from('sessoes_prova')
      .insert({
        simulado_id: simuladoId,
        estudante_id: estudanteId,
        tentativa_num: tentativaNum,
        is_teste: dto.is_teste ?? false,
        status: 'em_andamento',
        iniciado_em: now.toISOString(),
        tenant_id: tenantId,
      })
      .select()
      .single()

    if (sessaoErr || !sessao) throw new Error(sessaoErr?.message ?? 'Erro ao criar sessão')

    // 6. Load questions
    const { data: questoes, error: qErr } = await this.supabase
      .getClient()
      .from('simulado_questoes')
      .select(
        `questao_id, ordem, peso, anulada,
         questoes(id, enunciado, tipo, alternativas(id, texto, correta, ordem))`,
      )
      .eq('simulado_id', simuladoId)
      .eq('anulada', false)
      .order('ordem')

    if (qErr) throw new Error(qErr.message)

    const questoesRows = (questoes ?? []) as unknown as QuestaoRow[]

    // 7. Deterministic shuffle
    const shuffleQuestoes = regras.embaralhar_questoes ?? true
    const shuffleAlternativas = regras.embaralhar_alternativas ?? true

    const orderedQuestoes = shuffleQuestoes
      ? deterministicShuffle(questoesRows, sessao.id as string)
      : questoesRows

    // 8. Persist sessao_questao_ordem
    const ordemRows = orderedQuestoes.map((q, idx) => {
      const alts = q.questoes.alternativas ?? []
      const shuffledAlts = shuffleAlternativas
        ? deterministicShuffle(alts, `${sessao.id}-${q.questao_id}`)
        : alts

      return {
        sessao_id: sessao.id,
        questao_id: q.questao_id,
        tenant_id: tenantId,
        ordem_exibida: idx,
        ordem_alternativas: shuffledAlts.map((a) => a.id),
      }
    })

    await this.supabase.getClient().from('sessao_questao_ordem').insert(ordemRows)

    // 9. Log event
    await this.supabase.getClient().from('sessao_eventos').insert({
      sessao_id: sessao.id,
      tenant_id: tenantId,
      tipo: 'iniciou',
    })

    // 10. Return session with ordered questions (no correta field exposed to student)
    return {
      sessao: {
        id: sessao.id,
        status: sessao.status,
        iniciado_em: sessao.iniciado_em,
        tempo_limite_min: simulado.tempo_limite_min,
        data_fim: simulado.data_fim,
      },
      questoes: orderedQuestoes.map((q, idx) => {
        const alts = q.questoes.alternativas ?? []
        const shuffledAlts = shuffleAlternativas
          ? deterministicShuffle(alts, `${sessao.id}-${q.questao_id}`)
          : alts
        return {
          ordem: idx,
          questao_id: q.questao_id,
          enunciado: q.questoes.enunciado,
          tipo: q.questoes.tipo,
          peso: q.peso,
          alternativas: shuffledAlts.map((a) => ({
            id: a.id,
            texto: a.texto,
            // correta is intentionally omitted — never sent to student during active session
          })),
        }
      }),
    }
  }

  // ─── Save response (auto-save idempotent upsert) ───────────────────────────

  async saveResposta(
    sessaoId: string,
    estudanteId: string,
    tenantId: string,
    dto: SaveRespostaDto,
  ) {
    const sessao = await this.validateSessaoAccess(sessaoId, estudanteId, tenantId)

    // Verify alternativa exists and belongs to questao
    const { data: alternativa, error: altErr } = await this.supabase
      .getClient()
      .from('alternativas')
      .select('id, questao_id, correta')
      .eq('id', dto.alternativa_id)
      .eq('questao_id', dto.questao_id)
      .single()

    if (altErr || !alternativa) {
      throw new BadRequestException('Alternativa não encontrada para esta questão')
    }

    // Snapshot current gabarito at time of answer
    const snapshotGabarito = { alternativa_correta_id: alternativa.id, correta: alternativa.correta }

    const { error } = await this.supabase
      .getClient()
      .from('respostas_objetivas')
      .upsert(
        {
          sessao_id: sessaoId,
          questao_id: dto.questao_id,
          alternativa_id: dto.alternativa_id,
          correta: alternativa.correta,
          pontuacao: alternativa.correta ? 1 : 0,
          snapshot_gabarito: snapshotGabarito,
          tempo_resposta_seg: dto.tempo_resposta_seg ?? null,
          respondido_em: new Date().toISOString(),
          tenant_id: tenantId,
        },
        { onConflict: 'sessao_id,questao_id' },
      )

    if (error) throw new Error(error.message)

    return { saved: true, questao_id: dto.questao_id }
  }

  // ─── Finalize session ──────────────────────────────────────────────────────

  async finalizeSessao(sessaoId: string, estudanteId: string, tenantId: string) {
    const sessao = await this.validateSessaoAccess(sessaoId, estudanteId, tenantId)

    // Count answers and calculate score
    const { data: respostas } = await this.supabase
      .getClient()
      .from('respostas_objetivas')
      .select('correta, pontuacao')
      .eq('sessao_id', sessaoId)

    const total = respostas?.length ?? 0
    const corretas = respostas?.filter((r) => r.correta).length ?? 0
    const nota = total > 0 ? (corretas / total) * 10 : 0

    const { data: updated, error } = await this.supabase
      .getClient()
      .from('sessoes_prova')
      .update({
        status: 'finalizada',
        finalizado_em: new Date().toISOString(),
        nota,
      })
      .eq('id', sessaoId)
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Log event
    await this.supabase.getClient().from('sessao_eventos').insert({
      sessao_id: sessaoId,
      tenant_id: tenantId,
      tipo: 'finalizou',
    })

    return {
      sessao_id: sessaoId,
      status: 'finalizada',
      nota,
      total_questoes: total,
      total_corretas: corretas,
      finalizado_em: updated.finalizado_em,
    }
  }

  // ─── Get session state ──────────────────────────────────────────────────────

  async getSessaoState(sessaoId: string, estudanteId: string, tenantId: string) {
    const sessao = await this.validateSessaoAccess(sessaoId, estudanteId, tenantId)

    // Load simulado for time info
    const { data: simulado } = await this.supabase
      .getClient()
      .from('simulados')
      .select('data_fim, tempo_limite_min')
      .eq('id', sessao.simulado_id as string)
      .single()

    // Load ordered questions
    const { data: ordemRows } = await this.supabase
      .getClient()
      .from('sessao_questao_ordem')
      .select(
        `questao_id, ordem_exibida, ordem_alternativas,
         questoes(id, enunciado, tipo, alternativas(id, texto, ordem))`,
      )
      .eq('sessao_id', sessaoId)
      .order('ordem_exibida')

    // Load existing answers
    const { data: respostas } = await this.supabase
      .getClient()
      .from('respostas_objetivas')
      .select('questao_id, alternativa_id, respondido_em')
      .eq('sessao_id', sessaoId)

    const respostaMap = new Map(
      (respostas ?? []).map((r) => [r.questao_id as string, r]),
    )

    // Calculate time remaining
    const now = new Date()
    let tempoRestanteSeg: number | null = null

    if (sessao.iniciado_em && simulado?.tempo_limite_min) {
      const iniciado = new Date(sessao.iniciado_em as string)
      const limiteSeg = simulado.tempo_limite_min * 60
      const decorrido = Math.floor((now.getTime() - iniciado.getTime()) / 1000)
      tempoRestanteSeg = Math.max(0, limiteSeg - decorrido)
    }

    if (simulado?.data_fim) {
      const janelaSeg = Math.floor(
        (new Date(simulado.data_fim).getTime() - now.getTime()) / 1000,
      )
      tempoRestanteSeg =
        tempoRestanteSeg !== null
          ? Math.min(tempoRestanteSeg, janelaSeg)
          : janelaSeg
    }

    return {
      sessao: {
        id: sessaoId,
        status: sessao.status,
        iniciado_em: sessao.iniciado_em,
        tempo_restante_seg: tempoRestanteSeg,
      },
      questoes: (ordemRows ?? []).map((row) => {
        const q = row as unknown as {
          questao_id: string
          ordem_exibida: number
          ordem_alternativas: string[]
          questoes: {
            id: string
            enunciado: string
            tipo: string
            alternativas: Alternativa[]
          }
        }
        const altMap = new Map(
          (q.questoes.alternativas ?? []).map((a) => [a.id, a]),
        )
        const resposta = respostaMap.get(q.questao_id)

        return {
          ordem: q.ordem_exibida,
          questao_id: q.questao_id,
          enunciado: q.questoes.enunciado,
          tipo: q.questoes.tipo,
          alternativas: q.ordem_alternativas.map((altId) => {
            const alt = altMap.get(altId)
            return { id: altId, texto: alt?.texto ?? '' }
          }),
          resposta_atual: resposta?.alternativa_id ?? null,
        }
      }),
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async validateSessaoAccess(
    sessaoId: string,
    estudanteId: string,
    tenantId: string,
  ) {
    const { data: sessao, error } = await this.supabase
      .getClient()
      .from('sessoes_prova')
      .select('id, simulado_id, estudante_id, status, iniciado_em, finalizado_em, tenant_id')
      .eq('id', sessaoId)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !sessao) throw new NotFoundException('Sessão não encontrada')

    if (sessao.estudante_id !== estudanteId) {
      throw new ForbiddenException('Acesso negado: sessão não pertence a você')
    }

    if (sessao.status === 'finalizada') {
      throw new BadRequestException('Sessão já finalizada')
    }

    return sessao
  }
}

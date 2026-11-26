import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registrarAudit } from '@/lib/audit'
import { rankearSimulado } from '@/lib/ranking'
import { contextoNota, calcularNotaSessao } from '@/lib/simulado/nota'
import { planejarEdicao, letraDaAlternativa } from '@/lib/simulado/edicao-marcacao'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'
import { invalidarCatalogoSimulados } from '@/lib/aluno/catalogo-simulados'
import { marcarHomeDesatualizado } from '@/lib/home/snapshot'
import { marcarDesempenhoDesatualizado } from '@/lib/desempenho/snapshot'
import { marcarPerfilDesatualizado } from '@/lib/perfil/snapshot'
import { erroDeObjetoAusente } from '@/lib/db/recurso-ausente'

/**
 * EDIÇÃO ADMIN da marcação de UMA questão numa sessão finalizada do aluno. Reaproveita a regra canônica
 * (contextoNota/calcularNotaSessao → nota; rankearSimulado → posição; invalidações como a re-correção) e
 * PRESERVA a marcação original nas colunas marcacao_* da resposta (só na 1ª edição). A permissão/tenant do
 * requisitante é validada na borda (rota); aqui repetimos o gate de tenant (sessão e questão) como defesa.
 */
export type ResultadoEdicao = {
  ok: boolean
  error?: string
  /** Colunas da migração 20261208000000 ausentes — nada foi gravado. */
  migracaoPendente?: boolean
  notaAntes?: number
  notaDepois?: number
  posicaoAntes?: number | null
  posicaoDepois?: number | null
  marcacaoOriginal?: string | null
  marcacaoNova?: string | null
}

export async function editarMarcacaoAdmin(svc: SupabaseClient, p: {
  tenantId: string
  sessaoId: string
  questaoId: string
  /** null = deixar em branco. Ignorado quando `restaurar`. */
  novaAlternativaId: string | null
  restaurar?: boolean
  motivo?: string | null
  atorId: string | null
}): Promise<ResultadoEdicao> {
  const { tenantId, sessaoId, questaoId, restaurar = false, atorId } = p
  const motivo = (p.motivo ?? '').trim().slice(0, 500) || null

  // Gate de tenant + estado da sessão.
  const { data: sessao } = await svc.from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, status, deletado, nota, posicao_ranking, is_teste')
    .eq('id', sessaoId).eq('tenant_id', tenantId).maybeSingle()
  if (!sessao) return { ok: false, error: 'Sessão não encontrada.' }
  const s = sessao as any
  if (s.deletado) return { ok: false, error: 'Sessão excluída.' }
  if (s.status !== 'finalizada') return { ok: false, error: 'Só é possível editar a marcação de uma tentativa finalizada.' }

  const { data: vinculo } = await svc.from('simulado_prova_questoes').select('id')
    .eq('simulado_id', s.simulado_id).eq('questao_id', questaoId).eq('tenant_id', tenantId).maybeSingle()
  if (!vinculo) return { ok: false, error: 'Questão não pertence a este simulado.' }

  const { data: altsRaw } = await svc.from('simulado_alternativas').select('id, correta, ordem').eq('questao_id', questaoId).order('ordem')
  const alts = (altsRaw ?? []) as { id: string; correta: boolean; ordem: number }[]
  if (!alts.length) return { ok: false, error: 'Questão sem alternativas.' }

  // Resposta atual (com as colunas novas — se ausentes, a migração está pendente).
  const sel = await svc.from('simulado_respostas_objetivas')
    .select('id, alternativa_id, marcacao_editada, marcacao_original_alternativa_id')
    .eq('sessao_id', sessaoId).eq('questao_id', questaoId).maybeSingle()
  if (sel.error) {
    if (erroDeObjetoAusente(sel.error.message)) return { ok: false, migracaoPendente: true, error: 'Recurso indisponível: aplique a migração 20261208000000_respostas_marcacao_editada_admin.sql.' }
    return { ok: false, error: sel.error.message }
  }
  const atual = (sel.data ?? null) as any

  const plano = planejarEdicao({ alts, atual, nova: p.novaAlternativaId, restaurar })
  if ('erro' in plano) return { ok: false, error: plano.erro }

  const agora = new Date().toISOString()
  const antesAudit = {
    alternativa_id: atual?.alternativa_id ?? null, letra: letraDaAlternativa(alts, atual?.alternativa_id),
    marcacao_editada: !!atual?.marcacao_editada, nota: Number(s.nota ?? 0), posicao_ranking: s.posicao_ranking ?? null,
  }

  // 1) Grava a resposta (preservando a original na 1ª edição).
  if (plano.acao === 'apagar') {
    const { error } = await svc.from('simulado_respostas_objetivas').delete().eq('sessao_id', sessaoId).eq('questao_id', questaoId).eq('tenant_id', tenantId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await svc.from('simulado_respostas_objetivas').upsert({
      tenant_id: tenantId, sessao_id: sessaoId, questao_id: questaoId,
      alternativa_id: plano.alternativa_id, correta: plano.correta, pontuacao: plano.pontuacao,
      snapshot_gabarito: plano.snapshot_gabarito,
      // respondido_em só é definido quando a linha nasce (aluno estava em branco); em update o upsert o sobrescreve — preserva o existente.
      ...(atual ? {} : { respondido_em: agora }),
      marcacao_editada: plano.marcacao_editada,
      marcacao_original_alternativa_id: plano.marcacao_original_alternativa_id,
      editada_por: plano.restaurou ? null : atorId, editada_em: plano.restaurou ? null : agora, editada_motivo: plano.restaurou ? null : motivo,
    }, { onConflict: 'sessao_id,questao_id' })
    if (error) return { ok: false, error: error.message }
  }

  // 2) Nota (regra canônica; respeita anuladas/política/CEBRASPE) → ranking → caches.
  const ctx = await contextoNota(svc, s.simulado_id)
  const notaDepois = await calcularNotaSessao(svc, sessaoId, ctx)
  await svc.from('simulado_sessoes_prova').update({ nota: notaDepois }).eq('id', sessaoId).eq('tenant_id', tenantId)
  if (!s.is_teste) await rankearSimulado(svc, s.simulado_id)
  const { data: dep } = await svc.from('simulado_sessoes_prova').select('posicao_ranking').eq('id', sessaoId).maybeSingle()
  const posicaoDepois = (dep as any)?.posicao_ranking ?? null

  const marcacaoOriginal = letraDaAlternativa(alts, plano.original)
  const marcacaoNova = letraDaAlternativa(alts, plano.alternativa_id)
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_respostas_objetivas', entidadeId: atual?.id ?? sessaoId, tenantId, atorId,
    antes: antesAudit,
    depois: {
      acao: plano.restaurou ? 'restaurar_marcacao_original' : 'editar_marcacao_aluno',
      sessao_id: sessaoId, simulado_id: s.simulado_id, estudante_id: s.estudante_id, questao_id: questaoId,
      alternativa_id: plano.alternativa_id, letra: marcacaoNova, marcacao_original: marcacaoOriginal,
      nota: notaDepois, posicao_ranking: posicaoDepois, motivo,
    },
  })

  await invalidarRelatorios(tenantId)
  void invalidarCatalogoSimulados(tenantId, s.estudante_id)
  void Promise.allSettled([
    marcarHomeDesatualizado(svc, tenantId, s.estudante_id),
    marcarDesempenhoDesatualizado(svc, tenantId, s.estudante_id),
    marcarPerfilDesatualizado(svc, tenantId, s.estudante_id),
  ])

  return {
    ok: true, notaAntes: antesAudit.nota, notaDepois, posicaoAntes: antesAudit.posicao_ranking, posicaoDepois,
    marcacaoOriginal, marcacaoNova,
  }
}

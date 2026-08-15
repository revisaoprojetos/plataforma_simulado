'use server'

// "Fazer" um simulado PERSONALIZADO do aluno (Fase 2). Reusa a engine de sessão/correção:
// a sessão é uma linha em simulado_sessoes_prova (mesma tabela dos oficiais), o auto-save usa
// /api/sessoes/resposta e a finalização /api/sessoes/finalizar — que já pula webhook/gamificação/
// ranking quando o simulado tem owner_estudante_id (isolamento). Aqui só ABRIMOS a sessão e
// entregamos as questões COM gabarito (é o simulado do próprio aluno — estudo/revisão).
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { SupabaseClient } from '@supabase/supabase-js'

async function ctx() {
  const s = await getSessaoAluno()
  if (!s) throw new Error('Sessão do aluno não encontrada.')
  return { svc: createAdminClient() as SupabaseClient, estudanteId: s.estudanteId, tenantId: s.tenantId }
}

export type ModoPessoal = 'estudo' | 'prova' | 'revisao'
export type AltRunner = { id: string; texto: string; ordem: number; correta: boolean }
export type QuestaoRunner = {
  id: string; ordem: number; enunciado: string; tipo: string
  imagemUrl: string | null; disciplina: string | null; comentario: string | null
  alternativas: AltRunner[]
}
export type SessaoPessoal = {
  sessaoId: string; simuladoId: string; titulo: string; modo: ModoPessoal
  tempoLimiteMin: number | null; iniciadoEm: string; status: string
  questoes: QuestaoRunner[]; respostas: Record<string, string>
}

/**
 * Abre (retoma ou cria) a sessão do simulado pessoal e devolve as questões com gabarito +
 * as respostas já salvas. Escopado por tenant + owner_estudante_id (service role, sem RLS).
 */
export async function abrirSessaoPessoal(simuladoId: string): Promise<{ sessao?: SessaoPessoal; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()

  // 1. Simulado do próprio aluno (dono).
  const { data: sim } = await svc.from('simulado_simulados')
    .select('id, titulo, regras, tempo_limite_min')
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false)
    .maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  const regras = ((sim as any).regras ?? {}) as Record<string, unknown>
  const modo = (['estudo', 'prova', 'revisao'] as const).includes((regras.modo_pessoal as ModoPessoal))
    ? (regras.modo_pessoal as ModoPessoal) : 'estudo'

  // 2. Questões na ordem definida + conteúdo + alternativas (com `correta`).
  const pqs = await fetchAll<any>(() => svc.from('simulado_prova_questoes')
    .select('questao_id, ordem').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).order('ordem', { ascending: true }))
  if (!pqs.length) return { error: 'Adicione ao menos uma questão antes de fazer.' }
  const qids = pqs.map((p) => p.questao_id)

  // Tolerante a imagem_url (pode não estar migrada).
  let qrows: any[]
  try { qrows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor, disciplina_id, imagem_url').in('id', c)) }
  catch { qrows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor, disciplina_id').in('id', c)) }
  const qmap = new Map(qrows.map((q) => [q.id, q]))

  const altRows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', c))
  const altsByQ = new Map<string, AltRunner[]>()
  for (const a of altRows) {
    const arr = altsByQ.get(a.questao_id) ?? []
    arr.push({ id: a.id, texto: a.texto ?? '', ordem: a.ordem ?? 0, correta: a.correta === true })
    altsByQ.set(a.questao_id, arr)
  }

  const discIds = [...new Set(qrows.map((q) => q.disciplina_id).filter(Boolean))] as string[]
  const discM = new Map<string, string>()
  if (discIds.length) { const ds = await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c)); for (const d of ds) discM.set(d.id, d.nome) }

  const questoes: QuestaoRunner[] = pqs.map((p) => {
    const q = qmap.get(p.questao_id) ?? {}
    return {
      id: p.questao_id, ordem: p.ordem, enunciado: (q.enunciado as string) ?? '', tipo: (q.tipo as string) ?? 'objetiva',
      imagemUrl: (q.imagem_url as string | null) ?? null,
      disciplina: q.disciplina_id ? (discM.get(q.disciplina_id) ?? null) : null,
      comentario: (q.comentario_professor as string | null) ?? null,
      alternativas: (altsByQ.get(p.questao_id) ?? []).sort((a, b) => a.ordem - b.ordem),
    }
  })

  // 3. Retoma a sessão aberta ou cria uma nova tentativa.
  const { data: aberta } = await svc.from('simulado_sessoes_prova')
    .select('id, status, iniciado_em')
    .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('is_teste', false).neq('status', 'finalizada')
    .order('iniciado_em', { ascending: false }).limit(1).maybeSingle()

  let sessaoId: string, iniciadoEm: string, status: string
  if (aberta) {
    sessaoId = aberta.id as string; iniciadoEm = aberta.iniciado_em as string; status = aberta.status as string
  } else {
    const { count } = await svc.from('simulado_sessoes_prova').select('*', { count: 'exact', head: true })
      .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('is_teste', false).eq('status', 'finalizada')
    const now = new Date().toISOString()
    const { data: nova, error } = await svc.from('simulado_sessoes_prova').insert({
      tenant_id: tenantId, simulado_id: simuladoId, estudante_id: estudanteId, is_teste: false,
      status: 'em_andamento', iniciado_em: now, tentativa_num: (count ?? 0) + 1,
    }).select('id').single()
    if (error || !nova) return { error: error?.message ?? 'Não foi possível iniciar.' }
    sessaoId = (nova as any).id as string; iniciadoEm = now; status = 'em_andamento'
  }

  // 4. Respostas já gravadas nesta sessão.
  const { data: resp } = await svc.from('simulado_respostas_objetivas').select('questao_id, alternativa_id').eq('sessao_id', sessaoId)
  const respostas: Record<string, string> = {}
  for (const r of resp ?? []) if ((r as any).alternativa_id) respostas[(r as any).questao_id] = (r as any).alternativa_id

  // 5. Prática pessoal: o /api/sessoes/resposta não deve BLOQUEAR por tempo (o timer do modo Prova
  //    é só UX, sem antifraude). Garante a flag `permitir_continuar_apos_tempo`.
  if (regras.permitir_continuar_apos_tempo !== true) {
    await svc.from('simulado_simulados').update({ regras: { ...regras, permitir_continuar_apos_tempo: true } })
      .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  }

  return { sessao: { sessaoId, simuladoId, titulo: (sim as any).titulo as string, modo, tempoLimiteMin: (sim as any).tempo_limite_min ?? null, iniciadoEm, status, questoes, respostas } }
}

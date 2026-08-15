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
  origemSimulado: string | null; origemNumero: number | null
  alternativas: AltRunner[]
}
export type SecaoRunner = { id: string; nome: string; questaoIds: string[] }
export type SessaoPessoal = {
  sessaoId: string; simuladoId: string; titulo: string; modo: ModoPessoal
  tempoLimiteMin: number | null; iniciadoEm: string; status: string
  questoes: QuestaoRunner[]; respostas: Record<string, string>; secoes: SecaoRunner[]
  estudanteNome: string
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

  // Tolerante à coluna `comentario` da alternativa (comentário do gabarito por alternativa).
  let altRows: any[]
  try { altRows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta, comentario').in('questao_id', c)) }
  catch { altRows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', c)) }
  const altsByQ = new Map<string, AltRunner[]>()
  const comentCorretaByQ = new Map<string, string>()             // comentário da alternativa CORRETA
  const comentAltsByQ = new Map<string, { ordem: number; texto: string }[]>() // TODAS as alternativas comentadas
  for (const a of altRows) {
    const arr = altsByQ.get(a.questao_id) ?? []
    arr.push({ id: a.id, texto: a.texto ?? '', ordem: a.ordem ?? 0, correta: a.correta === true })
    altsByQ.set(a.questao_id, arr)
    const c = a.comentario ? String(a.comentario).trim() : ''
    if (c) {
      if (a.correta === true) comentCorretaByQ.set(a.questao_id, c)
      const list = comentAltsByQ.get(a.questao_id) ?? []; list.push({ ordem: a.ordem ?? 0, texto: c }); comentAltsByQ.set(a.questao_id, list)
    }
  }
  const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']
  // Comentário do professor: alternativa correta → comentario_professor → gabarito comentado (todas as alternativas).
  const resolverComentario = (qid: string, prof: string | null): string | null => {
    const correta = comentCorretaByQ.get(qid); if (correta) return correta
    if (prof && String(prof).trim()) return String(prof)
    const alts = (comentAltsByQ.get(qid) ?? []).slice().sort((a, b) => a.ordem - b.ordem)
    if (alts.length) return alts.map((a) => `**${LETRAS[a.ordem] ?? '•'})** ${a.texto}`).join('\n\n')
    return null
  }

  const discIds = [...new Set(qrows.map((q) => q.disciplina_id).filter(Boolean))] as string[]
  const discM = new Map<string, string>()
  if (discIds.length) { const ds = await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c)); for (const d of ds) discM.set(d.id, d.nome) }

  // Origem: de qual simulado OFICIAL cada questão veio + o número dela lá (1º oficial que a contém).
  const origRows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_prova_questoes').select('questao_id, simulado_id, ordem').in('questao_id', c).neq('simulado_id', simuladoId).order('ordem', { ascending: true }))
  const origSimIds = [...new Set(origRows.map((r) => r.simulado_id).filter(Boolean))] as string[]
  const oficialTitulo = new Map<string, string>()
  if (origSimIds.length) {
    const os = await fetchAllByIn<any>(origSimIds, (c) => svc.from('simulado_simulados').select('id, titulo').in('id', c).eq('tenant_id', tenantId).is('owner_estudante_id', null).eq('deletado', false))
    for (const o of os) oficialTitulo.set(o.id, o.titulo)
  }
  const origemDe = new Map<string, { titulo: string; numero: number }>()
  for (const r of origRows) {
    if (origemDe.has(r.questao_id)) continue
    const t = oficialTitulo.get(r.simulado_id)
    if (t) origemDe.set(r.questao_id, { titulo: t, numero: (Number(r.ordem) || 0) + 1 })
  }

  const questoes: QuestaoRunner[] = pqs.map((p) => {
    const q = qmap.get(p.questao_id) ?? {}
    const o = origemDe.get(p.questao_id)
    return {
      id: p.questao_id, ordem: p.ordem, enunciado: (q.enunciado as string) ?? '', tipo: (q.tipo as string) ?? 'objetiva',
      imagemUrl: (q.imagem_url as string | null) ?? null,
      disciplina: q.disciplina_id ? (discM.get(q.disciplina_id) ?? null) : null,
      comentario: resolverComentario(p.questao_id, (q.comentario_professor as string | null) ?? null),
      origemSimulado: o?.titulo ?? null, origemNumero: o?.numero ?? null,
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

  // 4. Respostas já gravadas nesta sessão + nome do estudante (header "Criado: …").
  const [{ data: resp }, { data: est }] = await Promise.all([
    svc.from('simulado_respostas_objetivas').select('questao_id, alternativa_id').eq('sessao_id', sessaoId),
    svc.from('simulado_estudantes').select('nome').eq('id', estudanteId).maybeSingle(),
  ])
  const respostas: Record<string, string> = {}
  for (const r of resp ?? []) if ((r as any).alternativa_id) respostas[(r as any).questao_id] = (r as any).alternativa_id
  const estudanteNome = ((est as any)?.nome as string) || 'Você'

  // 5. Prática pessoal: o /api/sessoes/resposta não deve BLOQUEAR por tempo (o timer do modo Prova
  //    é só UX, sem antifraude). Garante a flag `permitir_continuar_apos_tempo`.
  if (regras.permitir_continuar_apos_tempo !== true) {
    await svc.from('simulado_simulados').update({ regras: { ...regras, permitir_continuar_apos_tempo: true } })
      .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId)
  }

  // Seções (fileiras) p/ divisórias no runner — saneadas contra as questões presentes.
  const presentes = new Set(questoes.map((x) => x.id))
  const seen = new Set<string>()
  const secoes: SecaoRunner[] = (Array.isArray(regras.secoes) ? regras.secoes : [])
    .map((s: any) => ({ id: String(s?.id ?? ''), nome: String(s?.nome ?? '').slice(0, 80), questaoIds: (Array.isArray(s?.questaoIds) ? s.questaoIds : []).filter((id: string) => presentes.has(id) && !seen.has(id) && seen.add(id)) }))
    .filter((s: SecaoRunner) => s.id)

  return { sessao: { sessaoId, simuladoId, titulo: (sim as any).titulo as string, modo, tempoLimiteMin: (sim as any).tempo_limite_min ?? null, iniciadoEm, status, questoes, respostas, secoes, estudanteNome } }
}

export type ResumoPessoal = {
  simuladoId: string; titulo: string; modo: ModoPessoal; tempoLimiteMin: number | null
  total: number; porDisciplina: { nome: string; count: number }[]
  secoes: { nome: string; count: number }[]; temSecoes: boolean
  emAndamento: boolean; respondidas: number
}

/** Resumo do simulado pessoal para a TELA DE INÍCIO (HUD) — sem criar sessão (o timer do modo
 *  Prova só deve começar ao clicar em Iniciar). Traz total, quebra por matéria e seções. */
export async function resumoSimuladoPessoal(simuladoId: string): Promise<{ resumo?: ResumoPessoal; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const { data: sim } = await svc.from('simulado_simulados')
    .select('id, titulo, regras, tempo_limite_min')
    .eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false).maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  const regras = ((sim as any).regras ?? {}) as Record<string, unknown>
  const modo = (['estudo', 'prova', 'revisao'] as const).includes(regras.modo_pessoal as ModoPessoal) ? (regras.modo_pessoal as ModoPessoal) : 'estudo'

  const pqs = await fetchAll<any>(() => svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).order('ordem', { ascending: true }))
  if (!pqs.length) return { error: 'Adicione ao menos uma questão antes de fazer.' }
  const qids = pqs.map((p) => p.questao_id)

  const qrows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, disciplina_id').in('id', c))
  const discIds = [...new Set(qrows.map((q) => q.disciplina_id).filter(Boolean))] as string[]
  const discM = new Map<string, string>()
  if (discIds.length) { const ds = await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c)); for (const d of ds) discM.set(d.id, d.nome) }
  const cont = new Map<string, number>()
  for (const q of qrows) { const nome = q.disciplina_id ? (discM.get(q.disciplina_id) ?? 'Sem disciplina') : 'Sem disciplina'; cont.set(nome, (cont.get(nome) ?? 0) + 1) }
  const porDisciplina = [...cont.entries()].map(([nome, count]) => ({ nome, count })).sort((a, b) => b.count - a.count)

  const presentes = new Set(qids); const seen = new Set<string>()
  const secoes = (Array.isArray(regras.secoes) ? regras.secoes : [])
    .map((s: any) => ({ nome: String(s?.nome ?? '').trim() || 'Seção', count: (Array.isArray(s?.questaoIds) ? s.questaoIds : []).filter((id: string) => presentes.has(id) && !seen.has(id) && seen.add(id)).length }))

  const { data: aberta } = await svc.from('simulado_sessoes_prova').select('id')
    .eq('simulado_id', simuladoId).eq('estudante_id', estudanteId).eq('is_teste', false).neq('status', 'finalizada')
    .order('iniciado_em', { ascending: false }).limit(1).maybeSingle()
  let respondidas = 0
  if (aberta) { const { data: r } = await svc.from('simulado_respostas_objetivas').select('questao_id').eq('sessao_id', (aberta as any).id); respondidas = (r ?? []).length }

  return { resumo: { simuladoId, titulo: (sim as any).titulo as string, modo, tempoLimiteMin: (sim as any).tempo_limite_min ?? null, total: qids.length, porDisciplina, secoes, temSecoes: secoes.length > 0, emAndamento: !!aberta, respondidas } }
}

export type QuestaoCaderno = { numero: number; secao: string | null; disciplina: string | null; enunciado: string; alternativas: string[] }

/** Questões do simulado pessoal para o CADERNO imprimível (sem gabarito). Na ordem do layout. */
export async function cadernoSimuladoPessoal(simuladoId: string): Promise<{ titulo?: string; questoes?: QuestaoCaderno[]; error?: string }> {
  const { svc, estudanteId, tenantId } = await ctx()
  const { data: sim } = await svc.from('simulado_simulados').select('id, titulo, regras').eq('id', simuladoId).eq('tenant_id', tenantId).eq('owner_estudante_id', estudanteId).eq('deletado', false).maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  const pqs = await fetchAll<any>(() => svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', simuladoId).eq('tenant_id', tenantId).order('ordem', { ascending: true }))
  if (!pqs.length) return { error: 'Sem questões.' }
  const qids = pqs.map((p) => p.questao_id)

  let qrows: any[]
  try { qrows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_questoes').select('id, enunciado, disciplina_id').in('id', c)) }
  catch { qrows = [] }
  const qmap = new Map(qrows.map((q) => [q.id, q]))
  const altRows = await fetchAllByIn<any>(qids, (c) => svc.from('simulado_alternativas').select('questao_id, texto, ordem').in('questao_id', c))
  const altsByQ = new Map<string, { texto: string; ordem: number }[]>()
  for (const a of altRows) { const arr = altsByQ.get(a.questao_id) ?? []; arr.push({ texto: a.texto ?? '', ordem: a.ordem ?? 0 }); altsByQ.set(a.questao_id, arr) }
  const discIds = [...new Set(qrows.map((q) => q.disciplina_id).filter(Boolean))] as string[]
  const discM = new Map<string, string>()
  if (discIds.length) { const ds = await fetchAllByIn<any>(discIds, (c) => svc.from('simulado_disciplinas').select('id, nome').in('id', c)); for (const d of ds) discM.set(d.id, d.nome) }

  const secPorQ = new Map<string, string>()
  const seen = new Set<string>()
  for (const s of (Array.isArray((sim as any).regras?.secoes) ? (sim as any).regras.secoes : [])) {
    for (const id of (Array.isArray(s?.questaoIds) ? s.questaoIds : [])) if (!seen.has(id)) { seen.add(id); secPorQ.set(id, String(s?.nome ?? '').trim() || 'Seção') }
  }

  const questoes: QuestaoCaderno[] = pqs.map((p, i) => {
    const q = qmap.get(p.questao_id) ?? {}
    return {
      numero: i + 1, secao: secPorQ.get(p.questao_id) ?? null,
      disciplina: q.disciplina_id ? (discM.get(q.disciplina_id) ?? null) : null,
      enunciado: (q.enunciado as string) ?? '',
      alternativas: (altsByQ.get(p.questao_id) ?? []).sort((a, b) => a.ordem - b.ordem).map((a) => a.texto),
    }
  })
  return { titulo: (sim as any).titulo as string, questoes }
}

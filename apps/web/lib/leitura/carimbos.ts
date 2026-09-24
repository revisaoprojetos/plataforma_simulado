import 'server-only'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { normalizarCarimbos, normalizarConquistasModulo, resolverEscopoAulas, type CarimboDef, type CarimboCondicaoTipo, type ModuloConquistaDef } from '@/lib/leitura/carimbos-tipos'
import { getGamConfig } from '@/lib/gamificacao/config'
import { awardXp } from '@/lib/gamificacao/xp'

// Medalhas colecionáveis por MÓDULO (lógica de banco; tipos/helpers puros em carimbos-tipos.ts):
// carimbos (imagem, estampa na trilha) + conquistas próprias do módulo (ícone, coleção do aluno).
export { normalizarCarimbos, normalizarConquistasModulo }
export type { CarimboDef, CarimboCondicaoTipo, ModuloConquistaDef } from '@/lib/leitura/carimbos-tipos'

export interface ProgressoModulo { total: number; concluidas: number; gabaritadas: number; porAula: Record<string, { concluida: boolean; gabaritada: boolean }> }

/** Progresso do aluno no módulo: total de aulas publicadas, concluídas (leitura+quiz), gabaritadas e
 *  o estado por aula (para condições de aula específica). */
export async function progressoModuloAluno(svc: any, tenantId: string, moduloId: string, estudanteId: string): Promise<ProgressoModulo> {
  const { data: docs } = await svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('pasta_id', moduloId).eq('deletado', false).eq('publicado', true)
  const aulaIds = (docs ?? []).map((d: any) => d.id)
  if (!aulaIds.length) return { total: 0, concluidas: 0, gabaritadas: 0, porAula: {} }

  const [quiz, resp, prog] = await Promise.all([
    fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) => svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('documento_id')).catch(() => []),
    fetchAllByIn<{ documento_id: string; questao_id: string; correta: boolean }>(aulaIds, (chunk) => svc.from('simulado_leitura_respostas').select('documento_id, questao_id, correta').eq('estudante_id', estudanteId).in('documento_id', chunk).order('documento_id')).catch(() => []),
    fetchAllByIn<{ documento_id: string; concluido_em: string | null }>(aulaIds, (chunk) => svc.from('simulado_leitura_progresso').select('documento_id, concluido_em').eq('estudante_id', estudanteId).in('documento_id', chunk).order('documento_id')).catch(() => []),
  ])

  const quizPorDoc = new Map<string, Set<string>>()
  for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
  const respPorDoc = new Map<string, { answered: Set<string>; correct: Set<string> }>()
  for (const r of resp) { const c = respPorDoc.get(r.documento_id) ?? respPorDoc.set(r.documento_id, { answered: new Set(), correct: new Set() }).get(r.documento_id)!; c.answered.add(r.questao_id); if (r.correta) c.correct.add(r.questao_id) }
  const concluidaProg = new Set<string>((prog ?? []).filter((p) => p.concluido_em).map((p) => p.documento_id))

  let concluidas = 0, gabaritadas = 0
  const porAula: Record<string, { concluida: boolean; gabaritada: boolean }> = {}
  for (const id of aulaIds) {
    const qs = quizPorDoc.get(id)
    const cell = respPorDoc.get(id)
    const temQuiz = !!(qs && qs.size > 0)
    // MESMA regra da trilha (trilha.ts → aulaConcluida): "aula concluída" = leitura concluída E quiz TODO
    // respondido (independe de acertar). Aula sem quiz conta só pela leitura. Gabaritar é a regra separada.
    const questoesFeitas = temQuiz ? !!(cell && [...qs].every((qid) => cell.answered.has(qid))) : true
    const concluida = concluidaProg.has(id) && questoesFeitas
    const gabaritada = temQuiz && questoesFeitas && !!cell && [...qs].every((qid) => cell.correct.has(qid))
    porAula[id] = { concluida, gabaritada }
    if (concluida) { concluidas++; if (gabaritada) gabaritadas++ }
  }
  return { total: aulaIds.length, concluidas, gabaritadas, porAula }
}

function cumpre(condicao: { tipo: CarimboCondicaoTipo; meta: number; aulaModo?: 'todas' | 'especificas'; aulaIds?: string[] }, p: ProgressoModulo): boolean {
  const { tipo, meta } = condicao
  if (tipo === 'concluir_modulo') return p.total > 0 && p.concluidas >= p.total
  if (tipo === 'gabaritar_modulo') return p.total > 0 && p.gabaritadas >= p.total
  if (tipo === 'concluir_aulas') return p.concluidas >= meta
  if (tipo === 'gabaritar_aulas') return p.gabaritadas >= meta
  // "aula(s) específica(s)": o carimbo é COLETADO no perfil ao cumprir ao menos 1 aula do escopo
  // (a exibição na trilha é por-aula). Escopo = todas menos ocultas, ou as marcadas.
  if (tipo === 'concluir_aula' || tipo === 'gabaritar_aula') {
    const escopo = resolverEscopoAulas(condicao.aulaModo, condicao.aulaIds, Object.keys(p.porAula))
    if (!escopo.length) return false
    return escopo.some((id) => tipo === 'concluir_aula' ? !!p.porAula[id]?.concluida : !!p.porAula[id]?.gabaritada)
  }
  return false
}

/**
 * Avalia e concede os carimbos que o aluno passou a merecer no módulo (idempotente). Retorna os ids
 * recém-ganhos. Best-effort — nunca lança (não pode quebrar o fluxo do aluno). Tolerante à ausência
 * da tabela/coluna (dormente até a migração).
 */
export async function avaliarCarimbos(svc: any, tenantId: string, moduloId: string, estudanteId: string): Promise<string[]> {
  try {
    const { data: pasta } = await svc.from('simulado_pastas').select('carimbos_def').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
    const defs = normalizarCarimbos((pasta as any)?.carimbos_def).filter((c) => c.condicao)
    if (!defs.length) return []

    const { data: jaRows } = await svc.from('simulado_leitura_carimbos').select('carimbo_id').eq('tenant_id', tenantId).eq('modulo_id', moduloId).eq('estudante_id', estudanteId)
    const ja = new Set<string>((jaRows ?? []).map((r: any) => r.carimbo_id))
    const faltam = defs.filter((c) => !ja.has(c.id))
    if (!faltam.length) return []

    const prog = await progressoModuloAluno(svc, tenantId, moduloId, estudanteId)
    const ganhar = faltam.filter((c) => cumpre(c.condicao, prog))
    if (!ganhar.length) return []

    const { error } = await svc.from('simulado_leitura_carimbos').insert(ganhar.map((c) => ({ tenant_id: tenantId, modulo_id: moduloId, estudante_id: estudanteId, carimbo_id: c.id })))
    if (error && !/duplicate|unique/i.test(error.message)) return []
    return ganhar.map((c) => c.id)
  } catch {
    return []
  }
}

/**
 * Avalia e concede as CONQUISTAS PRÓPRIAS do módulo que o aluno passou a merecer (idempotente). Usa a
 * tabela GLOBAL simulado_conquista_desbloqueios (o id da conquista é único no tenant), então ela entra
 * na mesma coleção de conquistas do aluno. Concede XP só quando a gamificação está ativa. Best-effort.
 */
export async function avaliarConquistasModulo(svc: any, tenantId: string, moduloId: string, estudanteId: string): Promise<string[]> {
  try {
    const { data: pasta } = await svc.from('simulado_pastas').select('conquistas_def').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
    const defs = normalizarConquistasModulo((pasta as any)?.conquistas_def)
    if (!defs.length) return []

    const ids = defs.map((d) => d.id)
    const { data: jaRows } = await svc.from('simulado_conquista_desbloqueios').select('conquista_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('conquista_id', ids)
    const ja = new Set<string>((jaRows ?? []).map((r: any) => r.conquista_id))
    const faltam = defs.filter((d) => !ja.has(d.id))
    if (!faltam.length) return []

    const prog = await progressoModuloAluno(svc, tenantId, moduloId, estudanteId)
    const ganhar = faltam.filter((d) => cumpre(d.condicao, prog))
    if (!ganhar.length) return []

    const { data: ins } = await svc.from('simulado_conquista_desbloqueios')
      .upsert(ganhar.map((d) => ({ tenant_id: tenantId, estudante_id: estudanteId, conquista_id: d.id })), { onConflict: 'tenant_id,estudante_id,conquista_id', ignoreDuplicates: true })
      .select('conquista_id')
    const novos = new Set<string>((ins ?? []).map((r: any) => r.conquista_id))
    if (novos.size) {
      // XP só com a gamificação ligada (o desbloqueio em si é colecionável e independe dela).
      try {
        const cfg = await getGamConfig(svc, tenantId)
        if (cfg?.ativo) for (const d of ganhar) if (novos.has(d.id) && d.xp > 0) await awardXp(svc, { tenantId, estudanteId, origem: 'conquista', refId: d.id, xp: d.xp, meta: { conquista: d.id, modulo: moduloId } })
      } catch { /* tolerante */ }
    }
    return ganhar.filter((d) => novos.has(d.id)).map((d) => d.id)
  } catch {
    return []
  }
}

/** Award a partir de um DOCUMENTO (resolve o módulo). Chamado nas rotas de conclusão da leitura/quiz
 *  — funciona mesmo com a gamificação desligada (carimbo é colecionável da Leitura). Best-effort. */
export async function avaliarCarimbosPorDocumento(svc: any, tenantId: string | null, documentoId: string, estudanteId: string | null): Promise<string[]> {
  if (!tenantId || !estudanteId) return []
  try {
    const { data } = await svc.from('simulado_documentos').select('pasta_id').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
    const modulo = (data as any)?.pasta_id
    if (!modulo) return []
    return await avaliarCarimbos(svc, tenantId, modulo, estudanteId)
  } catch { return [] }
}

/** Award unificado (carimbos + conquistas) direto pelo MÓDULO. Chamado ao ABRIR o módulo no portal do
 *  aluno → concede retroativamente a quem já cumpriu a condição ANTES de o carimbo existir (o hook de
 *  conclusão só dispara em novas conclusões). Best-effort — nunca lança. */
export async function avaliarMedalhasModulo(svc: any, tenantId: string | null, moduloId: string | null, estudanteId: string | null): Promise<void> {
  if (!tenantId || !moduloId || !estudanteId) return
  try {
    await Promise.all([
      avaliarCarimbos(svc, tenantId, moduloId, estudanteId),
      avaliarConquistasModulo(svc, tenantId, moduloId, estudanteId),
    ])
  } catch { /* tolerante */ }
}

/** Award unificado (carimbos + conquistas do módulo) a partir de um DOCUMENTO. Chamado nas rotas de
 *  conclusão da leitura/quiz. Best-effort — nunca lança. */
export async function avaliarMedalhasPorDocumento(svc: any, tenantId: string | null, documentoId: string, estudanteId: string | null): Promise<void> {
  if (!tenantId || !estudanteId) return
  try {
    const { data } = await svc.from('simulado_documentos').select('pasta_id').eq('id', documentoId).eq('tenant_id', tenantId).maybeSingle()
    const modulo = (data as any)?.pasta_id
    if (!modulo) return
    await Promise.all([
      avaliarCarimbos(svc, tenantId, modulo, estudanteId),
      avaliarConquistasModulo(svc, tenantId, modulo, estudanteId),
    ])
  } catch { /* tolerante */ }
}

export interface ModuloComConquistas { pastaId: string; nome: string; conquistas: ModuloConquistaDef[] }

/** Todas as conquistas de módulos de Leitura do tenant, agrupadas por módulo (para a área de
 *  gamificação exibi-las com etiqueta de origem). 1 query — barato e egress-safe. */
export async function listarConquistasModuloTenant(svc: any, tenantId: string): Promise<ModuloComConquistas[]> {
  try {
    const { data } = await svc.from('simulado_pastas').select('id, nome, conquistas_def').eq('tenant_id', tenantId).eq('folder_area', 'leitura').not('conquistas_def', 'is', null)
    return (data ?? [])
      .map((p: any) => ({ pastaId: p.id, nome: p.nome ?? 'Módulo', conquistas: normalizarConquistasModulo(p.conquistas_def) }))
      .filter((m: ModuloComConquistas) => m.conquistas.length > 0)
  } catch {
    return []
  }
}

export interface CarimboPerfil { def: CarimboDef; modulo: string; ganhoEm: string | null }

/** Todos os carimbos GANHOS pelo aluno, de TODOS os módulos de Leitura — para o registro no perfil
 *  (coleção estilo conquista). 2 queries, egress-safe. */
export async function carimbosGanhosDoAluno(svc: any, tenantId: string | null, estudanteId: string | null): Promise<CarimboPerfil[]> {
  if (!tenantId || !estudanteId) return []
  try {
    const [{ data: pastas }, { data: rows }] = await Promise.all([
      svc.from('simulado_pastas').select('id, nome, carimbos_def').eq('tenant_id', tenantId).eq('folder_area', 'leitura').not('carimbos_def', 'is', null),
      svc.from('simulado_leitura_carimbos').select('carimbo_id, modulo_id, ganho_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId),
    ])
    if (!pastas?.length || !rows?.length) return []
    const ganhos = new Map<string, string | null>((rows as any[]).map((r) => [`${r.modulo_id}:${r.carimbo_id}`, r.ganho_em]))
    const out: CarimboPerfil[] = []
    for (const p of pastas as any[]) {
      for (const def of normalizarCarimbos(p.carimbos_def)) {
        const key = `${p.id}:${def.id}`
        if (ganhos.has(key)) out.push({ def, modulo: p.nome ?? 'Módulo', ganhoEm: ganhos.get(key) ?? null })
      }
    }
    return out
  } catch {
    return []
  }
}

export interface ConquistaModuloAluno { def: ModuloConquistaDef; ganho: boolean; ganhoEm: string | null }

/** Conquistas próprias do módulo com flag de ganho + data (coleção no perfil do aluno). */
export async function conquistasModuloDoAluno(svc: any, tenantId: string, moduloId: string, estudanteId: string): Promise<ConquistaModuloAluno[]> {
  try {
    const { data: pasta } = await svc.from('simulado_pastas').select('conquistas_def').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
    const defs = normalizarConquistasModulo((pasta as any)?.conquistas_def)
    if (!defs.length) return []
    const { data: rows } = await svc.from('simulado_conquista_desbloqueios').select('conquista_id, desbloqueado_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('conquista_id', defs.map((d) => d.id))
    const ganhos = new Map<string, string>((rows ?? []).map((r: any) => [r.conquista_id, r.desbloqueado_em]))
    return defs.map((def) => ({ def, ganho: ganhos.has(def.id), ganhoEm: ganhos.get(def.id) ?? null }))
  } catch {
    return []
  }
}

export interface CarimboAluno { def: CarimboDef; ganho: boolean; ganhoEm: string | null }

/** Carimbos do módulo com flag de ganho + data (para exibir no perfil do aluno). */
export async function carimbosDoAluno(svc: any, tenantId: string, moduloId: string, estudanteId: string): Promise<CarimboAluno[]> {
  try {
    const { data: pasta } = await svc.from('simulado_pastas').select('carimbos_def').eq('id', moduloId).eq('tenant_id', tenantId).maybeSingle()
    const defs = normalizarCarimbos((pasta as any)?.carimbos_def)
    if (!defs.length) return []
    const { data: rows } = await svc.from('simulado_leitura_carimbos').select('carimbo_id, ganho_em').eq('tenant_id', tenantId).eq('modulo_id', moduloId).eq('estudante_id', estudanteId)
    const ganhos = new Map<string, string>((rows ?? []).map((r: any) => [r.carimbo_id, r.ganho_em]))
    return defs.map((def) => ({ def, ganho: ganhos.has(def.id), ganhoEm: ganhos.get(def.id) ?? null }))
  } catch {
    return []
  }
}

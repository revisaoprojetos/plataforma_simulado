'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { brtLocalParaIso } from '@/lib/brt'

interface SimuladoData {
  titulo: string
  descricao?: string
  modo_aplicacao: string
  data_inicio?: string
  data_fim?: string
  tempo_limite_min?: number
  metodo_identificacao?: string
  embed_ativo?: boolean
  regras?: Record<string, unknown>
  status?: string
  /** Questões selecionadas (dos bancos) para já compor a prova na criação. */
  questaoIds?: string[]
  /** Banco base (pasta) do qual herdar estudantes/config — o banco é o pré-preparatório. */
  bancoBaseId?: string
  /** Estudantes escolhidos manualmente para matricular (modo "criar do zero"). */
  estudanteIds?: string[]
}

export async function createSimuladoAction(data: SimuladoData) {
  if (!(await checkPermission('simulados:create'))) return { error: 'Você não tem permissão para criar simulados.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido. Verifique o acesso.' }

  const supabase = await createClient()

  const { data: simulado, error } = await supabase
    .from('simulado_simulados')
    .insert({
      tenant_id: tenantId,
      titulo: data.titulo,
      descricao: data.descricao || null,
      modo_aplicacao: data.modo_aplicacao,
      // Datas informadas em horário de Brasília → gravadas em UTC.
      data_inicio: brtLocalParaIso(data.data_inicio),
      data_fim: brtLocalParaIso(data.data_fim),
      tempo_limite_min: data.tempo_limite_min || null,
      metodo_identificacao: data.metodo_identificacao || null,
      embed_ativo: data.embed_ativo ?? false,
      regras: data.bancoBaseId ? { ...(data.regras ?? {}), banco_base_id: data.bancoBaseId } : (data.regras ?? {}),
      status: 'rascunho',
      // A coluna created_at não tem default no banco migrado — seta explícito (senão vem null → "1969").
      created_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  // Compõe a prova com as questões escolhidas (dos bancos), na ordem selecionada.
  const ids = [...new Set((data.questaoIds ?? []).filter(Boolean))]
  if (ids.length) {
    await supabase.from('simulado_prova_questoes').insert(
      ids.map((questao_id, i) => ({ tenant_id: tenantId, simulado_id: simulado.id, questao_id, ordem: i })),
    )
  }

  // Matricula os estudantes: herdados do banco base + escolhidos manualmente + TODOS os passaportes.
  let herdados = 0
  {
    const svc = await createServiceClient()
    const aMatricular = new Set<string>((data.estudanteIds ?? []).filter(Boolean))
    if (data.bancoBaseId) {
      const { data: alunos } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', data.bancoBaseId).eq('tenant_id', tenantId)
      for (const a of (alunos ?? []) as any[]) if (a.estudante_id) aMatricular.add(a.estudante_id)
    }
    // Passaporte entra em TODO simulado criado (aparece em relatórios/ranking; a regra de acesso vale por cima).
    const passaportes = await fetchAll<{ id: string }>(() =>
      svc.from('simulado_estudantes').select('id').eq('tenant_id', tenantId).eq('classificacao', 'passaporte').eq('deletado', false).order('id', { ascending: true }))
    for (const p of passaportes) aMatricular.add(p.id)

    const estIds = [...aMatricular]
    if (estIds.length) {
      const { data: ja } = await svc.from('simulado_matriculas').select('estudante_id').eq('simulado_id', simulado.id).in('estudante_id', estIds)
      const jaSet = new Set((ja ?? []).map((m: any) => m.estudante_id))
      const novos = estIds.filter((e) => !jaSet.has(e))
      for (let i = 0; i < novos.length; i += 500) {
        const lote = novos.slice(i, i + 500)
        await svc.from('simulado_matriculas').insert(lote.map((estudante_id) => ({ tenant_id: tenantId, estudante_id, simulado_id: simulado.id, liberado: true })))
      }
      herdados = novos.length
    }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_simulados', entidadeId: simulado.id, depois: { ...simulado, questoes: ids.length, estudantes_matriculados: herdados } })

  revalidatePath('/admin/simulados')
  redirect(`/admin/simulados/${simulado.id}`)
}

export async function updateSimuladoAction(id: string, data: SimuladoData) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Você não tem permissão para editar simulados.' }
  const tenantId = await getCurrentTenantId()
  // Admin client (service role) + escopo por tenant manual: evita o UPDATE ser NEGADO
  // silenciosamente pela RLS (0 linhas, sem erro) e permite validar/auditar de verdade.
  const svc = createAdminClient()

  const { data: antes } = await svc.from('simulado_simulados').select('*').eq('id', id).maybeSingle()
  if (!antes) return { error: 'Simulado não encontrado.' }
  if (tenantId && (antes as any).tenant_id && (antes as any).tenant_id !== tenantId) return { error: 'Você não tem acesso a este simulado.' }

  // MERGE das regras: o form envia só as chaves do schema; preserva as demais já salvas
  // (banco_base_id, caderno_id, liberações manuais de nota/gabarito/caderno etc.).
  const regrasMescladas = { ...((antes as any).regras ?? {}), ...(data.regras ?? {}) }

  const patch = {
    titulo: data.titulo,
    descricao: data.descricao || null,
    modo_aplicacao: data.modo_aplicacao,
    // Datas informadas em horário de Brasília → gravadas em UTC.
    data_inicio: brtLocalParaIso(data.data_inicio),
    data_fim: brtLocalParaIso(data.data_fim),
    tempo_limite_min: data.tempo_limite_min || null,
    metodo_identificacao: data.metodo_identificacao || null,
    embed_ativo: data.embed_ativo ?? false,
    regras: regrasMescladas,
  }

  const { data: upd, error } = await svc.from('simulado_simulados').update(patch).eq('id', id).select('id')
  if (error) return { error: error.message }
  if (!upd?.length) return { error: 'Nada foi salvo — verifique seu acesso a este simulado.' }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_simulados', entidadeId: id, antes, depois: { ...antes, ...patch } })

  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
  return { ok: true }
}

export interface EstudanteLinkado {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  telefone: string | null
  classificacao: string
  liberado: boolean
  situacao: 'finalizou' | 'em_andamento' | 'nao_iniciou'
  nota: number | null
}

/**
 * Lista TODOS os estudantes matriculados (linkados) em um simulado, com a situação
 * de cada um (finalizou / em andamento / não iniciou) e a nota. Carregado sob demanda
 * pela aba "Estudantes" — pode ter milhares de linhas (passaportes), por isso usa
 * fetchAll para não truncar no teto de 1000 do PostgREST.
 */
export async function listarEstudantesSimulado(simuladoId: string): Promise<{ ok?: boolean; error?: string; estudantes?: EstudanteLinkado[] }> {
  if (!(await checkPermission('simulados:view'))) return { error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: sim } = await svc.from('simulado_simulados').select('tenant_id').eq('id', simuladoId).maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  if (tenantId && (sim as any).tenant_id && (sim as any).tenant_id !== tenantId) return { error: 'Sem acesso a este simulado.' }
  const tid = tenantId ?? (sim as any).tenant_id

  // Tudo em paralelo. Em vez de buscar estudantes por lotes de ids (dezenas de idas
  // ao banco quando há milhares de passaportes), varremos os estudantes do tenant
  // paginados (poucas páginas) e cruzamos em memória com as matrículas — bem mais rápido.
  const [matriculas, estRows, sessRows] = await Promise.all([
    fetchAll<{ estudante_id: string; liberado: boolean }>(() =>
      svc.from('simulado_matriculas').select('estudante_id, liberado').eq('simulado_id', simuladoId).order('estudante_id')),
    fetchAll<any>(() =>
      svc.from('simulado_estudantes').select('id, nome, email, cpf, telefone, classificacao').eq('tenant_id', tid).eq('deletado', false).order('id')),
    fetchAll<any>(() =>
      svc.from('simulado_sessoes_prova').select('estudante_id, status, nota').eq('simulado_id', simuladoId).eq('deletado', false).order('estudante_id')),
  ])
  const estIds = [...new Set(matriculas.map((m) => m.estudante_id).filter(Boolean))]
  if (!estIds.length) return { ok: true, estudantes: [] }

  const libPorEst = new Map(matriculas.map((m) => [m.estudante_id, m.liberado]))
  const estMap = new Map(estRows.map((e: any) => [e.id, e]))
  const sessPorEst = new Map<string, any[]>()
  for (const s of sessRows) {
    const arr = sessPorEst.get(s.estudante_id) ?? []
    arr.push(s)
    sessPorEst.set(s.estudante_id, arr)
  }

  const estudantes: EstudanteLinkado[] = estIds.map((eid) => {
    const e = estMap.get(eid) ?? {}
    const ss = sessPorEst.get(eid) ?? []
    const fin = ss.find((x) => x.status === 'finalizada')
    const emand = ss.some((x) => x.status !== 'finalizada')
    const situacao: EstudanteLinkado['situacao'] = fin ? 'finalizou' : emand ? 'em_andamento' : 'nao_iniciou'
    return {
      id: eid,
      nome: e.nome ?? 'Estudante',
      email: e.email ?? null,
      cpf: e.cpf ?? null,
      telefone: e.telefone ?? null,
      classificacao: e.classificacao ?? 'normal',
      liberado: !!libPorEst.get(eid),
      situacao,
      nota: fin?.nota ?? null,
    }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return { ok: true, estudantes }
}

export interface SessaoLinkada {
  id: string
  estudante: string
  status: string
  nota: number | null
  iniciado_em: string | null
  finalizado_em: string | null
  is_teste: boolean
}

/**
 * Lista TODAS as sessões de prova de um simulado, com o nome do estudante. Carregado
 * sob demanda pela aba "Sessões" — usa fetchAll (pode passar de 1000 num simulado grande).
 */
export async function listarSessoesSimulado(simuladoId: string): Promise<{ ok?: boolean; error?: string; sessoes?: SessaoLinkada[] }> {
  if (!(await checkPermission('simulados:view'))) return { error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: sim } = await svc.from('simulado_simulados').select('tenant_id').eq('id', simuladoId).maybeSingle()
  if (!sim) return { error: 'Simulado não encontrado.' }
  if (tenantId && (sim as any).tenant_id && (sim as any).tenant_id !== tenantId) return { error: 'Sem acesso a este simulado.' }
  const tid = tenantId ?? (sim as any).tenant_id

  const [sessRows, estRows] = await Promise.all([
    fetchAll<any>(() =>
      svc.from('simulado_sessoes_prova').select('id, estudante_id, status, nota, iniciado_em, finalizado_em, is_teste').eq('simulado_id', simuladoId).eq('deletado', false).order('iniciado_em', { ascending: false })),
    fetchAll<any>(() =>
      svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', tid).order('id')),
  ])
  const nomeMap = new Map(estRows.map((e: any) => [e.id, e.nome ?? 'Estudante']))

  const sessoes: SessaoLinkada[] = sessRows.map((s: any) => ({
    id: s.id,
    estudante: nomeMap.get(s.estudante_id) ?? 'Estudante',
    status: s.status ?? 'aguardando',
    nota: s.nota ?? null,
    iniciado_em: s.iniciado_em ?? null,
    finalizado_em: s.finalizado_em ?? null,
    is_teste: !!s.is_teste,
  }))

  return { ok: true, sessoes }
}

/** Vincula (ou desvincula) explicitamente um caderno de design ao simulado — define o tema/HUD aplicado. */
export async function vincularCadernoSimulado(simuladoId: string, cadernoId: string | null) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const { data: sim } = await supabase.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
  const regras: Record<string, unknown> = { ...((sim?.regras as Record<string, unknown>) ?? {}) }
  if (cadernoId) regras.caderno_id = cadernoId
  else delete regras.caderno_id
  const { error } = await supabase.from('simulado_simulados').update({ regras }).eq('id', simuladoId)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_simulados', entidadeId: simuladoId, depois: { caderno_id: cadernoId } })
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function addQuestaoToSimulado(simuladoId: string, questaoId: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { error: 'Tenant não resolvido.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('simulado_prova_questoes')
    .select('*', { count: 'exact', head: true })
    .eq('simulado_id', simuladoId)

  const { error } = await supabase.from('simulado_prova_questoes').insert({
    tenant_id: tenantId,
    simulado_id: simuladoId,
    questao_id: questaoId,
    ordem: count ?? 0,
  })

  if (error) return { error: error.message }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

export async function removeQuestaoFromSimulado(simuladoQuestaoId: string, simuladoId: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('simulado_prova_questoes')
    .delete()
    .eq('id', simuladoQuestaoId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true }
}

/**
 * Monta o patch de publicação: gera embed_token se faltar (sem ele o aluno não abre a prova)
 * e carimba `regras.publicado_em` = agora (usado pela fita "novo" no portal do aluno).
 */
async function patchPublicar(supabase: any, id: string): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('simulado_simulados').select('embed_token, regras').eq('id', id).maybeSingle()
  const regras = { ...((data?.regras as Record<string, unknown>) ?? {}), publicado_em: new Date().toISOString() }
  const patch: Record<string, unknown> = { status: 'publicado', regras }
  if (!data?.embed_token) patch.embed_token = crypto.randomUUID()
  return patch
}

export async function publishSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const patch = await patchPublicar(supabase, id)
  await supabase.from('simulado_simulados').update(patch).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function encerrarSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  await supabase.from('simulado_simulados').update({ status: 'encerrado' }).eq('id', id)
  await registrarAudit({ operacao: 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'encerrado' } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

export async function reabrirSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const supabase = await createClient()
  const patch = await patchPublicar(supabase, id)
  await supabase.from('simulado_simulados').update(patch).eq('id', id)
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_simulados', entidadeId: id, depois: { status: 'publicado', reaberto: true } })
  revalidatePath(`/admin/simulados/${id}`)
  revalidatePath('/admin/simulados')
}

/** Libera (ou bloqueia) manualmente um item do simulado (nota, gabarito ou caderno). */
export async function liberarItemAction(id: string, item: 'nota' | 'gabarito' | 'caderno', liberado: boolean) {
  if (!(await checkPermission('simulados:update'))) return { error: 'Sem permissão.' }
  const flag = { nota: 'nota_liberada', gabarito: 'gabarito_liberado', caderno: 'caderno_liberado' }[item]
  const supabase = await createClient()
  const { data: s } = await supabase.from('simulado_simulados').select('regras').eq('id', id).maybeSingle()
  const regras = { ...(((s?.regras as Record<string, unknown>) ?? {})), [flag]: liberado }
  await supabase.from('simulado_simulados').update({ regras }).eq('id', id)
  await registrarAudit({ operacao: liberado ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_simulados', entidadeId: id, depois: { [flag]: liberado } })
  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
}

/** Libera (ou bloqueia) manualmente o gabarito do simulado — grava regras.gabarito_liberado. */
export async function liberarGabaritoAction(id: string, liberado: boolean) {
  return liberarItemAction(id, 'gabarito', liberado)
}

export async function deleteSimuladoAction(id: string) {
  if (!(await checkPermission('simulados:delete'))) return { error: 'Você não tem permissão para excluir simulados.' }
  // Soft delete: vai para a Lixeira (recuperável); sessões/prova_questoes ficam preservadas.
  const { error } = await softDelete('simulado_simulados', id)
  if (error) return { error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_simulados', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/simulados')
  return { ok: true }
}

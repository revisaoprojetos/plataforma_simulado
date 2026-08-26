'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { hospedarBase64 } from '@/lib/storage/hospedar-base64'
import { softDelete } from '@/lib/soft-delete'
import { tipoEhCertoErrado, alternativasSaoCertoErrado } from '@/lib/simulado/formato'
import { executarRecorrecao, contarSessoesRecorrecao, type RecorrecaoJob } from '@/lib/simulado/recorrecao'
import { enfileirarRecorrecao } from '@/lib/queue/recorrecao-queue'
import type { AnaliseImport, QuestaoImport, AltImport, ResultadoImport } from './import-types'
import type { HudCores, HudPorPagina } from '@/lib/caderno-designer/types'

async function guard() {
  if (!(await checkPermission('questoes:view'))) {
    return { ok: false as const, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/**
 * Propaga a anulação marcada no BANCO (`simulado_questoes.anulada`) para TODOS os simulados que
 * usam a questão: dispara uma re-correção (anulacao, política pontua_todos) por (simulado, questão).
 * pontua_todos só ADICIONA ponto (ninguém perde nota). Igual ao botão "Anular" do admin: ≤ SYNC_MAX
 * sessões roda inline; acima, vai para a fila (worker) — sem fila, cai para inline.
 */
async function propagarAnulacaoBanco(svc: ReturnType<typeof createAdminClient>, tenantId: string, atorId: string | null, questaoIds: string[]): Promise<void> {
  const SYNC_MAX = Number(process.env.RECORRECAO_SYNC_MAX ?? 200)
  for (const questaoId of questaoIds) {
    const { data: pqs } = await svc
      .from('simulado_prova_questoes')
      .select('simulado_id')
      .eq('tenant_id', tenantId)
      .eq('questao_id', questaoId)
      .not('anulada', 'is', true) // pula os que já estão anulados naquele simulado
    const simuladoIds = [...new Set(((pqs ?? []) as any[]).map((r) => r.simulado_id as string))]
    for (const simuladoId of simuladoIds) {
      const job: RecorrecaoJob = { tipo: 'anulacao', tenantId, atorId, simuladoId, questaoId, motivo: 'Anulada na importação da planilha', politica: 'pontua_todos' }
      const n = await contarSessoesRecorrecao(svc, simuladoId, tenantId).catch(() => 0)
      if (n <= SYNC_MAX) { await executarRecorrecao(svc, job); continue }
      try { await enfileirarRecorrecao(job) } catch { await executarRecorrecao(svc, job) }
    }
  }
}

/** Cria um banco (pasta) de questões. `paiId` = pasta (folder) onde ele nasce (null = raiz). */
export async function criarBanco(nome: string, tipo: string = 'objetiva', paiId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const tp = tipo === 'discursiva' ? 'discursiva' : 'objetiva'

  const svc = createAdminClient()
  // Nasce DENTRO da pasta atual (pai_id) quando aberto de dentro de uma. Tolerante: se `tipo` ou
  // `pai_id` ainda não foram migrados, remove só a coluna que faltar e tenta de novo.
  const base: Record<string, unknown> = { tenant_id: g.tenantId, nome: titulo, tipo: tp }
  if (paiId) base.pai_id = paiId
  let ins = await svc.from('simulado_pastas').insert(base).select('id').single()
  if (ins.error && /tipo/i.test(ins.error.message) && 'tipo' in base) { delete base.tipo; ins = await svc.from('simulado_pastas').insert(base).select('id').single() }
  if (ins.error && /pai_id/i.test(ins.error.message) && 'pai_id' in base) { delete base.pai_id; ins = await svc.from('simulado_pastas').insert(base).select('id').single() }
  const { data, error } = ins
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar' }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, tipo: tp } })

  // (Removido a pedido) o banco NÃO vincula mais o grupo "Passaporte" automaticamente na criação.
  // Se quiser dar acesso aos passaportes, vincule o grupo manualmente pelo banco.

  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: data.id }
}

// ───────────────────────── Pastas (folders) de bancos ─────────────────────────

/** Cria uma PASTA (folder) para organizar bancos OU simulados. `area` separa onde ela aparece
 * ('banco' = Banco de Simulado, 'simulado' = Aplicação de Simulado). */
export async function criarPastaFolder(nome: string, paiId?: string | null, area?: 'banco' | 'simulado' | 'caderno'): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const base = { tenant_id: g.tenantId, nome: titulo, is_folder: true, pai_id: paiId ?? null }
  let { data, error } = await svc.from('simulado_pastas').insert({ ...base, folder_area: area ?? 'banco' }).select('id').single()
  // Tolerante: se folder_area ainda não foi migrada, cria sem ela.
  if (error && /folder_area/i.test(error.message)) {
    ;({ data, error } = await svc.from('simulado_pastas').insert(base).select('id').single())
  }
  if (error || !data) {
    if (error && /is_folder|pai_id|column/i.test(error.message)) return { ok: false, error: 'Recurso de pastas indisponível: rode a migration banco_pastas_folder (pai_id + is_folder) no banco.' }
    return { ok: false, error: error?.message ?? 'Erro ao criar pasta.' }
  }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, pasta: true, area: area ?? 'banco' } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath('/admin/simulados')
  return { ok: true, id: data.id }
}

/** Move um banco para dentro de uma pasta (ou para a raiz quando paiId = null). */
export async function moverBancoParaPasta(bancoId: string, paiId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ pai_id: paiId }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) {
    if (/pai_id|column/i.test(error.message)) return { ok: false, error: 'Recurso de pastas indisponível: rode a migration banco_pastas_folder (pai_id) no banco.' }
    return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { pai_id: paiId } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true }
}

/** Exclui uma PASTA (folder): solta o que está dentro (bancos via pai_id, simulados via pasta_id —
 * voltam à raiz, não são apagados) e remove a pasta. */
export async function excluirPastaFolder(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  try { await svc.from('simulado_pastas').update({ pai_id: null }).eq('pai_id', id).eq('tenant_id', g.tenantId) } catch { /* coluna pode não existir */ }
  try { await svc.from('simulado_simulados').update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* coluna pode não existir */ }
  try { await svc.from('simulado_cadernos_designer').update({ pasta_id: null }).eq('pasta_id', id).eq('tenant_id', g.tenantId) } catch { /* coluna pode não existir */ }
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true, pasta: true } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath('/admin/simulados')
  return { ok: true }
}

/** Renomeia um banco. */
export async function renomearBanco(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath(`/admin/banco-questoes/${id}`)
  return { ok: true }
}

/** Atualiza nome + personalização (cor/ícone/capa + imagem do card) de um banco. Tolerante caso as colunas não existam. */
export async function atualizarBanco(id: string, nome: string, cor: string | null, icone: string | null, capaUrl?: string | null, capaCardUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  // Capas vêm como base64 (redimensionar → toDataURL) → storage; grava só a URL (não infla a linha).
  const capa = capaUrl ? (await hospedarBase64(capaUrl, svc)) : null
  const capaCard = capaCardUrl ? (await hospedarBase64(capaCardUrl, svc)) : null
  const upd = (patch: Record<string, unknown>) => svc.from('simulado_pastas').update(patch).eq('id', id).eq('tenant_id', g.tenantId)
  const completo = { nome: titulo, cor: cor || null, icone: icone || null, capa_url: capa || null, capa_card_url: capaCard || null }

  let { error } = await upd(completo)
  // Fallback 1: coluna capa_card_url ainda não migrada → salva o resto (cor/ícone/capa preservados).
  if (error && /capa_card_url/i.test(error.message)) {
    const { capa_card_url, ...semCard } = completo
    ;({ error } = await upd(semCard))
  }
  // Fallback 2: outras colunas de personalização ausentes → salva só o nome.
  if (error && /cor|icone|capa_url|column/i.test(error.message)) {
    ;({ error } = await upd({ nome: titulo }))
  }
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo, cor, icone, capa: !!capaUrl, capaCard: !!capaCardUrl } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath(`/admin/banco-questoes/${id}`)
  return { ok: true }
}

/**
 * Cópia LITERAL de um banco: todos os campos (cor/ícone/capa/capa do card/tipo/grupos/ordem…),
 * as questões, os estudantes vinculados, os grupos vinculados e o caderno associado (cópia
 * INDEPENDENTE, com config.bancoId apontando pro banco novo). Retorna o id novo (ou null).
 * `opts.nome`/`opts.paiId` sobrescrevem nome/pasta; senão herdam do original. Reusável.
 */
async function copiarBanco(svc: ReturnType<typeof createAdminClient>, tenantId: string, origId: string, opts: { nome?: string; paiId?: string | null } = {}): Promise<string | null> {
  const { data: orig } = await svc.from('simulado_pastas').select('*').eq('id', origId).eq('tenant_id', tenantId).maybeSingle()
  if (!orig) return null
  const o = orig as any
  // Exclui id, timestamps, flags de exclusão e auditoria (caso existam) e caderno_id (tratado à parte).
  const { id: _i, created_at: _c, criado_em: _cc, atualizado_em: _a, updated_at: _u, deletado: _d, deletado_em: _de, deletado_por: _dp, criado_por: _cp, atualizado_por: _ap, caderno_id: origCadernoId, ...rest } = o
  const insBase: Record<string, unknown> = { ...rest }
  if (opts.nome !== undefined) insBase.nome = opts.nome
  if (opts.paiId !== undefined) insBase.pai_id = opts.paiId
  // Insere a cópia; se alguma coluna ainda não existir no banco, remove SÓ ela e tenta de novo.
  let ins = await svc.from('simulado_pastas').insert(insBase).select('id').single()
  for (let t = 0; t < 8 && ins.error; t++) {
    const col = colFaltante(ins.error.message)
    if (col && col in insBase && col !== 'tenant_id' && col !== 'nome') { delete insBase[col]; ins = await svc.from('simulado_pastas').insert(insBase).select('id').single(); continue }
    break
  }
  const novoId = ins.data?.id as string | undefined
  if (!novoId) return null

  // Questões (paginado — banco pode ter >1000 vínculos).
  const qs = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', origId).eq('tenant_id', tenantId).order('questao_id', { ascending: true }))
  for (let i = 0; i < qs.length; i += 500) await svc.from('simulado_questao_pasta').insert(qs.slice(i, i + 500).map((v) => ({ tenant_id: tenantId, pasta_id: novoId, questao_id: v.questao_id })))

  // Estudantes vinculados (paginado).
  const es = await fetchAll<{ estudante_id: string }>(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', origId).eq('tenant_id', tenantId).order('estudante_id', { ascending: true }))
  for (let i = 0; i < es.length; i += 500) await svc.from('simulado_pasta_estudantes').insert(es.slice(i, i + 500).map((v) => ({ tenant_id: tenantId, pasta_id: novoId, estudante_id: v.estudante_id })))

  // Grupos vinculados (herança de acesso) — tolerante.
  try {
    const { data: gr } = await svc.from('simulado_pasta_grupos').select('grupo_id').eq('pasta_id', origId).eq('tenant_id', tenantId)
    if (gr?.length) await svc.from('simulado_pasta_grupos').insert(gr.map((x: any) => ({ tenant_id: tenantId, pasta_id: novoId, grupo_id: x.grupo_id })))
  } catch { /* tabela pode não existir */ }

  // Caderno associado: cópia INDEPENDENTE (config.bancoId → banco novo). Fallback: liga o mesmo.
  if (origCadernoId) {
    let novoCadId: string | null = null
    try {
      const { data: cad } = await svc.from('simulado_cadernos_designer').select('nome, config').eq('id', origCadernoId).eq('tenant_id', tenantId).maybeSingle()
      if (cad) {
        const cfg = { ...(((cad as any).config) ?? {}), bancoId: novoId }
        const { data: nc } = await svc.from('simulado_cadernos_designer').insert({ tenant_id: tenantId, nome: `${(cad as any).nome} (cópia)`, config: cfg }).select('id').single()
        novoCadId = nc?.id ?? null
      }
    } catch { /* best-effort */ }
    try { await svc.from('simulado_pastas').update({ caderno_id: novoCadId ?? origCadernoId }).eq('id', novoId).eq('tenant_id', tenantId) } catch { /* coluna pode não existir */ }
  }
  return novoId
}

/** Duplica um banco: CÓPIA LITERAL (campos, questões, estudantes, grupos e caderno) na MESMA pasta. */
export async function duplicarBanco(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_pastas').select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Banco não encontrado.' }
  const novoId = await copiarBanco(svc, g.tenantId, id, { nome: `${(orig as any).nome} (cópia)` })
  if (!novoId) return { ok: false, error: 'Erro ao duplicar.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: novoId, depois: { copia_de: id } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: novoId }
}

/** Duplica uma PASTA (folder): copia a pasta (campos/capa) E faz cópia LITERAL de todos os bancos dentro. */
export async function duplicarPastaFolder(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_pastas').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Pasta não encontrada.' }
  const o = orig as any
  const { id: _i, created_at: _c, criado_em: _cc, atualizado_em: _a, updated_at: _u, deletado: _d, deletado_em: _de, deletado_por: _dp, criado_por: _cp, atualizado_por: _ap, caderno_id: _cad, ...rest } = o
  const insBase: Record<string, unknown> = { ...rest, nome: `${o.nome} (cópia)` }
  let ins = await svc.from('simulado_pastas').insert(insBase).select('id').single()
  for (let t = 0; t < 8 && ins.error; t++) {
    const col = colFaltante(ins.error.message)
    if (col && col in insBase && col !== 'tenant_id' && col !== 'nome') { delete insBase[col]; ins = await svc.from('simulado_pastas').insert(insBase).select('id').single(); continue }
    break
  }
  const novoFolderId = ins.data?.id as string | undefined
  if (!novoFolderId) return { ok: false, error: ins.error?.message ?? 'Erro ao duplicar a pasta.' }
  // Copia (literal) cada banco de dentro para a nova pasta (nível único → filhos são bancos).
  const { data: dentro } = await svc.from('simulado_pastas').select('id').eq('pai_id', id).eq('tenant_id', g.tenantId).eq('deletado', false)
  for (const b of dentro ?? []) await copiarBanco(svc, g.tenantId, (b as any).id, { paiId: novoFolderId })
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: novoFolderId, depois: { copia_de: id, pasta: true, bancos: (dentro ?? []).length } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: novoFolderId }
}

/** Exclui um banco (e seus vínculos com questões — as questões NÃO são apagadas). */
export async function excluirBanco(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  // Soft delete: o banco vai para a Lixeira. Mantemos os vínculos (questões/estudantes)
  // para que a restauração traga o banco completo de volta.
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true }
}

/** Adiciona questões a um banco (ignora as que já estão nele). */
export async function adicionarQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; adicionadas?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: false, error: 'Selecione ao menos uma questão.' }

  const svc = createAdminClient()
  const { data: jaTem } = await svc
    .from('simulado_questao_pasta')
    .select('questao_id')
    .eq('pasta_id', bancoId)
    .in('questao_id', questaoIds)
  const existentes = new Set((jaTem ?? []).map((r: any) => r.questao_id))
  const novas = questaoIds.filter((q) => !existentes.has(q))
  if (!novas.length) return { ok: true, adicionadas: 0 }

  const { error } = await svc
    .from('simulado_questao_pasta')
    .insert(novas.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id })))
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { questoes_adicionadas: novas.length } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, adicionadas: novas.length }
}

export type QuestaoBancoBuscaItem = {
  id: string; external_id: string | null; enunciado: string; tipo: string
  nivel_dificuldade: string | null; disciplina: string | null; assunto: string | null
}
export type FiltrosBuscaBanco = { busca?: string; disciplinaId?: string; dificuldade?: string; tipo?: string }

/**
 * Busca questões do tenant que NÃO estão no banco (para o pop-up "Adicionar questões"), server-side
 * e limitada. Antes a página carregava 500 questões no load — bancos grandes perdiam o resto.
 * Filtra por enunciado/código, disciplina (id), dificuldade e tipo direto no banco.
 */
export async function buscarQuestoesForaBanco(bancoId: string, filtros: FiltrosBuscaBanco = {}, limite = 40): Promise<{ ok: boolean; itens?: QuestaoBancoBuscaItem[]; error?: string }> {
  const g = await guard()
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const jaNo = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', g.tenantId).order('questao_id', { ascending: true }))
  const noSet = new Set(jaNo.map((r) => r.questao_id))
  const safe = (filtros.busca ?? '').replace(/[,()%*]/g, ' ').trim()
  let q = svc.from('simulado_questoes')
    .select('id, external_id, enunciado, tipo, nivel_dificuldade, disciplina_id, disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
    .eq('tenant_id', g.tenantId).eq('deletado', false)
  if (filtros.disciplinaId && filtros.disciplinaId !== 'all') q = q.eq('disciplina_id', filtros.disciplinaId)
  if (filtros.dificuldade && filtros.dificuldade !== 'all') q = q.eq('nivel_dificuldade', filtros.dificuldade)
  if (filtros.tipo && filtros.tipo !== 'all') q = q.eq('tipo', filtros.tipo)
  if (safe) q = q.or(`enunciado.ilike.%${safe}%,external_id.ilike.%${safe}%`)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(Math.min(200, Math.max(limite * 4, 80)))
  if (error) return { ok: false, error: error.message }
  const itens = (data ?? []).filter((r: any) => !noSet.has(r.id)).slice(0, limite).map((r: any) => ({
    id: r.id, external_id: r.external_id ?? null, enunciado: r.enunciado ?? '', tipo: r.tipo,
    nivel_dificuldade: r.nivel_dificuldade ?? null, disciplina: r.disciplinas?.nome ?? null, assunto: r.assuntos?.nome ?? null,
  }))
  return { ok: true, itens }
}

/** Disciplinas do tenant (id + nome) para o filtro do pop-up — tabela pequena, carga leve. */
export async function listarDisciplinasFiltro(): Promise<{ id: string; nome: string }[]> {
  const g = await guard()
  if (!g.ok) return []
  const svc = createAdminClient()
  const rows = await fetchAll<{ id: string; nome: string }>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', g.tenantId).order('nome', { ascending: true }))
  return rows.map((d) => ({ id: d.id, nome: d.nome ?? '—' }))
}

/** Detalhe de uma questão (enunciado + alternativas + comentários) para o expandir da tabela do
 * banco. Carregado SOB DEMANDA ao abrir a linha (bancos grandes não carregam tudo no load). */
export interface DetalheQuestao {
  enunciado: string
  comentario_professor: string | null
  tipo: string | null
  alternativas: { ordem: number; texto: string; correta: boolean; comentario: string | null; lei: string | null }[]
}
export async function carregarDetalheQuestao(questaoId: string): Promise<{ ok: boolean; detalhe?: DetalheQuestao; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const [{ data: q }, { data: alts }] = await Promise.all([
    svc.from('simulado_questoes').select('enunciado, comentario_professor, tipo').eq('id', questaoId).eq('tenant_id', g.tenantId).maybeSingle(),
    // Escopada por questao_id (que já é do tenant, validado pela query acima); evita gap de tenant_id nulo em alternativas antigas.
    svc.from('simulado_alternativas').select('ordem, texto, correta, comentario, lei').eq('questao_id', questaoId).order('ordem', { ascending: true }),
  ])
  if (!q) return { ok: false, error: 'Questão não encontrada.' }
  return {
    ok: true,
    detalhe: {
      enunciado: (q as any).enunciado ?? '',
      comentario_professor: (q as any).comentario_professor ?? null,
      tipo: (q as any).tipo ?? null,
      alternativas: (alts ?? []).map((a: any) => ({ ordem: a.ordem ?? 0, texto: a.texto ?? '', correta: !!a.correta, comentario: a.comentario ?? null, lei: a.lei ?? null })),
    },
  }
}

/** Remove várias questões de um banco de uma vez (as questões continuam existindo). */
export async function removerQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: true }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('tenant_id', g.tenantId)
    .in('questao_id', questaoIds)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/** Remove uma questão de um banco (a questão continua existindo). */
export async function removerQuestao(bancoId: string, questaoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

// ───────────────────────── Importação de questões ─────────────────────────

function norm(s: string) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function normEnun(s: string) {
  return norm(s).replace(/\s+/g, ' ')
}

/** Extrai o nome da coluna ausente de um erro do PostgREST/Postgres (para o insert tolerante). */
function colFaltante(msg?: string): string | null {
  if (!msg) return null
  return msg.match(/'([a-z0-9_]+)' column/i)?.[1] ?? msg.match(/column "?([a-z0-9_]+)"? does not exist/i)?.[1] ?? null
}

/** Mapeia um cabeçalho da planilha para o campo interno. */
function mapHeader(h: string): string | null {
  const n = norm(h).replace(/[\s_]+/g, '')
  if (['numero', 'num', 'no'].includes(n)) return 'numero'
  if (['enunciado', 'questao', 'pergunta'].includes(n)) return 'enunciado'
  if (n === 'tipo') return 'tipo'
  if (['disciplina', 'materia'].includes(n)) return 'disciplina'
  if (n === 'categoria') return 'categoria'
  if (['assuntoprincipal', 'assunto'].includes(n)) return 'assunto'
  if (['assuntodetalhe', 'assuntodetalhado', 'detalhe'].includes(n)) return 'assunto_detalhe'
  if (n === 'grupo') return 'grupo'
  if (['pilar1', 'pilarum'].includes(n)) return 'pilar_1'
  if (['pilar2', 'pilardois'].includes(n)) return 'pilar_2'
  if (n === 'banca') return 'banca'
  if (['orgao', 'orgaos'].includes(n)) return 'orgao'
  if (n === 'cargo') return 'cargo'
  if (n === 'ano') return 'ano'
  if (['dificuldade', 'nivel', 'niveldificuldade'].includes(n)) return 'dificuldade'
  if (['correta', 'gabarito', 'resposta', 'alternativacorreta', 'alternativascorretas'].includes(n)) return 'correta'
  if (['alternativasincorretas', 'incorretas', 'incorreta'].includes(n)) return 'incorretas'
  if (['etiqueta', 'etiquetas', 'tag', 'tags'].includes(n)) return 'etiquetas'
  const lei = n.match(/^lei([a-e])$/); if (lei) return 'lei_' + lei[1]
  const com = n.match(/^comentario([a-e])$/); if (com) return 'com_' + com[1]
  if (['comentario', 'comentariocompleto', 'comentarioprofessor', 'comentariodoprofessor', 'comentariogeral', 'gabaritocomentado', 'resolucao', 'comentarios'].includes(n)) return 'comentario'
  const m = n.match(/^(?:alternativa|alt)?([a-e])$/)
  if (m) return 'alt_' + m[1]
  return null
}

/** Parser CSV simples com suporte a aspas e delimitador , ou ; */
function parseCSV(txt: string): string[][] {
  const primeira = txt.split(/\r?\n/)[0] ?? ''
  const delim = primeira.split(';').length > primeira.split(',').length ? ';' : ','
  const linhas: string[][] = []
  let campo = '', linha: string[] = [], aspas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (aspas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else aspas = false }
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === delim) { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.map((l) => l.map((x) => x.trim()))
}

/** Lê o arquivo (.xlsx/.xls via exceljs, ou .csv/.txt) em uma matriz de células. */
async function lerLinhas(arquivo: File): Promise<string[][]> {
  const nome = (arquivo.name || '').toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await arquivo.arrayBuffer())
    const ws = wb.worksheets[0]
    const linhas: string[][] = []
    ws?.eachRow((row) => {
      const vals: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v: any = cell.value
        const s = v && typeof v === 'object' && 'text' in v ? v.text : v
        vals.push(s == null ? '' : String(s).trim())
      })
      linhas.push(vals)
    })
    return linhas
  }
  return parseCSV(await lerTextoCsv(arquivo))
}

/**
 * Lê o texto do CSV tolerando o encoding: UTF-8 (com ou sem BOM) ou, se os bytes
 * não forem UTF-8 válido (ex.: "CSV ANSI"/Windows-1252 exportado do Excel), refaz
 * a decodificação em Windows-1252. Evita cabeçalhos acentuados (Número, Nível,
 * Órgão, Comentário…) chegarem corrompidos e não serem reconhecidos.
 */
async function lerTextoCsv(arquivo: File): Promise<string> {
  const buf = new Uint8Array(await arquivo.arrayBuffer())
  // Remove BOM UTF-8, se houver.
  const bytes = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  // O caractere de substituição (�) indica bytes que não eram UTF-8 → tenta Windows-1252.
  if (utf8.includes('�')) {
    try { return new TextDecoder('windows-1252').decode(bytes) } catch { return utf8 }
  }
  return utf8
}

/** Constrói as questões a partir das linhas da planilha (1ª linha = cabeçalho). */
/**
 * Converte a convenção de formatação do curso (ex.: PGE/RS) para markdown padrão:
 *  `#texto#` → **negrito**, `_texto_` → *itálico*, `_#texto#_` → ***negrito+itálico***.
 * Ordem importa: o combinado primeiro. Lacunas `____` e `#`/`_` soltos são preservados.
 */
function converterMarcacao(s: string): string {
  if (!s) return s
  return s
    .replace(/_#([^#]+?)#_/g, '***$1***')          // negrito + itálico
    .replace(/#([^#\n]+?)#/g, '**$1**')             // negrito
    .replace(/(?<!_)_(?!_)([^_\n]+?)_(?!_)/g, '*$1*') // itálico (ignora lacunas ____ )
}

function montarQuestoes(linhas: string[][]): QuestaoImport[] {
  if (linhas.length < 2) return []
  const header = linhas[0].map(mapHeader)
  const letras = ['a', 'b', 'c', 'd', 'e']
  const out: QuestaoImport[] = []
  for (let r = 1; r < linhas.length; r++) {
    const row = linhas[r]
    if (!row.some((c) => c && c.trim())) continue
    const get = (campo: string) => { const idx = header.indexOf(campo); return idx >= 0 ? (row[idx] ?? '').trim() : '' }

    const enunciado = converterMarcacao(get('enunciado'))
    const tipoCell = get('tipo')
    const tipoRaw = norm(tipoCell)
    // Certo/Errado é uma OBJETIVA de 2 opções, marcada por formato — não é um tipo separado.
    const ehCE = tipoEhCertoErrado(tipoCell)
    const tipo: 'objetiva' | 'discursiva' = tipoRaw.startsWith('disc') ? 'discursiva' : 'objetiva'
    const difRaw = norm(get('dificuldade'))
    const dif = difRaw.startsWith('fac') ? 'facil' : difRaw.startsWith('dif') ? 'dificil' : difRaw.startsWith('med') ? 'medio' : null
    const anoNum = parseInt(get('ano'), 10)
    // Gabarito: aceita letra (A–E) OU "Certo"/"Errado" OU "ANULADA".
    const corretaNorm = norm(get('correta'))
    // "ANULADA"/"ANULAR" → questão anulada: ponto garantido a todos, sem alternativa correta.
    const anulada = corretaNorm.startsWith('anul')
    const corretaLetra = anulada ? '' : corretaNorm.replace(/[^a-e]/g, '').charAt(0)
    const corretaCE = anulada ? null : (corretaNorm.startsWith('cert') ? 'certo' : corretaNorm.startsWith('err') ? 'errado' : null)
    let alternativas: AltImport[] = []
    letras.forEach((L, i) => {
      const t = get('alt_' + L)
      if (!t) return
      const correta = corretaCE ? norm(t) === corretaCE : L === corretaLetra
      alternativas.push({ texto: converterMarcacao(t), correta, ordem: i, lei: converterMarcacao(get('lei_' + L)) || null, comentario: converterMarcacao(get('com_' + L)) || null })
    })

    // Formato: explícito (Tipo = Certo/Errado) ou deduzido (2 alternativas Certo/Errado).
    let formato: 'multipla' | 'certo_errado' = 'multipla'
    if (tipo === 'objetiva' && (ehCE || alternativasSaoCertoErrado(alternativas.map((a) => a.texto)))) formato = 'certo_errado'

    // Atalho: Tipo = Certo/Errado sem A/B preenchidos → cria as 2 alternativas automaticamente.
    if (formato === 'certo_errado' && alternativas.length === 0) {
      const certoCerto = corretaCE ? corretaCE === 'certo' : corretaLetra !== 'b'
      alternativas = [
        { texto: 'Certo', correta: anulada ? false : certoCerto, ordem: 0, lei: null, comentario: get('com_a') || null },
        { texto: 'Errado', correta: anulada ? false : !certoCerto, ordem: 1, lei: null, comentario: get('com_b') || null },
      ]
    }

    let erro: string | null = null
    if (!enunciado) erro = 'Enunciado vazio'
    else if (tipo === 'objetiva') {
      if (alternativas.length < 2) erro = 'Menos de 2 alternativas'
      // Anulada não exige alternativa correta (o enunciado + assertivas aparecem, mas bloqueados).
      else if (!anulada && !alternativas.some((a) => a.correta)) erro = 'Alternativa correta não indicada'
    }

    // Etiquetas: nomes separados por vírgula ou ponto-e-vírgula (reusa as existentes, inclusive funcionais).
    const etiquetas = get('etiquetas').split(/[,;]/).map((s) => s.trim()).filter(Boolean)

    out.push({
      linha: r + 1, numero: get('numero') || null, enunciado, tipo, formato,
      disciplina: get('disciplina') || null, categoria: get('categoria') || null,
      assunto: get('assunto') || null, assunto_detalhe: get('assunto_detalhe') || null, grupo: get('grupo') || null,
      pilar_1: get('pilar_1') || null, pilar_2: get('pilar_2') || null,
      banca: get('banca') || null, orgao: get('orgao') || null, cargo: get('cargo') || null,
      ano: Number.isFinite(anoNum) ? anoNum : null, nivel_dificuldade: dif,
      comentario_professor: converterMarcacao(get('comentario')) || null, anulada, etiquetas, alternativas, erro,
    })
  }
  return out
}

/** Resolve/cria taxonomia por nome (versão service-role para a importação). */
async function resolveNome(svc: ReturnType<typeof createAdminClient>, table: 'simulado_bancas' | 'simulado_orgaos' | 'simulado_disciplinas', tenantId: string, nome?: string | null): Promise<string | null> {
  const n = nome?.trim(); if (!n) return null
  const { data: ex } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from(table).insert({ nome: n, tenant_id: tenantId }).select('id').single()
  if (error) { const { data: again } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

/** Resolve/cria um assunto (filho de disciplina) por nome. */
async function resolveAssunto(svc: ReturnType<typeof createAdminClient>, tenantId: string, nome?: string | null, disciplinaId?: string | null): Promise<string | null> {
  const n = nome?.trim(); if (!n) return null
  let q = svc.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n)
  if (disciplinaId) q = q.eq('disciplina_id', disciplinaId)
  const { data: ex } = await q.maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from('simulado_assuntos').insert({ nome: n, tenant_id: tenantId, disciplina_id: disciplinaId ?? null }).select('id').single()
  if (error) { const { data: again } = await svc.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

/** Resolve/cria uma etiqueta por nome (case-insensitive). Reusa as existentes — inclusive as
 *  funcionais (Anulada/Desatualizada/…), então importar com esse nome ANULA a questão pela etiqueta. */
async function resolveEtiqueta(svc: ReturnType<typeof createAdminClient>, tenantId: string, nome?: string | null): Promise<string | null> {
  const n = nome?.trim(); if (!n) return null
  const { data: ex } = await svc.from('simulado_etiquetas').select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from('simulado_etiquetas').insert({ tenant_id: tenantId, nome: n, cor: '#64748b' }).select('id').single()
  if (error) { const { data: again } = await svc.from('simulado_etiquetas').select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

/** Lê o arquivo enviado e devolve a relação de questões, marcando as que já existem. */
export async function analisarQuestoesImport(formData: FormData): Promise<AnaliseImport> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo || arquivo.size === 0) return { ok: false, error: 'Selecione um arquivo.' }

  let linhas: string[][]
  try { linhas = await lerLinhas(arquivo) } catch (e: any) { return { ok: false, error: 'Falha ao ler o arquivo: ' + (e?.message ?? '') } }
  const questoes = montarQuestoes(linhas)
  if (!questoes.length) return { ok: false, error: 'Nenhuma questão encontrada. Confira se há um cabeçalho e ao menos uma linha.' }

  // Dedupe por enunciado normalizado (contra as questões já cadastradas no tenant).
  // fetchAll: com >1000 questões no tenant, o dedupe truncava e re-importava duplicatas.
  const svc = createAdminClient()
  const existentes = await fetchAll<{ id: string; enunciado: string | null }>(() =>
    svc.from('simulado_questoes').select('id, enunciado').eq('tenant_id', g.tenantId).eq('deletado', false).order('id', { ascending: true }))
  const mapa = new Map<string, string>()
  for (const e of existentes) mapa.set(normEnun(e.enunciado ?? ''), e.id)
  for (const q of questoes) {
    const id = mapa.get(normEnun(q.enunciado))
    if (id) { q.jaExiste = true; q.questaoIdExistente = id }
  }

  const resumo = {
    total: questoes.length,
    novas: questoes.filter((q) => !q.jaExiste && !q.erro).length,
    jaExistem: questoes.filter((q) => q.jaExiste).length,
    comErro: questoes.filter((q) => q.erro).length,
  }
  return { ok: true, questoes, resumo }
}

/** Cria as questões novas no sistema, ignora as já existentes e (se houver banco) vincula todas a ele. */
export async function confirmarImportQuestoes(bancoId: string | null, questoes: QuestaoImport[]): Promise<ResultadoImport> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  if (!questoes?.length) return { ok: false, error: 'Nada para importar.' }
  const svc = createAdminClient()

  const idsParaVincular: string[] = []
  const anuladaIds = new Set<string>() // questões marcadas ANULADA (novas + reimportadas) → propagar
  // Ordem final desejada (coluna "Número" do CSV; empate desfeito pela ordem de leitura).
  const ordenados: { n: number; seq: number; id: string }[] = []
  let criadas = 0, jaExistiam = 0
  let seq = 0

  // Etiquetas: resolve por nome UMA vez (cache) e vincula (upsert idempotente por questao+etiqueta).
  const etiquetaCache = new Map<string, string | null>()
  const resolverEtiquetaId = async (nome: string): Promise<string | null> => {
    const key = norm(nome); if (!key) return null
    if (etiquetaCache.has(key)) return etiquetaCache.get(key)!
    const id = await resolveEtiqueta(svc, g.tenantId, nome)
    etiquetaCache.set(key, id)
    return id
  }
  const vincularEtiquetas = async (questaoId: string, nomes?: string[]) => {
    for (const nome of nomes ?? []) {
      const etId = await resolverEtiquetaId(nome)
      if (etId) await svc.from('simulado_questao_etiquetas').upsert({ tenant_id: g.tenantId, questao_id: questaoId, etiqueta_id: etId }, { onConflict: 'questao_id,etiqueta_id', ignoreDuplicates: true })
    }
  }
  const registrarOrdem = (id: string, numero?: string | null) => {
    const n = numero != null && numero !== '' && !Number.isNaN(Number(numero)) ? Number(numero) : Number.MAX_SAFE_INTEGER
    ordenados.push({ n, seq: seq++, id })
  }

  for (const q of questoes) {
    if (q.erro) continue
    if (q.jaExiste && q.questaoIdExistente) {
      idsParaVincular.push(q.questaoIdExistente); registrarOrdem(q.questaoIdExistente, q.numero); jaExistiam++
      // Re-import marcando ANULADA atualiza a questão existente no banco (para propagar depois).
      if (q.anulada) { anuladaIds.add(q.questaoIdExistente); await svc.from('simulado_questoes').update({ anulada: true }).eq('id', q.questaoIdExistente).eq('tenant_id', g.tenantId) }
      await vincularEtiquetas(q.questaoIdExistente, q.etiquetas) // aplica as etiquetas na questão já existente também
      continue
    }

    const banca_id = await resolveNome(svc, 'simulado_bancas', g.tenantId, q.banca)
    const orgao_id = await resolveNome(svc, 'simulado_orgaos', g.tenantId, q.orgao)
    const disciplina_id = await resolveNome(svc, 'simulado_disciplinas', g.tenantId, q.disciplina)
    const assunto_id = await resolveAssunto(svc, g.tenantId, q.assunto, disciplina_id)

    const base: Record<string, unknown> = {
      tenant_id: g.tenantId, tipo: q.tipo, enunciado: q.enunciado, banca_id, orgao_id, disciplina_id, assunto_id,
      ano: q.ano ?? null, nivel_dificuldade: q.nivel_dificuldade ?? null, gabarito_tipo: 'oficial',
      comentario_professor: q.comentario_professor ?? null, status: 'publicada',
    }
    // Campos novos (existem após a migration). Se a coluna não existir ainda, reenvia só o base.
    const extra: Record<string, unknown> = {
      numero: q.numero ?? null, grupo: q.grupo ?? null, categoria: q.categoria ?? null,
      assunto_detalhe: q.assunto_detalhe ?? null, pilar_1: q.pilar_1 ?? null, pilar_2: q.pilar_2 ?? null, cargo: q.cargo ?? null,
      formato: q.formato ?? 'multipla', anulada: q.anulada === true,
    }
    // Insere a questão. Se alguma coluna nova ainda não existir no banco, remove SÓ ela e tenta de novo
    // (não perde os outros campos). Assim funciona antes e depois das migrations.
    let payloadQ: Record<string, unknown> = { ...base, ...extra }
    let novaId: string | null = null
    for (let tent = 0; tent < 10; tent++) {
      const r = await svc.from('simulado_questoes').insert(payloadQ).select('id').single()
      if (!r.error && r.data) { novaId = (r.data as any).id; break }
      const col = colFaltante(r.error?.message)
      if (col && col in payloadQ && !(col in base)) { delete payloadQ[col]; continue }
      break
    }
    if (!novaId) continue

    if (q.tipo === 'objetiva' && q.alternativas.length) {
      let payloadA: Record<string, unknown>[] = q.alternativas.map((a) => ({
        tenant_id: g.tenantId, questao_id: novaId, texto: a.texto, correta: a.correta, ordem: a.ordem, lei: a.lei ?? null, comentario: a.comentario ?? null,
      }))
      for (let tent = 0; tent < 6; tent++) {
        const r = await svc.from('simulado_alternativas').insert(payloadA)
        if (!r.error) break
        const col = colFaltante(r.error?.message)
        if (col && payloadA[0] && col in payloadA[0]) { payloadA = payloadA.map((x) => { const y = { ...x }; delete y[col]; return y }); continue }
        break
      }
    }
    await vincularEtiquetas(novaId, q.etiquetas) // vincula as etiquetas (tags) informadas no CSV
    idsParaVincular.push(novaId); registrarOrdem(novaId, q.numero); criadas++
    if (q.anulada) anuladaIds.add(novaId)
  }

  // Vincula ao banco (ignora as já vinculadas) — só quando há banco de destino.
  let vinculadas = 0
  if (bancoId && idsParaVincular.length) {
    const { data: jaTem } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).in('questao_id', idsParaVincular)
    const existSet = new Set((jaTem ?? []).map((r: any) => r.questao_id))
    const novos = idsParaVincular.filter((id) => !existSet.has(id))
    if (novos.length) {
      const { error } = await svc.from('simulado_questao_pasta').insert(novos.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id })))
      if (!error) vinculadas = novos.length
    }
  }

  // Ordena o banco pela coluna "Número" do CSV (preservando questões que já estavam antes deste
  // import). Sem isso, o banco (e o simulado que herda dele) exibia as questões embaralhadas.
  if (bancoId && ordenados.length) {
    try {
      const importadosEmOrdem = [...ordenados].sort((a, b) => a.n - b.n || a.seq - b.seq).map((o) => o.id)
      const jaSet = new Set(importadosEmOrdem)
      const { data: pasta } = await svc.from('simulado_pastas').select('ordem_questoes').eq('id', bancoId).eq('tenant_id', g.tenantId).maybeSingle()
      const anterior = (Array.isArray((pasta as any)?.ordem_questoes) ? (pasta as any).ordem_questoes : []) as string[]
      const preservados = anterior.filter((id) => !jaSet.has(id)) // ordens antigas de questões não reimportadas
      const novaOrdem = [...preservados, ...importadosEmOrdem]
      await svc.from('simulado_pastas').update({ ordem_questoes: novaOrdem }).eq('id', bancoId).eq('tenant_id', g.tenantId)
    } catch { /* coluna ordem_questoes pode não existir ainda — ignora */ }
  }

  // Propaga anulações marcadas no banco para os simulados que já usam essas questões:
  // cada sessão finalizada é re-corrigida (ponto garantido a todos). Best-effort — não derruba o import.
  if (anuladaIds.size) {
    try { await propagarAnulacaoBanco(svc, g.tenantId, g.atorId, [...anuladaIds]) }
    catch (e) { console.error('[import] propagação de anulação falhou:', (e as any)?.message) }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_questoes', entidadeId: bancoId ?? 'sistema', depois: { importadas: criadas, jaExistiam, vinculadas, anuladas: anuladaIds.size } })
  revalidatePath('/admin/questoes')
  if (bancoId) revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, criadas, jaExistiam, vinculadas }
}

/** Salva a ordem manual das questões dentro de um banco (lista de questao_id). */
export async function reordenarQuestoesBanco(bancoId: string, ordemIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ ordem_questoes: ordemIds }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) {
    if (/ordem_questoes/i.test(error.message)) return { ok: false, error: 'Rode a migration ordem_questoes no banco.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

export type GrupoBanco = { id: string; nome: string; disciplinas: string[] }

/** Salva os grupos de disciplinas de um banco (pasta). */
export async function salvarGruposBanco(bancoId: string, grupos: GrupoBanco[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ grupos }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

// ── HUD do simulado por BANCO (simulado_pastas.hud jsonb) ──────────────────────────────────────
/** Lê o HUD (tema da prova) salvo no banco. Tolerante à coluna `hud` ausente (cai no vazio → padrão). */
export async function carregarHudBanco(bancoId: string): Promise<{ ok: boolean; base: Partial<HudCores>; porPagina: HudPorPagina }> {
  const vazio = { ok: true, base: {} as Partial<HudCores>, porPagina: {} as HudPorPagina }
  const g = await guard()
  if (!g.ok || !bancoId) return vazio
  const svc = createAdminClient()
  try {
    const { data, error } = await svc.from('simulado_pastas').select('hud').eq('id', bancoId).eq('tenant_id', g.tenantId).maybeSingle()
    if (error) return vazio // coluna pode não existir ainda
    const hud = (data as any)?.hud
    if (!hud || typeof hud !== 'object') return vazio
    return { ok: true, base: (hud.hudCores ?? {}) as Partial<HudCores>, porPagina: (hud.hudPorPagina ?? {}) as HudPorPagina }
  } catch { return vazio }
}

/** Salva o HUD (base + por página) no banco. Aplica a todos os simulados com regras.banco_base_id = este banco. */
export async function salvarHudBanco(bancoId: string, dados: { hudCores: Partial<HudCores>; hudPorPagina: HudPorPagina }): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('questoes:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId || !bancoId) return { ok: false, error: 'Banco não resolvido.' }
  const svc = createAdminClient()
  const hud = { hudCores: dados.hudCores ?? {}, hudPorPagina: dados.hudPorPagina ?? {} }
  const { error } = await svc.from('simulado_pastas').update({ hud }).eq('id', bancoId).eq('tenant_id', access.tenantId)
  if (error) return { ok: false, error: /column .*hud|hud.*column|schema cache/i.test(error.message) ? 'Coluna ausente — rode: alter table simulado_pastas add column if not exists hud jsonb;' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { hud: 'atualizado' } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

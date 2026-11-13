'use server'

// REGISTRO DE ATUALIZAÇÕES / PONTOS DE VERSÃO de materiais (Estúdio › Produto › Atualizações, Biblioteca, editor).
// 'use server': só async exportadas. Toda ação: permissão + service role com tenant_id explícito + registrarAudit.
// Permissão: admin OU configuracoes:update OU biblioteca:update (professor) OU produtos:manage. Leitura: + *:view.
// Requer a migração 20261119010000; sem ela as ações devolvem o aviso (nada quebra).

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { hojeBrtISO } from '@/lib/brt'
import { TIPOS_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import {
  LIMITES_ATUALIZACAO, combinarDataHoraBrt, normalizarItens,
  type FiltroAtualizacoes, type ItemAlteracao, type LinhaAtualizacao, type StatusAtualizacao, type TipoAtualizacao,
} from '@/lib/conteudo/atualizacoes-tipos'
import {
  AVISO_MIGRACAO_EXIBICAO, AVISO_MIGRACAO_PONTOS, colunasExibicaoExistem, comFallbackFlags, listarAtualizacoes, listarDocumentosDoProduto, registroVersoesAtivo,
} from '@/lib/conteudo/atualizacoes-registro'
import { notificarPontoDeVersao } from '@/lib/conteudo/atualizacoes-notificar'
import { rotulosDeMateriais } from '@/lib/admin-revisao/atualizacoes'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCHEMA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist|column .* does not exist|could not find the .* column/i
const T = 'simulado_conteudo_atualizacoes'

type Falha = { ok: false; error: string }

async function guard(acao: 'view' | 'edit'): Promise<Falha | { ok: true; tenantId: string; atorId: string | null }> {
  const a = await getCurrentAccess()
  const p = a.permissions
  const edita = a.isAdmin || p.includes('*') || p.includes('configuracoes:update') || p.includes('biblioteca:update') || p.includes('produtos:manage')
  const ve = edita || p.includes('configuracoes:view') || p.includes('biblioteca:view') || p.includes('produtos:view')
  if (!(acao === 'edit' ? edita : ve)) return { ok: false, error: 'Sem permissão.' }
  if (!a.tenantId) return { ok: false, error: 'Tenant não resolvido — recarregue a página.' }
  return { ok: true, tenantId: a.tenantId, atorId: a.userId ?? null }
}

const tipoOk = (t: unknown): t is TipoAtualizacao => TIPOS_ATUALIZACAO.some((x) => x.id === t)
const msgErro = (m: string | undefined) => (m && SCHEMA_AUSENTE.test(m) ? AVISO_MIGRACAO_PONTOS : m || 'Falha ao salvar.')

/** Data (YYYY-MM-DD) + hora opcional (HH:mm), ambas em Brasília. Data vazia = hoje (BRT); hora vazia = 00:00. Rejeita futuro distante. */
function resolverOcorrida(data: string | null | undefined, hora: string | null | undefined): { iso: string } | { erro: string } {
  const d = (data ?? '').trim()
  const h = (hora ?? '').trim()
  if (!d && !h) return { iso: new Date().toISOString() }
  if (h && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return { erro: 'Hora inválida (use HH:MM).' }
  const iso = combinarDataHoraBrt(d || hojeBrtISO(), h)
  if (!iso) return { erro: 'Data inválida.' }
  if (new Date(iso).getTime() > Date.now() + 24 * 3600_000) return { erro: 'A data da atualização não pode estar no futuro.' }
  return { iso }
}

/** Interruptores de exibição ao aluno (padrão ligado). Hora vazia → a hora nunca é exibida. */
function lerFlags(i: { exibirData?: boolean; exibirHora?: boolean; exibirRotulo?: boolean }, hora: string | null | undefined) {
  return { exibir_data: i.exibirData !== false, exibir_hora: i.exibirHora !== false && !!(hora ?? '').trim(), exibir_rotulo: i.exibirRotulo !== false }
}
/** Exige a migração só se o admin realmente ocultou data/rótulo (hora vazia não conta: já é "sem hora"). */
const exigeMigracao = (f: { exibir_data: boolean; exibir_rotulo: boolean }) => !f.exibir_data || !f.exibir_rotulo

// ───────────────────────────── Leituras ─────────────────────────────

/** Lista paginada (documento / produto / global) — busca, filtros e ordenação no servidor. */
export async function listarAtualizacoesAction(f: FiltroAtualizacoes): Promise<{ ok: true; rows: LinhaAtualizacao[]; total: number } | Falha> {
  const g = await guard('view'); if (!g.ok) return g
  if (f.documentoId && !UUID.test(f.documentoId)) return { ok: false, error: 'Documento inválido.' }
  if (f.produtoId && !UUID.test(f.produtoId)) return { ok: false, error: 'Produto inválido.' }
  const r = await listarAtualizacoes(createAdminClient(), g.tenantId, f)
  if (r.semTabela) return { ok: false, error: AVISO_MIGRACAO_PONTOS }
  return { ok: true, rows: r.rows, total: r.total }
}

/** Seletor de documentos do currículo de um produto (busca + paginação no banco). */
export async function listarDocumentosProdutoAction(produtoId: string, q: string, page: number): Promise<{ ok: true; rows: { id: string; titulo: string }[]; total: number } | Falha> {
  const g = await guard('view'); if (!g.ok) return g
  if (!UUID.test(produtoId)) return { ok: false, error: 'Produto inválido.' }
  return { ok: true, ...(await listarDocumentosDoProduto(createAdminClient(), g.tenantId, produtoId, q ?? '', page, 20)) }
}

/** Contexto do dialog: rótulo dos documentos, flag do tenant e (editor) estado da versão em edição. */
export async function contextoRegistroAction(documentoIds: string[], versaoId?: string | null): Promise<
  { ok: true; materiais: { id: string; rotulo: string }[]; registroAtivo: boolean; exibicaoDisponivel: boolean; versao: { id: string; numero: number; atual: boolean } | null } | Falha
> {
  const g = await guard('view'); if (!g.ok) return g
  const ids = [...new Set((documentoIds ?? []).filter((i) => UUID.test(i)))].slice(0, LIMITES_ATUALIZACAO.documentos)
  const svc = createAdminClient()
  const [rot, ativo, exibicaoDisponivel] = await Promise.all([rotulosDeMateriais(svc, g.tenantId, ids), registroVersoesAtivo(svc, g.tenantId), colunasExibicaoExistem(svc)])
  let versao: { id: string; numero: number; atual: boolean } | null = null
  if (versaoId && UUID.test(versaoId) && ids.length === 1) {
    const [{ data: v }, { data: d }] = await Promise.all([
      svc.from('simulado_conteudo_versoes').select('id, numero').eq('tenant_id', g.tenantId).eq('id', versaoId).eq('documento_id', ids[0]).maybeSingle(),
      svc.from('simulado_conteudo_documentos').select('versao_atual_id').eq('tenant_id', g.tenantId).eq('id', ids[0]).maybeSingle(),
    ])
    if (v) versao = { id: (v as any).id, numero: (v as any).numero, atual: (d as any)?.versao_atual_id === versaoId }
  }
  return { ok: true, materiais: ids.map((id) => ({ id, rotulo: rot.get(id) ?? 'Material' })), registroAtivo: ativo, exibicaoDisponivel, versao }
}

// ───────────────────────────── Escrita ─────────────────────────────

interface RegistrarPontoInput {
  documentoIds: string[]
  produtoId?: string | null
  rotulo?: string
  tipo: TipoAtualizacao
  /** Resumo geral (opcional se houver itens). */
  resumo?: string
  /** Itens gerais (aplicados a todos os documentos sem override). */
  itens?: ItemAlteracao[]
  /** Override por documento (multisseleção). */
  porDocumento?: Record<string, { resumo?: string; itens?: ItemAlteracao[] }>
  /** "YYYY-MM-DD" (Brasília). Vazio = hoje. */
  data?: string | null
  /** "HH:mm" (Brasília), opcional. Vazio = 00:00 e a hora não é exibida. */
  hora?: string | null
  exibirData?: boolean
  exibirHora?: boolean
  exibirRotulo?: boolean
  avisarAlunos?: boolean
  mostrarInicio?: boolean
  visivelAluno?: boolean
  status?: StatusAtualizacao
  /** Editor/fluxo de publicação: ao registrar como "publicado", move versao_atual_id para esta versão (1 documento). */
  publicarVersaoId?: string | null
}

export async function registrarPontoVersaoAction(input: RegistrarPontoInput): Promise<{ ok: true; ids: string[]; loteId: string | null; publicouVersao: boolean } | Falha> {
  const g = await guard('edit'); if (!g.ok) return g
  const docIds = [...new Set((input.documentoIds ?? []).filter((i) => UUID.test(i)))]
  if (!docIds.length) return { ok: false, error: 'Escolha ao menos um material.' }
  if (docIds.length > LIMITES_ATUALIZACAO.documentos) return { ok: false, error: `No máximo ${LIMITES_ATUALIZACAO.documentos} materiais por registro.` }
  if (!tipoOk(input.tipo)) return { ok: false, error: 'Tipo de atualização inválido.' }
  const rotulo = String(input.rotulo ?? '').trim().slice(0, LIMITES_ATUALIZACAO.rotulo) || null
  const resumoGeral = String(input.resumo ?? '').trim()
  if (resumoGeral.length > LIMITES_ATUALIZACAO.resumo) return { ok: false, error: `O resumo passou de ${LIMITES_ATUALIZACAO.resumo} caracteres.` }
  const itensGerais = normalizarItens(input.itens)
  const ocorrida = resolverOcorrida(input.data, input.hora); if ('erro' in ocorrida) return { ok: false, error: ocorrida.erro }
  const flags = lerFlags(input, input.hora)
  const flagsOk = await colunasExibicaoExistem(createAdminClient())
  if (!flagsOk && exigeMigracao(flags)) return { ok: false, error: AVISO_MIGRACAO_EXIBICAO }
  const status: StatusAtualizacao = input.status === 'rascunho' ? 'rascunho' : 'publicado'
  const produtoId = input.produtoId && UUID.test(input.produtoId) ? input.produtoId : null

  const svc = createAdminClient()
  // Documentos do tenant (não excluídos).
  const docs: any[] = []
  for (let i = 0; i < docIds.length; i += 80) {
    const { data } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', docIds.slice(i, i + 80))
    docs.push(...((data ?? []) as any[]))
  }
  if (docs.length !== docIds.length) return { ok: false, error: 'Algum material não foi encontrado (ou foi excluído).' }

  // Publicar versão (editor): só 1 documento, só se a versão pertence a ele e o registro é "publicado".
  let versaoPublicar: string | null = null
  if (input.publicarVersaoId && status === 'publicado') {
    if (docs.length !== 1 || !UUID.test(input.publicarVersaoId)) return { ok: false, error: 'Publicar versão vale para um único material.' }
    const { data: v } = await svc.from('simulado_conteudo_versoes').select('id').eq('tenant_id', g.tenantId).eq('id', input.publicarVersaoId).eq('documento_id', docs[0].id).maybeSingle()
    if (!v) return { ok: false, error: 'Versão não encontrada para este material.' }
    versaoPublicar = input.publicarVersaoId
  }

  const loteId = docs.length > 1 ? randomUUID() : null
  const agora = new Date().toISOString()
  const linhas: any[] = []
  for (const d of docs) {
    const ov = input.porDocumento?.[d.id]
    const texto = String(ov?.resumo ?? resumoGeral).trim()
    if (texto.length > LIMITES_ATUALIZACAO.resumo) return { ok: false, error: `O resumo passou de ${LIMITES_ATUALIZACAO.resumo} caracteres.` }
    const itens = ov?.itens ? normalizarItens(ov.itens) : itensGerais
    if (!texto && !itens.length) return { ok: false, error: `Descreva o que mudou em "${d.titulo ?? 'material'}" (resumo ou ao menos um item).` }
    linhas.push({
      tenant_id: g.tenantId, documento_id: d.id, versao_id: versaoPublicar ?? d.versao_atual_id ?? null, produto_id: produtoId, lote_id: loteId,
      tipo: input.tipo, rotulo, texto, itens, ocorrida_em: ocorrida.iso, status, visivel_aluno: input.visivelAluno !== false,
      avisar_alunos: !!input.avisarAlunos, mostrar_inicio: input.mostrarInicio !== false, ...(flagsOk ? flags : {}),
      publicado_em: status === 'publicado' ? agora : null, criado_por: g.atorId,
    })
  }
  const { data, error } = await svc.from(T).insert(linhas).select('id, documento_id')
  if (error || !data) return { ok: false, error: msgErro(error?.message) }
  const ids = (data as any[]).map((r) => r.id as string)

  // Publicar versão: move o ponteiro do documento (mesma regra do callback do OnlyOffice, agora explícita).
  let publicouVersao = false
  if (versaoPublicar) {
    const { error: e2 } = await svc.from('simulado_conteudo_documentos')
      .update({ versao_atual_id: versaoPublicar, status: 'publicado', atualizado_em: agora })
      .eq('tenant_id', g.tenantId).eq('id', docs[0].id)
    if (e2) return { ok: false, error: `Registro criado, mas a versão não foi publicada: ${e2.message}` }
    publicouVersao = true
    // A versão publicada passa a valer para o aluno → conta as páginas (se faltar) e invalida os caches do cronograma, fora da resposta.
    const docPub = docs[0].id as string
    const recontar = async () => { const { sincronizarPaginasDocumento } = await import('@/lib/conteudo/paginas-sync'); await sincronizarPaginasDocumento(svc, g.tenantId, docPub, { emitir: true, invalidar: true }) }
    try { after(() => recontar().catch(() => {})) } catch { void recontar().catch(() => {}) }
    await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_conteudo_documentos', entidadeId: docs[0].id, atorId: g.atorId, tenantId: g.tenantId, antes: { versao_atual_id: docs[0].versao_atual_id ?? null }, depois: { versao_atual_id: versaoPublicar, via: 'registro_atualizacao' } }).catch(() => {})
  }

  await Promise.all((data as any[]).map((r, i) => registrarAudit({
    operacao: 'INSERT', entidade: T, entidadeId: r.id, atorId: g.atorId, tenantId: g.tenantId,
    depois: { documento_id: r.documento_id, tipo: input.tipo, rotulo, status, lote_id: loteId, produto_id: produtoId, ...(flagsOk ? flags : {}), itens: linhas[i].itens.length, publicou_versao: !!versaoPublicar },
  }).catch(() => {})))

  // Avisos só de registro PUBLICADO; fora do caminho da resposta (best-effort).
  if (status === 'publicado' && (input.avisarAlunos || input.mostrarInicio !== false)) {
    const tarefa = async () => {
      for (const [i, d] of docs.entries()) {
        await notificarPontoDeVersao(svc, g.tenantId, {
          documentoId: d.id, pastaId: d.pasta_id ?? null, titulo: d.titulo ?? 'material', tipo: input.tipo, rotulo,
          resumo: linhas[i].texto, primeiroItem: linhas[i].itens[0]?.texto ?? null, avisarAlunos: !!input.avisarAlunos, mostrarInicio: input.mostrarInicio !== false,
          ocorridaEm: ocorrida.iso, exibirData: flags.exibir_data, exibirHora: flags.exibir_hora, exibirRotulo: flags.exibir_rotulo,
        })
      }
    }
    try { after(tarefa) } catch { void tarefa() }
  }
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true, ids, loteId, publicouVersao }
}

export async function editarPontoVersaoAction(input: {
  id: string; rotulo?: string; tipo: TipoAtualizacao; resumo?: string; itens?: ItemAlteracao[]; data?: string | null; hora?: string | null; visivelAluno?: boolean
  exibirData?: boolean; exibirHora?: boolean; exibirRotulo?: boolean
}): Promise<{ ok: true } | Falha> {
  const g = await guard('edit'); if (!g.ok) return g
  if (!UUID.test(input.id)) return { ok: false, error: 'Registro inválido.' }
  if (!tipoOk(input.tipo)) return { ok: false, error: 'Tipo de atualização inválido.' }
  const texto = String(input.resumo ?? '').trim()
  if (texto.length > LIMITES_ATUALIZACAO.resumo) return { ok: false, error: `O resumo passou de ${LIMITES_ATUALIZACAO.resumo} caracteres.` }
  const itens = normalizarItens(input.itens)
  if (!texto && !itens.length) return { ok: false, error: 'Descreva o que mudou (resumo ou ao menos um item).' }
  const ocorrida = resolverOcorrida(input.data, input.hora); if ('erro' in ocorrida) return { ok: false, error: ocorrida.erro }
  const svc = createAdminClient()
  const flags = lerFlags(input, input.hora)
  const flagsOk = await colunasExibicaoExistem(svc)
  if (!flagsOk && exigeMigracao(flags)) return { ok: false, error: AVISO_MIGRACAO_EXIBICAO }
  const colsEd = 'id, tipo, rotulo, texto, itens, ocorrida_em, visivel_aluno, status'
  const { data: antes } = await comFallbackFlags((f) => svc.from(T).select(f ? `${colsEd}, exibir_data, exibir_hora, exibir_rotulo` : colsEd).eq('tenant_id', g.tenantId).eq('id', input.id).eq('deletado', false).maybeSingle())
  if (!antes) return { ok: false, error: 'Registro não encontrado.' }
  const patch = {
    tipo: input.tipo, rotulo: String(input.rotulo ?? '').trim().slice(0, LIMITES_ATUALIZACAO.rotulo) || null, texto, itens,
    ocorrida_em: ocorrida.iso, ...(flagsOk ? flags : {}), visivel_aluno: input.visivelAluno !== false, atualizado_em: new Date().toISOString(), atualizado_por: g.atorId,
  }
  const { error } = await svc.from(T).update(patch).eq('tenant_id', g.tenantId).eq('id', input.id)
  if (error) return { ok: false, error: msgErro(error.message) }
  await registrarAudit({ operacao: 'UPDATE', entidade: T, entidadeId: input.id, atorId: g.atorId, tenantId: g.tenantId, antes: antes as any, depois: { ...patch, itens: itens.length } }).catch(() => {})
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true }
}

/** publicar (rascunho → publicado, avisa alunos se marcado) · rascunho (volta a rascunho) · ocultar/exibir (visível ao aluno). */
export async function alterarEstadoPontoAction(ids: string[], acao: 'publicar' | 'rascunho' | 'ocultar' | 'exibir'): Promise<{ ok: true; alterados: number } | Falha> {
  const g = await guard('edit'); if (!g.ok) return g
  const lista = [...new Set((ids ?? []).filter((i) => UUID.test(i)))].slice(0, 200)
  if (!lista.length) return { ok: false, error: 'Nenhum registro selecionado.' }
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  const patch: Record<string, unknown> =
    acao === 'publicar' ? { status: 'publicado', publicado_em: agora }
      : acao === 'rascunho' ? { status: 'rascunho' }
        : acao === 'ocultar' ? { visivel_aluno: false } : { visivel_aluno: true }
  patch.atualizado_em = agora; patch.atualizado_por = g.atorId
  const colsSt = 'id, documento_id, tipo, rotulo, texto, itens, status, visivel_aluno, avisar_alunos, mostrar_inicio, ocorrida_em'
  const { data: antes } = await comFallbackFlags((f) => svc.from(T).select(f ? `${colsSt}, exibir_data, exibir_hora, exibir_rotulo` : colsSt).eq('tenant_id', g.tenantId).eq('deletado', false).in('id', lista))
  const alvo = ((antes ?? []) as any[]).filter((r) => (acao === 'publicar' ? r.status !== 'publicado' : true))
  if (!alvo.length) return { ok: true, alterados: 0 }
  const { error } = await svc.from(T).update(patch).eq('tenant_id', g.tenantId).in('id', alvo.map((r) => r.id))
  if (error) return { ok: false, error: msgErro(error.message) }
  await Promise.all(alvo.map((r) => registrarAudit({
    operacao: acao === 'publicar' || acao === 'exibir' ? 'LIBERAR' : 'BLOQUEAR', entidade: T, entidadeId: r.id, atorId: g.atorId, tenantId: g.tenantId,
    antes: { status: r.status, visivel_aluno: r.visivel_aluno }, depois: { acao, ...patch },
  }).catch(() => {})))
  // Publicar um rascunho dispara os avisos que ficaram pendentes.
  if (acao === 'publicar') {
    const tarefa = async () => {
      const docIds = [...new Set(alvo.map((r) => r.documento_id as string))]
      const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', g.tenantId).in('id', docIds.slice(0, 80))
      const m = new Map(((docs ?? []) as any[]).map((d) => [d.id, d]))
      for (const r of alvo) {
        if (!r.avisar_alunos && r.mostrar_inicio === false) continue
        const d = m.get(r.documento_id)
        await notificarPontoDeVersao(svc, g.tenantId, {
          documentoId: r.documento_id, pastaId: d?.pasta_id ?? null, titulo: d?.titulo ?? 'material', tipo: r.tipo, rotulo: r.rotulo ?? null,
          resumo: r.texto ?? '', primeiroItem: Array.isArray(r.itens) ? r.itens[0]?.texto ?? null : null, avisarAlunos: !!r.avisar_alunos, mostrarInicio: r.mostrar_inicio !== false,
          ocorridaEm: r.ocorrida_em ?? null, exibirData: r.exibir_data !== false, exibirHora: r.exibir_hora !== false, exibirRotulo: r.exibir_rotulo !== false,
        })
      }
    }
    try { after(tarefa) } catch { void tarefa() }
  }
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true, alterados: alvo.length }
}

/** Exclusão LÓGICA (some da lista e do aluno; recuperável no banco). */
export async function excluirPontoAction(ids: string[]): Promise<{ ok: true; alterados: number } | Falha> {
  const g = await guard('edit'); if (!g.ok) return g
  const lista = [...new Set((ids ?? []).filter((i) => UUID.test(i)))].slice(0, 200)
  if (!lista.length) return { ok: false, error: 'Nenhum registro selecionado.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(T).update({ deletado: true, deletado_em: new Date().toISOString(), deletado_por: g.atorId })
    .eq('tenant_id', g.tenantId).eq('deletado', false).in('id', lista).select('id, documento_id')
  if (error) return { ok: false, error: msgErro(error.message) }
  await Promise.all(((data ?? []) as any[]).map((r) => registrarAudit({
    operacao: 'DELETE', entidade: T, entidadeId: r.id, atorId: g.atorId, tenantId: g.tenantId, antes: { documento_id: r.documento_id, deletado: false }, depois: { deletado: true },
  }).catch(() => {})))
  revalidatePath('/admin/revisao/atualizacoes')
  return { ok: true, alterados: (data ?? []).length }
}

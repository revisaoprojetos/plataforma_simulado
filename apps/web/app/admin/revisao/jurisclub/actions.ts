'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { brtLocalParaIso } from '@/lib/brt'
import { alunosComJurisclub, alunosDosGrupos } from '@/lib/revisao/jurisclub-dados'
import { criarNovidade } from '@/lib/novidades/novidades'
import { confirmarImportQuestoes } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import { inferirTribunal, type JulgadoDraft, type QuestaoDraft, type Liberacoes, type NovaEdicaoInput } from '@/lib/revisao/jurisclub-tipos'

/**
 * Server actions do JurisClub (Plataforma Revisão). 'use server': só funções async exportadas.
 * RBAC: biblioteca:update (editar), biblioteca:publicar (publicar / tirar do ar / liberar partes / errata).
 * Service role + filtro EXPLÍCITO por tenant_id em tudo (service role bypassa RLS).
 */

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const BASE = '/admin/revisao/jurisclub'

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const letras = (s: string) => s.replace(/[^A-Za-zÀ-ú]/g, '').length

async function edicaoDoTenant(svc: any, tenantId: string, id: string) {
  if (!UUID_RE.test(id)) return null
  const { data } = await svc.from('jurisclub_edicoes').select('id, titulo, pasta, status, liberacoes, todos').eq('id', id).eq('tenant_id', tenantId).eq('deletado', false).maybeSingle()
  return data as { id: string; titulo: string; pasta: string; status: string; liberacoes: Liberacoes; todos: boolean } | null
}

async function recontar(svc: any, tenantId: string, edicaoId: string) {
  const [j, q] = await Promise.all([
    svc.from('jurisclub_julgados').select('id', { count: 'exact', head: true }).eq('edicao_id', edicaoId).eq('tenant_id', tenantId),
    svc.from('jurisclub_questoes').select('id', { count: 'exact', head: true }).eq('edicao_id', edicaoId).eq('tenant_id', tenantId),
  ])
  await svc.from('jurisclub_edicoes').update({ n_julgados: j.count ?? 0, n_questoes: q.count ?? 0, atualizado_em: new Date().toISOString() }).eq('id', edicaoId).eq('tenant_id', tenantId)
}

async function chunked<T>(rows: T[], fn: (c: T[]) => PromiseLike<{ error: { message: string } | null }>, n = 200) {
  for (let i = 0; i < rows.length; i += n) {
    const { error } = await fn(rows.slice(i, i + n))
    if (error) throw new Error(error.message)
  }
}

// ───────────────────────────── Passo a passo ─────────────────────────────


/** Etapa 6: publica agora, agenda ou salva rascunho. Grava edição + grupos + julgados + questões. */
export async function criarEdicao(input: NovaEdicaoInput, modo: 'publicar' | 'rascunho'): Promise<R<{ id: string; status: string }>> {
  const g = await guard(modo === 'publicar' ? 'biblioteca:publicar' : 'biblioteca:update')
  if (!g.ok) return g
  const titulo = (input.titulo ?? '').trim()
  if (letras(titulo) < 3) return { ok: false, error: 'Dê um nome com pelo menos 3 letras.' }
  if (input.pasta !== 'mensal' && input.pasta !== '1a7d') return { ok: false, error: 'Pasta inválida.' }
  const grupos = [...new Set((input.grupos ?? []).filter((x) => UUID_RE.test(x)))]
  const julgados = (input.julgados ?? []).filter((j) => (j.titulo ?? '').trim())
  const questoes = input.questoes ?? []
  if (modo === 'publicar') {
    if (!julgados.length) return { ok: false, error: 'Falta o arquivo da edição (nenhum julgado).' }
    if (!questoes.length && !input.semQ) return { ok: false, error: 'Suba as questões ou marque “Publicar sem questões por enquanto”.' }
    if (!input.todos && !grupos.length) return { ok: false, error: 'Libere para todos ou escolha ao menos um grupo.' }
  }
  let publicarEm: string | null = null
  if (modo === 'publicar' && input.quando === 'agendar') {
    publicarEm = brtLocalParaIso(input.data)
    if (!publicarEm) return { ok: false, error: 'Informe a data e a hora do agendamento.' }
    if (new Date(publicarEm).getTime() <= Date.now()) return { ok: false, error: 'O agendamento precisa estar no futuro.' }
  }
  const status = modo === 'rascunho' ? 'rascunho' : publicarEm ? 'agendado' : 'publicado'
  const svc = createAdminClient()

  const temQ = questoes.length > 0
  const { data: ed, error } = await svc.from('jurisclub_edicoes').insert({
    tenant_id: g.tenantId, pasta: input.pasta, titulo, mes_ref: input.mes || null, status,
    publicar_em: publicarEm, publicado_em: status === 'publicado' ? new Date().toISOString() : null,
    falta: status === 'rascunho' ? 'salvo no passo a passo' : null,
    cor: input.cor, imagem_url: input.imagem, versao: input.versao, todos: !!input.todos,
    ordem_julgados: input.ordemJulgados ?? 'doc', ...(input.filtros ? { filtros: input.filtros } : {}),
    filtros_auto: input.filtrosAuto, documento_id: input.documentoId, questoes_doc_id: input.questoesDocId,
    sem_questoes: !!input.semQ, para_banco: !!input.paraBanco,
    liberacoes: { leitura: true, vf: temQ, pdf: true, cad: temQ, gab: temQ },
    avisar_alunos: !!input.avisar, destaque_inicio: !!input.destaque, preparar_email: !!input.email,
    criado_por: g.atorId,
  }).select('id').single()
  if (error || !ed) return { ok: false, error: error?.message ?? 'Falha ao criar a edição.' }
  const id = (ed as any).id as string

  try {
    if (!input.todos && grupos.length) {
      await chunked(grupos, (c) => svc.from('jurisclub_edicao_grupos').insert(c.map((grupo_id) => ({ edicao_id: id, tenant_id: g.tenantId, grupo_id }))))
    }
    const ordemId = new Map<number, string>()
    if (julgados.length) {
      const rows = julgados.map((j, i) => ({
        tenant_id: g.tenantId, edicao_id: id, ordem: i, titulo: j.titulo.trim(), tribunal: j.tribunal || inferirTribunal(j.titulo),
        orgao: j.orgao || null, disciplina: j.disciplina || null, selos: j.selos ?? [], fazenda: !!j.fazenda || (j.selos ?? []).some((s) => s === 'fav' || s === 'desf'),
        conferido: !!j.conferido, trecho_uid: j.trecho_uid && UUID_RE.test(j.trecho_uid) ? j.trecho_uid : null,
      }))
      for (let i = 0; i < rows.length; i += 200) {
        const { data, error: e } = await svc.from('jurisclub_julgados').insert(rows.slice(i, i + 200)).select('id, ordem')
        if (e) throw new Error(e.message)
        for (const r of (data ?? []) as any[]) ordemId.set(r.ordem, r.id)
      }
    }
    if (questoes.length) {
      const rows = questoes.filter((q) => (q.enunciado ?? '').trim()).map((q, i) => ({
        tenant_id: g.tenantId, edicao_id: id, ordem: i, enunciado: q.enunciado.trim(), gabarito: q.gabarito === 'E' ? 'E' : 'C',
        disciplina: q.disciplina || null, assunto: q.assunto || null, comentario: q.comentario || null,
        julgado_id: q.julgadoIdx != null ? ordemId.get(q.julgadoIdx) ?? null : null,
      }))
      await chunked(rows, (c) => svc.from('jurisclub_questoes').insert(c))
    }
    await recontar(svc, g.tenantId, id)
  } catch (e: any) {
    await svc.from('jurisclub_edicoes').delete().eq('id', id).eq('tenant_id', g.tenantId) // desfaz (cascade nos filhos)
    return { ok: false, error: e?.message ?? 'Falha ao gravar o conteúdo da edição.' }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId,
    depois: { titulo, pasta: input.pasta, status, julgados: julgados.length, questoes: questoes.length } })

  if (status === 'publicado' && input.avisar) {
    await criarNovidade(svc, { tenantId: g.tenantId, categoria: 'jurisclub', titulo: `${input.pasta === '1a7d' ? 'Novo dia no ar' : 'Nova edição do JurisClub'}: ${titulo}`, destaque: !!input.destaque, ctaLabel: 'Ler agora', criadoPor: g.atorId }).catch(() => null)
  }
  if (status !== 'rascunho' && input.paraBanco && questoes.length) await enviarQuestoesAoBanco(id).catch(() => null)
  revalidatePath(BASE)
  return { ok: true, id, status }
}

/** Contagem de alunos distintos nos grupos escolhidos (etapa 5 / aba Estudantes). */
export async function contarAlunosGrupos(grupoIds: string[]): Promise<R<{ total: number }>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return g
  return { ok: true, total: await alunosDosGrupos(g.tenantId, grupoIds ?? []) }
}

/** "Todos os alunos com JurisClub" (assinatura ativa em produto JurisClub + grupos vinculados ao produto). */
export async function contarAlunosJurisclub(): Promise<R<{ total: number }>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return g
  return { ok: true, total: await alunosComJurisclub(g.tenantId) }
}

/** Lê o documento da Biblioteca (categoria jurisclub) e devolve os títulos estruturados como julgados candidatos. */
export async function lerJulgadosDoDocumento(documentoId: string): Promise<R<{ julgados: JulgadoDraft[]; titulo: string }>> {
  const g = await guard('biblioteca:view')
  if (!g.ok) return g
  if (!UUID_RE.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id, titulo, versao_atual_id').eq('id', documentoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const versaoId = (doc as any).versao_atual_id as string | null
  if (!versaoId) return { ok: false, error: 'O documento ainda não tem versão processada.' }
  const trechos = await fetchAll<any>(() => svc.from('simulado_conteudo_trechos').select('uid, ordem, tipo, rotulo, texto')
    .eq('tenant_id', g.tenantId).eq('versao_id', versaoId).in('tipo', ['titulo', 'capitulo']).order('ordem', { ascending: true }))
  const julgados: JulgadoDraft[] = (trechos ?? [])
    .map((t: any) => ({ t: String(t.texto ?? t.rotulo ?? '').trim(), uid: t.uid as string }))
    .filter((x) => x.t.length >= 6)
    .map((x) => ({ titulo: x.t.slice(0, 300), tribunal: inferirTribunal(x.t), orgao: '', disciplina: '', selos: [], fazenda: false, conferido: false, trecho_uid: x.uid }))
  if (!julgados.length) return { ok: false, error: 'Não encontrei julgados estruturados neste documento. Cole a lista na etapa ou adicione manualmente.' }
  return { ok: true, julgados, titulo: (doc as any).titulo }
}

// ───────────────────────────── Página da edição ─────────────────────────────

/** Publicar / Tirar do ar. */
export async function alternarPublicacao(id: string, avisar = false): Promise<R<{ status: string }>> {
  const g = await guard('biblioteca:publicar'); if (!g.ok) return g
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const noAr = e.status === 'publicado'
  if (!noAr) {
    const [j, ed] = await Promise.all([
      svc.from('jurisclub_julgados').select('id', { count: 'exact', head: true }).eq('edicao_id', id).eq('tenant_id', g.tenantId),
      svc.from('jurisclub_edicoes').select('todos').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle(),
    ])
    if (!(j.count ?? 0)) return { ok: false, error: 'Não dá para publicar sem nenhum julgado.' }
    if (ed.data && !(ed.data as any).todos) {
      const { count } = await svc.from('jurisclub_edicao_grupos').select('grupo_id', { count: 'exact', head: true }).eq('edicao_id', id).eq('tenant_id', g.tenantId)
      if (!count) return { ok: false, error: 'Escolha ao menos um grupo em Estudantes antes de publicar.' }
    }
  }
  const status = noAr ? 'rascunho' : 'publicado'
  const { error } = await svc.from('jurisclub_edicoes').update({
    status, atualizado_em: new Date().toISOString(),
    ...(noAr ? { falta: 'tirado do ar' } : { falta: null, publicado_em: new Date().toISOString(), publicar_em: null }),
  }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: noAr ? 'BLOQUEAR' : 'LIBERAR', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, antes: { status: e.status }, depois: { status, titulo: e.titulo } })
  if (!noAr && avisar) await criarNovidade(svc, { tenantId: g.tenantId, categoria: 'jurisclub', titulo: `Nova edição do JurisClub: ${e.titulo}`, ctaLabel: 'Ler agora', criadoPor: g.atorId }).catch(() => null)
  revalidatePath(BASE)
  return { ok: true, status }
}

export async function alternarLiberacao(id: string, parte: keyof Liberacoes): Promise<R<{ liberado: boolean }>> {
  const g = await guard('biblioteca:publicar'); if (!g.ok) return g
  if (!['leitura', 'vf', 'pdf', 'cad', 'gab'].includes(parte)) return { ok: false, error: 'Parte inválida.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const lib: Liberacoes = { ...({ leitura: true, vf: false, pdf: true, cad: false, gab: false } as Liberacoes), ...(e.liberacoes ?? {}) }
  lib[parte] = !lib[parte]
  const { error } = await svc.from('jurisclub_edicoes').update({ liberacoes: lib, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: lib[parte] ? 'LIBERAR' : 'BLOQUEAR', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, antes: { parte, liberado: !lib[parte] }, depois: { parte, liberado: lib[parte], titulo: e.titulo } })
  revalidatePath(`${BASE}/${id}`)
  return { ok: true, liberado: lib[parte] }
}

export async function salvarQuemVe(id: string, todos: boolean, grupoIds: string[]): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const ids = [...new Set((grupoIds ?? []).filter((x) => UUID_RE.test(x)))]
  if (!todos && !ids.length) return { ok: false, error: 'Escolha ao menos um grupo ou libere para todos.' }
  if (ids.length) {
    const ok = await fetchAllByIn<any>(ids, (c) => svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).in('id', c).order('id'))
    if (ok.length !== ids.length) return { ok: false, error: 'Algum grupo não pertence a esta plataforma.' }
  }
  const { error } = await svc.from('jurisclub_edicoes').update({ todos, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await svc.from('jurisclub_edicao_grupos').delete().eq('edicao_id', id).eq('tenant_id', g.tenantId)
  if (!todos && ids.length) await chunked(ids, (c) => svc.from('jurisclub_edicao_grupos').insert(c.map((grupo_id) => ({ edicao_id: id, tenant_id: g.tenantId, grupo_id }))))
  await registrarAudit({ operacao: 'UPDATE', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, antes: { todos: e.todos }, depois: { todos, grupos: ids.length, quem: 'quem vê', titulo: e.titulo } })
  revalidatePath(`${BASE}/${id}`)
  return { ok: true }
}

export async function salvarConfiguracoes(id: string, c: { titulo: string; cor: string; imagem: string | null; ordem: 'doc' | 'disc' | 'trib'; filtros: string[]; versao: 'ambos' | 'ess' | 'comp' }): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  if (letras(c.titulo ?? '') < 3) return { ok: false, error: 'O nome precisa de pelo menos 3 letras.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const { error } = await svc.from('jurisclub_edicoes').update({
    titulo: c.titulo.trim(), cor: c.cor, imagem_url: c.imagem, ordem_julgados: c.ordem, filtros: c.filtros, versao: c.versao, atualizado_em: new Date().toISOString(),
  }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, antes: { titulo: e.titulo }, depois: { ...c, imagem: c.imagem ? 'definida' : null } })
  revalidatePath(`${BASE}/${id}`); revalidatePath(BASE)
  return { ok: true }
}

/** Liga a edição a um documento da Biblioteca: leitura (julgados), PDF original ou caderno de questões. */
export async function vincularDocumento(id: string, tipo: 'leitura' | 'pdf' | 'questoes', documentoId: string): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  if (!UUID_RE.test(documentoId)) return { ok: false, error: 'Documento inválido.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id').eq('id', documentoId).eq('tenant_id', g.tenantId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const col = tipo === 'leitura' ? 'documento_id' : tipo === 'pdf' ? 'pdf_doc_id' : 'questoes_doc_id'
  const { error } = await svc.from('jurisclub_edicoes').update({ [col]: documentoId, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, depois: { [col]: documentoId, titulo: e.titulo } })
  revalidatePath(`${BASE}/${id}`)
  return { ok: true }
}

/** "Trocar o .docx": lê o documento novo e acrescenta os julgados que ainda não existem (entram como NÃO conferidos). */
export async function trocarDocumento(id: string, documentoId: string): Promise<R<{ novos: number }>> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, id); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const lido = await lerJulgadosDoDocumento(documentoId)
  if (!lido.ok) return lido
  const existentes = await fetchAll<any>(() => svc.from('jurisclub_julgados').select('id, titulo, ordem').eq('edicao_id', id).eq('tenant_id', g.tenantId).order('id'))
  const tit = new Set(existentes.map((x: any) => String(x.titulo).trim().toLowerCase()))
  let ordem = existentes.reduce((m: number, x: any) => Math.max(m, x.ordem ?? 0), -1) + 1
  const novos = lido.julgados.filter((j) => !tit.has(j.titulo.trim().toLowerCase()))
  if (novos.length) {
    await chunked(novos, (c) => svc.from('jurisclub_julgados').insert(c.map((j) => ({
      tenant_id: g.tenantId, edicao_id: id, ordem: ordem++, titulo: j.titulo, tribunal: j.tribunal, orgao: null, disciplina: null, selos: [], fazenda: false, conferido: false, trecho_uid: j.trecho_uid ?? null,
    }))))
  }
  await svc.from('jurisclub_edicoes').update({ documento_id: documentoId }).eq('id', id).eq('tenant_id', g.tenantId)
  await recontar(svc, g.tenantId, id)
  await registrarAudit({ operacao: 'UPDATE', entidade: 'jurisclub_edicoes', entidadeId: id, tenantId: g.tenantId, atorId: g.atorId, depois: { documento_id: documentoId, julgados_novos: novos.length, titulo: e.titulo } })
  revalidatePath(`${BASE}/${id}`)
  return { ok: true, novos: novos.length }
}

// ── Julgados ──

export async function salvarJulgado(edicaoId: string, julgadoId: string | null, j: { titulo: string; tribunal: string; orgao: string; disciplina: string; selos: string[] }): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  const titulo = (j.titulo ?? '').trim()
  if (titulo.length < 3) return { ok: false, error: 'Informe o título.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, edicaoId); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const selos = (j.selos ?? []).filter((s) => ['rg', 'rep', 'vinc', 'reaf', 'sup', 'nov', 'fav', 'desf'].includes(s))
  const campos = { titulo, tribunal: j.tribunal || 'STF', orgao: j.orgao || null, disciplina: j.disciplina || null, selos, fazenda: selos.includes('fav') || selos.includes('desf') }
  if (julgadoId) {
    if (!UUID_RE.test(julgadoId)) return { ok: false, error: 'Julgado inválido.' }
    const { error } = await svc.from('jurisclub_julgados').update(campos).eq('id', julgadoId).eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: ult } = await svc.from('jurisclub_julgados').select('ordem').eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId).order('ordem', { ascending: false }).limit(1)
    const ordem = ((ult?.[0] as any)?.ordem ?? -1) + 1
    const { error } = await svc.from('jurisclub_julgados').insert({ ...campos, tenant_id: g.tenantId, edicao_id: edicaoId, ordem, conferido: false })
    if (error) return { ok: false, error: error.message }
    await recontar(svc, g.tenantId, edicaoId)
  }
  await registrarAudit({ operacao: julgadoId ? 'UPDATE' : 'INSERT', entidade: 'jurisclub_julgados', entidadeId: julgadoId, tenantId: g.tenantId, atorId: g.atorId, depois: { ...campos, edicao: e.titulo } })
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true }
}

export async function conferirJulgado(edicaoId: string, julgadoId: string, conferido: boolean): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  if (!UUID_RE.test(julgadoId)) return { ok: false, error: 'Julgado inválido.' }
  const svc = createAdminClient()
  const { error } = await svc.from('jurisclub_julgados').update({ conferido }).eq('id', julgadoId).eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true }
}

export async function excluirJulgado(edicaoId: string, julgadoId: string): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  if (!UUID_RE.test(julgadoId)) return { ok: false, error: 'Julgado inválido.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, edicaoId); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const { data: antes } = await svc.from('jurisclub_julgados').select('titulo').eq('id', julgadoId).eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId).maybeSingle()
  const { error } = await svc.from('jurisclub_julgados').delete().eq('id', julgadoId).eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await recontar(svc, g.tenantId, edicaoId)
  await registrarAudit({ operacao: 'DELETE', entidade: 'jurisclub_julgados', entidadeId: julgadoId, tenantId: g.tenantId, atorId: g.atorId, antes: { titulo: (antes as any)?.titulo, edicao: e.titulo } })
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true }
}

/** Sobe/desce um julgado trocando a `ordem` com o vizinho. */
export async function moverJulgado(edicaoId: string, julgadoId: string, dir: -1 | 1): Promise<R> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  if (!UUID_RE.test(julgadoId)) return { ok: false, error: 'Julgado inválido.' }
  const svc = createAdminClient()
  const { data: cur } = await svc.from('jurisclub_julgados').select('id, ordem').eq('id', julgadoId).eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (!cur) return { ok: false, error: 'Julgado não encontrado.' }
  const ordem = (cur as any).ordem as number
  const q = svc.from('jurisclub_julgados').select('id, ordem').eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId)
  const { data: viz } = await (dir < 0 ? q.lt('ordem', ordem).order('ordem', { ascending: false }) : q.gt('ordem', ordem).order('ordem', { ascending: true })).limit(1)
  const v = viz?.[0] as any
  if (!v) return { ok: true }
  await Promise.all([
    svc.from('jurisclub_julgados').update({ ordem: v.ordem }).eq('id', julgadoId).eq('tenant_id', g.tenantId),
    svc.from('jurisclub_julgados').update({ ordem }).eq('id', v.id).eq('tenant_id', g.tenantId),
  ])
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true }
}

// ── Questões V/F ──

export async function adicionarQuestoes(edicaoId: string, qs: QuestaoDraft[]): Promise<R<{ adicionadas: number }>> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, edicaoId); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const lista = (qs ?? []).filter((q) => (q.enunciado ?? '').trim())
  if (!lista.length) return { ok: false, error: 'Nenhuma questão válida.' }
  const { data: ult } = await svc.from('jurisclub_questoes').select('ordem').eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId).order('ordem', { ascending: false }).limit(1)
  let ordem = ((ult?.[0] as any)?.ordem ?? -1) + 1
  // "Ligada a": o nº do julgado (coluna Ordem, 1-based) vira julgado_id.
  const nums = [...new Set(lista.map((q) => q.julgadoIdx).filter((n): n is number => n != null))]
  const porOrdem = new Map<number, string>()
  if (nums.length) {
    const { data: js } = await svc.from('jurisclub_julgados').select('id, ordem').eq('tenant_id', g.tenantId).eq('edicao_id', edicaoId).in('ordem', nums.map((n) => n - 1))
    for (const j of (js ?? []) as any[]) porOrdem.set(j.ordem + 1, j.id)
  }
  await chunked(lista, (c) => svc.from('jurisclub_questoes').insert(c.map((q) => ({
    tenant_id: g.tenantId, edicao_id: edicaoId, ordem: ordem++, enunciado: q.enunciado.trim(), gabarito: q.gabarito === 'E' ? 'E' : 'C',
    disciplina: q.disciplina || null, assunto: q.assunto || null, comentario: q.comentario || null, julgado_id: q.julgadoIdx != null ? porOrdem.get(q.julgadoIdx) ?? null : null,
  }))))
  await recontar(svc, g.tenantId, edicaoId)
  await registrarAudit({ operacao: 'INSERT', entidade: 'jurisclub_questoes', tenantId: g.tenantId, atorId: g.atorId, depois: { edicao: e.titulo, quantidade: lista.length } })
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true, adicionadas: lista.length }
}

/** "Mandar ao banco do simulado": cria (dedupe por external_id) as V/F no banco de Questões, formato Certo/Errado. */
export async function enviarQuestoesAoBanco(edicaoId: string): Promise<R<{ criadas: number; jaExistiam: number }>> {
  const g = await guard('biblioteca:update'); if (!g.ok) return g
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, edicaoId); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  const rows = await fetchAll<any>(() => svc.from('jurisclub_questoes').select('id, enunciado, gabarito, disciplina, assunto, comentario, ordem').eq('edicao_id', edicaoId).eq('tenant_id', g.tenantId).order('ordem').order('id'))
  if (!rows.length) return { ok: false, error: 'Esta edição ainda não tem questões.' }
  const qs: QuestaoImport[] = rows.map((r: any, i: number) => ({
    linha: i + 1, numero: `jurisclub-${r.id}`, enunciado: r.enunciado, tipo: 'objetiva', formato: 'certo_errado',
    disciplina: r.disciplina, assunto: r.assunto, comentario_professor: r.comentario, etiquetas: ['JurisClub'],
    alternativas: [{ texto: 'Certo', correta: r.gabarito === 'C', ordem: 1 }, { texto: 'Errado', correta: r.gabarito === 'E', ordem: 2 }],
  }))
  const res = await confirmarImportQuestoes(null, qs)
  if (!res.ok) return { ok: false, error: res.error ?? 'Falha ao enviar ao banco.' }
  await registrarAudit({ operacao: 'INSERT', entidade: 'jurisclub_questoes', tenantId: g.tenantId, atorId: g.atorId, depois: { edicao: e.titulo, destino: 'banco de questões', criadas: res.criadas, jaExistiam: res.jaExistiam } })
  return { ok: true, criadas: res.criadas ?? 0, jaExistiam: res.jaExistiam ?? 0 }
}

// ── Erratas ──

export async function registrarErrata(edicaoId: string, input: { julgadoTitulo: string; texto: string; avisar: boolean }): Promise<R> {
  const g = await guard('biblioteca:publicar'); if (!g.ok) return g
  const texto = (input.texto ?? '').trim()
  if (!texto) return { ok: false, error: 'Escreva o que mudou.' }
  const svc = createAdminClient()
  const e = await edicaoDoTenant(svc, g.tenantId, edicaoId); if (!e) return { ok: false, error: 'Edição não encontrada.' }
  let novidadeId: string | null = null
  if (input.avisar) {
    const n = await criarNovidade(svc, { tenantId: g.tenantId, categoria: 'jurisclub', titulo: `Errata · ${e.titulo}`, descricao: `${input.julgadoTitulo ? input.julgadoTitulo + ': ' : ''}${texto}`, criadoPor: g.atorId })
    if ('id' in n) novidadeId = n.id
  }
  const { error } = await svc.from('jurisclub_erratas').insert({
    tenant_id: g.tenantId, edicao_id: edicaoId, julgado_titulo: input.julgadoTitulo?.slice(0, 300) || null, texto, avisou: !!input.avisar, novidade_id: novidadeId, criado_por: g.atorId,
  })
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'jurisclub_erratas', tenantId: g.tenantId, atorId: g.atorId, depois: { edicao: e.titulo, julgado: input.julgadoTitulo, avisou: !!input.avisar } })
  revalidatePath(`${BASE}/${edicaoId}`)
  return { ok: true }
}

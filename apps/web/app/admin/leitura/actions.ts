'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { faixaUuidDoCodigo } from '@/lib/codigo-questao'
import { espinhaDeHtml, reancorar } from '@/lib/leitura/reanchor'

export type SituacaoEditorial = 'em_preparacao' | 'rascunho' | 'em_revisao' | 'publicada' | 'arquivada' | 'revogada'

export type Documento = {
  id: string
  titulo: string
  descricao: string | null
  cor: string | null
  icone: string | null
  capa_url: string | null
  pasta_id: string | null
  versao: number
  publicado: boolean
  desafio_ativo: boolean
  desafio_exige_fim: boolean
  desafio_tempo_min: number | null
  artigos?: number
  // Metadados de LEI (Fase A / A1) — todos opcionais (documentos genéricos ficam null).
  materia_id?: string | null
  tipo_norma?: string | null
  numero?: string | null
  ano?: number | null
  titulo_oficial?: string | null
  ementa?: string | null
  slug?: string | null
  esfera?: string | null
  fonte_oficial?: string | null
  ultima_verificacao?: string | null
  ordem?: number | null
  situacao_editorial?: SituacaoEditorial | null
}

export type Materia = { id: string; nome: string; slug: string | null; descricao: string | null; cor: string | null; icone: string | null; ordem: number }

/** slug seguro a partir de um texto (sem acento, minúsculo, hífens). */
function slugify(s: string): string {
  return (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

async function guard(perm: string) {
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Cria um documento vazio (rascunho) — o conteúdo HTML entra no editor. */
export async function criarDocumento(titulo: string, pastaId?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const t = (titulo ?? '').trim() || 'Novo documento'
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_documentos')
    .insert({ tenant_id: g.tenantId, titulo: t, pasta_id: pastaId ?? null, criado_por: g.atorId })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_documentos', entidadeId: (data as any).id, depois: { titulo: t }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true, id: (data as any).id }
}

const CAMPOS_DOC = [
  'titulo', 'descricao', 'cor', 'icone', 'capa_url', 'publicado', 'desafio_ativo', 'desafio_exige_fim', 'desafio_tempo_min', 'pasta_id',
  // metadados de lei (A1) — tolerante: se a coluna não existir, o update refaz sem elas.
  'materia_id', 'tipo_norma', 'numero', 'ano', 'titulo_oficial', 'ementa', 'slug', 'esfera', 'fonte_oficial', 'ultima_verificacao', 'ordem', 'situacao_editorial',
] as const
const CAMPOS_LEI = new Set(['materia_id', 'tipo_norma', 'numero', 'ano', 'titulo_oficial', 'ementa', 'slug', 'esfera', 'fonte_oficial', 'ultima_verificacao', 'ordem', 'situacao_editorial'])

export async function atualizarDocumento(
  id: string,
  patch: Partial<Pick<Documento, (typeof CAMPOS_DOC)[number]>>,
): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of CAMPOS_DOC) { if (k in patch) dados[k] = (patch as any)[k] }
  if (typeof dados.titulo === 'string') dados.titulo = (dados.titulo as string).trim() || 'Documento'
  // Slug: normaliza + registra o slug ANTERIOR no histórico (redireciona links antigos).
  if ('slug' in dados) {
    const novo = dados.slug ? slugify(String(dados.slug)) : null
    dados.slug = novo
    if (novo) {
      const { data: atual } = await svc.from('simulado_documentos').select('slug').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
      const antigo = (atual as any)?.slug as string | null
      if (antigo && antigo !== novo) await svc.from('simulado_lei_slug_historico').upsert({ tenant_id: g.tenantId, documento_id: id, slug: antigo }, { onConflict: 'tenant_id,slug', ignoreDuplicates: true })
    }
  }

  let { error } = await svc.from('simulado_documentos').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  // Tolerante: se as colunas de lei ainda não migraram, salva só os campos base.
  if (error && /column|materia_id|situacao_editorial|titulo_oficial/i.test(error.message)) {
    const base: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(dados)) if (!CAMPOS_LEI.has(k)) base[k] = v
    ;({ error } = await svc.from('simulado_documentos').update(base).eq('id', id).eq('tenant_id', g.tenantId))
  }
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documentos', entidadeId: id, depois: dados, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${id}`)
  return { ok: true }
}

export async function publicarDocumento(id: string, publicado: boolean): Promise<{ ok: boolean; error?: string }> {
  return atualizarDocumento(id, { publicado })
}

// ── Versionamento / publicação (A2) ──────────────────────────────────────────

/** Carry-over aditivo da versão publicada → nova versão (progresso, questões, anotações). */
async function carryOver(svc: ReturnType<typeof createAdminClient>, tenantId: string, documentoId: string, vAnt: number, vNova: number, htmlNovo: string) {
  if (vAnt === vNova) return
  // Progresso: copia p/ a nova versão (ignora se já existir).
  const { data: prog } = await svc.from('simulado_leitura_progresso').select('estudante_id, pct, artigo_max, tempo_seg, iniciado_em, concluido_em').eq('documento_id', documentoId).eq('documento_versao', vAnt)
  if (prog?.length) await svc.from('simulado_leitura_progresso').upsert((prog as any[]).map((p) => ({ tenant_id: tenantId, estudante_id: p.estudante_id, documento_id: documentoId, documento_versao: vNova, pct: p.pct, artigo_max: p.artigo_max, tempo_seg: p.tempo_seg, iniciado_em: p.iniciado_em, concluido_em: p.concluido_em })), { onConflict: 'estudante_id,documento_id,documento_versao', ignoreDuplicates: true })
  // Questões inline: re-liga à nova versão.
  const { data: qs } = await svc.from('simulado_documento_questoes').select('questao_id, apos_artigo, obrigatoria, ordem').eq('documento_id', documentoId).eq('documento_versao', vAnt).eq('deletado', false)
  if (qs?.length) await svc.from('simulado_documento_questoes').upsert((qs as any[]).map((q) => ({ tenant_id: tenantId, documento_id: documentoId, documento_versao: vNova, questao_id: q.questao_id, apos_artigo: q.apos_artigo, obrigatoria: q.obrigatoria, ordem: q.ordem })), { onConflict: 'documento_id,documento_versao,questao_id', ignoreDuplicates: true })
  // Anotações (aluno + base): re-ancora pela espinha da nova versão; falha → revisao_necessaria.
  const S = espinhaDeHtml(htmlNovo)
  for (const tabela of ['simulado_leitura_anotacoes', 'simulado_documento_anotacoes_base'] as const) {
    const ehAluno = tabela === 'simulado_leitura_anotacoes'
    // Do aluno, carrega só as PRÓPRIAS (grifos base são re-clonados das novas base rows → sem duplicar).
    let q = svc.from(tabela).select('*').eq('documento_id', documentoId).eq('documento_versao', vAnt).eq('deletado', false)
    if (ehAluno) q = q.eq('origem', 'propria')
    const { data: anots, error } = await q
    if (error || !anots?.length) continue
    const novas = (anots as any[]).map((a) => {
      const rec = reancorar(S, { inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '' })
      const base: Record<string, unknown> = {
        tenant_id: tenantId, documento_id: documentoId, documento_versao: vNova,
        inicio_char: rec?.inicio ?? a.inicio_char, fim_char: rec?.fim ?? a.fim_char,
        exact: a.exact, prefix: a.prefix, suffix: a.suffix, cor: a.cor, nota: a.nota,
      }
      if (ehAluno) { base.estudante_id = a.estudante_id; base.origem = a.origem; base.base_id = a.base_id; base.revisao_necessaria = !rec }
      else { base.ordem = a.ordem; if ('tipo_grifo' in a) { base.tipo_grifo = a.tipo_grifo; base.editorial = a.editorial } }
      return base
    })
    if (ehAluno) await svc.from(tabela).upsert(novas as any, { onConflict: 'estudante_id,documento_versao,base_id', ignoreDuplicates: true })
    else await svc.from(tabela).insert(novas as any)
  }
}

/** Publica o rascunho como versão IMUTÁVEL e vira o ponteiro (commit num único UPDATE). */
export async function publicarVersao(documentoId: string, relatorio?: { tipo?: string; descricao?: string }): Promise<{ ok: boolean; versao?: number; error?: string }> {
  const g = await guard('leitura:publicar'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc, error: derr } = await svc.from('simulado_documentos').select('versao, versao_publicada, versao_rascunho').eq('id', documentoId).eq('tenant_id', g.tenantId).maybeSingle()
  if (derr && /versao_publicada|column/i.test(derr.message)) return { ok: false, error: 'Rode a migração de versionamento (20260823000002).' }
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const pub = (doc as any).versao_publicada ?? (doc as any).versao ?? 1
  const rasc = (doc as any).versao_rascunho ?? pub
  if (rasc <= pub) return { ok: false, error: 'Não há rascunho novo para publicar. Edite o conteúdo primeiro.' }

  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html').eq('documento_id', documentoId).eq('versao', rasc).maybeSingle()
  const html = (cont as any)?.html as string | undefined
  if (!html || !html.replace(/<[^>]+>/g, '').trim()) return { ok: false, error: 'Rascunho vazio — nada a publicar.' }

  // 1) carry-over aditivo (mantém linhas antigas → seguro/re-executável)
  try { await carryOver(svc, g.tenantId, documentoId, pub, rasc, html) } catch (e) { console.error('[leitura] carryOver:', (e as Error)?.message) }
  // 2) marca a linha como publicada (imutável a partir daqui)
  await svc.from('simulado_documento_conteudos').update({ estado: 'publicada', publicado_em: new Date().toISOString(), publicado_por: g.atorId }).eq('documento_id', documentoId).eq('versao', rasc)
  // 3) COMMIT — vira o ponteiro num único UPDATE (aluno passa a ver a nova versão)
  const { error } = await svc.from('simulado_documentos').update({ versao_publicada: rasc, versao: rasc, publicado: true, situacao_editorial: 'publicada', atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  // 4) relatório público + auditoria
  const tipo = relatorio?.tipo || (pub === rasc - 1 && pub <= 1 ? 'nova_lei' : 'alteracao')
  await svc.from('simulado_lei_atualizacoes').insert({ tenant_id: g.tenantId, documento_id: documentoId, versao: rasc, tipo, descricao: relatorio?.descricao || null, criado_por: g.atorId })
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { versao_publicada: rasc, tipo }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true, versao: rasc }
}

/** Arquiva a lei (some do catálogo comum; preserva versões/anotações). */
export async function arquivarDocumento(documentoId: string, arquivar: boolean): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ situacao_editorial: arquivar ? 'arquivada' : 'publicada', publicado: !arquivar, atualizado_em: new Date().toISOString() }).eq('id', documentoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: arquivar ? 'BLOQUEAR' : 'LIBERAR', entidade: 'simulado_documentos', entidadeId: documentoId, depois: { arquivada: arquivar }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura'); revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

// ── Matérias (áreas do direito) — organização do catálogo ────────────────────

export async function listarMaterias(): Promise<{ ok: boolean; itens?: Materia[]; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_materias').select('id, nome, slug, descricao, cor, icone, ordem').eq('tenant_id', g.tenantId).eq('deletado', false).order('ordem').order('nome')
  if (error) return { ok: false, error: error.message }
  return { ok: true, itens: (data ?? []).map((m: any) => ({ id: m.id, nome: m.nome, slug: m.slug ?? null, descricao: m.descricao ?? null, cor: m.cor ?? null, icone: m.icone ?? null, ordem: m.ordem ?? 0 })) }
}

export async function criarMateria(nome: string, cor?: string | null, icone?: string | null): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const n = (nome ?? '').trim(); if (!n) return { ok: false, error: 'Informe um nome.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_materias').insert({ tenant_id: g.tenantId, nome: n, slug: slugify(n), cor: cor ?? null, icone: icone ?? null }).select('id').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Já existe uma matéria com esse nome.' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_materias', entidadeId: (data as any).id, depois: { nome: n }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura/materias')
  return { ok: true, id: (data as any).id }
}

export async function atualizarMateria(id: string, patch: Partial<Pick<Materia, 'nome' | 'cor' | 'icone' | 'ordem'>>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  for (const k of ['nome', 'cor', 'icone', 'ordem'] as const) if (k in patch) dados[k] = (patch as any)[k]
  if (typeof dados.nome === 'string') { dados.nome = (dados.nome as string).trim(); dados.slug = slugify(dados.nome as string) }
  const { error } = await svc.from('simulado_materias').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/leitura/materias')
  return { ok: true }
}

export async function excluirMateria(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:delete'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  // Solta as leis dessa matéria (não apaga leis) + soft-delete da matéria.
  await svc.from('simulado_documentos').update({ materia_id: null }).eq('materia_id', id).eq('tenant_id', g.tenantId)
  const { error } = await svc.from('simulado_materias').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_materias', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura/materias')
  return { ok: true }
}

/** Soft-delete (some das listagens; a lixeira restaura). */
export async function excluirDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:delete'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documentos').update({ deletado: true, atualizado_em: new Date().toISOString() }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_documentos', entidadeId: id, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath('/admin/leitura')
  return { ok: true }
}

/** Duplica o documento + a versão vigente do conteúdo. */
export async function duplicarDocumento(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:create'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_documentos').select('*').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Documento não encontrado.' }
  const { data: novo, error } = await svc.from('simulado_documentos').insert({
    tenant_id: g.tenantId, titulo: `${(orig as any).titulo} (cópia)`, descricao: (orig as any).descricao,
    cor: (orig as any).cor, icone: (orig as any).icone, capa_url: (orig as any).capa_url, pasta_id: (orig as any).pasta_id,
    versao: 1, publicado: false, desafio_ativo: (orig as any).desafio_ativo, desafio_exige_fim: (orig as any).desafio_exige_fim,
    desafio_tempo_min: (orig as any).desafio_tempo_min, criado_por: g.atorId,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  const novoId = (novo as any).id
  // Copia a versão vigente do conteúdo (se houver).
  const { data: cont } = await svc.from('simulado_documento_conteudos').select('html, texto_hash, artigos').eq('documento_id', id).eq('versao', (orig as any).versao).maybeSingle()
  if (cont) await svc.from('simulado_documento_conteudos').insert({ tenant_id: g.tenantId, documento_id: novoId, versao: 1, html: (cont as any).html, texto_hash: (cont as any).texto_hash, artigos: (cont as any).artigos })
  revalidatePath('/admin/leitura')
  return { ok: true, id: novoId }
}

// ── Atribuição (grupos + estudantes). SEM atribuição = liberado a todos. ────────

/** Grupos atribuídos + todos os grupos do tenant (p/ o seletor). */
export async function carregarAtribuicao(documentoId: string): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; atribuido: boolean }[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: todos } = await svc.from('simulado_grupos').select('id, nome, cor').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome')
  const { data: atrib } = await svc.from('simulado_documento_grupos').select('grupo_id').eq('documento_id', documentoId)
  const set = new Set((atrib ?? []).map((r: any) => r.grupo_id))
  return { ok: true, grupos: (todos ?? []).map((x: any) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, atribuido: set.has(x.id) })) }
}

/** Define os grupos atribuídos (substitui o conjunto atual). */
export async function definirGruposDocumento(documentoId: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  await svc.from('simulado_documento_grupos').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (ids.length) {
    const { error } = await svc.from('simulado_documento_grupos').insert(ids.map((grupo_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_documento_grupos', entidadeId: documentoId, depois: { grupos: ids.length }, atorId: g.atorId, tenantId: g.tenantId })
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true }
}

// ── Anotações BASE (pré-definidas do admin) — vêm no documento p/ todos os alunos ──

export type AnotacaoBase = { id: string; inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota: string | null }

/** Lista as anotações base da versão vigente do documento. */
export async function listarAnotacoesBase(documentoId: string, versao: number): Promise<{ ok: boolean; itens?: AnotacaoBase[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_anotacoes_base')
    .select('id, inicio_char, fim_char, exact, prefix, suffix, cor, nota')
    .eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false)
  if (error) return { ok: false, error: error.message }
  return { ok: true, itens: (data ?? []).map((a: any) => ({ id: a.id, inicio: a.inicio_char, fim: a.fim_char, exact: a.exact, prefix: a.prefix ?? '', suffix: a.suffix ?? '', cor: a.cor, nota: a.nota ?? null })) }
}

export async function criarAnotacaoBase(documentoId: string, versao: number, a: { inicio: number; fim: number; exact: string; prefix: string; suffix: string; cor: string; nota?: string | null }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_anotacoes_base').insert({
    tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao,
    inicio_char: a.inicio, fim_char: a.fim, exact: String(a.exact).slice(0, 4000), prefix: a.prefix ?? null, suffix: a.suffix ?? null, cor: a.cor, nota: a.nota || null,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as any).id }
}

export async function atualizarAnotacaoBase(id: string, patch: { cor?: string; nota?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  if ('cor' in patch) dados.cor = patch.cor
  if ('nota' in patch) dados.nota = patch.nota || null
  const { error } = await svc.from('simulado_documento_anotacoes_base').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function excluirAnotacaoBase(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_anotacoes_base').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Questões no meio da leitura (Fase 2) ──

export type QuestaoDoc = { id: string; questaoId: string; enunciado: string; aposArtigo: number; obrigatoria: boolean }
export type QuestaoBuscaLeitura = { id: string; enunciado: string; codigo: string | null }

const snippet = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)

/** Questões já anexadas ao documento (versão vigente). */
export async function listarQuestoesDocumento(documentoId: string, versao: number): Promise<{ ok: boolean; itens?: QuestaoDoc[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: dq, error } = await svc.from('simulado_documento_questoes')
    .select('id, questao_id, apos_artigo, obrigatoria').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).eq('documento_versao', versao).eq('deletado', false).order('apos_artigo').order('ordem')
  if (error) return { ok: false, error: error.message }
  const ids = [...new Set((dq ?? []).map((x: any) => x.questao_id))]
  const enun = new Map<string, string>()
  if (ids.length) {
    const { data: qs } = await svc.from('simulado_questoes').select('id, enunciado').in('id', ids)
    for (const q of (qs ?? []) as any[]) enun.set(q.id, snippet(q.enunciado))
  }
  return { ok: true, itens: (dq ?? []).map((x: any) => ({ id: x.id, questaoId: x.questao_id, enunciado: enun.get(x.questao_id) || 'Questão', aposArtigo: x.apos_artigo, obrigatoria: !!x.obrigatoria })) }
}

/** Busca questões objetivas do banco (por enunciado ou código) para anexar. */
export async function buscarQuestoesLeitura(query: string): Promise<{ ok: boolean; itens?: QuestaoBuscaLeitura[]; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const q = (query ?? '').trim()
  const faixa = q ? faixaUuidDoCodigo(q) : null
  let sel = svc.from('simulado_questoes').select('id, enunciado, codigo').eq('tenant_id', g.tenantId).eq('deletado', false).eq('tipo', 'objetiva').limit(30)
  if (faixa) sel = sel.gte('id', faixa.lo).lte('id', faixa.hi)
  else if (q) sel = sel.ilike('enunciado', `%${q.replace(/[%,]/g, ' ')}%`)
  let res = await sel
  if (res.error && /codigo/i.test(res.error.message)) res = await svc.from('simulado_questoes').select('id, enunciado').eq('tenant_id', g.tenantId).eq('deletado', false).eq('tipo', 'objetiva').ilike('enunciado', `%${q}%`).limit(30) as any
  if (res.error) return { ok: false, error: res.error.message }
  return { ok: true, itens: (res.data ?? []).map((x: any) => ({ id: x.id, enunciado: snippet(x.enunciado) || 'Questão', codigo: x.codigo ?? null })) }
}

export async function adicionarQuestaoDocumento(documentoId: string, versao: number, questaoId: string, aposArtigo: number, obrigatoria: boolean): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_documento_questoes').upsert(
    { tenant_id: g.tenantId, documento_id: documentoId, documento_versao: versao, questao_id: questaoId, apos_artigo: aposArtigo, obrigatoria, ordem: aposArtigo, deletado: false },
    { onConflict: 'documento_id,documento_versao,questao_id' },
  ).select('id').single()
  if (error) return { ok: false, error: /duplicate|unique/i.test(error.message) ? 'Essa questão já está no documento.' : error.message }
  revalidatePath(`/admin/leitura/${documentoId}`)
  return { ok: true, id: (data as any).id }
}

export async function atualizarQuestaoDocumento(id: string, patch: { aposArtigo?: number; obrigatoria?: boolean }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const dados: Record<string, unknown> = {}
  if ('aposArtigo' in patch) { dados.apos_artigo = patch.aposArtigo; dados.ordem = patch.aposArtigo }
  if ('obrigatoria' in patch) dados.obrigatoria = patch.obrigatoria
  const { error } = await svc.from('simulado_documento_questoes').update(dados).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function removerQuestaoDocumento(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('leitura:update'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_documento_questoes').update({ deletado: true }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Lista de documentos do admin (grade), com a contagem de artigos da versão vigente. */
export async function listarDocumentosAdmin(): Promise<{ ok: boolean; itens?: Documento[]; error?: string }> {
  const g = await guard('leitura:view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const docs = await fetchAll<any>(() =>
    svc.from('simulado_documentos').select('*').eq('tenant_id', g.tenantId).eq('deletado', false).order('atualizado_em', { ascending: false }))
  const ids = docs.map((d) => d.id)
  const artigosPorDoc = new Map<string, number>()
  if (ids.length) {
    const { data: cont } = await svc.from('simulado_documento_conteudos').select('documento_id, versao, artigos').in('documento_id', ids)
    const versaoDoc = new Map(docs.map((d) => [d.id, d.versao]))
    for (const c of (cont ?? []) as any[]) if (c.versao === versaoDoc.get(c.documento_id)) artigosPorDoc.set(c.documento_id, c.artigos ?? 0)
  }
  return { ok: true, itens: docs.map((d) => ({ ...d, artigos: artigosPorDoc.get(d.id) ?? 0 })) }
}

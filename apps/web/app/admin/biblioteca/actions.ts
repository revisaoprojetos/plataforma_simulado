'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getStorage } from '@/lib/storage'
import { getCurrentAccess, checkPermission, getAuthUser } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { selecionarGrupos } from '@/lib/simulado/grupos'
import {
  listarDocumentos, obterDocumento, listarVersoes, criarDocumento,
  criarVersao, definirArquivoVersao, definirVersaoAtual, ultimaVersao,
} from '@/lib/conteudo/documentos'
import { randomUUID } from 'node:crypto'
import { tipoDoArquivo, converterParaHtml, guardarOriginal, baixarOriginal, urlAssinadaOriginal, resolverBucketConteudo } from '@/lib/conteudo/ingestao'
import { contagensDocsAreaSql, resumoAcessoPastaSql } from '@/lib/conteudo/biblioteca-sql'
import { reconciliarVersao } from '@/lib/conteudo/reconciliacao'
import { listarVinculosDoDocumento, vincularDocumento, desvincular, type ModoVinculo } from '@/lib/conteudo/vinculos'
import { gerarThumbDocumento, gerarPdfDocumento } from '@/lib/conteudo/thumb'

// Duas coleções na mesma infra: 'conteudo' (materiais) e 'modelo_caderno' (modelos de caderno em docx).
// Cada uma tem suas próprias pastas via folder_area.
export type Categoria = 'conteudo' | 'modelo_caderno'
const folderArea = (c: Categoria) => (c === 'modelo_caderno' ? 'conteudo_modelo' : 'conteudo')
const PASTAS = 'simulado_pastas'

async function guard(acao: 'view' | 'update') {
  const perm = acao === 'view' ? 'configuracoes:view' : 'configuracoes:update'
  if (!(await checkPermission(perm))) return { ok: false as const, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId, atorId: access.userId ?? null }
}

// ── PASTAS (estilo Drive) ────────────────────────────────────────────────────────
export interface PastaConteudo { id: string; nome: string; pai_id: string | null; cor: string | null }

export async function listarArvore(pastaId?: string | null, categoria: Categoria = 'conteudo'): Promise<{
  ok: boolean; error?: string
  pastas: PastaConteudo[]; documentos: Awaited<ReturnType<typeof listarDocumentos>>; breadcrumb: PastaConteudo[]
  previas: Record<string, { tipo: string; texto: string }[]>
  thumbs: Record<string, string>
  contagens: Record<string, number>        // itens (docs + subpastas) DENTRO de cada pasta listada
  restritasPasta: Record<string, boolean>  // pasta com acesso_geral = 'restrito'
  restritoDoc: Record<string, boolean>     // doc com acesso_geral = 'restrito'
  resumo: { nGrupos: number; nAlunos: number } // entrega agregada da pasta atual (grupos/alunos distintos)
}> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error, pastas: [], documentos: [], breadcrumb: [], previas: {}, thumbs: {}, contagens: {}, restritasPasta: {}, restritoDoc: {}, resumo: { nGrupos: 0, nAlunos: 0 } }
  const svc = createAdminClient()
  const area = folderArea(categoria)
  const alvo = pastaId ?? null
  // ONDA 1: pastas da área + docs da pasta atual (paralelo). O "índice de TODOS os docs" NÃO é mais puxado —
  // as contagens vêm do SQL agregado (Fase 1 egress). Só cai no fetchAll de docs se o SQL estiver indisponível.
  const [todas, documentos] = await Promise.all([
    fetchAll<any>(() => svc.from(PASTAS).select('id, nome, pai_id, cor, deletado, acesso_geral').eq('tenant_id', g.tenantId).eq('folder_area', area).eq('is_folder', true).order('id', { ascending: true })).then((r) => r ?? []),
    listarDocumentos({ pastaId: alvo, categoria }),
  ])
  const doArea = todas.filter((p) => !p.deletado).sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
  const pastas = doArea.filter((p) => (p.pai_id ?? null) === alvo).map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }))
  const docIds = documentos.map((d) => d.id)

  const contagens: Record<string, number> = {}
  const restritasPasta: Record<string, boolean> = {}
  const restritoDoc: Record<string, boolean> = {}
  const resumo = { nGrupos: 0, nAlunos: 0 }

  // SQL AGREGADO (egress mínimo): contagem de docs por pasta + restritos + resumo de acesso — tudo no banco.
  const [contSql, resumoSql] = await Promise.all([
    contagensDocsAreaSql(g.tenantId, categoria),
    resumoAcessoPastaSql(g.tenantId, docIds, alvo),
  ])

  // docsPorPasta + restritoDoc: do SQL; se indisponível, FALLBACK PostgREST (puxa o índice leve de docs).
  let docsPorPasta: Map<string, number>
  if (contSql) {
    docsPorPasta = contSql.porPasta
    for (const id of contSql.restritos) restritoDoc[id] = true
  } else {
    const docsArea = (await fetchAll<any>(() => svc.from('simulado_conteudo_documentos').select('id, pasta_id, acesso_geral').eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false).order('id', { ascending: true }))) ?? []
    docsPorPasta = new Map<string, number>()
    for (const d of docsArea) { const k = d.pasta_id ?? '__root__'; docsPorPasta.set(k, (docsPorPasta.get(k) ?? 0) + 1); if (String(d.acesso_geral) === 'restrito') restritoDoc[d.id] = true }
  }
  const subPorPasta = new Map<string, number>()
  for (const p of doArea) { const k = p.pai_id ?? '__root__'; subPorPasta.set(k, (subPorPasta.get(k) ?? 0) + 1) }
  for (const p of doArea) { contagens[p.id] = (docsPorPasta.get(p.id) ?? 0) + (subPorPasta.get(p.id) ?? 0); if (String(p.acesso_geral) === 'restrito') restritasPasta[p.id] = true }

  // Resumo de acesso: do SQL; se indisponível, FALLBACK PostgREST (count distinto por fetchAll/fetchAllByIn).
  if (resumoSql) {
    resumo.nGrupos = resumoSql.nGrupos; resumo.nAlunos = resumoSql.nAlunos
  } else {
    try {
      const vazio = Promise.resolve([] as any[])
      const [dg, de, pg, pe] = await Promise.all([
        docIds.length ? fetchAllByIn<any>(docIds, (chunk) => svc.from('simulado_conteudo_documento_grupos').select('grupo_id').eq('tenant_id', g.tenantId).in('documento_id', chunk)).then((r) => r ?? []) : vazio,
        docIds.length ? fetchAllByIn<any>(docIds, (chunk) => svc.from('simulado_conteudo_documento_estudantes').select('estudante_id').eq('tenant_id', g.tenantId).in('documento_id', chunk)).then((r) => r ?? []) : vazio,
        alvo ? fetchAll<any>(() => svc.from('simulado_pasta_grupos').select('grupo_id').eq('tenant_id', g.tenantId).eq('pasta_id', alvo)).then((r) => r ?? []) : vazio,
        alvo ? fetchAll<any>(() => svc.from('simulado_pasta_estudantes').select('estudante_id').eq('tenant_id', g.tenantId).eq('pasta_id', alvo)).then((r) => r ?? []) : vazio,
      ])
      const grupos = new Set<string>(), alunos = new Set<string>()
      for (const r of dg) if (r.grupo_id) grupos.add(String(r.grupo_id))
      for (const r of pg) if (r.grupo_id) grupos.add(String(r.grupo_id))
      for (const r of de) if (r.estudante_id) alunos.add(String(r.estudante_id))
      for (const r of pe) if (r.estudante_id) alunos.add(String(r.estudante_id))
      resumo.nGrupos = grupos.size; resumo.nAlunos = alunos.size
    } catch { /* best-effort */ }
  }
  // breadcrumb
  const porId = new Map(doArea.map((p) => [p.id, p]))
  const breadcrumb: PastaConteudo[] = []
  let cur = alvo
  while (cur && porId.has(cur)) { const p = porId.get(cur)!; breadcrumb.unshift({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }); cur = p.pai_id ?? null }

  // PRÉVIA dos cards: primeiros trechos ESTRUTURADOS (tipo+texto) p/ montar uma mini-página (título + linhas),
  // em vez de um blocão de texto. Versão = atual (publicada) ou a mais nova. Batched.
  const previas: Record<string, { tipo: string; texto: string }[]> = {}
  // CAPA (thumb fiel): URL assinada JÁ PRONTA do PNG cacheado → o card renderiza a imagem direto, sem piscar
  // a folha de trechos. Caminho determinístico (versão+hash); se o objeto não existir, o card regenera onError.
  const thumbs: Record<string, string> = {}
  try {
    const verPorDoc = new Map<string, string>()
    for (const d of documentos) if (d.versao_atual_id) verPorDoc.set(d.id, d.versao_atual_id)
    const semVer = documentos.filter((d) => !d.versao_atual_id).map((d) => d.id)
    if (semVer.length) {
      const vers = (await fetchAll<any>(() => svc.from('simulado_conteudo_versoes').select('id, documento_id, numero').eq('tenant_id', g.tenantId).in('documento_id', semVer).order('numero', { ascending: false }))) ?? []
      for (const v of vers) if (!verPorDoc.has(v.documento_id)) verPorDoc.set(v.documento_id, v.id)
    }
    const verIds = [...new Set(verPorDoc.values())]
    if (verIds.length) {
      // Prévia = folha de conteúdo (até ~24 trechos da 1ª página). É também a CAPA do card — renderizada
      // no app a partir dos trechos, sem depender do OnlyOffice (que só é usado no editor fiel).
      const trechos = (await fetchAll<any>(() => svc.from('simulado_conteudo_trechos').select('versao_id, ordem, texto, tipo').eq('tenant_id', g.tenantId).in('versao_id', verIds).lte('ordem', 24).order('ordem', { ascending: true }))) ?? []
      const porVersao = new Map<string, { tipo: string; texto: string }[]>()
      for (const t of trechos) { const a = porVersao.get(t.versao_id) ?? []; if (a.length < 24) a.push({ tipo: String(t.tipo || 'paragrafo'), texto: String(t.texto || '').replace(/\s+/g, ' ').trim().slice(0, 320) }); porVersao.set(t.versao_id, a) }
      for (const [docId, verId] of verPorDoc) { const arr = porVersao.get(verId); if (arr && arr.length) previas[docId] = arr }
      // CAPA fiel (1ª página docx): NÃO assinamos URL nem geramos OnlyOffice por card aqui (egress + herd de
      // conversões a cada pasta aberta). O card carrega a capa LAZY via rota GET /api/admin/biblioteca/capa/
      // [versaoId] (só lê o cache; nunca gera no grid). Enquanto não há capa, o card mostra a prévia/placeholder.
    }
  } catch { /* prévia best-effort */ }

  return { ok: true, pastas, documentos, breadcrumb, previas, thumbs, contagens, restritasPasta, restritoDoc, resumo }
}

/** Trechos da versão atual (ou mais nova) de um documento — para a aba "Prévia" do drawer de detalhe. */
export async function previaDocumento(documentoId: string): Promise<{ ok: boolean; titulo?: string; trechos: { tipo: string; rotulo: string | null; texto: string }[] }> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, trechos: [] }
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('titulo, versao_atual_id').eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
  if (!doc) return { ok: false, trechos: [] }
  let versaoId = (doc as any).versao_atual_id as string | null
  if (!versaoId) {
    const { data: v } = await svc.from('simulado_conteudo_versoes').select('id').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()
    versaoId = (v as any)?.id ?? null
  }
  if (!versaoId) return { ok: true, titulo: (doc as any).titulo, trechos: [] }
  const trechos = (await fetchAll<any>(() => svc.from('simulado_conteudo_trechos').select('tipo, rotulo, texto, ordem').eq('tenant_id', g.tenantId).eq('versao_id', versaoId!).order('ordem', { ascending: true }))) ?? []
  return { ok: true, titulo: (doc as any).titulo, trechos: trechos.map((t) => ({ tipo: t.tipo, rotulo: t.rotulo, texto: t.texto })) }
}

/** Dados p/ render FIEL no visualizador (OnlyOffice em modo leitura) — igual ao editor, mas só-leitura.
 *  Entrega a URL assinada do .docx da versão atual + a config do OnlyOffice. É a MESMA renderização do
 *  documento real (blocos/cores), não os trechos em texto. */
export async function dadosVisualizacao(documentoId: string): Promise<{
  ok: boolean; error?: string
  versaoId?: string; documentUrl?: string; onlyofficeUrl?: string; wopiHost?: string; chave?: string; fileType?: string; tipoOrigem?: string
}> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos')
    .select('tipo_origem, versao_atual_id').eq('tenant_id', g.tenantId).eq('id', documentoId).eq('deletado', false).maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const campos = 'id, numero, arquivo_key, hash_arquivo'
  let ver: any = null
  if ((doc as any).versao_atual_id) {
    const r = await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', g.tenantId).eq('id', (doc as any).versao_atual_id).maybeSingle()
    ver = r.data
  }
  if (!ver) {
    const r = await svc.from('simulado_conteudo_versoes').select(campos).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('numero', { ascending: false }).limit(1).maybeSingle()
    ver = r.data
  }
  if (!ver?.arquivo_key) return { ok: false, error: 'Sem arquivo para visualizar.' }
  const documentUrl = await urlAssinadaOriginal(ver.arquivo_key, 3600)
  if (!documentUrl) return { ok: false, error: 'Não foi possível abrir o arquivo no storage.' }
  const tipoOrigem = (doc as any).tipo_origem as string
  const fileType = tipoOrigem === 'pdf' ? 'pdf' : tipoOrigem === 'html' ? 'html' : 'docx'
  return {
    ok: true,
    versaoId: ver.id,
    documentUrl,
    onlyofficeUrl: process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082',
    wopiHost: process.env.CONTEUDO_WOPI_HOST || process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000',
    chave: `${ver.numero}_${String(ver.hash_arquivo || '').slice(0, 8)}`,
    fileType,
    tipoOrigem,
  }
}

/** Miniatura FIEL do card: PNG da 1ª página do .docx (render do OnlyOffice), cacheado no storage por
 *  versão (hash). Devolve a URL assinada da imagem. Gera 1x e reusa; falhou → null (card usa fallback). */
export async function thumbDocumento(documentoId: string, opts?: { latest?: boolean }): Promise<{ url: string | null }> {
  const g = await guard('view')
  if (!g.ok) return { url: null }
  return { url: await gerarThumbDocumento(g.tenantId, documentoId, { latest: opts?.latest }) }
}

export async function criarPasta(nome: string, paiId?: string | null, categoria: Categoria = 'conteudo'): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (!nome?.trim()) return { ok: false, error: 'Nome obrigatório.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from(PASTAS).insert({ tenant_id: g.tenantId, nome: nome.trim(), is_folder: true, pai_id: paiId ?? null, folder_area: folderArea(categoria) }).select('id').single()
  if (error || !data) return { ok: false, error: error?.message || 'Falha ao criar pasta.' }
  revalidatePath('/admin/biblioteca')
  return { ok: true, id: data.id }
}

export async function renomearPasta(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from(PASTAS).update({ nome: nome.trim() }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function definirCorPasta(id: string, cor: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from(PASTAS).update({ cor }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function moverPasta(id: string, paiId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (id === paiId) return { ok: false, error: 'Pasta não pode ser pai de si mesma.' }
  const svc = createAdminClient()
  const { error } = await svc.from(PASTAS).update({ pai_id: paiId }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function removerPasta(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()
  // reparenta filhos e documentos para a raiz, depois remove (não apaga documentos)
  await svc.from(PASTAS).update({ pai_id: null }).eq('tenant_id', g.tenantId).eq('pai_id', id)
  await svc.from('simulado_conteudo_documentos').update({ pasta_id: null }).eq('tenant_id', g.tenantId).eq('pasta_id', id)
  const { error } = await svc.from(PASTAS).update({ deletado: true }).eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function renomearDocumento(documentoId: string, titulo: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  if (!titulo?.trim()) return { ok: false, error: 'Título obrigatório.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ titulo: titulo.trim(), atualizado_em: new Date().toISOString() }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** URL assinada do arquivo da versão atual (ou última) — para baixar o original. */
export async function urlDownloadDocumento(documentoId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error }
  const doc = await obterDocumento(documentoId)
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const versaoId = doc.versao_atual_id || (await ultimaVersao(documentoId))?.id
  if (!versaoId) return { ok: false, error: 'Nenhuma versão disponível.' }
  const svc = createAdminClient()
  const { data: v } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', g.tenantId).eq('id', versaoId).maybeSingle()
  if (!v?.arquivo_key) return { ok: false, error: 'Arquivo não encontrado.' }
  const url = await urlAssinadaOriginal(v.arquivo_key, 600)
  if (!url) return { ok: false, error: 'Não foi possível gerar o link.' }
  return { ok: true, url }
}

/** Todas as pastas da categoria (para o menu "Mover para…"). */
export async function listarPastasConteudo(categoria: Categoria = 'conteudo'): Promise<{ id: string; nome: string; pai_id: string | null }[]> {
  const g = await guard('view')
  if (!g.ok) return []
  const svc = createAdminClient()
  const rows = await fetchAll<any>(() => svc.from(PASTAS)
    .select('id, nome, pai_id, deletado').eq('tenant_id', g.tenantId).eq('folder_area', folderArea(categoria)).eq('is_folder', true)
    .order('id', { ascending: true }))
  return (rows ?? []).filter((p) => !p.deletado).map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null }))
}

export async function moverDocumento(documentoId: string, pastaId: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ pasta_id: pastaId }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** Cria uma CÓPIA independente do documento: baixa o original da versão atual e re-ingere como
 *  "{título} (cópia)" na MESMA pasta/categoria (novo doc + v1 própria, storage próprio). */
export async function duplicarDocumento(documentoId: string): Promise<{ ok: boolean; error?: string; documentoId?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const doc = await obterDocumento(documentoId)
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  const versaoId = doc.versao_atual_id || (await ultimaVersao(documentoId))?.id
  if (!versaoId) return { ok: false, error: 'Nenhuma versão para copiar.' }
  const svc = createAdminClient()
  const { data: v } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', g.tenantId).eq('id', versaoId).maybeSingle()
  if (!v?.arquivo_key) return { ok: false, error: 'Arquivo da versão não encontrado.' }
  const bytes = await baixarOriginal(v.arquivo_key)
  if (!bytes) return { ok: false, error: 'Não foi possível ler o arquivo original.' }
  const ext = doc.tipo_origem === 'pdf' ? 'pdf' : doc.tipo_origem === 'pptx' ? 'pptx' : doc.tipo_origem === 'xlsx' ? 'xlsx'
    : doc.tipo_origem === 'video' ? 'mp4' : doc.tipo_origem === 'audio' ? 'mp3' : doc.tipo_origem === 'html' ? 'html' : 'docx'
  const r = await ingerirBytes(bytes, {
    titulo: `${doc.titulo} (cópia)`, pastaId: doc.pasta_id, nomeArquivo: `${doc.titulo}.${ext}`,
    categoria: doc.categoria, tenantId: g.tenantId, atorId: g.atorId,
  })
  if (!r.ok) return { ok: false, error: r.error }
  revalidatePath('/admin/biblioteca')
  return { ok: true, documentoId: r.documentoId }
}

// ── DOCUMENTOS (upload → conversão → reconciliação) ───────────────────────────────
function bytesDeBase64(b64: string): Buffer {
  const i = b64.indexOf(',')
  return Buffer.from(i >= 0 ? b64.slice(i + 1) : b64, 'base64')
}

/** Importa um documento novo: sobe o original, converte, cria doc+v1 e estrutura os trechos. */
// Núcleo da ingestão (compartilhado por base64 e por upload-de-storage): cria doc+versão, guarda o
// original, converte e reconcilia. Recebe os BYTES já em memória.
async function ingerirBytes(data: Buffer, input: {
  titulo: string; pastaId?: string | null; nomeArquivo: string; mime?: string; categoria?: Categoria
  tenantId: string; atorId: string | null
}): Promise<{ ok: boolean; error?: string; documentoId?: string; trechos?: number }> {
  const tipo = tipoDoArquivo(input.nomeArquivo, input.mime)
  if (!tipo) return { ok: false, error: 'Formato não suportado (use .docx, .pdf ou .html).' }
  const user = await getAuthUser()
  const fonte = user?.email || (user?.user_metadata as any)?.name || input.atorId || null
  const criado = await criarDocumento({ titulo: input.titulo, tipoOrigem: tipo, arquivoKey: '', pastaId: input.pastaId ?? null, fonte, licenca: null, criadoPor: input.atorId, categoria: input.categoria ?? 'conteudo' })
  if ('erro' in criado) return { ok: false, error: criado.erro }
  const guardado = await guardarOriginal({ tenantId: input.tenantId, documentoId: criado.documentoId, numeroVersao: 1, tipo, data, nome: input.nomeArquivo, criadoPor: input.atorId })
  if ('erro' in guardado) return { ok: false, error: guardado.erro, documentoId: criado.documentoId }
  await definirArquivoVersao(criado.versaoId, guardado.arquivoKey, guardado.hash)
  const { html, erro } = await converterParaHtml(data, tipo)
  if (erro || !html.trim()) return { ok: false, error: erro || 'Conversão vazia.', documentoId: criado.documentoId }
  const rec = await reconciliarVersao({ documentoId: criado.documentoId, versaoNovaId: criado.versaoId, versaoAnteriorId: null, html })
  if (rec.erro) return { ok: false, error: rec.erro, documentoId: criado.documentoId }
  // No modelo Drive, subir = já disponível: torna a versão atual e publica o documento (status=publicado).
  // Sem isto, o doc fica 'rascunho' c/ versao_atual_id nulo e NUNCA aparece para o aluno (gate em leitor.ts).
  await definirVersaoAtual(criado.documentoId, criado.versaoId)
  await registrarAudit({ tenantId: input.tenantId, atorId: input.atorId, entidade: 'simulado_conteudo_documentos', operacao: 'INSERT', entidadeId: criado.documentoId, depois: { titulo: input.titulo, trechos: rec.trechos, publicado: true } }).catch(() => {})
  // Pré-aquece SÓ a CAPA (1ª página, leve) p/ a rota lazy achá-la cacheada. O PDF do doc INTEIRO (OnlyOffice
  // ~45s) NÃO é gerado no import (era brutal em import de massa) — é gerado sob demanda ao ABRIR o documento.
  void gerarThumbDocumento(input.tenantId, criado.documentoId, { forcar: true }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true, documentoId: criado.documentoId, trechos: rec.trechos }
}

// Importação por BASE64 (um arquivo pequeno, ex.: o ImportDialog manual).
export async function importarDocumento(input: {
  titulo: string; pastaId?: string | null
  nomeArquivo: string; mime?: string; dataBase64: string; categoria?: Categoria
}): Promise<{ ok: boolean; error?: string; documentoId?: string; trechos?: number }> {
  const g = await guard('update')
  if (!g.ok) return g
  const data = bytesDeBase64(input.dataBase64)
  return ingerirBytes(data, { titulo: input.titulo, pastaId: input.pastaId, nomeArquivo: input.nomeArquivo, mime: input.mime, categoria: input.categoria, tenantId: g.tenantId, atorId: g.atorId })
}

// Upload DIRETO ao storage (sem base64 pela server action → sem o limite de corpo): o cliente sobe o
// arquivo para uma URL assinada e depois chama importarDeStorage, que lê os bytes e ingere.
export async function prepararUploadConteudo(nomeArquivo: string): Promise<{ ok: boolean; path?: string; uploadUrl?: string; kind?: 'supabase' | 's3-put'; token?: string; bucket?: string; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const bucket = await resolverBucketConteudo()
  const safe = (nomeArquivo || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `tmp/${g.tenantId}/${randomUUID()}-${safe}`
  try {
    // Sem contentType → o content-type NÃO é assinado (no S3) e o browser envia o f.type livremente.
    const t = await getStorage().criarUploadTicket(bucket, path)
    if (t.kind === 'supabase') return { ok: true, path, uploadUrl: t.signedUrl, kind: 'supabase', token: t.token, bucket }
    return { ok: true, path, uploadUrl: t.url, kind: 's3-put', bucket }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao preparar o upload.' }
  }
}

export async function importarDeStorage(input: {
  path: string; titulo: string; nomeArquivo: string; mime?: string; pastaId?: string | null; categoria?: Categoria
}): Promise<{ ok: boolean; error?: string; documentoId?: string; trechos?: number }> {
  const g = await guard('update'); if (!g.ok) return g
  // Só paths temporários do próprio tenant.
  if (!input.path.startsWith(`tmp/${g.tenantId}/`)) return { ok: false, error: 'Caminho de upload inválido.' }
  const bucket = await resolverBucketConteudo()
  const data = await baixarOriginal(input.path)
  if (!data) return { ok: false, error: 'Não foi possível ler o arquivo enviado.' }
  const r = await ingerirBytes(data, { titulo: input.titulo, pastaId: input.pastaId, nomeArquivo: input.nomeArquivo, mime: input.mime, categoria: input.categoria, tenantId: g.tenantId, atorId: g.atorId })
  await getStorage().remove(bucket, input.path).catch(() => {})
  return r
}

/**
 * Cria um documento EM BRANCO (.docx editável no OnlyOffice). Gera o .docx server-side com a lib `docx`
 * e define o HTML inicial direto (um H1 com o título) — NÃO depende da conversão/OnlyOffice na criação,
 * então nasce sempre, mesmo que o serviço de conversão esteja indisponível. O aluno/edição seguem o
 * mesmo fluxo de versões; ao editar no OnlyOffice e republicar, a reconciliação atualiza os trechos.
 */
export async function criarDocumentoBranco(input: {
  titulo: string; pastaId?: string | null; categoria?: Categoria
}): Promise<{ ok: boolean; error?: string; documentoId?: string }> {
  try {
    const g = await guard('update')
    if (!g.ok) return g
    const titulo = (input.titulo || '').trim()
    if (!titulo) return { ok: false, error: 'Informe um título.' }
    const user = await getAuthUser()
    const fonte = user?.email || (user?.user_metadata as any)?.name || g.atorId || null

    // .docx em branco (título como H1 + parágrafo vazio) p/ edição posterior no OnlyOffice.
    const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
    const docx = new Document({ sections: [{ children: [
      new Paragraph({ text: titulo, heading: HeadingLevel.HEADING_1 }),
      new Paragraph(''),
    ] }] })
    const data = await Packer.toBuffer(docx)

    const criado = await criarDocumento({ titulo, tipoOrigem: 'docx', arquivoKey: '', pastaId: input.pastaId ?? null, fonte, licenca: null, criadoPor: g.atorId, categoria: input.categoria ?? 'conteudo' })
    if ('erro' in criado) return { ok: false, error: criado.erro }
    const guardado = await guardarOriginal({ tenantId: g.tenantId, documentoId: criado.documentoId, numeroVersao: 1, tipo: 'docx', data, nome: `${titulo}.docx`, criadoPor: g.atorId })
    if ('erro' in guardado) return { ok: false, error: guardado.erro, documentoId: criado.documentoId }
    await definirArquivoVersao(criado.versaoId, guardado.arquivoKey, guardado.hash)

    // HTML inicial DIRETO (sem passar pelo OnlyOffice) → nasce editável e com 1 trecho (o título).
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
    const html = `<h1>${esc(titulo)}</h1><p></p>`
    const rec = await reconciliarVersao({ documentoId: criado.documentoId, versaoNovaId: criado.versaoId, versaoAnteriorId: null, html })
    if (rec.erro) return { ok: false, error: rec.erro, documentoId: criado.documentoId }

    await registrarAudit({ tenantId: g.tenantId, atorId: g.atorId, entidade: 'simulado_conteudo_documentos', operacao: 'INSERT', entidadeId: criado.documentoId, depois: { titulo, branco: true } }).catch(() => {})
    void gerarThumbDocumento(g.tenantId, criado.documentoId, { forcar: true }).catch(() => {})
    revalidatePath('/admin/biblioteca')
    return { ok: true, documentoId: criado.documentoId }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao criar documento em branco.' }
  }
}

/** Publica uma NOVA versão a partir de um novo arquivo → reconcilia contra a anterior (carrega uids). */
export async function publicarNovaVersao(input: {
  documentoId: string; nomeArquivo: string; mime?: string; dataBase64: string; publicar?: boolean
}): Promise<{ ok: boolean; error?: string; versaoId?: string; reconc?: any }> {
  const g = await guard('update')
  if (!g.ok) return g
  const tipo = tipoDoArquivo(input.nomeArquivo, input.mime)
  if (!tipo) return { ok: false, error: 'Formato não suportado.' }
  const data = bytesDeBase64(input.dataBase64)
  const nv = await criarVersao(input.documentoId, { arquivoKey: '', origem: 'upload' })
  if ('erro' in nv) return { ok: false, error: nv.erro }
  const guardado = await guardarOriginal({ tenantId: g.tenantId, documentoId: input.documentoId, numeroVersao: nv.numero, tipo, data, nome: input.nomeArquivo, criadoPor: g.atorId })
  if ('erro' in guardado) return { ok: false, error: guardado.erro }
  await definirArquivoVersao(nv.versaoId, guardado.arquivoKey, guardado.hash)
  const { html, erro } = await converterParaHtml(data, tipo)
  if (erro || !html.trim()) return { ok: false, error: erro || 'Conversão vazia.' }
  const rec = await reconciliarVersao({ documentoId: input.documentoId, versaoNovaId: nv.versaoId, versaoAnteriorId: nv.anteriorId, html })
  if (rec.erro) return { ok: false, error: rec.erro }
  if (input.publicar) await definirVersaoAtual(input.documentoId, nv.versaoId)
  await registrarAudit({ tenantId: g.tenantId, atorId: g.atorId, entidade: 'simulado_conteudo_versoes', operacao: input.publicar ? 'LIBERAR' : 'INSERT', entidadeId: nv.versaoId, depois: { numero: nv.numero, reconciliacao: rec } }).catch(() => {})
  // Pré-gera a miniatura da nova versão (se publicada, é a que o card vai mostrar).
  await gerarThumbDocumento(g.tenantId, input.documentoId, { forcar: true }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true, versaoId: nv.versaoId, reconc: rec }
}

export async function publicarDocumento(documentoId: string, versaoId?: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const alvo = versaoId || (await ultimaVersao(documentoId))?.id
  if (!alvo) return { ok: false, error: 'Nenhuma versão para publicar.' }
  const r = await definirVersaoAtual(documentoId, alvo)
  if (!r.ok) return { ok: false, error: r.erro }
  await registrarAudit({ tenantId: g.tenantId, atorId: g.atorId, entidade: 'simulado_conteudo_documentos', operacao: 'LIBERAR', entidadeId: documentoId, depois: { versao_atual_id: alvo } }).catch(() => {})
  // A versão exibida mudou → pré-gera a miniatura dela.
  await gerarThumbDocumento(g.tenantId, documentoId, { forcar: true }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function removerDocumento(documentoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ deletado: true }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** Abre (ou cria) um RASCUNHO editável em docx para o OnlyOffice. Só docx. Devolve o versaoId do rascunho. */
export async function abrirEdicaoDocx(documentoId: string): Promise<{ ok: boolean; error?: string; versaoId?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const doc = await obterDocumento(documentoId)
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  if (doc.tipo_origem !== 'docx') return { ok: false, error: 'Edição no editor disponível apenas para documentos .docx.' }
  const last = await ultimaVersao(documentoId)
  if (!last) return { ok: false, error: 'Documento sem versão.' }
  // RÁPIDO: se a última versão NÃO é a publicada (imutável), ela já é um rascunho editável → abre
  // DIRETO, sem copiar/converter/reconciliar (isso acontece no SAVE). É o caso do que foi importado.
  if (doc.versao_atual_id !== last.id) return { ok: true, versaoId: last.id }
  // A última versão É a publicada (imutável) → cria um rascunho COMPARTILHANDO a mesma chave do arquivo
  // (copy-on-write). NÃO baixa nem re-sobe o .docx (era ~7s de ida+volta de storage). Ao SALVAR, o callback
  // grava um OBJETO NOVO (guardarOriginal) e atualiza a chave do rascunho — a versão publicada nunca é tocada.
  const nv = await criarVersao(documentoId, { arquivoKey: last.arquivo_key, hashArquivo: last.hash_arquivo ?? undefined, origem: 'edicao_editor' })
  if ('erro' in nv) return { ok: false, error: nv.erro }
  return { ok: true, versaoId: nv.versaoId }
}

// Prévia de CONTEÚDO (admin): trechos estruturados da versão atual (ou última, p/ rascunho) —
// renderizável no app SEM depender do OnlyOffice. Grifos do aluno não se aplicam ao admin.
export async function conteudoPreviewAdmin(documentoId: string): Promise<{ ok: boolean; trechos?: { uid: string; tipo: string; rotulo: string | null; texto: string }[]; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id, versao_atual_id').eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
  if (!doc) return { ok: false, error: 'Documento não encontrado.' }
  let versaoId: string | null = (doc as any).versao_atual_id ?? null
  if (!versaoId) { const uv = await ultimaVersao(documentoId); versaoId = uv?.id ?? null }
  if (!versaoId) return { ok: false, error: 'Sem versão para visualizar ainda.' }
  // Prévia = guardrail de egress: no máx. 400 trechos (cobre a prévia de praticamente qualquer doc), em
  // vez do fetchAll ILIMITADO que paginava o documento inteiro só para a aba "Prévia".
  const { data: trechos } = await svc.from('simulado_conteudo_trechos')
    .select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', g.tenantId).eq('versao_id', versaoId)
    .order('ordem', { ascending: true }).limit(400)
  return { ok: true, trechos: ((trechos as any[]) ?? []).map((t) => ({ uid: t.uid, tipo: t.tipo, rotulo: t.rotulo ?? null, texto: t.texto ?? '' })) }
}

// PDF do documento INTEIRO (via OnlyOffice, cacheado) p/ a prévia grande progressiva (iframe nativo).
export async function pdfPreviewDocumento(documentoId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const url = await gerarPdfDocumento(g.tenantId, documentoId)
  return url ? { ok: true, url } : { ok: false, error: 'Não foi possível preparar o PDF (OnlyOffice indisponível?).' }
}

export async function detalheDocumento(documentoId: string) {
  const g = await guard('view')
  if (!g.ok) return { ok: false as const, error: g.error }
  const [doc, versoes, vinculos] = await Promise.all([
    obterDocumento(documentoId), listarVersoes(documentoId), listarVinculosDoDocumento(documentoId),
  ])
  if (!doc) return { ok: false as const, error: 'Documento não encontrado.' }
  return { ok: true as const, doc, versoes, vinculos }
}

export async function vincularAction(input: { documentoId: string; produtoTipo: string; produtoRefId: string; modo: ModoVinculo; versaoFixadaId?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const r = await vincularDocumento(input)
  if ('erro' in r) return { ok: false, error: r.erro }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

export async function desvincularAction(vinculoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update')
  if (!g.ok) return g
  const r = await desvincular(vinculoId)
  if (!r.ok) return { ok: false, error: r.erro }
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

// ── ACESSO do DOCUMENTO (conteúdo) — grupos + alunos. Vazio = liberado a todos; união dos dois. ──
// Tolerante: se as tabelas simulado_conteudo_documento_grupos/_estudantes não migraram, trata como vazio.
export type EstudanteAcessoLinha = { id: string; nome: string; email: string | null; cpf: string | null; classificacao: string | null; avatar: string | null; perfil_avatar_cor: string | null }
export type GrupoAtribuido = { id: string; nome: string; cor: string | null; atribuido: boolean; is_mestre: boolean; pai_id: string | null }
const SEM_TAB_DOC = (m?: string) => /relation .* does not exist|simulado_conteudo_documento_(grupos|estudantes)|schema cache/i.test(m ?? '')

/** Grupos do tenant (com flag `atribuido`) + alunos individuais já atribuídos a este documento. */
export async function carregarAtribuicaoDoc(documentoId: string): Promise<{ ok: boolean; grupos?: GrupoAtribuido[]; estudantes?: EstudanteAcessoLinha[]; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const [todos, atribG, atribE] = await Promise.all([
    selecionarGrupos(svc, g.tenantId),
    svc.from('simulado_conteudo_documento_grupos').select('grupo_id').eq('documento_id', documentoId).eq('tenant_id', g.tenantId),
    svc.from('simulado_conteudo_documento_estudantes').select('estudante_id').eq('documento_id', documentoId).eq('tenant_id', g.tenantId),
  ])
  const setG = new Set(((atribG.data as any[]) ?? []).map((r) => r.grupo_id))
  const idsE = [...new Set(((atribE.data as any[]) ?? []).map((r) => r.estudante_id))]
  const est = idsE.length
    ? await fetchAllByIn<any>(idsE, (chunk) => svc.from('simulado_estudantes').select('id, nome, email, cpf, classificacao, avatar, perfil_avatar_cor').in('id', chunk).order('nome', { ascending: true }))
    : []
  return {
    ok: true,
    grupos: (todos as any[]).map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, atribuido: setG.has(x.id), is_mestre: !!x.is_mestre, pai_id: x.pai_id ?? null })),
    estudantes: (est as any[]).map((e): EstudanteAcessoLinha => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, cpf: e.cpf ?? null, classificacao: e.classificacao ?? null, avatar: e.avatar ?? null, perfil_avatar_cor: e.perfil_avatar_cor ?? null })),
  }
}

export async function definirGruposDoc(documentoId: string, grupoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const ids = [...new Set((grupoIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_conteudo_documento_grupos').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (del.error && SEM_TAB_DOC(del.error.message)) return { ok: false, error: 'Rode a migração de acesso do documento (20261021000000).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_conteudo_documento_grupos').insert(ids.map((grupo_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, grupo_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documento_grupos', entidadeId: documentoId, depois: { grupos: ids.length }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

export async function definirEstudantesDoc(documentoId: string, estudanteIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  const del = await svc.from('simulado_conteudo_documento_estudantes').delete().eq('documento_id', documentoId).eq('tenant_id', g.tenantId)
  if (del.error && SEM_TAB_DOC(del.error.message)) return { ok: false, error: 'Rode a migração de acesso do documento (20261021000000).' }
  if (ids.length) {
    const { error } = await svc.from('simulado_conteudo_documento_estudantes').insert(ids.map((estudante_id) => ({ tenant_id: g.tenantId, documento_id: documentoId, estudante_id })))
    if (error) return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documento_estudantes', entidadeId: documentoId, depois: { estudantes: ids.length }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

// ── "Gerenciar acessos" HIERÁRQUICO — a subárvore (pastas + documentos) de uma pasta, cada nó com o
// status de acesso (restrito = tem alguma atribuição; senão = liberado a todos). ──
export type NoAcesso = { id: string; nome: string; tipo: 'pasta' | 'documento'; nivel: number; restrito: boolean }

export async function carregarArvoreAcesso(raizId: string | null, categoria: Categoria): Promise<{ ok: boolean; nodes?: NoAcesso[]; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const fa = folderArea(categoria)
  // Pastas são poucas (dezenas) → carregar todas (2 colunas) é barato e necessário p/ montar a árvore.
  const pastasRaw = await fetchAll<any>(() => svc.from('simulado_pastas').select('id, nome, pai_id').eq('tenant_id', g.tenantId).eq('folder_area', fa).eq('deletado', false))
  const filhosDe = new Map<string | null, any[]>()
  for (const p of pastasRaw ?? []) { const k = p.pai_id ?? null; (filhosDe.get(k) ?? filhosDe.set(k, []).get(k)!).push(p) }

  // Só a SUBÁRVORE de raizId (ou tudo se raiz null) — evita puxar docs/atribuições de todo o tenant.
  const subPastaIds: string[] = []
  if (raizId) {
    const seen = new Set<string>(); const stack = [raizId]
    while (stack.length) { const cur = stack.pop()!; if (seen.has(cur)) continue; seen.add(cur); subPastaIds.push(cur); for (const f of filhosDe.get(cur) ?? []) stack.push(f.id) }
  } else {
    for (const p of pastasRaw ?? []) subPastaIds.push(p.id)
  }

  // Documentos escopados à subárvore (raizId) ou todos (raiz null, p/ pegar também os docs da raiz sem pasta).
  const docsRaw = raizId
    ? (subPastaIds.length ? await fetchAllByIn<any>(subPastaIds, (c) => svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true })) : [])
    : await fetchAll<any>(() => svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id').eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false))
  const docIds = (docsRaw ?? []).map((d: any) => d.id)

  // restrito = tem alguma atribuição. ESCOPADO por .in() + fetchAllByIn (SEM o truncamento de 1000 da query crua).
  const pastaRestr = new Set<string>()
  if (subPastaIds.length) try {
    const [pg, pe] = await Promise.all([
      fetchAllByIn<any>(subPastaIds, (c) => svc.from('simulado_pasta_grupos').select('pasta_id').eq('tenant_id', g.tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
      fetchAllByIn<any>(subPastaIds, (c) => svc.from('simulado_pasta_estudantes').select('pasta_id').eq('tenant_id', g.tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
    ])
    for (const r of pg as any[]) pastaRestr.add(r.pasta_id)
    for (const r of pe as any[]) pastaRestr.add(r.pasta_id)
  } catch { /* tabelas ausentes → nada restrito */ }
  const docRestr = new Set<string>()
  if (docIds.length) try {
    const [dg, de] = await Promise.all([
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_grupos').select('documento_id').eq('tenant_id', g.tenantId).in('documento_id', c).order('documento_id', { ascending: true })),
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_estudantes').select('documento_id').eq('tenant_id', g.tenantId).in('documento_id', c).order('documento_id', { ascending: true })),
    ])
    for (const r of dg as any[]) docRestr.add(r.documento_id)
    for (const r of de as any[]) docRestr.add(r.documento_id)
  } catch { /* tabelas de doc ausentes (migração pendente) → nada restrito */ }

  const docsDe = new Map<string | null, any[]>()
  for (const d of docsRaw ?? []) { const k = d.pasta_id ?? null; (docsDe.get(k) ?? docsDe.set(k, []).get(k)!).push(d) }

  const nodes: NoAcesso[] = []
  const visit = new Set<string>()
  function walk(paiId: string | null, nivel: number) {
    const subs = (filhosDe.get(paiId) ?? []).slice().sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    for (const p of subs) {
      if (visit.has(p.id)) continue; visit.add(p.id) // anti-ciclo
      nodes.push({ id: p.id, nome: p.nome, tipo: 'pasta', nivel, restrito: pastaRestr.has(p.id) })
      walk(p.id, nivel + 1)
    }
    const ds = (docsDe.get(paiId) ?? []).slice().sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR'))
    for (const d of ds) nodes.push({ id: d.id, nome: d.titulo, tipo: 'documento', nivel, restrito: docRestr.has(d.id) })
  }
  // Se a raiz é uma pasta, mostra-a como topo (editável) + a subárvore abaixo; se null, lista a Biblioteca inteira.
  if (raizId) {
    const raiz = (pastasRaw ?? []).find((p: any) => p.id === raizId)
    if (raiz) { nodes.push({ id: raiz.id, nome: raiz.nome, tipo: 'pasta', nivel: 0, restrito: pastaRestr.has(raiz.id) }); visit.add(raiz.id) }
    walk(raizId, raiz ? 1 : 0)
  } else {
    walk(null, 0)
  }
  return { ok: true, nodes }
}

// ── LIBERAR ACESSO estilo Drive (papéis reader/commenter/editor + link + herança) ──
// Monta a árvore p/ o DriveAcessoDialog e persiste em lote. Papéis/geral/herança nas colunas da
// migração 20261022000000; grupos/alunos nas 4 tabelas de atribuição.
export type ModoAcessoDTO = 'principal' | 'herdar' | 'propria' | 'bloquear'
export type OrigemDTO = 'avulsa' | 'individual'
export type PermsDTO = { ler: boolean; baixar: boolean; grifar: boolean }
export type DriveNodeDTO = {
  id: string; nome: string; tipo: 'folder' | 'doc'; cor: string | null; herda: boolean
  /** Modo de acesso de 1ª classe (spec 01 §3). Ausente nos dados antigos → o cliente trata como padrão. */
  modo?: ModoAcessoDTO
  /** Visibilidade: oculto do aluno (sem bloquear quem já tem link). */
  oculto?: boolean
  pessoas: { id: string; tipo: 'estudante' | 'grupo'; email: string; nome: string; papel: 'reader' | 'commenter' | 'editor'; avatar?: string | null; corAvatar?: string | null; origem?: OrigemDTO; perms?: PermsDTO }[]
  geral: { modo: 'restrito' | 'todos'; papel: 'reader' | 'commenter' | 'editor' } | null
  filhos: DriveNodeDTO[]
}
const PAPEL_OK = (p: any): 'reader' | 'commenter' | 'editor' => (p === 'commenter' || p === 'editor' ? p : 'reader')
const GERAL_OK = (gr: any): 'restrito' | 'todos' | null => (gr === 'restrito' || gr === 'todos' ? gr : null)
const MODO_OK = (m: any): ModoAcessoDTO | undefined => (m === 'principal' || m === 'herdar' || m === 'propria' || m === 'bloquear' ? m : undefined)
const ORIGEM_OK = (o: any): OrigemDTO => (o === 'individual' ? 'individual' : 'avulsa')
const permsDaRow = (r: any): PermsDTO => ({ ler: r?.pode_ler !== false, baixar: r?.pode_baixar !== false, grifar: r?.pode_grifar !== false })
const SEM_COL = (m?: string) => /column .* does not exist|herda_acesso|acesso_geral/i.test(m ?? '')
const SEM_COL_V2 = (m?: string) => /column .* does not exist|modo_acesso|oculto|origem|pode_ler|pode_grifar|schema cache/i.test(m ?? '')

/** SELECT tolerante: tenta com as colunas novas; se faltarem (migração pendente), cai no SELECT legado. */
async function selTol<T>(primario: () => any, legado: () => any): Promise<T[]> {
  try { return (await fetchAll<T>(primario)) ?? [] } catch { try { return (await fetchAll<T>(legado)) ?? [] } catch { return [] } }
}
async function selTolByIn<T>(ids: string[], primario: (c: string[]) => any, legado: (c: string[]) => any): Promise<T[]> {
  if (!ids.length) return []
  try { return (await fetchAllByIn<T>(ids, primario)) ?? [] } catch { try { return (await fetchAllByIn<T>(ids, legado)) ?? [] } catch { return [] } }
}

export async function montarArvoreAcessoDrive(raizId: string, categoria: Categoria = 'conteudo'): Promise<{ ok: boolean; root?: DriveNodeDTO; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const fa = folderArea(categoria)
  const gruposP = selecionarGrupos(svc, g.tenantId).catch(() => [] as any[]) // em paralelo (independe das pastas)
  const pastasRaw = await selTol<any>(
    () => svc.from('simulado_pastas').select('id, nome, pai_id, cor, herda_acesso, acesso_geral, acesso_geral_papel, modo_acesso, oculto').eq('tenant_id', g.tenantId).eq('folder_area', fa).eq('deletado', false).order('id', { ascending: true }),
    () => svc.from('simulado_pastas').select('id, nome, pai_id, cor, herda_acesso, acesso_geral, acesso_geral_papel').eq('tenant_id', g.tenantId).eq('folder_area', fa).eq('deletado', false).order('id', { ascending: true }),
  )
  const porId = new Map<string, any>(pastasRaw.map((p) => [p.id, p]))
  if (!porId.has(raizId)) return { ok: false, error: 'Pasta não encontrada.' }
  const filhosDe = new Map<string | null, any[]>()
  for (const p of pastasRaw) { const k = p.pai_id ?? null; (filhosDe.get(k) ?? filhosDe.set(k, []).get(k)!).push(p) }

  // subárvore de pastas (BFS anti-ciclo)
  const subIds: string[] = []; const seen = new Set<string>(); const stack = [raizId]
  while (stack.length) { const cur = stack.pop()!; if (seen.has(cur)) continue; seen.add(cur); subIds.push(cur); for (const f of filhosDe.get(cur) ?? []) stack.push(f.id) }

  const docsRaw = subIds.length ? await selTolByIn<any>(subIds,
    (c) => svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, herda_acesso, acesso_geral, acesso_geral_papel, modo_acesso, oculto').eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true }),
    (c) => svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, herda_acesso, acesso_geral, acesso_geral_papel').eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true }),
  ) : []
  const docIds = docsRaw.map((d) => d.id)

  // Atribuições (tolerante às colunas v2 origem/pode_ler/pode_baixar/pode_grifar → cai no SELECT legado só com papel).
  const AC = 'papel, origem, pode_ler, pode_baixar, pode_grifar'
  const [pg, pe] = await Promise.all([
    selTolByIn<any>(subIds, (c) => svc.from('simulado_pasta_grupos').select(`pasta_id, grupo_id, ${AC}`).eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true }), (c) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id, papel').eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true })),
    selTolByIn<any>(subIds, (c) => svc.from('simulado_pasta_estudantes').select(`pasta_id, estudante_id, ${AC}`).eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true }), (c) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id, papel').eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true })),
  ])
  const [dg, de] = docIds.length ? await Promise.all([
    selTolByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_grupos').select(`documento_id, grupo_id, ${AC}`).eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true }), (c) => svc.from('simulado_conteudo_documento_grupos').select('documento_id, grupo_id, papel').eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true })),
    selTolByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_estudantes').select(`documento_id, estudante_id, ${AC}`).eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true }), (c) => svc.from('simulado_conteudo_documento_estudantes').select('documento_id, estudante_id, papel').eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true })),
  ]) : [[], []]

  const grupos = await gruposP
  const nomeGrupo = new Map<string, string>((grupos as any[]).map((x) => [x.id, x.nome]))
  const estIds = [...new Set([...pe, ...de].map((r) => r.estudante_id))]
  const estRows = estIds.length ? (await fetchAllByIn<any>(estIds, (c) => svc.from('simulado_estudantes').select('id, nome, email, avatar, perfil_avatar_cor').in('id', c).order('id', { ascending: true }))) ?? [] : []
  const estById = new Map<string, any>((estRows as any[]).map((e) => [e.id, e]))

  const pessoasDe = (grpRows: any[], estRows2: any[], key: 'pasta_id' | 'documento_id', id: string): DriveNodeDTO['pessoas'] => {
    const out: DriveNodeDTO['pessoas'] = []
    for (const r of grpRows) if (r[key] === id) out.push({ id: r.grupo_id, tipo: 'grupo', email: '', nome: nomeGrupo.get(r.grupo_id) ?? 'Grupo', papel: PAPEL_OK(r.papel), origem: ORIGEM_OK(r.origem), perms: permsDaRow(r) })
    for (const r of estRows2) if (r[key] === id) { const e = estById.get(r.estudante_id); out.push({ id: r.estudante_id, tipo: 'estudante', email: e?.email ?? '', nome: e?.nome ?? 'Aluno', papel: PAPEL_OK(r.papel), avatar: e?.avatar ?? null, corAvatar: e?.perfil_avatar_cor ?? null, origem: ORIGEM_OK(r.origem), perms: permsDaRow(r) }) }
    return out
  }
  const geralDe = (row: any): DriveNodeDTO['geral'] => { const m = GERAL_OK(row.acesso_geral); return m ? { modo: m, papel: PAPEL_OK(row.acesso_geral_papel) } : null }

  const docsPorPasta = new Map<string | null, any[]>()
  for (const d of docsRaw) { const k = d.pasta_id ?? null; (docsPorPasta.get(k) ?? docsPorPasta.set(k, []).get(k)!).push(d) }

  const buildDoc = (d: any): DriveNodeDTO => ({ id: d.id, nome: d.titulo, tipo: 'doc', cor: null, herda: d.herda_acesso !== false, modo: MODO_OK(d.modo_acesso), oculto: d.oculto === true, pessoas: pessoasDe(dg, de, 'documento_id', d.id), geral: geralDe(d), filhos: [] })
  const vis = new Set<string>()
  const buildFolder = (p: any): DriveNodeDTO => {
    vis.add(p.id)
    return {
      id: p.id, nome: p.nome, tipo: 'folder', cor: p.cor ?? null, herda: p.herda_acesso !== false,
      modo: MODO_OK(p.modo_acesso), oculto: p.oculto === true,
      pessoas: pessoasDe(pg, pe, 'pasta_id', p.id), geral: geralDe(p),
      filhos: [
        ...(filhosDe.get(p.id) ?? []).filter((c) => !vis.has(c.id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(buildFolder),
        ...(docsPorPasta.get(p.id) ?? []).slice().sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt-BR')).map(buildDoc),
      ],
    }
  }
  return { ok: true, root: buildFolder(porId.get(raizId)) }
}

type AtribInput = { id: string; papel?: string; origem?: OrigemDTO; perms?: PermsDTO }
export async function salvarAcessoNo(input: {
  id: string; tipo: 'folder' | 'doc'; herda: boolean
  geral: { modo: 'restrito' | 'todos'; papel: string } | null
  modo?: ModoAcessoDTO; oculto?: boolean
  grupos: AtribInput[]; estudantes: AtribInput[]
}): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const tabela = input.tipo === 'folder' ? 'simulado_pastas' : 'simulado_conteudo_documentos'
  const tg = input.tipo === 'folder' ? 'simulado_pasta_grupos' : 'simulado_conteudo_documento_grupos'
  const te = input.tipo === 'folder' ? 'simulado_pasta_estudantes' : 'simulado_conteudo_documento_estudantes'
  const key = input.tipo === 'folder' ? 'pasta_id' : 'documento_id'

  const baseUpd = {
    herda_acesso: input.herda,
    acesso_geral: input.geral ? input.geral.modo : null,
    acesso_geral_papel: input.geral ? PAPEL_OK(input.geral.papel) : 'reader',
  }
  // modo_acesso/oculto são v2 (migração 20261026000000). Tenta com eles; se a coluna não existe, grava só o legado.
  const v2 = { ...baseUpd, ...(input.modo ? { modo_acesso: input.modo } : {}), ...(input.oculto !== undefined ? { oculto: !!input.oculto } : {}) }
  let upd = await svc.from(tabela).update(v2).eq('id', input.id).eq('tenant_id', g.tenantId)
  if (upd.error && SEM_COL_V2(upd.error.message)) upd = await svc.from(tabela).update(baseUpd).eq('id', input.id).eq('tenant_id', g.tenantId)
  if (upd.error && SEM_COL(upd.error.message)) return { ok: false, error: 'Rode a migração de acesso (20261022000000) e NOTIFY pgrst.' }
  if (upd.error) return { ok: false, error: upd.error.message }

  // Insere uma atribuição (grupo/aluno) com papel + colunas v2 (origem/permissões); se v2 ausente, só papel.
  async function substituir(tab: string, refCol: 'grupo_id' | 'estudante_id', linhas: AtribInput[]): Promise<{ ok: boolean; error?: string }> {
    const del = await svc.from(tab).delete().eq(key, input.id).eq('tenant_id', g.tenantId)
    if (del.error && SEM_TAB_DOC(del.error.message)) return { ok: false, error: 'Rode a migração de acesso do documento (20261021000000).' }
    const ids = linhas.filter((x) => x.id)
    if (!ids.length) return { ok: true }
    const full = ids.map((x) => ({
      tenant_id: g.tenantId, [key]: input.id, [refCol]: x.id, papel: PAPEL_OK(x.papel),
      origem: ORIGEM_OK(x.origem), pode_ler: x.perms ? !!x.perms.ler : true, pode_baixar: x.perms ? !!x.perms.baixar : true, pode_grifar: x.perms ? !!x.perms.grifar : true,
    }))
    let ins = await svc.from(tab).insert(full)
    if (ins.error && SEM_COL_V2(ins.error.message)) {
      ins = await svc.from(tab).insert(ids.map((x) => ({ tenant_id: g.tenantId, [key]: input.id, [refCol]: x.id, papel: PAPEL_OK(x.papel) })))
    }
    return ins.error ? { ok: false, error: ins.error.message } : { ok: true }
  }

  const rg = await substituir(tg, 'grupo_id', input.grupos ?? []); if (!rg.ok) return rg
  const re = await substituir(te, 'estudante_id', input.estudantes ?? []); if (!re.ok) return re

  await registrarAudit({ operacao: 'UPDATE', entidade: tabela, entidadeId: input.id, depois: { modo: input.modo ?? null, oculto: !!input.oculto, herda: input.herda, geral: input.geral?.modo ?? null, grupos: (input.grupos ?? []).length, estudantes: (input.estudantes ?? []).length }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
}

/** Grupos (ids) de um estudante — p/ o "Simular aluno" do modal (acessoEfetivo roda no cliente). */
export async function gruposDoEstudante(estudanteId: string): Promise<{ ok: boolean; grupos?: string[]; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId)
  return { ok: true, grupos: [...new Set(((data as any[]) ?? []).map((r) => r.grupo_id))] }
}

/** Grupos do tenant p/ o seletor do "Liberar acesso" (Drive). */
export async function listarGruposBiblioteca(): Promise<{ ok: boolean; grupos?: { id: string; nome: string; cor: string | null; is_mestre: boolean; pai_id: string | null }[]; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const grupos = await selecionarGrupos(svc, g.tenantId).catch(() => [] as any[])
  return { ok: true, grupos: (grupos as any[]).map((x) => ({ id: x.id, nome: x.nome, cor: x.cor ?? null, is_mestre: !!x.is_mestre, pai_id: x.pai_id ?? null })) }
}

/** Busca paginada de alunos do tenant (server-side .range()+count — sem puxar todos). */
export async function buscarAlunosBiblioteca(q = '', offset = 0, limit = 30): Promise<{ ok: boolean; items?: { id: string; nome: string; email: string | null; avatar: string | null; cor: string | null }[]; total?: number; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  let query = svc.from('simulado_estudantes').select('id, nome, email, avatar, perfil_avatar_cor', { count: 'exact' }).eq('tenant_id', g.tenantId)
  const term = (q ?? '').trim().replace(/[%,]/g, ' ')
  if (term) query = query.or(`nome.ilike.%${term}%,email.ilike.%${term}%`)
  const { data, count, error } = await query.order('nome', { ascending: true }).range(offset, offset + limit - 1)
  if (error) return { ok: false, error: error.message }
  return { ok: true, items: ((data as any[]) ?? []).map((e) => ({ id: e.id, nome: e.nome ?? 'Aluno', email: e.email ?? null, avatar: e.avatar ?? null, cor: e.perfil_avatar_cor ?? null })), total: count ?? 0 }
}

/** Resolve um e-mail a um aluno existente do tenant (sem auto-registro). */
export async function resolverEstudantePorEmail(email: string): Promise<{ ok: boolean; pessoa?: { id: string; tipo: 'estudante'; email: string; nome: string; papel: 'reader' }; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const v = (email ?? '').trim().toLowerCase()
  const { data } = await svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', g.tenantId).ilike('email', v).limit(1)
  const e = (data as any[])?.[0]
  if (!e) return { ok: false, error: 'Aluno não encontrado.' }
  return { ok: true, pessoa: { id: e.id, tipo: 'estudante', email: e.email ?? v, nome: e.nome ?? 'Aluno', papel: 'reader' } }
}

// ── SIDEBAR do documento (Fase 2): detalhe rico + permissões do aluno + acesso + vínculos leitor + histórico ──
export type PermissoesAluno = { pode_ler_plataforma: boolean; pode_baixar: boolean; pode_grifar: boolean; marca_dagua: boolean; pode_imprimir: boolean }
export type VinculoLeitor = { id: string; alvo_tipo: string; alvo_ref_id: string | null; rotulo: string; detalhe: string | null; url: string | null; modo: string; ordem: number }
export type AcessoLinhaSidebar = { id: string; nome: string; papel: string; pode_baixar: boolean; liberado_ate: string | null }
export type EventoHistorico = { tipo: string; titulo: string; detalhe: string | null; em: string }

function rotuloAudit(op: string, entidade: string): string {
  const alvo = /grupos|estudantes/.test(entidade) ? 'Acesso' : /vinculos_leitor|vinculos/.test(entidade) ? 'Vínculo' : /versoes/.test(entidade) ? 'Versão' : 'Documento'
  const m: Record<string, string> = { INSERT: 'criado', UPDATE: 'atualizado', DELETE: 'removido', LIBERAR: 'liberado', BLOQUEAR: 'bloqueado', ANULAR: 'anulado', RECORRIGIR: 'recorrigido' }
  return `${alvo} ${m[op] ?? String(op).toLowerCase()}`
}

/** Tudo que a sidebar do documento mostra (abas Detalhes/Acesso/Vínculos/Histórico). Tolerante a colunas
 *  não migradas (cai em defaults). */
export async function carregarSidebarDoc(documentoId: string): Promise<{
  ok: boolean; error?: string
  base?: { titulo: string; tipo_origem: string; status: string; versaoNum: number | null; versoesCount: number }
  permissoes?: PermissoesAluno; janela?: { de: string | null; ate: string | null }
  leituras?: number; grifos?: number
  acesso?: { geral: string | null; grupos: AcessoLinhaSidebar[]; estudantes: AcessoLinhaSidebar[] }
  vinculos?: VinculoLeitor[]
  historico?: EventoHistorico[]
}> {
  const g = await guard('view'); if (!g.ok) return { ok: false, error: g.error }
  const svc = createAdminClient()
  let doc: any = null
  try {
    const r = await svc.from('simulado_conteudo_documentos')
      .select('id, titulo, tipo_origem, status, versao_atual_id, acesso_geral, pode_ler_plataforma, pode_baixar, pode_grifar, marca_dagua, pode_imprimir, liberado_de, liberado_ate')
      .eq('tenant_id', g.tenantId).eq('id', documentoId).maybeSingle()
    doc = r.data
  } catch { /* colunas não migradas → defaults */ }
  if (!doc) { const base = await obterDocumento(documentoId); if (!base) return { ok: false, error: 'Documento não encontrado.' }; doc = { ...base, acesso_geral: null } }
  const permissoes: PermissoesAluno = {
    pode_ler_plataforma: doc.pode_ler_plataforma ?? true, pode_baixar: doc.pode_baixar ?? true,
    pode_grifar: doc.pode_grifar ?? true, marca_dagua: doc.marca_dagua ?? true, pode_imprimir: doc.pode_imprimir ?? false,
  }
  const janela = { de: doc.liberado_de ?? null, ate: doc.liberado_ate ?? null }

  // TUDO o resto em PARALELO (antes eram ~8 round-trips sequenciais = segundos de lag no clique).
  // Cada query tolera falha isolada (tabela não migrada → vazio), sem derrubar as outras.
  const nulo = () => ({ data: null as any, count: 0 })
  const [versoes, leiturasR, grifosR, dgR, deR, vinculosR, auditR] = await Promise.all([
    listarVersoes(documentoId).catch(() => [] as Awaited<ReturnType<typeof listarVersoes>>),
    svc.from('simulado_conteudo_leitura_progresso').select('aluno_id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).then((r) => r, nulo),
    svc.from('simulado_conteudo_anotacoes').select('id', { count: 'exact', head: true }).eq('tenant_id', g.tenantId).eq('documento_id', documentoId).then((r) => r, nulo),
    svc.from('simulado_conteudo_documento_grupos').select('grupo_id, papel, pode_baixar, liberado_ate').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).then((r) => r, nulo),
    svc.from('simulado_conteudo_documento_estudantes').select('estudante_id, papel, pode_baixar, liberado_ate').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).then((r) => r, nulo),
    svc.from('simulado_conteudo_vinculos_leitor').select('id, alvo_tipo, alvo_ref_id, rotulo, detalhe, url, modo, ordem').eq('tenant_id', g.tenantId).eq('documento_id', documentoId).order('ordem', { ascending: true }).then((r) => r, nulo),
    svc.from('simulado_audit_logs').select('operacao, entidade, criado_em').eq('tenant_id', g.tenantId).eq('entidade_id', documentoId).order('criado_em', { ascending: false }).limit(40).then((r) => r, nulo),
  ])
  const versaoNum = doc.versao_atual_id ? (versoes.find((v) => v.id === doc.versao_atual_id)?.numero ?? null) : (versoes[0]?.numero ?? null)
  const base = { titulo: doc.titulo ?? 'Documento', tipo_origem: doc.tipo_origem ?? '—', status: doc.status ?? 'rascunho', versaoNum, versoesCount: versoes.length }
  const leituras = leiturasR.count ?? 0, grifos = grifosR.count ?? 0
  const dg = (dgR.data as any[]) ?? [], de = (deR.data as any[]) ?? []

  // Lookups de NOMES (só o necessário) em paralelo: grupos atribuídos por id (não TODOS do tenant) + estudantes.
  const grupoIds = [...new Set(dg.map((r) => r.grupo_id).filter(Boolean))]
  const estIds = [...new Set(de.map((r) => r.estudante_id).filter(Boolean))]
  const [gruposNome, estNome] = await Promise.all([
    grupoIds.length ? (fetchAllByIn<any>(grupoIds, (chunk) => svc.from('simulado_grupos').select('id, nome').in('id', chunk)).catch(() => [])) : Promise.resolve([]),
    estIds.length ? (fetchAllByIn<any>(estIds, (chunk) => svc.from('simulado_estudantes').select('id, nome').in('id', chunk)).catch(() => [])) : Promise.resolve([]),
  ])
  const nomeG = new Map((gruposNome as any[]).map((x) => [x.id, x.nome]))
  const nomeE = new Map((estNome as any[]).map((x) => [x.id, x.nome]))
  const grupos: AcessoLinhaSidebar[] = dg.map((r) => ({ id: r.grupo_id, nome: nomeG.get(r.grupo_id) ?? 'Grupo', papel: r.papel ?? 'reader', pode_baixar: r.pode_baixar ?? true, liberado_ate: r.liberado_ate ?? null }))
  const estudantes: AcessoLinhaSidebar[] = de.map((r) => ({ id: r.estudante_id, nome: nomeE.get(r.estudante_id) ?? 'Aluno', papel: r.papel ?? 'reader', pode_baixar: r.pode_baixar ?? true, liberado_ate: r.liberado_ate ?? null }))

  const vinculos: VinculoLeitor[] = ((vinculosR.data as any[]) ?? []) as VinculoLeitor[]
  const historico: EventoHistorico[] = []
  for (const a of ((auditR.data as any[]) ?? [])) historico.push({ tipo: 'audit', titulo: rotuloAudit(a.operacao, a.entidade), detalhe: null, em: a.criado_em })
  for (const v of versoes) historico.push({ tipo: 'versao', titulo: `Versão ${v.numero} publicada`, detalhe: v.origem === 'edicao_editor' ? 'edição no editor' : v.origem, em: v.criada_em })
  historico.sort((a, b) => String(b.em).localeCompare(String(a.em)))

  return { ok: true, base, permissoes, janela, leituras, grifos, acesso: { geral: doc.acesso_geral ?? null, grupos, estudantes }, vinculos, historico: historico.slice(0, 30) }
}

/** Salva os toggles "o que o aluno pode fazer". */
export async function salvarPermissoesDoc(documentoId: string, p: Partial<PermissoesAluno>): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const patch: Record<string, boolean> = {}
  for (const k of ['pode_ler_plataforma', 'pode_baixar', 'pode_grifar', 'marca_dagua', 'pode_imprimir'] as const) if (k in p) patch[k] = !!p[k]
  if (!Object.keys(patch).length) return { ok: true }
  const { error } = await svc.from('simulado_conteudo_documentos').update(patch).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: /column .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração da sidebar (20261024000000).' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: patch, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

/** Define a janela de liberação (datas) no nível do documento. */
export async function salvarJanelaDoc(documentoId: string, de: string | null, ate: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_documentos').update({ liberado_de: de || null, liberado_ate: ate || null }).eq('tenant_id', g.tenantId).eq('id', documentoId)
  if (error) return { ok: false, error: /column .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração da sidebar (20261024000000).' : error.message }
  await registrarAudit({ operacao: 'LIBERAR', entidade: 'simulado_conteudo_documentos', entidadeId: documentoId, depois: { liberado_de: de, liberado_ate: ate }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

/** Adiciona um vínculo CONTEÚDO↔CONTEÚDO (aparece pro aluno no leitor). */
export async function adicionarVinculoLeitor(input: { documentoId: string; alvo_tipo: string; alvo_ref_id?: string | null; rotulo: string; detalhe?: string | null; url?: string | null; modo?: string }): Promise<{ ok: boolean; error?: string; id?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const rotulo = (input.rotulo ?? '').trim(); if (!rotulo) return { ok: false, error: 'Informe um rótulo.' }
  const { data, error } = await svc.from('simulado_conteudo_vinculos_leitor').insert({
    tenant_id: g.tenantId, documento_id: input.documentoId, alvo_tipo: input.alvo_tipo, alvo_ref_id: input.alvo_ref_id ?? null,
    rotulo, detalhe: input.detalhe ?? null, url: input.url ?? null, modo: input.modo ?? 'sempre',
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: /relation .* does not exist|schema cache/i.test(error.message) ? 'Rode a migração da sidebar (20261024000000).' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_conteudo_vinculos_leitor', entidadeId: input.documentoId, depois: { rotulo }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true, id: (data as any)?.id }
}

/** Remove um vínculo de leitor. */
export async function removerVinculoLeitor(id: string, documentoId?: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_conteudo_vinculos_leitor').delete().eq('tenant_id', g.tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_conteudo_vinculos_leitor', entidadeId: documentoId ?? null, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca'); return { ok: true }
}

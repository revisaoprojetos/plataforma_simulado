'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
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
  arquivos: Record<string, { url: string; tipo: string }>
  pdfs: Record<string, string>
}> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error, pastas: [], documentos: [], breadcrumb: [], previas: {}, thumbs: {}, arquivos: {}, pdfs: {} }
  const svc = createAdminClient()
  const area = folderArea(categoria)
  // Filtra NO BANCO por área (não varre todas as pastas do tenant) + order por coluna única (paginação segura).
  const todas = (await fetchAll<any>(() => svc.from(PASTAS)
    .select('id, nome, pai_id, cor, deletado')
    .eq('tenant_id', g.tenantId).eq('folder_area', area).eq('is_folder', true)
    .order('id', { ascending: true }))) ?? []
  const doArea = todas.filter((p) => !p.deletado).sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
  const alvo = pastaId ?? null
  const pastas = doArea.filter((p) => (p.pai_id ?? null) === alvo).map((p) => ({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }))
  const documentos = await listarDocumentos({ pastaId: alvo, categoria })
  // breadcrumb
  const porId = new Map(doArea.map((p) => [p.id, p]))
  const breadcrumb: PastaConteudo[] = []
  let cur = alvo
  while (cur && porId.has(cur)) { const p = porId.get(cur)!; breadcrumb.unshift({ id: p.id, nome: p.nome, pai_id: p.pai_id ?? null, cor: p.cor ?? null }); cur = p.pai_id ?? null }

  // PRÉVIA dos cards: primeiros trechos ESTRUTURADOS (tipo+texto) p/ montar uma mini-página (título + linhas),
  // em vez de um blocão de texto. Versão = atual (publicada) ou a mais nova. Batched.
  const previas: Record<string, { tipo: string; texto: string }[]> = {}
  // URL assinada do ORIGINAL por doc → miniatura FIEL no card (docx-preview / PDF nativo), sem OnlyOffice.
  const arquivos: Record<string, { url: string; tipo: string }> = {}
  // URL do PDF (doc inteiro, cacheado) por doc → a prévia grande abre DIRETO no viewer (sem telas de loading).
  const pdfs: Record<string, string> = {}
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

      // Por doc: (a) URL do ORIGINAL (p/ docx-preview, fallback local) e (b) URL da CAPA fiel do OnlyOffice
      // (PNG cacheado por versão/hash) — PREFERIDA quando existe (produção). O card tenta a capa e, se o
      // objeto não existir (ex.: dev sem OnlyOffice → 404), cai no docx-preview.
      const vks = (await fetchAll<any>(() => svc.from('simulado_conteudo_versoes').select('id, arquivo_key, hash_arquivo').eq('tenant_id', g.tenantId).in('id', verIds))) ?? []
      const keyPorVer = new Map<string, string>(); const hashPorVer = new Map<string, string>()
      for (const v of vks) { if (v.arquivo_key) keyPorVer.set(v.id, v.arquivo_key); hashPorVer.set(v.id, String(v.hash_arquivo || '')) }
      await Promise.all(documentos.map(async (d) => {
        const verId = verPorDoc.get(d.id); if (!verId) return
        const key = keyPorVer.get(verId)
        if (key) { const url = await urlAssinadaOriginal(key, 3600); if (url) arquivos[d.id] = { url, tipo: String((d as any).tipo_origem || 'docx') } }
        if ((d as any).tipo_origem === 'docx') {
          const h8 = hashPorVer.get(verId)?.slice(0, 8) || ''
          // Capa (1ª página). Cacheada → usa; senão pré-gera em background.
          const turl = await urlAssinadaOriginal(`conteudo-thumbs/${g.tenantId}/${verId}_${h8}_r1k.png`, 3600)
          if (turl) thumbs[d.id] = turl
          else void gerarThumbDocumento(g.tenantId, d.id).catch(() => {})
          // PDF (doc inteiro). Cacheado → devolve a URL (prévia grande abre DIRETO); senão pré-gera.
          const purl = await urlAssinadaOriginal(`conteudo-pdfs/${g.tenantId}/${verId}_${h8}.pdf`, 3600)
          if (purl) pdfs[d.id] = purl
          else void gerarPdfDocumento(g.tenantId, d.id).catch(() => {})
        }
      }))
    }
  } catch { /* prévia/capa best-effort */ }

  return { ok: true, pastas, documentos, breadcrumb, previas, thumbs, arquivos, pdfs }
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
  void gerarThumbDocumento(input.tenantId, criado.documentoId, { forcar: true }).catch(() => {})
  void gerarPdfDocumento(input.tenantId, criado.documentoId).catch(() => {}) // pré-gera o PDF do doc inteiro (prévia grande)
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
export async function prepararUploadConteudo(nomeArquivo: string): Promise<{ ok: boolean; path?: string; token?: string; bucket?: string; signedUrl?: string; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const bucket = await resolverBucketConteudo()
  const safe = (nomeArquivo || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(-80)
  const path = `tmp/${g.tenantId}/${randomUUID()}-${safe}`
  const { data, error } = await svc.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data) return { ok: false, error: error?.message || 'Falha ao preparar o upload.' }
  return { ok: true, path, token: data.token, bucket, signedUrl: data.signedUrl }
}

export async function importarDeStorage(input: {
  path: string; titulo: string; nomeArquivo: string; mime?: string; pastaId?: string | null; categoria?: Categoria
}): Promise<{ ok: boolean; error?: string; documentoId?: string; trechos?: number }> {
  const g = await guard('update'); if (!g.ok) return g
  // Só paths temporários do próprio tenant.
  if (!input.path.startsWith(`tmp/${g.tenantId}/`)) return { ok: false, error: 'Caminho de upload inválido.' }
  const svc = createAdminClient()
  const bucket = await resolverBucketConteudo()
  const data = await baixarOriginal(input.path)
  if (!data) return { ok: false, error: 'Não foi possível ler o arquivo enviado.' }
  const r = await ingerirBytes(data, { titulo: input.titulo, pastaId: input.pastaId, nomeArquivo: input.nomeArquivo, mime: input.mime, categoria: input.categoria, tenantId: g.tenantId, atorId: g.atorId })
  await svc.storage.from(bucket).remove([input.path]).catch(() => {})
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
  // A última versão É a publicada → cria um rascunho copiando o arquivo (preserva a imutável).
  const bytes = await baixarOriginal(last.arquivo_key)
  if (!bytes) return { ok: false, error: 'Não foi possível ler o arquivo da versão atual (storage).' }
  const nv = await criarVersao(documentoId, { arquivoKey: '', origem: 'edicao_editor' })
  if ('erro' in nv) return { ok: false, error: nv.erro }
  const guardado = await guardarOriginal({ tenantId: g.tenantId, documentoId, numeroVersao: nv.numero, tipo: 'docx', data: bytes, nome: `${doc.titulo}.docx`, criadoPor: g.atorId })
  if ('erro' in guardado) return { ok: false, error: guardado.erro }
  await definirArquivoVersao(nv.versaoId, guardado.arquivoKey, guardado.hash)
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
  const trechos = await fetchAll<any>(() => svc.from('simulado_conteudo_trechos').select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', g.tenantId).eq('versao_id', versaoId).order('ordem', { ascending: true }))
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
export type DriveNodeDTO = {
  id: string; nome: string; tipo: 'folder' | 'doc'; cor: string | null; herda: boolean
  pessoas: { id: string; tipo: 'estudante' | 'grupo'; email: string; nome: string; papel: 'reader' | 'commenter' | 'editor'; avatar?: string | null; corAvatar?: string | null }[]
  geral: { modo: 'restrito' | 'todos'; papel: 'reader' | 'commenter' | 'editor' } | null
  filhos: DriveNodeDTO[]
}
const PAPEL_OK = (p: any): 'reader' | 'commenter' | 'editor' => (p === 'commenter' || p === 'editor' ? p : 'reader')
const GERAL_OK = (gr: any): 'restrito' | 'todos' | null => (gr === 'restrito' || gr === 'todos' ? gr : null)
const SEM_COL = (m?: string) => /column .* does not exist|herda_acesso|acesso_geral/i.test(m ?? '')

export async function montarArvoreAcessoDrive(raizId: string, categoria: Categoria = 'conteudo'): Promise<{ ok: boolean; root?: DriveNodeDTO; error?: string }> {
  const g = await guard('view'); if (!g.ok) return g
  const svc = createAdminClient()
  const fa = folderArea(categoria)
  const gruposP = selecionarGrupos(svc, g.tenantId).catch(() => [] as any[]) // em paralelo (independe das pastas)
  const pastasRaw = (await fetchAll<any>(() => svc.from('simulado_pastas')
    .select('id, nome, pai_id, cor, herda_acesso, acesso_geral, acesso_geral_papel')
    .eq('tenant_id', g.tenantId).eq('folder_area', fa).eq('deletado', false).order('id', { ascending: true }))) ?? []
  const porId = new Map<string, any>(pastasRaw.map((p) => [p.id, p]))
  if (!porId.has(raizId)) return { ok: false, error: 'Pasta não encontrada.' }
  const filhosDe = new Map<string | null, any[]>()
  for (const p of pastasRaw) { const k = p.pai_id ?? null; (filhosDe.get(k) ?? filhosDe.set(k, []).get(k)!).push(p) }

  // subárvore de pastas (BFS anti-ciclo)
  const subIds: string[] = []; const seen = new Set<string>(); const stack = [raizId]
  while (stack.length) { const cur = stack.pop()!; if (seen.has(cur)) continue; seen.add(cur); subIds.push(cur); for (const f of filhosDe.get(cur) ?? []) stack.push(f.id) }

  const docsRaw = subIds.length ? ((await fetchAllByIn<any>(subIds, (c) => svc.from('simulado_conteudo_documentos')
    .select('id, titulo, pasta_id, herda_acesso, acesso_geral, acesso_geral_papel')
    .eq('tenant_id', g.tenantId).eq('categoria', categoria).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true }))) ?? []) : []
  const docIds = docsRaw.map((d) => d.id)

  let pg: any[] = [], pe: any[] = [], dg: any[] = [], de: any[] = []
  try {
    const [a, b] = await Promise.all([
      fetchAllByIn<any>(subIds, (c) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id, papel').eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true })),
      fetchAllByIn<any>(subIds, (c) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id, papel').eq('tenant_id', g.tenantId).in('pasta_id', c).order('id', { ascending: true })),
    ]); pg = a as any[]; pe = b as any[]
  } catch { /* tabelas/colunas ausentes */ }
  if (docIds.length) try {
    const [a, b] = await Promise.all([
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_grupos').select('documento_id, grupo_id, papel').eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true })),
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_estudantes').select('documento_id, estudante_id, papel').eq('tenant_id', g.tenantId).in('documento_id', c).order('id', { ascending: true })),
    ]); dg = a as any[]; de = b as any[]
  } catch { /* migração de doc pendente */ }

  const grupos = await gruposP
  const nomeGrupo = new Map<string, string>((grupos as any[]).map((x) => [x.id, x.nome]))
  const estIds = [...new Set([...pe, ...de].map((r) => r.estudante_id))]
  const estRows = estIds.length ? (await fetchAllByIn<any>(estIds, (c) => svc.from('simulado_estudantes').select('id, nome, email, avatar, perfil_avatar_cor').in('id', c).order('id', { ascending: true }))) ?? [] : []
  const estById = new Map<string, any>((estRows as any[]).map((e) => [e.id, e]))

  const pessoasDe = (grpRows: any[], estRows2: any[], key: 'pasta_id' | 'documento_id', id: string): DriveNodeDTO['pessoas'] => {
    const out: DriveNodeDTO['pessoas'] = []
    for (const r of grpRows) if (r[key] === id) out.push({ id: r.grupo_id, tipo: 'grupo', email: '', nome: nomeGrupo.get(r.grupo_id) ?? 'Grupo', papel: PAPEL_OK(r.papel) })
    for (const r of estRows2) if (r[key] === id) { const e = estById.get(r.estudante_id); out.push({ id: r.estudante_id, tipo: 'estudante', email: e?.email ?? '', nome: e?.nome ?? 'Aluno', papel: PAPEL_OK(r.papel), avatar: e?.avatar ?? null, corAvatar: e?.perfil_avatar_cor ?? null }) }
    return out
  }
  const geralDe = (row: any): DriveNodeDTO['geral'] => { const m = GERAL_OK(row.acesso_geral); return m ? { modo: m, papel: PAPEL_OK(row.acesso_geral_papel) } : null }

  const docsPorPasta = new Map<string | null, any[]>()
  for (const d of docsRaw) { const k = d.pasta_id ?? null; (docsPorPasta.get(k) ?? docsPorPasta.set(k, []).get(k)!).push(d) }

  const buildDoc = (d: any): DriveNodeDTO => ({ id: d.id, nome: d.titulo, tipo: 'doc', cor: null, herda: d.herda_acesso !== false, pessoas: pessoasDe(dg, de, 'documento_id', d.id), geral: geralDe(d), filhos: [] })
  const vis = new Set<string>()
  const buildFolder = (p: any): DriveNodeDTO => {
    vis.add(p.id)
    return {
      id: p.id, nome: p.nome, tipo: 'folder', cor: p.cor ?? null, herda: p.herda_acesso !== false,
      pessoas: pessoasDe(pg, pe, 'pasta_id', p.id), geral: geralDe(p),
      filhos: [
        ...(filhosDe.get(p.id) ?? []).filter((c) => !vis.has(c.id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')).map(buildFolder),
        ...(docsPorPasta.get(p.id) ?? []).slice().sort((a, b) => String(a.titulo).localeCompare(String(b.titulo), 'pt-BR')).map(buildDoc),
      ],
    }
  }
  return { ok: true, root: buildFolder(porId.get(raizId)) }
}

export async function salvarAcessoNo(input: {
  id: string; tipo: 'folder' | 'doc'; herda: boolean
  geral: { modo: 'restrito' | 'todos'; papel: string } | null
  grupos: { id: string; papel: string }[]; estudantes: { id: string; papel: string }[]
}): Promise<{ ok: boolean; error?: string }> {
  const g = await guard('update'); if (!g.ok) return g
  const svc = createAdminClient()
  const tabela = input.tipo === 'folder' ? 'simulado_pastas' : 'simulado_conteudo_documentos'
  const tg = input.tipo === 'folder' ? 'simulado_pasta_grupos' : 'simulado_conteudo_documento_grupos'
  const te = input.tipo === 'folder' ? 'simulado_pasta_estudantes' : 'simulado_conteudo_documento_estudantes'
  const key = input.tipo === 'folder' ? 'pasta_id' : 'documento_id'

  const upd = await svc.from(tabela).update({
    herda_acesso: input.herda,
    acesso_geral: input.geral ? input.geral.modo : null,
    acesso_geral_papel: input.geral ? PAPEL_OK(input.geral.papel) : 'reader',
  }).eq('id', input.id).eq('tenant_id', g.tenantId)
  if (upd.error && !SEM_COL(upd.error.message)) return { ok: false, error: upd.error.message }
  if (upd.error && SEM_COL(upd.error.message)) return { ok: false, error: 'Rode a migração de acesso (20261022000000) e NOTIFY pgrst.' }

  const gIds = (input.grupos ?? []).filter((x) => x.id)
  const dgr = await svc.from(tg).delete().eq(key, input.id).eq('tenant_id', g.tenantId)
  if (dgr.error && SEM_TAB_DOC(dgr.error.message)) return { ok: false, error: 'Rode a migração de acesso do documento (20261021000000).' }
  if (gIds.length) { const { error } = await svc.from(tg).insert(gIds.map((x) => ({ tenant_id: g.tenantId, [key]: input.id, grupo_id: x.id, papel: PAPEL_OK(x.papel) }))); if (error) return { ok: false, error: error.message } }

  const eIds = (input.estudantes ?? []).filter((x) => x.id)
  await svc.from(te).delete().eq(key, input.id).eq('tenant_id', g.tenantId)
  if (eIds.length) { const { error } = await svc.from(te).insert(eIds.map((x) => ({ tenant_id: g.tenantId, [key]: input.id, estudante_id: x.id, papel: PAPEL_OK(x.papel) }))); if (error) return { ok: false, error: error.message } }

  await registrarAudit({ operacao: 'UPDATE', entidade: tabela, entidadeId: input.id, depois: { herda: input.herda, geral: input.geral?.modo ?? null, grupos: gIds.length, estudantes: eIds.length }, atorId: g.atorId, tenantId: g.tenantId }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true }
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

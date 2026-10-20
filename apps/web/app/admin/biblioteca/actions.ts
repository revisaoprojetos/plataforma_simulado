'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission, getAuthUser } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import {
  listarDocumentos, obterDocumento, listarVersoes, criarDocumento,
  criarVersao, definirArquivoVersao, definirVersaoAtual, ultimaVersao,
} from '@/lib/conteudo/documentos'
import { tipoDoArquivo, converterParaHtml, guardarOriginal, baixarOriginal, urlAssinadaOriginal } from '@/lib/conteudo/ingestao'
import { reconciliarVersao } from '@/lib/conteudo/reconciliacao'
import { listarVinculosDoDocumento, vincularDocumento, desvincular, type ModoVinculo } from '@/lib/conteudo/vinculos'
import { gerarThumbDocumento } from '@/lib/conteudo/thumb'

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
}> {
  const g = await guard('view')
  if (!g.ok) return { ok: false, error: g.error, pastas: [], documentos: [], breadcrumb: [], previas: {}, thumbs: {} }
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
      const trechos = (await fetchAll<any>(() => svc.from('simulado_conteudo_trechos').select('versao_id, ordem, texto, tipo').eq('tenant_id', g.tenantId).in('versao_id', verIds).lte('ordem', 7).order('ordem', { ascending: true }))) ?? []
      const porVersao = new Map<string, { tipo: string; texto: string }[]>()
      for (const t of trechos) { const a = porVersao.get(t.versao_id) ?? []; if (a.length < 7) a.push({ tipo: String(t.tipo || 'paragrafo'), texto: String(t.texto || '').replace(/\s+/g, ' ').trim().slice(0, 160) }); porVersao.set(t.versao_id, a) }
      for (const [docId, verId] of verPorDoc) { const arr = porVersao.get(verId); if (arr && arr.length) previas[docId] = arr }

      // hash por versão → caminho da capa → URL assinada (só docx).
      const hashPorVer = new Map<string, string>()
      const vs = (await fetchAll<any>(() => svc.from('simulado_conteudo_versoes').select('id, hash_arquivo').eq('tenant_id', g.tenantId).in('id', verIds))) ?? []
      for (const v of vs) hashPorVer.set(v.id, String(v.hash_arquivo || ''))
      await Promise.all(documentos.filter((d) => d.tipo_origem === 'docx').map(async (d) => {
        const verId = verPorDoc.get(d.id); if (!verId) return
        const path = `conteudo-thumbs/${g.tenantId}/${verId}_${hashPorVer.get(verId)?.slice(0, 8) || ''}_r1k.png`
        const url = await urlAssinadaOriginal(path, 3600)
        if (url) thumbs[d.id] = url
      }))
    }
  } catch { /* prévia/capa best-effort */ }

  return { ok: true, pastas, documentos, breadcrumb, previas, thumbs }
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
export async function thumbDocumento(documentoId: string): Promise<{ url: string | null }> {
  const g = await guard('view')
  if (!g.ok) return { url: null }
  return { url: await gerarThumbDocumento(g.tenantId, documentoId) }
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
export async function importarDocumento(input: {
  titulo: string; pastaId?: string | null
  nomeArquivo: string; mime?: string; dataBase64: string; categoria?: Categoria
}): Promise<{ ok: boolean; error?: string; documentoId?: string; trechos?: number }> {
  const g = await guard('update')
  if (!g.ok) return g
  const tipo = tipoDoArquivo(input.nomeArquivo, input.mime)
  if (!tipo) return { ok: false, error: 'Formato não suportado (use .docx, .pdf ou .html).' }

  // Origem AUTOMÁTICA = conta que importou (e-mail/nome). Sem campo manual, sem gate.
  const user = await getAuthUser()
  const fonte = user?.email || (user?.user_metadata as any)?.name || g.atorId || null

  const data = bytesDeBase64(input.dataBase64)
  // 1. cria doc + versão 1 (arquivo_key vazio por ora)
  const criado = await criarDocumento({ titulo: input.titulo, tipoOrigem: tipo, arquivoKey: '', pastaId: input.pastaId ?? null, fonte, licenca: null, criadoPor: g.atorId, categoria: input.categoria ?? 'conteudo' })
  if ('erro' in criado) return { ok: false, error: criado.erro }

  // 2. sobe o original e amarra à versão 1
  const guardado = await guardarOriginal({ tenantId: g.tenantId, documentoId: criado.documentoId, numeroVersao: 1, tipo, data, nome: input.nomeArquivo, criadoPor: g.atorId })
  if ('erro' in guardado) return { ok: false, error: guardado.erro, documentoId: criado.documentoId }
  await definirArquivoVersao(criado.versaoId, guardado.arquivoKey, guardado.hash)

  // 3. converte + estrutura (sem versão anterior → cria uids frescos)
  const { html, erro } = await converterParaHtml(data, tipo)
  if (erro || !html.trim()) return { ok: false, error: erro || 'Conversão vazia.', documentoId: criado.documentoId }
  const rec = await reconciliarVersao({ documentoId: criado.documentoId, versaoNovaId: criado.versaoId, versaoAnteriorId: null, html })
  if (rec.erro) return { ok: false, error: rec.erro, documentoId: criado.documentoId }

  await registrarAudit({ tenantId: g.tenantId, atorId: g.atorId, entidade: 'simulado_conteudo_documentos', operacao: 'INSERT', entidadeId: criado.documentoId, depois: { titulo: input.titulo, trechos: rec.trechos } }).catch(() => {})
  // Pré-gera a miniatura FIEL (docx→PNG via OnlyOffice) já no import → card abre instantâneo depois.
  await gerarThumbDocumento(g.tenantId, criado.documentoId, { forcar: true }).catch(() => {})
  revalidatePath('/admin/biblioteca')
  return { ok: true, documentoId: criado.documentoId, trechos: rec.trechos }
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

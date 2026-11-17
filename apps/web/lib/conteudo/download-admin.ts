import 'server-only'
import { montarZip, validarBytesArquivo } from './download-admin-zip'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { decidirDownload, montarPdfComCapa, sanitizarNomeArquivo } from './baixar-pura'
import { mapaPastas, resolverCapaDoc, resolverPaginaInicialDoc, type PastaCP } from './capa-pagina'
import { buscar, carregarCapa } from './capa-bytes'
import { urlAssinadaOriginal } from './ingestao'
import { montarFolhaAtualizacaoPdf } from './folha-atualizacao'
import { dadosFolhaDoDocumento } from './folha-atualizacao-dados'
import { urlFonteOnlyOffice } from './fonte-onlyoffice'
import { converterDocx, gerarPdfDocumento } from './thumb'
import {
  DL_CONCORRENCIA, DL_MAX_BYTES_TOTAL, DL_MAX_DOCS, DL_MAX_IDS, DL_ORCAMENTO_MS, EXT_CONVERSAO, FORMATOS_DOWNLOAD, MIME_POR_EXT,
  montarRelatorio, nomeDoZip, sanitizarSegmento, type FormatoDownload, type LinhaRelatorio,
} from './download-admin-pura'

/**
 * DOWNLOAD ADMIN (editor + lote da Biblioteca). Um serviço só:
 *  - resolve documentos do tenant (ids + pastas[+subpastas], chunks de 80);
 *  - gera cada arquivo no formato pedido (original do storage, PDF cacheado em conteudo-pdfs, ODT/RTF/TXT pelo
 *    ConvertService do OnlyOffice) com CAPA opcional (capa do documento > capa da pasta em lote; a página inicial
 *    descarta as folhas "ocultas" — mesmas regras do download do aluno: decidirDownload/montarPdfComCapa);
 *  - 1 documento + 1 formato = arquivo direto; senão ZIP (nomes = título sanitizado + extensão, duplicados " (2)",
 *    estrutura de pastas opcional, _relatorio.txt com falhas/avisos). Falha de um item NUNCA derruba o lote.
 */

const PASTAS = 'simulado_pastas'
const DOCS = 'simulado_conteudo_documentos'
const VERS = 'simulado_conteudo_versoes'
const MAX_DOC_BYTES = 120 * 1024 * 1024

export interface PedidoDownload {
  documentoIds: string[]
  pastaIds: string[]
  incluirSubpastas: boolean
  formatos: FormatoDownload[]
  incluirCapa: boolean
  /** Folha com a ÚLTIMA atualização publicada do documento: entra depois da capa e antes da 1ª folha (só PDF/Original). */
  incluirAtualizacao?: boolean
  manterEstrutura: boolean
  /** Só com 1 documento: baixa ESTA versão (ex.: a do editor) em vez da atual. */
  versaoId?: string | null
}

type DocRow = { id: string; titulo: string; pasta_id: string | null; tipo_origem: string; versao_atual_id: string | null; capa_url?: string | null; pagina_inicial?: number | null }
type VerRow = { id: string; documento_id: string; arquivo_key: string | null; hash_arquivo: string | null }
type PastaRow = PastaCP & { nome: string; deletado?: boolean }

export type ResultadoDownload =
  | { ok: false; status: number; erro: string }
  | { ok: true; bytes: Uint8Array; nome: string; mime: string; docIds: string[]; resumo: { total: number; geradas: number; falhas: number; avisos: number; zip: boolean; aviso?: string } }

const semColuna = (m?: string) => /column .* does not exist|schema cache|42703|PGRST204/i.test(m ?? '')

async function carregarPastas(svc: SupabaseClient, tenantId: string): Promise<PastaRow[]> {
  const sel = (cols: string) => () => svc.from(PASTAS).select(cols).eq('tenant_id', tenantId).in('folder_area', ['conteudo', 'conteudo_modelo', 'conteudo_jurisclub']).eq('is_folder', true).order('id', { ascending: true })
  let rows: any[] = []
  try { rows = (await fetchAll<any>(sel('id, nome, pai_id, deletado, capa_url, capa_modo, pagina_inicial, pagina_inicial_modo'))) ?? [] }
  catch { try { rows = (await fetchAll<any>(sel('id, nome, pai_id, deletado'))) ?? [] } catch { rows = [] } } // migração de capa ausente
  return rows.filter((p) => !p.deletado) as PastaRow[]
}

async function carregarDocs(svc: SupabaseClient, tenantId: string, col: 'id' | 'pasta_id', ids: string[]): Promise<DocRow[]> {
  const q = (cols: string) => (c: string[]) => svc.from(DOCS).select(cols).eq('tenant_id', tenantId).eq('deletado', false).in(col, c).order('id', { ascending: true })
  try { return (await fetchAllByIn<any>(ids, q('id, titulo, pasta_id, tipo_origem, versao_atual_id, capa_url, pagina_inicial'))) ?? [] }
  catch (e) {
    if (!semColuna((e as Error)?.message)) throw e
    return (await fetchAllByIn<any>(ids, q('id, titulo, pasta_id, tipo_origem, versao_atual_id'))) ?? []
  }
}

/** Lista final: docs + caminho (pastas) de cada um, relativo à pasta selecionada mais próxima. */
async function resolverDocs(svc: SupabaseClient, tenantId: string, p: PedidoDownload) {
  const precisaPastas = p.pastaIds.length > 0 || p.incluirCapa || p.manterEstrutura
  const pastas = precisaPastas ? await carregarPastas(svc, tenantId) : []
  const porId = new Map(pastas.map((x) => [x.id, x]))
  const escopoTopo = new Map<string, string>() // pastaId -> pasta de topo selecionada
  const topos = p.pastaIds.filter((id) => porId.has(id))
  for (const t of topos) escopoTopo.set(t, t)
  if (topos.length && p.incluirSubpastas) {
    const filhos = new Map<string, string[]>()
    for (const x of pastas) if (x.pai_id) (filhos.get(x.pai_id) ?? filhos.set(x.pai_id, []).get(x.pai_id)!).push(x.id)
    for (const t of topos) {
      const pilha = [t]
      while (pilha.length) { const cur = pilha.pop()!; for (const f of filhos.get(cur) ?? []) if (!escopoTopo.has(f)) { escopoTopo.set(f, t); pilha.push(f) } }
    }
  }
  const mapa = new Map<string, DocRow>()
  const add = (rows: DocRow[]) => { for (const r of rows) if (!mapa.has(r.id)) mapa.set(r.id, r) }
  if (p.documentoIds.length) add(await carregarDocs(svc, tenantId, 'id', p.documentoIds))
  if (escopoTopo.size) add(await carregarDocs(svc, tenantId, 'pasta_id', [...escopoTopo.keys()]))
  const docs = [...mapa.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))

  // Com UMA pasta de topo e nenhum doc avulso fora dela, a raiz do ZIP é o conteúdo da pasta (sem aninhar o próprio nome).
  const soUmaPasta = topos.length === 1 && docs.every((d) => d.pasta_id && escopoTopo.get(d.pasta_id) === topos[0])
  const caminho = (d: DocRow): string => {
    if (!p.manterEstrutura || !d.pasta_id) return ''
    const topo = escopoTopo.get(d.pasta_id)
    if (!topo) return '' // doc avulso (fora das pastas selecionadas) vai na raiz
    const segs: string[] = []
    const vistos = new Set<string>()
    let cur: string | null = d.pasta_id
    while (cur && !vistos.has(cur)) {
      vistos.add(cur)
      const pa = porId.get(cur)
      if (!pa) break
      if (!(soUmaPasta && cur === topo)) segs.unshift(sanitizarSegmento(pa.nome))
      if (cur === topo) break
      cur = pa.pai_id ?? null
    }
    return segs.join('/')
  }
  return { docs, pastas, caminho, pastaUnica: topos.length === 1 && soUmaPasta ? (porId.get(topos[0])?.nome ?? null) : null }
}

interface Ctx {
  svc: SupabaseClient; tenantId: string; origem: string; incluirCapa: boolean; incluirAtualizacao: boolean
  versoes: Map<string, VerRow>; pastasCP: Map<string, PastaCP>
  capaCache: Map<string, Promise<Awaited<ReturnType<typeof carregarCapa>>>>
  versaoIdFixa?: string | null
}

type Gerado = { ok: true; bytes: Uint8Array; ext: string; aviso?: string } | { ok: false; erro: string }

function extDoOriginal(d: DocRow, arquivoKey: string): string {
  if (d.tipo_origem === 'docx' || d.tipo_origem === 'pdf') return d.tipo_origem
  const m = /\.([a-z0-9]{1,5})$/i.exec(arquivoKey)
  return m ? m[1].toLowerCase() : 'bin'
}

async function gerarArquivoBruto(ctx: Ctx, d: DocRow, fmt: FormatoDownload): Promise<Gerado> {
  const ver = ctx.versoes.get(d.id)
  if (!ver?.arquivo_key) return { ok: false, erro: 'Documento sem arquivo (nenhuma versão com arquivo).' }
  const arquivoKey = ver.arquivo_key
  const tipo = d.tipo_origem
  const baixavel = tipo === 'pdf' || tipo === 'docx'
  const urlOrig = async () => urlAssinadaOriginal(arquivoKey, 600)

  // capa efetiva (documento > pasta em lote) e página inicial
  let capaUrl: string | null = null, paginaInicial = 1
  if (ctx.incluirCapa) {
    capaUrl = resolverCapaDoc(d.capa_url, d.pasta_id, ctx.pastasCP).valor
    paginaInicial = resolverPaginaInicialDoc(d.pagina_inicial ?? null, d.pasta_id, ctx.pastasCP).valor ?? 1
  }
  const fmtAceitaCapa = FORMATOS_DOWNLOAD.find((f) => f.id === fmt)?.aceitaCapa ?? false
  let aviso: string | undefined
  if (ctx.incluirCapa && !fmtAceitaCapa) aviso = 'A capa só se aplica ao PDF; este formato saiu sem capa.'
  else if (ctx.incluirCapa && !capaUrl) aviso = 'Sem capa cadastrada (nem no documento nem na pasta); saiu sem capa.'
  else if (ctx.incluirCapa && !baixavel) aviso = 'Capa só se aplica a documentos PDF/DOCX; este tipo saiu sem capa.'
  const comCapa = !!(ctx.incluirCapa && fmtAceitaCapa && capaUrl && baixavel)

  // Folha de atualização (última atualização publicada): só PDF/Original de PDF/DOCX; sem registro, sai sem ela.
  let folha: Awaited<ReturnType<typeof dadosFolhaDoDocumento>> = null
  if (ctx.incluirAtualizacao) {
    if (!fmtAceitaCapa) aviso = [aviso, 'A folha de atualização só se aplica ao PDF; este formato saiu sem ela.'].filter(Boolean).join(' ')
    else if (!baixavel) aviso = [aviso, 'A folha de atualização só se aplica a documentos PDF/DOCX.'].filter(Boolean).join(' ')
    else {
      folha = await dadosFolhaDoDocumento(ctx.svc, ctx.tenantId, d.id, d.titulo, { soVisivelAluno: false })
      if (!folha) aviso = [aviso, 'Sem atualização publicada neste documento; saiu sem a folha de atualização.'].filter(Boolean).join(' ')
    }
  }
  const comAtz = !!folha

  // ORIGINAL sem capa → bytes do storage (qualquer tipo)
  if (fmt === 'original' && !comCapa && !comAtz) {
    const u = await urlOrig(); if (!u) return { ok: false, erro: 'Não foi possível gerar o link do arquivo no storage.' }
    const b = await buscar(u, MAX_DOC_BYTES, 60000)
    return b ? { ok: true, bytes: b, ext: extDoOriginal(d, arquivoKey), aviso } : { ok: false, erro: 'Falha ao ler o arquivo no storage (ausente ou maior que 120 MB).' }
  }

  // Conversões ODT/RTF/TXT (só DOCX, via OnlyOffice)
  if (fmt === 'odt' || fmt === 'rtf' || fmt === 'txt') {
    if (tipo !== 'docx') return { ok: false, erro: `Formato ${fmt.toUpperCase()} só existe para documentos .docx (este é ${tipo}).` }
    try {
      const src = await urlFonteOnlyOffice(arquivoKey, 1800)
      const key = `dl_${ver.id}_${String(ver.hash_arquivo || '').slice(0, 8)}_${fmt}`
      const out = await converterDocx(src, key, 'docx', EXT_CONVERSAO[fmt])
      return out ? { ok: true, bytes: new Uint8Array(out), ext: EXT_CONVERSAO[fmt], aviso } : { ok: false, erro: 'O OnlyOffice não converteu o documento (serviço indisponível ou arquivo inválido).' }
    } catch { return { ok: false, erro: 'O OnlyOffice não está acessível para converter.' } }
  }

  // PDF (do original PDF, do cache conteudo-pdfs ou convertido) — com ou sem capa
  if (!baixavel) return { ok: false, erro: `Documento do tipo "${tipo}" não tem versão em PDF.` }
  let base: Uint8Array | null = null
  if (tipo === 'pdf') { const u = await urlOrig(); base = u ? await buscar(u, MAX_DOC_BYTES, 60000) : null }
  else {
    const u = await gerarPdfDocumento(ctx.tenantId, d.id, undefined, ctx.versaoIdFixa ?? undefined).catch(() => null)
    base = u ? await buscar(u, MAX_DOC_BYTES, 60000) : null
    if (!base) return { ok: false, erro: 'Não foi possível converter para PDF (OnlyOffice indisponível ou conversão falhou).' }
  }
  if (!base) return { ok: false, erro: 'Falha ao ler o arquivo no storage.' }
  if (!comCapa && !comAtz) return { ok: true, bytes: base, ext: 'pdf', aviso }

  const dec = decidirDownload(tipo as 'pdf' | 'docx', comCapa ? capaUrl : null, paginaInicial)
  try {
    let capa: Awaited<ReturnType<typeof carregarCapa>> = null
    let avisoCapa: string | undefined
    if (comCapa) {
      let p = ctx.capaCache.get(capaUrl as string)
      if (!p) { p = carregarCapa(capaUrl as string, ctx.origem); ctx.capaCache.set(capaUrl as string, p) }
      capa = await p
      if (!capa) avisoCapa = 'A capa não pôde ser carregada; o PDF saiu SEM capa.'
    }
    if (!capa && !comAtz) return { ok: true, bytes: base, ext: 'pdf', aviso: avisoCapa ?? aviso }
    const pdf = await montarPdfComCapa(base, capa, {
      descartarAntes: capa ? dec.descartarAntes : 0, titulo: d.titulo,
      folha: folha ? (w, h) => montarFolhaAtualizacaoPdf(folha as NonNullable<typeof folha>, [w, h]) : undefined,
    })
    const avisoOrig = fmt === 'original' && tipo === 'docx' ? 'Original .docx com capa/folha de atualização: saiu em PDF (não é aplicável ao .docx).' : undefined
    return { ok: true, bytes: pdf, ext: 'pdf', aviso: [avisoCapa, avisoOrig, aviso].filter(Boolean).join(' ') || undefined }
  } catch { return { ok: true, bytes: base, ext: 'pdf', aviso: 'Falha ao montar a capa/folha de atualização; o PDF saiu SEM elas.' } }
}

/** Gera + valida (não-vazio e assinatura): arquivo truncado/HTML de erro/0 bytes vira FALHA relatada, nunca um item corrompido no ZIP. */
async function gerarArquivo(ctx: Ctx, d: DocRow, fmt: FormatoDownload): Promise<Gerado> {
  const g = await gerarArquivoBruto(ctx, d, fmt)
  if (!g.ok) return g
  const motivo = validarBytesArquivo(g.bytes, g.ext)
  return motivo ? { ok: false, erro: motivo } : g
}

export async function prepararDownloadAdmin(svc: SupabaseClient, tenantId: string, origem: string, p: PedidoDownload): Promise<ResultadoDownload> {
  if (p.documentoIds.length + p.pastaIds.length === 0) return { ok: false, status: 400, erro: 'Nada selecionado.' }
  if (p.documentoIds.length + p.pastaIds.length > DL_MAX_IDS) return { ok: false, status: 400, erro: `Selecione no máximo ${DL_MAX_IDS} itens por vez.` }
  const r = await resolverDocs(svc, tenantId, p)
  const { docs } = r
  if (docs.length === 0) return { ok: false, status: 404, erro: 'Nenhum documento encontrado na seleção.' }
  if (docs.length > DL_MAX_DOCS) return { ok: false, status: 413, erro: `A seleção tem ${docs.length} documentos (máximo ${DL_MAX_DOCS} por download). Baixe por pasta ou divida a seleção.` }
  if (docs.length * p.formatos.length > DL_MAX_DOCS * 2) return { ok: false, status: 413, erro: 'Muitos arquivos (documentos × formatos). Reduza os formatos ou divida a seleção.' }

  // versões (1 consulta por chunk de 80)
  const versoes = new Map<string, VerRow>()
  if (p.versaoId && docs.length === 1) {
    const { data } = await svc.from(VERS).select('id, documento_id, arquivo_key, hash_arquivo').eq('tenant_id', tenantId).eq('documento_id', docs[0].id).eq('id', p.versaoId).maybeSingle()
    if (data) versoes.set(docs[0].id, data as VerRow)
  }
  const idsVer = docs.filter((d) => d.versao_atual_id && !versoes.has(d.id)).map((d) => d.versao_atual_id as string)
  if (idsVer.length) {
    const rows = await fetchAllByIn<any>(idsVer, (c) => svc.from(VERS).select('id, documento_id, arquivo_key, hash_arquivo').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }))
    for (const v of rows ?? []) if (!versoes.has(v.documento_id)) versoes.set(v.documento_id, v as VerRow)
  }
  for (const d of docs) { // sem versão atual: a mais nova
    if (versoes.has(d.id)) continue
    const { data } = await svc.from(VERS).select('id, documento_id, arquivo_key, hash_arquivo').eq('tenant_id', tenantId).eq('documento_id', d.id).order('numero', { ascending: false }).limit(1).maybeSingle()
    if (data) versoes.set(d.id, data as VerRow)
  }

  const ctx: Ctx = { svc, tenantId, origem, incluirCapa: p.incluirCapa, incluirAtualizacao: !!p.incluirAtualizacao, versoes, pastasCP: mapaPastas(r.pastas), capaCache: new Map(), versaoIdFixa: p.versaoId ?? null }
  const unico = docs.length === 1 && p.formatos.length === 1
  const falhas: LinhaRelatorio[] = [], avisos: LinhaRelatorio[] = []
  const tarefas = docs.flatMap((d) => p.formatos.map((f) => ({ d, f })))
  const saidas: { d: DocRow; f: FormatoDownload; g: Gerado & { ok: true } }[] = []
  let bytesTotal = 0, i = 0
  const inicio = Date.now()
  const worker = async () => {
    while (i < tarefas.length) {
      const { d, f } = tarefas[i++]
      if (Date.now() - inicio > DL_ORCAMENTO_MS) { falhas.push({ titulo: d.titulo, formato: f, mensagem: 'Não processado: tempo máximo do download esgotado. Baixe este item em outro lote (menos documentos).' }); continue }
      if (bytesTotal > DL_MAX_BYTES_TOTAL) { falhas.push({ titulo: d.titulo, formato: f, mensagem: 'Não incluído: o ZIP atingiu o tamanho máximo. Baixe este item em outro lote.' }); continue }
      let g: Gerado
      try { g = await gerarArquivo(ctx, d, f) } catch (e) { g = { ok: false, erro: `Erro inesperado: ${(e as Error)?.message?.slice(0, 120) ?? 'desconhecido'}` } }
      if (!g.ok) { falhas.push({ titulo: d.titulo, formato: f, mensagem: g.erro }); continue }
      bytesTotal += g.bytes.byteLength
      if (g.aviso) avisos.push({ titulo: d.titulo, formato: f, mensagem: g.aviso })
      saidas.push({ d, f, g })
    }
  }
  await Promise.all(Array.from({ length: Math.min(DL_CONCORRENCIA, tarefas.length) }, worker))
  const docIds = docs.map((d) => d.id)

  if (unico) {
    const s = saidas[0]
    if (!s) return { ok: false, status: 422, erro: falhas[0]?.mensagem ?? 'Não foi possível gerar o arquivo.' }
    return {
      ok: true, bytes: s.g.bytes, nome: sanitizarNomeArquivo(s.d.titulo, s.g.ext), mime: MIME_POR_EXT[s.g.ext] ?? 'application/octet-stream', docIds,
      resumo: { total: 1, geradas: 1, falhas: 0, avisos: avisos.length, zip: false, aviso: avisos[0]?.mensagem },
    }
  }
  if (saidas.length === 0) {
    return { ok: false, status: 422, erro: `Nenhum arquivo pôde ser gerado. Ex.: ${falhas[0]?.titulo ?? ''} — ${falhas[0]?.mensagem ?? 'erro desconhecido'}` }
  }

  // ZIP determinístico: ordem por título/formato; nomes únicos
  saidas.sort((a, b) => a.d.titulo.localeCompare(b.d.titulo, 'pt-BR') || a.f.localeCompare(b.f))
  const rel = montarRelatorio({ geradoEm: new Date(), total: tarefas.length, ok: saidas.length, falhas, avisos, incluirCapa: p.incluirCapa, incluirAtualizacao: !!p.incluirAtualizacao, formatos: p.formatos.map((f) => FORMATOS_DOWNLOAD.find((x) => x.id === f)?.rotulo ?? f) })
  const { bytes: out } = montarZip(saidas.map((s) => ({ dir: r.caminho(s.d), titulo: s.d.titulo, ext: s.g.ext, bytes: s.g.bytes })), rel)
  return {
    ok: true, bytes: out, nome: nomeDoZip(r.pastaUnica), mime: MIME_POR_EXT.zip, docIds,
    resumo: { total: tarefas.length, geradas: saidas.length, falhas: falhas.length, avisos: avisos.length, zip: true },
  }
}

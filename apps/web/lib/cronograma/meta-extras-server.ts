import 'server-only'

/**
 * Extras do cronograma Revisão no iframe (servidor): CONTEÚDO da Biblioteca por meta e PROGRESSO parcial/não realizada.
 * Tudo tolerante às migrations 20261114030000 (tabelas ausentes => degrada sem quebrar o plano).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { chaveRelatorio, esquecerPrefixo, remember } from '@/lib/cache/relatorio-cache'
import { paginasEfetivasDocs, type DocParaPaginas, type PaginasDoc } from '@/lib/conteudo/paginas-efetivas'
import { tipoBaixavel } from '@/lib/conteudo/baixar-pura'
import { lerPoliticaDownload } from '@/lib/conteudo/politica-download'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { coalescer, lerProgressoReencaixado } from './progresso-emissao'
import {
  indexarBiblioteca, resolverDocumentoMeta, vinculosPorMeta,
  type ConteudoResolvido, type DocBiblioteca, type MetaParaConteudo, type TipoMaterial, type VinculoExplicito,
} from './conteudo-meta'

const TIPOS_MATERIAL = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])
const T_VINC = 'simulado_cronograma_meta_conteudo'
const T_PROG = 'simulado_cronograma_meta_progresso'

/** Tabela/coluna ausente (migration pendente): 42P01 / PGRST205 / 42703 / PGRST204. */
export function tabelaAusente(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false
  return ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(String(e.code)) || /does not exist|could not find the (table|'.*' column)/i.test(e.message ?? '')
}

// ── Biblioteca: documentos publicados das pastas de DISCIPLINA, com o tipo de material herdado (pai_id) ──
// Mesmo critério do adaptativo (conteudo-banco.ts › montarConteudo): subpasta tipada mais próxima subindo a árvore.
async function carregarDocsBiblioteca(svc: SupabaseClient, tenantId: string): Promise<DocBiblioteca[]> {
  const [{ data: discRows }, pastas] = await Promise.all([
    svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId),
    fetchAll<{ id: string; pai_id: string | null; disciplina_id: string | null; cronograma_tipo_material: string | null }>(() =>
      svc.from('simulado_pastas').select('id, pai_id, disciplina_id, cronograma_tipo_material')
        .eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id') as never),
  ])
  const discNome = new Map(((discRows ?? []) as { id: string; nome: string }[]).map((d) => [d.id, d.nome]))
  const filhos = new Map<string, string[]>()
  const pai = new Map<string, string | null>()
  const tipo = new Map<string, string | null>()
  for (const p of pastas) {
    pai.set(p.id, p.pai_id)
    tipo.set(p.id, p.cronograma_tipo_material)
    if (p.pai_id) filhos.set(p.pai_id, [...(filhos.get(p.pai_id) ?? []), p.id])
  }
  const discDaPasta = new Map<string, string>()
  for (const p of pastas) if (p.disciplina_id) {
    const pilha = [p.id]
    while (pilha.length) { const c = pilha.pop()!; if (!discDaPasta.has(c)) { discDaPasta.set(c, p.disciplina_id); (filhos.get(c) ?? []).forEach((f) => pilha.push(f)) } }
  }
  if (!discDaPasta.size) return []
  const cache = new Map<string, string | null>()
  const tipoHerdado = (id: string): TipoMaterial | null => {
    const caminho: string[] = []
    let cur: string | null = id, achado: string | null = null
    const visto = new Set<string>()
    while (cur && !visto.has(cur)) {
      visto.add(cur)
      if (cache.has(cur)) { achado = cache.get(cur)!; break }
      caminho.push(cur)
      const t = tipo.get(cur)
      if (t && TIPOS_MATERIAL.has(t)) { achado = t; break }
      cur = pai.get(cur) ?? null
    }
    for (const c of caminho) cache.set(c, achado)
    return achado as TipoMaterial | null
  }
  const docs = await fetchAllByIn<{ id: string; titulo: string; pasta_id: string }>([...discDaPasta.keys()], (chunk) =>
    svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id')
      .eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).in('pasta_id', chunk).order('id') as never,
  { concorrencia: 4 })
  const out: DocBiblioteca[] = []
  for (const d of docs) {
    const nome = discNome.get(discDaPasta.get(d.pasta_id) ?? '')
    if (nome) out.push({ id: d.id, titulo: d.titulo, disc: nome, tipo: tipoHerdado(d.pasta_id) })
  }
  return out
}

/** Índice da Biblioteca por tenant (cache 5 min — a Biblioteca muda pouco; o leitor revalida o acesso a cada abertura). */
export async function docsBibliotecaCache(svc: SupabaseClient, tenantId: string): Promise<DocBiblioteca[]> {
  return remember<DocBiblioteca[]>(`crono-rev:bib:${tenantId}`, 300, () => carregarDocsBiblioteca(svc, tenantId))
}

export type VinculoLinha = VinculoExplicito & { id?: string }

/** Vínculos explícitos do cronograma (lista vazia sem a migration). */
export async function lerVinculos(svc: SupabaseClient, tenantId: string, cronogramaId: string): Promise<VinculoLinha[]> {
  try {
    return await fetchAll<VinculoLinha>(() =>
      svc.from(T_VINC).select('id, meta_id, chave_meta, documento_id, pagina_ini').eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never)
  } catch { return [] }
}

export type MetaCatalogo = { id: string; chave: string | null }
export async function metasAtuais(svc: SupabaseClient, tenantId: string, cronogramaId: string): Promise<MetaCatalogo[]> {
  try {
    return await coalescer(`metas-atuais:${tenantId}:${cronogramaId}`, 3000, () =>
      fetchAll<MetaCatalogo>(() => svc.from('simulado_cronograma_metas').select('id, chave').eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never))
  } catch {
    // coluna `chave` ausente (migration 20261114020000 pendente): só ids
    const r = await fetchAll<{ id: string }>(() => svc.from('simulado_cronograma_metas').select('id').eq('tenant_id', tenantId).eq('cronograma_id', cronogramaId).order('id') as never)
    return r.map((m) => ({ id: m.id, chave: null }))
  }
}

/** `baixavel`: o tipo do documento permite o botão "Baixar" (PDF/DOCX — ver lib/conteudo/baixar-pura). */
export type DocDaMeta = ConteudoResolvido & { titulo: string; paginas: number | null; baixavel: boolean }

/**
 * Resolve meta -> documento (explícito > automático) para as metas da grade e devolve título/páginas do doc.
 * Só devolve docs que EXISTEM publicados no tenant (vínculo explícito para doc apagado é ignorado).
 * O ACESSO do aluno (pasta + doc, herança pai_id) é decidido pelo leitor na abertura (e por /meta-conteudo antes).
 */
export async function resolverConteudoDasMetas(
  svc: SupabaseClient, tenantId: string, cronogramaId: string, metas: MetaParaConteudo[], versaoGrade?: number | null,
): Promise<Map<string, DocDaMeta>> {
  if (!metas.length) return new Map()
  // CACHE do resultado (743 metas -> documento): chave = tenant + cronograma + versao_grade + impressão digital dos ids/textos
  // das metas da grade. TTL curto (2 min) cobre edição de vínculos/Biblioteca; o admin invalida ao salvar vínculos
  // (invalidarConteudoCronograma). Antes isto era recomputado (índice da Biblioteca + vínculos + metas + docs + versões) a cada abertura.
  const h = createHash('md5')
  for (const m of metas) h.update(`${m.id}|${m.tipo}|${m.aula ?? ''}|${m.disciplinas.join('/')}|${m.conteudo ?? ''};`)
  const chave = chaveRelatorio(tenantId, 'crono-rev', 'conteudo', cronogramaId, versaoGrade ?? 0, h.digest('hex'))
  const entradas = await remember<[string, DocDaMeta][]>(chave, 120, async () => [...(await resolverConteudoDasMetasBruto(svc, tenantId, cronogramaId, metas)).entries()])
  return new Map(entradas)
}

/** Invalida o cache de conteúdo por meta do cronograma (chamar ao salvar/remover vínculos explícitos). Best-effort. */
export async function invalidarConteudoCronograma(tenantId: string, cronogramaId: string): Promise<void> {
  await esquecerPrefixo(tenantId, `crono-rev:conteudo:${cronogramaId}:`)
}

async function resolverConteudoDasMetasBruto(
  svc: SupabaseClient, tenantId: string, cronogramaId: string, metas: MetaParaConteudo[],
): Promise<Map<string, DocDaMeta>> {
  const out = new Map<string, DocDaMeta>()
  if (!metas.length) return out
  const [docs, vinculos, atuais] = await Promise.all([
    docsBibliotecaCache(svc, tenantId).catch(() => [] as DocBiblioteca[]),
    lerVinculos(svc, tenantId, cronogramaId),
    metasAtuais(svc, tenantId, cronogramaId).catch(() => [] as MetaCatalogo[]),
  ])
  const indice = indexarBiblioteca(docs)
  const porMeta = vinculos.length ? vinculosPorMeta(vinculos, atuais) : new Map<string, VinculoLinha>()
  const resolvidos = new Map<string, ConteudoResolvido>()
  for (const m of metas) {
    const r = resolverDocumentoMeta(m, indice, porMeta.get(m.id))
    if (r) resolvidos.set(m.id, r)
  }
  if (!resolvidos.size) return out

  // Metadados dos docs usados (título, versão atual -> páginas), em lotes de 80.
  const ids = [...new Set([...resolvidos.values()].map((r) => r.docId))]
  const info = new Map<string, { titulo: string; versao: string | null; baixavel: boolean }>()
  const docsPag: DocParaPaginas[] = []
  const polDl = await lerPoliticaDownload(svc, tenantId) // chave da PLATAFORMA: desligada → nenhum botão "Baixar" (o servidor também barra)
  try {
    const rows = await fetchAllByIn<{ id: string; titulo: string; pasta_id: string | null; versao_atual_id: string | null; tipo_origem: string | null; pode_baixar: boolean | null }>(ids, (chunk) =>
      svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id, tipo_origem, pode_baixar')
        .eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).in('id', chunk).order('id') as never,
    { concorrencia: 4 })
    for (const r of rows) { docsPag.push({ id: r.id, pasta_id: r.pasta_id ?? null, versao_atual_id: r.versao_atual_id ?? null }); info.set(r.id, { titulo: r.titulo, versao: r.versao_atual_id, baixavel: polDl.alunoPodeBaixar && r.pode_baixar !== false && tipoBaixavel(r.tipo_origem) }) }
  } catch (e) { throw e } // não devolver vazio: o chamador degrada SEM gravar vazio no cache
  // páginas EFETIVAS (versão atual − página inicial) pela função única compartilhada; sem contagem → null (o aluno informa o total no Parcial)
  const pagsDoc = await paginasEfetivasDocs(svc, tenantId, docsPag).catch(() => new Map<string, PaginasDoc>())

  for (const [metaId, r] of resolvidos) {
    const d = info.get(r.docId)
    if (!d) continue
    out.set(metaId, { ...r, titulo: d.titulo, paginas: pagsDoc.get(r.docId)?.efetivas ?? null, baixavel: d.baixavel })
  }
  return out
}

// ── Progresso parcial / não realizada ──
export type ProgressoMetaLinha = {
  meta_id: string
  status: 'parcial' | 'nao_realizada'
  pagina_ate: number | null
  total_paginas: number | null
  artigo: string | null
  ponto: string | null
  minutos_restantes: number | null
  atualizado_em: string
}

/** Linhas da emissão (reencaixadas por chave). Sem a tabela: []. */
export async function lerProgressoMetas(svc: SupabaseClient, tenantId: string, cronogramaId: string, emissaoId: string): Promise<ProgressoMetaLinha[]> {
  try {
    return (await lerProgressoReencaixado<ProgressoMetaLinha>(svc, tenantId, cronogramaId, emissaoId, 'simulado_cronograma_meta_progresso',
      'status, pagina_ate, total_paginas, artigo, ponto, minutos_restantes, atualizado_em')) as ProgressoMetaLinha[]
  } catch (e) {
    if (tabelaAusente(e as { message?: string; code?: string })) return []
    return []
  }
}

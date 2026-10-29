import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AS, WLP } from './engine'
import type { Conteudo } from './conteudo'
import { conteudoSeed } from './conteudo'

// Loader de CONTEÚDO REAL do Cronograma Adaptativo (substitui o seed):
//  · disciplinas  → simulado_disciplinas (nome, classificacao, cor, ordem)
//  · aulas (AS)   → documentos publicados da Biblioteca nas SUBpastas da disciplina marcadas como
//                   PDFull/PDFight (ou docs soltos na pasta-disciplina, sem subpasta-tipada)
//  · lei seca(WLP)→ SUBpastas marcadas como LegProc (1 doc → 1 semana, ordem natural do título);
//                   se não houver, cai no fallback da tabela simulado_cronograma_adaptativo_legproc
//  · questões     → SUBpastas marcadas como "questoes" ficam RESERVADAS (não viram aula; sem meta nova)
//
// TIPO DE MATERIAL por SUBpasta: simulado_pastas.cronograma_tipo_material
//   ('pdfull' | 'pdfight' | 'legproc' | 'questoes' | null).
// HERANÇA: um documento herda o tipo da subpasta-tipada mais próxima subindo a árvore (pai_id);
//          se nenhuma subpasta no caminho tem tipo, o doc é tratado como 'pdfull' (compatibilidade).
// Enquanto o admin não vincular pastas/cadastrar lei seca, cai no SEED (não quebra).

export interface DisciplinaInfo { nome: string; classificacao: string | null; cor: string | null }
export interface ConteudoBanco extends Conteudo { disciplinas: DisciplinaInfo[]; vazio: boolean }

const PAG_PADRAO = 40 // páginas assumidas quando o PDF ainda não foi medido
const TIPOS_MATERIAL = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'questoes'])

/** `.in()` em lotes (evita hang do proxy com listas grandes); projeção já vem do build. */
async function selectInChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunk = 150,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunk) {
    const { data } = await run(ids.slice(i, i + chunk))
    if (data) out.push(...data)
  }
  return out
}

export async function carregarConteudoBanco(svc: SupabaseClient, tenantId: string): Promise<ConteudoBanco> {
  // 1) disciplinas
  const { data: discRows } = await svc.from('simulado_disciplinas')
    .select('id, nome, classificacao, cor, ordem').eq('tenant_id', tenantId)
    .order('ordem', { ascending: true }).order('nome', { ascending: true })
  const disciplinas: DisciplinaInfo[] = (discRows || []).map((d: Record<string, unknown>) => ({ nome: String(d.nome), classificacao: (d.classificacao as string) ?? null, cor: (d.cor as string) ?? null }))
  const discById = new Map<string, { nome: string }>((discRows || []).map((d: Record<string, unknown>) => [String(d.id), { nome: String(d.nome) }]))

  // 2) pastas de conteúdo (p/ montar subárvore por disciplina + tipo de material por subpasta)
  const { data: pastaRows } = await svc.from('simulado_pastas')
    .select('id, pai_id, disciplina_id, ordem, cronograma_tipo_material').eq('tenant_id', tenantId).eq('folder_area', 'conteudo')
  const pastas = (pastaRows || []) as Array<{ id: string; pai_id: string | null; disciplina_id: string | null; ordem: number | null; cronograma_tipo_material: string | null }>
  const filhos = new Map<string, string[]>()
  const paiPorPasta = new Map<string, string | null>()
  const tipoPorPasta = new Map<string, string | null>()
  for (const p of pastas) {
    paiPorPasta.set(p.id, p.pai_id)
    tipoPorPasta.set(p.id, p.cronograma_tipo_material)
    if (p.pai_id) { const arr = filhos.get(p.pai_id) || []; arr.push(p.id); filhos.set(p.pai_id, arr) }
  }
  // pasta_id -> disciplina_id (herdado da pasta-raiz marcada com disciplina_id)
  const discDaPasta = new Map<string, string>()
  for (const p of pastas) if (p.disciplina_id) {
    const pilha = [p.id]
    while (pilha.length) { const cur = pilha.pop()!; if (!discDaPasta.has(cur)) { discDaPasta.set(cur, p.disciplina_id); (filhos.get(cur) || []).forEach((f) => pilha.push(f)) } }
  }
  if (discDaPasta.size === 0) return { ...fallbackConteudo(), disciplinas, vazio: true }

  // tipo de material herdado: subpasta-tipada mais próxima subindo a árvore (com memoização + anti-ciclo)
  const tipoCache = new Map<string, string | null>()
  const tipoHerdado = (pastaId: string): string | null => {
    const caminho: string[] = []
    let cur: string | null = pastaId
    let achado: string | null = null
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      if (tipoCache.has(cur)) { achado = tipoCache.get(cur)!; break }
      caminho.push(cur)
      const t = tipoPorPasta.get(cur)
      if (t && TIPOS_MATERIAL.has(t)) { achado = t; break }
      cur = paiPorPasta.get(cur) ?? null
    }
    for (const c of caminho) tipoCache.set(c, achado)
    return achado
  }

  // 3) documentos publicados dessas pastas (projeção mínima; .in() em lotes)
  const pastaIds = [...discDaPasta.keys()]
  const docs = await selectInChunks<{ id: string; titulo: string; pasta_id: string; versao_atual_id: string | null }>(
    pastaIds,
    (chunk) => svc.from('simulado_conteudo_documentos')
      .select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', tenantId)
      .eq('status', 'publicado').eq('deletado', false).in('pasta_id', chunk),
  )

  // 4) classifica cada doc pelo tipo herdado da sua subpasta
  //    pdfull | pdfight | null -> aula (PDFull) · legproc -> lei seca · questoes -> reservado (ignora)
  const aulaDocs: Array<{ titulo: string; versaoId: string | null; discNome: string }> = []
  const legprocDocs: Array<{ titulo: string }> = []
  for (const d of docs) {
    const discId = discDaPasta.get(d.pasta_id); if (!discId) continue
    const disc = discById.get(discId); if (!disc) continue
    const tipo = tipoHerdado(d.pasta_id)
    if (tipo === 'legproc') { legprocDocs.push({ titulo: d.titulo }); continue } // lei seca → WLP
    // AULAS = só PDFull (ou docs sem subpasta tipada, p/ compat). PDFight (questões), PDFlash (revisão)
    // e Questões são MATERIAIS ligados às metas que o engine JÁ gera (qu/fl) — não contam como aula nova.
    if (tipo === 'pdfight' || tipo === 'pdflash' || tipo === 'questoes') continue
    aulaDocs.push({ titulo: d.titulo, versaoId: d.versao_atual_id, discNome: disc.nome }) // pdfull | null
  }

  // páginas da versão atual — só das aulas (legproc/questões não precisam de páginas)
  const verIds = aulaDocs.map((d) => d.versaoId).filter(Boolean) as string[]
  const pagPorVersao = new Map<string, number>()
  if (verIds.length) {
    const verRows = await selectInChunks<{ id: string; paginas: number | null }>(
      verIds,
      (chunk) => svc.from('simulado_conteudo_versoes').select('id, paginas').in('id', chunk),
    )
    for (const v of verRows) if (v.paginas) pagPorVersao.set(v.id, v.paginas)
  }

  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

  // 5) monta AS agrupado por disciplina (ordem alfabética-natural do título)
  const porDisc = new Map<string, Array<{ titulo: string; pags: number }>>()
  for (const d of aulaDocs) {
    const pags = (d.versaoId && pagPorVersao.get(d.versaoId)) || PAG_PADRAO
    const arr = porDisc.get(d.discNome) || []; arr.push({ titulo: d.titulo, pags }); porDisc.set(d.discNome, arr)
  }
  const ASout: AS = []
  for (const di of disciplinas) { // segue a ordem das disciplinas (ordem/nome)
    const aulas = porDisc.get(di.nome); if (!aulas || !aulas.length) continue
    aulas.sort((a, b) => col.compare(a.titulo, b.titulo))
    aulas.forEach((a, i) => ASout.push([di.nome, String(i + 1), a.titulo, a.pags, '', '']))
  }
  if (!ASout.length) return { ...fallbackConteudo(), disciplinas, vazio: true }

  // 6) WLP (lei seca por semana)
  //    Heurística doc→semana: todos os docs das subpastas LegProc (de qualquer disciplina) são
  //    achatados numa lista única, ordenados por título (natural) e mapeados em sequência →
  //    doc nº k (1-based) = semana k, 1 bloco por semana (texto = título do documento).
  //    Sem subpastas LegProc com docs → fallback da tabela (comportamento anterior preservado).
  let WLPout: WLP
  if (legprocDocs.length) {
    legprocDocs.sort((a, b) => col.compare(a.titulo, b.titulo))
    WLPout = Array.from({ length: legprocDocs.length + 1 }, () => [] as string[])
    legprocDocs.forEach((ld, i) => { WLPout[i + 1] = [ld.titulo] })
  } else {
    const { data: lpRows } = await svc.from('simulado_cronograma_adaptativo_legproc')
      .select('semana, ordem, texto').eq('tenant_id', tenantId).order('semana').order('ordem')
    const lp = (lpRows || []) as Array<{ semana: number; ordem: number; texto: string }>
    const maxSem = lp.reduce((m, r) => Math.max(m, r.semana), 0)
    WLPout = Array.from({ length: maxSem + 1 }, () => [] as string[])
    for (const r of lp) (WLPout[r.semana] ||= []).push(r.texto)
  }

  return { AS: ASout, WLP: WLPout, disciplinas, vazio: false }
}

function fallbackConteudo(): Conteudo { return conteudoSeed() }

/** {AS, WLP} prontos p/ o motor — banco quando houver, senão seed. */
export async function carregarConteudo(svc: SupabaseClient, tenantId: string): Promise<Conteudo> {
  const b = await carregarConteudoBanco(svc, tenantId)
  return b.vazio ? conteudoSeed() : { AS: b.AS, WLP: b.WLP }
}

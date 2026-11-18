/**
 * RELINK SEGURO DE DOCUMENTO por NOME (módulo PURO — sem server-only; testado em __tests__/relink-documento.test.ts).
 *
 * CONTEXTO: a ligação meta→documento é por ID (chave `d:<uuid>` da assinatura do plano). Se o admin APAGA um documento e o RECRIA
 * (mesmo título/pasta, id novo — caso de 11/11), a chave antiga some e o remap (remap-as.ts) deixa o progresso ÓRFÃO. Aqui se
 * reencontra o substituto com SEGURANÇA e o remap trata os dois como a MESMA aula.
 *
 * REGRA DE OURO — só relinka quando TUDO é verdade (senão NÃO relinka e a meta fica 'material indisponível'):
 *   1. o documento antigo está DELETADO (soft-delete/purgado) — despublicado/movido NÃO é relinkado (pode voltar);
 *   2. há UM ÚNICO candidato publicado com o mesmo título normalizado (e nenhum outro documento antigo disputa esse candidato);
 *   3. mesma disciplina e mesma pasta (ou pasta irmã: mesmo pai);
 *   4. o candidato foi criado DEPOIS do deletado_em do antigo (quando a data é conhecida);
 *   5. nunca TESTE/Cópia → aula real (candidato com 'teste'/'cópia' só é aceito se o antigo também tinha).
 */
import { docIdDaChave, idOrfao, lerOrfao, remapearEstado, type AssinaturaAS, type EntradaRemap, type SaidaRemap } from './remap-as'

/** Normaliza o título p/ comparação: sem acentos/caixa/espaços extras, traços unificados, zeros à esquerda dos números e sufixos '(2)' / 'Cópia'. */
export function normalizarTituloDoc(t: string | null | undefined): string {
  let s = String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  s = s.replace(/\.(pdf|docx?|html?)\s*$/i, '')
  s = s.replace(/[‐-―−]/g, '-') // ‐ ‑ ‒ – — ― −
  // sufixos de duplicata: "(2)", "- copia", "copia de ", "(copia)"
  s = s.replace(/\s*\(\s*(?:copia|copy)(?:\s*\d+)?\s*\)\s*$/g, '').replace(/\s*[-–]?\s*(?:copia|copy)(?:\s*\d+)?\s*$/g, '').replace(/^\s*(?:copia|copy)\s+de\s+/g, '')
  s = s.replace(/\s*\(\s*\d{1,2}\s*\)\s*$/g, '')
  s = s.replace(/\b0+(\d)/g, '$1') // "01" → "1"
  s = s.replace(/\s*-\s*/g, ' - ').replace(/[^\p{L}\p{N}\- ]+/gu, ' ').replace(/\s+/g, ' ').trim()
  return s
}

/** Título de teste/cópia (não pode substituir aula real). */
export const ehTesteOuCopia = (t: string | null | undefined): boolean => /(^|[^a-z])(teste|testes|copia|copy)([^a-z]|$)/i.test(String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''))

export interface DocAntigo {
  id: string
  titulo?: string | null
  titulo_norm?: string | null
  pasta_id?: string | null
  pasta_pai_id?: string | null
  disciplina?: string | null
  /** documento deletado (soft-delete ou já purgado) */
  deletado: boolean
  deletado_em?: string | null
}
export interface DocCandidato {
  id: string
  titulo: string
  titulo_norm?: string | null
  pasta_id?: string | null
  pasta_pai_id?: string | null
  disciplina?: string | null
  publicado: boolean
  criado_em?: string | null
}

export type ResultadoSubstituto =
  | { tipo: 'unico'; candidato: DocCandidato }
  | { tipo: 'ambiguo'; candidatos: DocCandidato[] }
  | { tipo: 'nenhum'; motivo: string }

const nz = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase()

/** Escolhe o substituto de um documento apagado. Ambíguo/zero → NÃO relinka. */
export function encontrarSubstituto(antigo: DocAntigo, candidatos: DocCandidato[]): ResultadoSubstituto {
  if (!antigo.deletado) return { tipo: 'nenhum', motivo: 'antigo_nao_deletado' }
  const alvo = antigo.titulo_norm || normalizarTituloDoc(antigo.titulo)
  if (!alvo) return { tipo: 'nenhum', motivo: 'sem_titulo' }
  const antigoTeste = ehTesteOuCopia(antigo.titulo)
  const ok = candidatos.filter((c) => {
    if (!c.publicado || c.id === antigo.id) return false
    if ((c.titulo_norm || normalizarTituloDoc(c.titulo)) !== alvo) return false
    if (ehTesteOuCopia(c.titulo) && !antigoTeste) return false
    if (nz(c.disciplina) !== nz(antigo.disciplina)) return false
    const mesmaPasta = !!c.pasta_id && c.pasta_id === antigo.pasta_id
    const irma = !!c.pasta_pai_id && c.pasta_pai_id === antigo.pasta_pai_id
    if (!mesmaPasta && !irma) return false
    if (antigo.deletado_em && c.criado_em) { const a = Date.parse(antigo.deletado_em), b = Date.parse(c.criado_em); if (Number.isFinite(a) && Number.isFinite(b) && b < a) return false }
    return true
  })
  if (ok.length === 1) return { tipo: 'unico', candidato: ok[0] }
  if (ok.length > 1) return { tipo: 'ambiguo', candidatos: ok }
  return { tipo: 'nenhum', motivo: 'sem_candidato' }
}

export interface RelinkItem { chaveAntiga: string; chaveNova: string; docAntigo: string; docNovo: string; titulo: string }
export interface ResultadoRelinks {
  relinks: RelinkItem[]
  ambiguos: Array<{ chaveAntiga: string; docAntigo: string; candidatos: string[] }>
  indisponiveis: Array<{ chaveAntiga: string; docAntigo: string; motivo: string }>
}

/**
 * Para cada chave `d:` da assinatura ANTIGA que não existe na NOVA, procura o substituto entre as chaves `d:` NOVAS que não
 * existiam na antiga. `docs` = informação por id de documento (antigos e novos). Um candidato disputado por 2+ antigos NÃO é relinkado.
 */
export function calcularRelinks(antiga: AssinaturaAS, nova: AssinaturaAS, docs: Map<string, DocAntigo & Partial<DocCandidato>>): ResultadoRelinks {
  const out: ResultadoRelinks = { relinks: [], ambiguos: [], indisponiveis: [] }
  const novasSet = new Set(nova.chaves), antigasSet = new Set(antiga.chaves)
  const candidatos: Array<DocCandidato & { chave: string }> = []
  nova.chaves.forEach((k, j) => {
    if (antigasSet.has(k)) return
    const id = docIdDaChave(k); const d = id ? docs.get(id) : null
    if (!id || !d) return
    candidatos.push({ id, chave: k, titulo: d.titulo ?? '', titulo_norm: d.titulo_norm, pasta_id: d.pasta_id, pasta_pai_id: d.pasta_pai_id, disciplina: nova.discs[j] ?? d.disciplina ?? null, publicado: d.publicado !== false, criado_em: d.criado_em })
  })
  const escolhas = new Map<string, { chaveAntiga: string; docAntigo: string; titulo: string }[]>() // chaveNova → antigos que a disputam
  antiga.chaves.forEach((k, i) => {
    if (novasSet.has(k)) return
    const id = docIdDaChave(k); if (!id) return
    const d = docs.get(id)
    if (!d) { out.indisponiveis.push({ chaveAntiga: k, docAntigo: id, motivo: 'documento_sem_dados' }); return }
    const r = encontrarSubstituto({ ...d, id, disciplina: antiga.discs[i] ?? d.disciplina ?? null }, candidatos)
    if (r.tipo === 'unico') {
      const c = candidatos.find((x) => x.id === r.candidato.id)!
      const l = escolhas.get(c.chave) ?? []; l.push({ chaveAntiga: k, docAntigo: id, titulo: d.titulo ?? '' }); escolhas.set(c.chave, l)
    } else if (r.tipo === 'ambiguo') out.ambiguos.push({ chaveAntiga: k, docAntigo: id, candidatos: r.candidatos.map((c) => c.id) })
    else out.indisponiveis.push({ chaveAntiga: k, docAntigo: id, motivo: r.motivo })
  })
  for (const [chaveNova, disputa] of escolhas) {
    const docNovo = docIdDaChave(chaveNova)!
    if (disputa.length > 1) { for (const x of disputa) out.ambiguos.push({ chaveAntiga: x.chaveAntiga, docAntigo: x.docAntigo, candidatos: [docNovo] }); continue }
    const x = disputa[0]
    out.relinks.push({ chaveAntiga: x.chaveAntiga, chaveNova, docAntigo: x.docAntigo, docNovo, titulo: x.titulo })
  }
  return out
}

/** Troca, na assinatura antiga, as chaves relinkadas pelas novas (o remap por chave passa a ver "a mesma aula"). */
export function aplicarRelinksNaAssinatura(antiga: AssinaturaAS, relinks: RelinkItem[]): AssinaturaAS {
  if (!relinks.length) return antiga
  const m = new Map(relinks.map((r) => [r.chaveAntiga, r.chaveNova]))
  return { chaves: antiga.chaves.map((k) => m.get(k) ?? k), discs: antiga.discs }
}

/**
 * remapearEstado COM relink: a entrada (cfg.orfas e linhas 'og:<chave antiga>:…' já órfãs) é traduzida p/ a chave nova e a
 * assinatura antiga também; as `mudancas` devolvidas apontam de volta aos ids ORIGINAIS das linhas do banco (p/ upsert/delete corretos).
 * Sem relinks é idêntico a remapearEstado.
 */
export function remapearEstadoComRelink<M extends { meta_id: string }>(
  ent: EntradaRemap<M>, antiga: AssinaturaAS, nova: AssinaturaAS, relinks: RelinkItem[],
): SaidaRemap<M> {
  if (!relinks.length) return remapearEstado(ent, antiga, nova)
  const mapa = new Map(relinks.map((r) => [r.chaveAntiga, r.chaveNova]))
  const original = new Map<string, string>() // id traduzido → id original (só p/ ids de órfãs renomeadas)
  const traduzId = (id: string): string => {
    const o = lerOrfao(id); if (!o) return id
    const n = mapa.get(o.chave); if (!n) return id
    const novoId = idOrfao(n, o.tpl); original.set(novoId, id); return novoId
  }
  const traduzKeys = (rec: Record<string, unknown> | undefined) => {
    if (!rec) return rec
    const r: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) { const o = lerOrfao(k); r[o && mapa.has(o.chave) ? idOrfao(mapa.get(o.chave)!, o.tpl) : k] = v }
    return r
  }
  const cfg = { ...ent.cfg } as Record<string, unknown>
  if (cfg.orfas && typeof cfg.orfas === 'object') {
    const orf: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cfg.orfas as Record<string, unknown>)) orf[mapa.get(k) ?? k] = v
    cfg.orfas = orf
  }
  const ent2: EntradaRemap<M> = {
    cfg,
    plano: ent.plano, revs: ent.revs,
    detalhes: traduzKeys(ent.detalhes as Record<string, unknown>) as EntradaRemap<M>['detalhes'],
    metas: ent.metas.map((x) => { const n = traduzId(x.meta_id); return n === x.meta_id ? x : { ...x, meta_id: n } }),
  }
  const r = remapearEstado(ent2, aplicarRelinksNaAssinatura(antiga, relinks), nova)
  return { ...r, mudancas: r.mudancas.map((m) => ({ de: original.get(m.de) ?? m.de, para: m.para })) }
}

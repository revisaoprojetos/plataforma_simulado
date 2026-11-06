// DADOS DE REFERÊNCIA do Cronograma Adaptativo, extraídos do HTML do modelo (Cronograma_Adaptativo_2.8.html)
// por scripts/importar-cronograma-html.mjs → catalogo-html.json. Módulo PURO (servidor e testes).
//
// NÃO substitui o conteúdo da plataforma: as disciplinas e aulas continuam sendo as da Biblioteca (mesma
// numeração das metas `pf:<i>` dos planos já criados). Este catálogo ENRIQUECE o que existe:
//  · páginas de cada PDFull (duração da meta) e links de questões (QConcursos / TEC) por aula;
//  · ORDEM de distribuição das matérias (Const 1, Adm 1, Trib 1, PC 1, Const 2, …);
//  · metas de LegProc (lei + trecho, 30 min) por disciplina, na ordem das planilhas;
//  · grupo (essencial / complementar / AGU) e cor de cada disciplina.
// O casamento é por NOME CANÔNICO da disciplina ("Direito Administrativo - verificar" = "Direito Administrativo",
// "Direito Processual do Trabalho" = "Processo do Trabalho", "Internacional Público" = "Direito Internacional"),
// nº da aula ("Aula 07 - PDFULL - …" ↔ aula 7) e nº da lei ("Lei 14.133_2021 - …" ↔ "Lei nº 14.133/21 (…)").

import dados from './catalogo-html.json'

export interface CatalogoHTML {
  id: string
  fonte: string
  grupos: { essenciais: string[]; complementares: string[]; agu: string[][] }
  cores: Record<string, string>
  semFlash: string[]
  /** [disciplina, nº da aula, tema, páginas do PDFull, link QConcursos, link TEC] */
  aulas: Array<[string, string, string, number, string, string]>
  ordem: number[]
  materiais: Record<string, { pdflashPaginas: number | null; pdfightPaginas: number | null; videoaula: string | null; atualizacao: string | null }>
  legprocs: Array<{ disc: string; lei: string; texto: string; minutos: number }>
  ordemLP: number[]
  apoio: Array<{ disc: string; tipo: string; numero: string; tema: string; paginas: number | null }>
}

export const CATALOGO_HTML = dados as unknown as CatalogoHTML

const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Chave canônica da disciplina: junta grafias da MESMA matéria (Biblioteca × planilhas do modelo). */
export function chaveDisciplina(nome: string): string {
  return semAcento(nome).toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/\s*-\s*verificar$/, '')
    .replace(/^direito /, '')
    .replace(/^processual /, 'processo ')
    .replace(/^internacional publico$/, 'internacional')
}

/** Disciplinas RETIRADAS do catálogo autorizado 2.18 (Direitos Humanos, por decisão do responsável). Os índices ficam reservados; progresso existente é preservado, nada é apagado. */
const RETIRADAS = new Set(['direitos humanos'])
export const disciplinaRetirada = (nome: string): boolean => RETIRADAS.has(chaveDisciplina(nome))

export type Grupo = 'essencial' | 'complementar' | 'especifica'
export interface DiscHTML { nome: string; grupo: Grupo; cor: string | null; ordem: number }

const _disc = new Map<string, DiscHTML>()
{
  const g = CATALOGO_HTML.grupos
  const add = (nome: string, grupo: Grupo) => { const k = chaveDisciplina(nome); if (!_disc.has(k)) _disc.set(k, { nome, grupo, cor: CATALOGO_HTML.cores[nome] || null, ordem: _disc.size }) }
  g.essenciais.forEach((n) => add(n, 'essencial'))
  g.complementares.forEach((n) => add(n, 'complementar'))
  g.agu.flat().forEach((n) => add(n, 'especifica'))
  const ativas = new Set(CATALOGO_HTML.ordem)
  CATALOGO_HTML.aulas.forEach((a, i) => { if (ativas.has(i)) add(a[0], 'complementar') }) // só aulas ativas (índices reservados/retirados não criam disciplina)
}
/** Disciplina do modelo correspondente a um nome da plataforma (ou null se a matéria não está no modelo). */
export function disciplinaHTML(nome: string): DiscHTML | null { return _disc.get(chaveDisciplina(nome)) || null }
/** Nome exibido no cronograma: o do modelo quando a matéria existe nele; senão o da plataforma (sem "- verificar"). */
export function nomeDisciplina(nome: string): string {
  return disciplinaHTML(nome)?.nome || String(nome || '').replace(/\s*-\s*verificar\s*$/i, '').trim()
}
/** Grupos de disciplina do modelo (AGU com pares, ex.: Internacional + Internacional Privado). */
export const GRUPOS_HTML = CATALOGO_HTML.grupos

// ── aulas ─────────────────────────────────────────────────────────────────────────────────────────
export const numeroAula = (titulo: string): number | null => { const m = /\baula\s*0*(\d{1,3})\b/i.exec(titulo || ''); return m ? Number(m[1]) : null }
const chaveTexto = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export interface AulaHTML { idx: number; disc: string; numero: string; tema: string; paginas: number; qc: string; tec: string; ordem: number }
const _ordemAula = new Map(CATALOGO_HTML.ordem.map((i, k) => [i, k]))
const _aulasPorDisc = new Map<string, AulaHTML[]>()
CATALOGO_HTML.aulas.forEach((a, idx) => {
  const ordem = _ordemAula.get(idx)
  if (ordem == null) return // inativa no modelo
  const k = chaveDisciplina(a[0]); const l = _aulasPorDisc.get(k) || []
  l.push({ idx, disc: a[0], numero: a[1], tema: a[2], paginas: a[3], qc: a[4], tec: a[5], ordem }); _aulasPorDisc.set(k, l)
})

/** Aula do modelo para um documento PDFull da Biblioteca: mesma disciplina + nº da aula (ou tema contido no título). */
export function aulaHTML(disc: string, titulo: string): AulaHTML | null {
  const lista = _aulasPorDisc.get(chaveDisciplina(disc)); if (!lista) return null
  const n = numeroAula(titulo)
  if (n != null) { const a = lista.find((x) => Number(x.numero) === n); if (a) return a }
  const t = chaveTexto(titulo)
  return lista.find((x) => x.tema && t.includes(chaveTexto(x.tema))) || null
}

// ── LegProc ───────────────────────────────────────────────────────────────────────────────────────
/** Número da lei/decreto/resolução sem pontos e zeros à esquerda ("Lei nº 14.133/21" → "14133"; "CONAMA 001_1986" → "1"). */
export function numeroLei(titulo: string): string | null {
  const t = semAcento(titulo).toLowerCase()
  const m = /(?:lei complementar|lei|decreto-lei|decreto|resolucao conama|resolucao|lc)\s*(?:n[ºo°.]*\s*)?(\d{1,3}(?:\.\d{3})*|\d+)/.exec(t)
  return m ? String(Number(m[1].replace(/\./g, ''))) : null
}
/** Códigos e normas citados sem número no modelo → palavra-chave do título do documento na Biblioteca. */
const ALIAS_LEI: Array<[RegExp, RegExp]> = [
  [/^constituicao federal/, /constituicao federal/],
  [/^adct\b/, /\badct\b|disposicoes constitucionais transitorias/],
  [/^codigo civil\b/, /codigo civil|10\.406/],
  [/^codigo de processo civil\b/, /codigo de processo civil|13\.105/],
  [/^consolidacao das leis do trabalho\b/, /consolidacao das leis do trabalho|\bclt\b|5\.452/],
  [/^codigo tributario nacional\b/, /codigo tributario nacional|\bctn\b|5\.172/],
]
const tipoLei = (t: string) => /lei complementar|\blc\b/.test(t) ? 'lc' : /decreto-lei/.test(t) ? 'dl' : /resolucao/.test(t) ? 'res' : /decreto/.test(t) ? 'dec' : 'lei'

/** Documento de lei da Biblioteca (mesma disciplina) que corresponde à lei citada no modelo. */
export function docDaLei<D extends { titulo: string }>(lei: string, docs: D[]): D | null {
  const l = semAcento(lei).toLowerCase()
  for (const [deLei, doDoc] of ALIAS_LEI) if (deLei.test(l)) return docs.find((d) => doDoc.test(semAcento(d.titulo).toLowerCase())) || null
  const n = numeroLei(lei); if (!n) return null
  const cands = docs.filter((d) => numeroLei(d.titulo) === n)
  if (cands.length <= 1) return cands[0] || null
  return cands.find((d) => tipoLei(semAcento(d.titulo).toLowerCase()) === tipoLei(l)) || cands[0]
}

function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16).padStart(8, '0') }
/** Chave estável da lei (disciplina + nome normalizado) — base do id das metas: lp:L<hash>:<n>. */
export const chaveLeiHTML = (disc: string, lei: string) => 'L' + hash(chaveDisciplina(disc) + '|' + chaveTexto(lei))

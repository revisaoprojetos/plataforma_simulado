// Casamento PURO (sem servidor/banco) das linhas da planilha "Liberação de aulas (primeira aparição)" com as aulas
// (submódulos) de um produto extensivo. Sem efeitos colaterais: recebe linhas + módulos e devolve o vínculo sugerido.
//
// Regras:
//  1) matéria da planilha ↔ módulo raiz (pai_id nulo) por nome normalizado (sem acento/caixa) + aliases + similaridade;
//  2) pares por similaridade de título (≥ 0,5; bônus se o nº da aula bate com o "Aula NN" do submódulo) e, no que
//     sobrar, por nº da aula (título destoante = "suspeito", para conferência) — o nº sozinho engana quando a
//     numeração da planilha está defasada em relação ao produto;
//     (depois, título ≥ 0,5 também marcado como suspeito);
//  3) sem número (ex.: Legislação da AGU "Parte I/II/III") e sem título parecido → por ORDEM entre as aulas livres
//     da matéria (só se as quantidades batem).
// Tudo que não casar volta com aulaId = null (o admin ajusta à mão).

export interface ModuloMin { id: string; pai_id: string | null; titulo: string; ordem: number }
export interface LinhaMatch { ordem: number; disciplina: string; numeroAula: number | null; titulo: string }
export type MetodoMatch = 'numero' | 'titulo' | 'ordem' | 'nenhum'
export interface ResultadoMatch {
  ordem: number
  moduloId: string | null
  aulaId: string | null
  metodo: MetodoMatch
  /** Similaridade (0–1) entre o título da planilha e o da aula casada. */
  similaridade: number
  /** Casou por número mas o título destoa (sim < 0,25): vale conferir. */
  suspeito: boolean
  motivo?: string
}

/** Sem acento, minúsculo, só letras/números separados por 1 espaço. */
export function normalizar(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Matéria da planilha (normalizada) → nomes de módulo (normalizados) aceitos, além do nome idêntico. */
const ALIASES: Record<string, string[]> = {
  'processo civil': ['direito processual civil'],
  'processo penal': ['direito processual penal'],
  'processo do trabalho': ['direito processual do trabalho'],
  'legislacao da agu': ['legislacao da agu gestao de conflitos e governanca'],
  'previdenciario': ['direito previdenciario'],
  'previdenciario publico': ['direito previdenciario publico', 'direito pevidenciario publico'],
  'direito previdenciario publico': ['direito pevidenciario publico'],
  'legislacao penal': ['legislacao penal especial'],
  'direito internacional': ['direito internacional publico'],
  'direito eleitoral': ['direito eleitoral para agu'],
  'direito empresarial': ['direito comercial', 'direito empresarial'],
}

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em', 'na', 'no', 'para', 'por', 'com', 'ao', 'parte', 'aula'])
// Plural simples ('estatutos' = 'estatuto') para a similaridade não perder aulas por 1 letra.
const tokens = (s: string) => normalizar(s).split(' ').filter((t) => t && !STOP.has(t)).map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t))

/** Similaridade de títulos (0–1): Dice sobre palavras relevantes, com bônus se um contém o outro. */
export function similaridade(a: string, b: string): number {
  const na = normalizar(a), nb = normalizar(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(tokens(a)), tb = new Set(tokens(b))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const dice = (2 * inter) / (ta.size + tb.size)
  const cobertura = inter / Math.min(ta.size, tb.size)
  return Math.max(dice, na.includes(nb) || nb.includes(na) ? 0.85 : 0, cobertura * 0.9 * (inter >= 2 ? 1 : 0.6))
}

/** Número da aula no título do submódulo ("Aula 03 - …", "Aula 01 (PARTE II) - …") + sub-parte opcional. */
export function numeroDoTitulo(titulo: string): { numero: number | null; parte: number | null } {
  const m = /^\s*aula\s*0*(\d+)/i.exec(titulo)
  const p = /\(\s*parte\s*([ivx]+|\d+)\s*\)/i.exec(titulo)
  let parte: number | null = null
  if (p) {
    const r = p[1].toUpperCase()
    const rom: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 }
    parte = /^\d+$/.test(r) ? Number(r) : rom[r] ?? null
  }
  return { numero: m ? Number(m[1]) : null, parte }
}

/** Tema da aula: o título sem "Aula NN (PARTE X) - " e sem o nome da matéria repetido logo depois. */
export function temaDaAula(titulo: string, materia: string): string {
  let t = titulo.replace(/^\s*aula\s*0*\d+\s*(\(\s*parte[^)]*\))?\s*(-\s*)?/i, '').trim()
  const partes = t.split(/\s+-\s+/)
  if (partes.length > 1) {
    const sim = similaridade(partes[0], materia)
    const tk = tokens(partes[0])
    const tm = new Set(tokens(materia))
    const nosTokensMateria = tk.length > 0 && tk.every((x) => tm.has(x) || [...tm].some((y) => y.startsWith(x.slice(0, 4))))
    if (sim >= 0.6 || nosTokensMateria) t = partes.slice(1).join(' - ')
  }
  return t
}

interface DiscMod { raiz: ModuloMin; aulas: Array<ModuloMin & { numero: number | null; parte: number | null; tema: string }> }

function indexarDisciplinas(modulos: ModuloMin[]): DiscMod[] {
  const raizes = modulos.filter((m) => !m.pai_id).sort((a, b) => a.ordem - b.ordem)
  return raizes.map((raiz) => ({
    raiz,
    aulas: modulos.filter((m) => m.pai_id === raiz.id).sort((a, b) => a.ordem - b.ordem).map((a) => {
      const { numero, parte } = numeroDoTitulo(a.titulo)
      return { ...a, numero, parte, tema: temaDaAula(a.titulo, raiz.titulo) }
    }),
  }))
}

/** Acha o módulo raiz da matéria: nome idêntico → alias → melhor similaridade (≥ 0,6). */
export function resolverDisciplina(materia: string, discs: DiscMod[]): DiscMod | null {
  const n = normalizar(materia)
  const exato = discs.find((d) => normalizar(d.raiz.titulo) === n)
  if (exato) return exato
  for (const alvo of ALIASES[n] ?? []) {
    const d = discs.find((x) => normalizar(x.raiz.titulo) === alvo)
    if (d) return d
  }
  let melhor: DiscMod | null = null, ms = 0
  for (const d of discs) {
    const s = similaridade(materia, d.raiz.titulo)
    if (s > ms) { ms = s; melhor = d }
  }
  return melhor && ms >= 0.6 ? melhor : null
}

export function casarLinhas(linhas: LinhaMatch[], modulos: ModuloMin[]): ResultadoMatch[] {
  const discs = indexarDisciplinas(modulos)
  const res = new Map<number, ResultadoMatch>()
  const porDisc = new Map<DiscMod, LinhaMatch[]>()
  for (const l of linhas) {
    const d = resolverDisciplina(l.disciplina, discs)
    if (!d) { res.set(l.ordem, { ordem: l.ordem, moduloId: null, aulaId: null, metodo: 'nenhum', similaridade: 0, suspeito: false, motivo: 'matéria sem módulo correspondente no produto' }); continue }
    const lst = porDisc.get(d) ?? []; lst.push(l); porDisc.set(d, lst)
  }

  for (const [d, lst] of porDisc) {
    const usada = new Set<string>()
    const ok = (l: LinhaMatch, a: DiscMod['aulas'][number], metodo: MetodoMatch, sim: number) => {
      usada.add(a.id)
      res.set(l.ordem, { ordem: l.ordem, moduloId: d.raiz.id, aulaId: a.id, metodo, similaridade: sim, suspeito: (metodo === 'numero' && sim < 0.25) || (metodo === 'titulo' && sim < 0.7) })
    }
    // 1ª passada: pares (linha, aula) por SIMILARIDADE forte de título (≥ 0,7), do mais parecido ao menos; empate/bônus pelo mesmo nº.
    //    O nº sozinho engana quando a numeração da planilha está defasada em relação ao produto (ex.: Processo Civil).
    const pares: Array<{ l: LinhaMatch; a: DiscMod['aulas'][number]; s: number; mesmo: boolean }> = []
    for (const l of lst) for (const a of d.aulas) {
      const s = similaridade(l.titulo, a.tema)
      if (s >= 0.7) pares.push({ l, a, s, mesmo: l.numeroAula != null && a.numero === l.numeroAula })
    }
    pares.sort((x, y) => (y.s + (y.mesmo ? 0.15 : 0)) - (x.s + (x.mesmo ? 0.15 : 0)) || x.l.ordem - y.l.ordem)
    for (const p of pares) if (!res.has(p.l.ordem) && !usada.has(p.a.id)) ok(p.l, p.a, p.mesmo ? 'numero' : 'titulo', p.s)
    // 2ª: o que sobrou casa pelo nº da aula (título destoante → marcado como suspeito para conferência).
    for (const l of lst) {
      if (res.has(l.ordem) || l.numeroAula == null) continue
      const cands = d.aulas.filter((a) => a.numero === l.numeroAula && !usada.has(a.id))
      if (!cands.length) continue
      const pont = cands.map((a) => ({ a, s: similaridade(l.titulo, a.tema) })).sort((x, y) => y.s - x.s || x.a.ordem - y.a.ordem)
      ok(l, pont[0].a, 'numero', pont[0].s)
    }
    // 2b: ainda sobrou? título razoavelmente parecido (≥ 0,5) com aula livre — sempre marcado para conferência.
    for (const l of lst) {
      if (res.has(l.ordem)) continue
      let melhor: DiscMod['aulas'][number] | null = null, ms = 0
      for (const a of d.aulas) {
        if (usada.has(a.id)) continue
        const s = similaridade(l.titulo, a.tema)
        if (s > ms) { ms = s; melhor = a }
      }
      if (melhor && ms >= 0.5) ok(l, melhor, 'titulo', ms)
    }
    // 3ª: sem número e sem título parecido (ex.: "Parte I/II/III") → por ordem, se as quantidades batem.
    const sobras = lst.filter((l) => !res.has(l.ordem))
    const livres = d.aulas.filter((a) => !usada.has(a.id))
    if (sobras.length && sobras.length === livres.length && sobras.every((l) => l.numeroAula == null)) {
      sobras.sort((a, b) => a.ordem - b.ordem).forEach((l, i) => ok(l, livres[i], 'ordem', similaridade(l.titulo, livres[i].tema)))
    }
    for (const l of lst) {
      if (!res.has(l.ordem)) {
        res.set(l.ordem, { ordem: l.ordem, moduloId: d.raiz.id, aulaId: null, metodo: 'nenhum', similaridade: 0, suspeito: false, motivo: l.numeroAula != null ? `não há “Aula ${String(l.numeroAula).padStart(2, '0')}” em ${d.raiz.titulo}` : 'título sem aula parecida' })
      }
    }
  }
  return linhas.map((l) => res.get(l.ordem)!)
}

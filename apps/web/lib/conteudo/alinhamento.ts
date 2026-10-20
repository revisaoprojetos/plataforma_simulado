// Alinhamento de `uid` entre versões de um documento (RISCO #1 da auditoria — "o grifo sobrevive à
// edição"). NÚCLEO DETERMINÍSTICO e PURO (sem IO, sem server-only): roda no servidor, no worker e em
// teste/node sem chave de API. A IA entra só nos casos AMBÍGUOS (ver alinhamento-ia.ts), pra otimizar
// tokens — a maioria dos trechos casa de graça aqui.
//
// Ideia: cada trecho da versão ANTIGA tem um `uid` estável (identidade do parágrafo). Ao editar o
// documento (v1 → v2) reparseamos em trechos novos e precisamos CARREGAR os uids para frente:
//   - trecho idêntico  → mantém uid (estado 'identico')  → anotação segue intacta
//   - trecho editado   → mantém uid (estado 'alterado')  → anotação segue, porém sinalizada
//   - trecho novo      → uid novo    (estado 'novo')      → sem anotação
//   - trecho sumiu     → uid vira ÓRFÃO                   → anotação fica 'orfa'
// A qualidade disso é medida pela PoC (alinhamento.poc) em precision/recall.

export interface TrechoVersao {
  /** Posição do trecho na versão (0-based), na ordem do documento. */
  indice: number
  /** Texto do trecho (parágrafo/célula/título). */
  texto: string
  /** Tipo estrutural opcional (paragrafo/titulo/lista/tabela…) — usado como desempate leve. */
  tipo?: string
  /** Presente SÓ na versão antiga: a identidade a carregar. */
  uid?: string
}

export type OrigemMatch = 'exato' | 'posicional' | 'fuzzy' | 'ia' | 'novo'
export type EstadoTrecho = 'identico' | 'alterado' | 'novo'

export interface Alinhamento {
  novoIndice: number
  /** uid carregado da versão antiga, ou null quando é trecho novo (recebe uid fresco na gravação). */
  uid: string | null
  velhoIndice: number | null
  origem: OrigemMatch
  /** 0..1 — confiança do casamento (1 = idêntico). */
  similaridade: number
  estado: EstadoTrecho
}

export interface ParAmbiguo {
  novoIndice: number
  /** Candidatos da versão antiga que ficaram na "zona cinza" — a IA decide. */
  candidatos: { velhoIndice: number; uid: string; similaridade: number }[]
}

export interface ResultadoAlinhamento {
  alinhamentos: Alinhamento[]
  /** uids da versão antiga que NÃO foram carregados → anotações nesses uids viram 'orfa'. */
  orfaos: { uid: string; velhoIndice: number }[]
  /** Casos que o determinístico não resolveu com confiança → vão para a camada de IA. */
  ambiguos: ParAmbiguo[]
  metrica: { total: number; exatos: number; posicionais: number; fuzzy: number; novos: number; ambiguos: number }
}

export interface OpcoesAlinhamento {
  /** ≥ isto no fuzzy = casa automático (estado 'alterado'). Padrão 0.82. */
  limiarAlto?: number
  /** Entre [limiarBaixo, limiarAlto) = zona cinza → IA. Abaixo = considerado trecho diferente. Padrão 0.55. */
  limiarBaixo?: number
  /** Janela de busca fuzzy por deslocamento de índice (±). Padrão 25. */
  janela?: number
}

// ── Normalização & similaridade (puras) ─────────────────────────────────────────
const DIACRITICOS = /[̀-ͯ]/g

/** Minúsculas, sem acento, espaços colapsados — base para comparação estável. */
export function normalizar(texto: string): string {
  return (texto || '').normalize('NFD').replace(DIACRITICOS, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Tokens alfanuméricos (para similaridade por conjunto). */
export function tokens(textoNorm: string): string[] {
  return textoNorm.split(/[^a-z0-9]+/).filter(Boolean)
}

/** Dice sobre bigramas de tokens — robusto a inserção/remoção de poucas palavras. */
function diceTokens(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  if (a.length === 0 || b.length === 0) return 0
  const big = (xs: string[]) => {
    const m = new Map<string, number>()
    if (xs.length === 1) { m.set(xs[0], 1); return m }
    for (let i = 0; i < xs.length - 1; i++) { const k = xs[i] + ' ' + xs[i + 1]; m.set(k, (m.get(k) || 0) + 1) }
    return m
  }
  const ma = big(a), mb = big(b)
  let inter = 0, ta = 0, tb = 0
  ma.forEach((v) => { ta += v }); mb.forEach((v) => { tb += v })
  ma.forEach((v, k) => { const w = mb.get(k); if (w) inter += Math.min(v, w) })
  return (2 * inter) / (ta + tb)
}

/** Levenshtein normalizado (1 - dist/maxLen), com teto de tamanho pra não explodir em parágrafos longos. */
function simLevenshtein(a: string, b: string): number {
  const CAP = 1200
  const s = a.length > CAP ? a.slice(0, CAP) : a
  const t = b.length > CAP ? b.slice(0, CAP) : b
  const n = s.length, m = t.length
  if (n === 0 && m === 0) return 1
  if (n === 0 || m === 0) return 0
  let prev = new Array(m + 1)
  let cur = new Array(m + 1)
  for (let j = 0; j <= m; j++) prev[j] = j
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    const si = s.charCodeAt(i - 1)
    for (let j = 1; j <= m; j++) {
      const cost = si === t.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev; prev = cur; cur = tmp
  }
  const dist = prev[m]
  return 1 - dist / Math.max(n, m)
}

/** Similaridade combinada 0..1 entre dois textos já normalizados. */
export function similaridade(aNorm: string, bNorm: string): number {
  if (aNorm === bNorm) return 1
  const ta = tokens(aNorm), tb = tokens(bNorm)
  const dice = diceTokens(ta, tb)
  // Levenshtein só quando Dice já indica parentesco (poupa custo); senão Dice basta.
  if (dice < 0.2) return dice
  const lev = simLevenshtein(aNorm, bNorm)
  return Math.max(dice, 0.5 * dice + 0.5 * lev)
}

// ── Alinhamento determinístico ───────────────────────────────────────────────────
export function alinhar(
  velhos: TrechoVersao[],
  novos: TrechoVersao[],
  opts: OpcoesAlinhamento = {},
): ResultadoAlinhamento {
  const alto = opts.limiarAlto ?? 0.82
  const baixo = opts.limiarBaixo ?? 0.55
  const janela = opts.janela ?? 25

  const vNorm = velhos.map((v) => normalizar(v.texto))
  const nNorm = novos.map((n) => normalizar(n.texto))
  const uidDe = (i: number) => velhos[i].uid || `v${i}` // tolera ausência de uid (teste)

  const velhoUsado = new Array(velhos.length).fill(false)
  const match: (Alinhamento | null)[] = new Array(novos.length).fill(null)

  // ── Passo 1: EXATO por hash do texto normalizado (desempate por índice mais próximo) ──
  const porNorm = new Map<string, number[]>()
  vNorm.forEach((s, i) => { const l = porNorm.get(s); if (l) l.push(i); else porNorm.set(s, [i]) })
  nNorm.forEach((s, ni) => {
    const cand = porNorm.get(s)
    if (!cand) return
    let melhor = -1, melhorDist = Infinity
    for (const vi of cand) { if (velhoUsado[vi]) continue; const d = Math.abs(vi - ni); if (d < melhorDist) { melhorDist = d; melhor = vi } }
    if (melhor >= 0) {
      velhoUsado[melhor] = true
      match[ni] = { novoIndice: ni, uid: uidDe(melhor), velhoIndice: melhor, origem: 'exato', similaridade: 1, estado: 'identico' }
    }
  })

  // ── Passo 2: POSICIONAL entre âncoras — trechos não casados entre dois exatos, em ordem,
  //    quando a contagem bate e a similaridade passa do piso (edição leve preservando estrutura). ──
  const anchors: number[] = []
  match.forEach((m, ni) => { if (m) anchors.push(ni) })
  const faixa = (iniN: number, fimN: number, iniV: number, fimV: number) => {
    const ns: number[] = [], vs: number[] = []
    for (let x = iniN; x < fimN; x++) if (!match[x]) ns.push(x)
    for (let x = iniV; x < fimV; x++) if (!velhoUsado[x]) vs.push(x)
    if (ns.length === 0 || vs.length === 0 || ns.length !== vs.length) return
    for (let k = 0; k < ns.length; k++) {
      const ni = ns[k], vi = vs[k]
      const sim = similaridade(nNorm[ni], vNorm[vi])
      if (sim >= baixo) {
        velhoUsado[vi] = true
        match[ni] = { novoIndice: ni, uid: uidDe(vi), velhoIndice: vi, origem: 'posicional', similaridade: sim, estado: sim >= 0.999 ? 'identico' : 'alterado' }
      }
    }
  }
  if (anchors.length) {
    const first = anchors[0], last = anchors[anchors.length - 1]
    faixa(0, first, 0, match[first]!.velhoIndice!)
    for (let a = 0; a < anchors.length - 1; a++) faixa(anchors[a] + 1, anchors[a + 1], match[anchors[a]]!.velhoIndice! + 1, match[anchors[a + 1]]!.velhoIndice!)
    faixa(last + 1, novos.length, match[last]!.velhoIndice! + 1, velhos.length)
  }

  // ── Passo 3: FUZZY guloso por melhor-mútuo dentro da janela de índice ──
  const naoCasadosN = () => { const a: number[] = []; for (let i = 0; i < novos.length; i++) if (!match[i]) a.push(i); return a }
  const livresV = () => { const a: number[] = []; for (let i = 0; i < velhos.length; i++) if (!velhoUsado[i]) a.push(i); return a }

  const ambiguos: ParAmbiguo[] = []
  {
    const ns = naoCasadosN()
    // matriz esparsa de similaridades dentro da janela
    const simOf = new Map<string, number>()
    const sim = (ni: number, vi: number) => { const k = ni + ':' + vi; let s = simOf.get(k); if (s === undefined) { s = similaridade(nNorm[ni], vNorm[vi]); simOf.set(k, s) } return s }
    // ordena pares candidatos por similaridade desc e casa guloso respeitando uso
    const pares: { ni: number; vi: number; s: number }[] = []
    for (const ni of ns) {
      for (const vi of livresV()) {
        if (Math.abs(vi - ni) > janela) continue
        const s = sim(ni, vi)
        if (s >= baixo) pares.push({ ni, vi, s })
      }
    }
    pares.sort((x, y) => y.s - x.s)
    for (const p of pares) {
      if (match[p.ni] || velhoUsado[p.vi]) continue
      if (p.s >= alto) {
        velhoUsado[p.vi] = true
        match[p.ni] = { novoIndice: p.ni, uid: uidDe(p.vi), velhoIndice: p.vi, origem: 'fuzzy', similaridade: p.s, estado: 'alterado' }
      }
    }
    // zona cinza: o que sobrou com candidatos em [baixo, alto) vira AMBÍGUO (para a IA)
    for (const ni of naoCasadosN()) {
      const cand = pares.filter((p) => p.ni === ni && !velhoUsado[p.vi] && p.s < alto)
        .sort((a, b) => b.s - a.s).slice(0, 4)
        .map((p) => ({ velhoIndice: p.vi, uid: uidDe(p.vi), similaridade: p.s }))
      if (cand.length) ambiguos.push({ novoIndice: ni, candidatos: cand })
    }
  }

  // ── Passo 4: sobras → NOVO (news sem match) e ÓRFÃO (velhos não usados) ──
  for (let ni = 0; ni < novos.length; ni++) {
    if (!match[ni]) {
      const amb = ambiguos.some((a) => a.novoIndice === ni)
      match[ni] = { novoIndice: ni, uid: amb ? null : null, velhoIndice: null, origem: amb ? 'ia' : 'novo', similaridade: 0, estado: 'novo' }
    }
  }
  const orfaos: { uid: string; velhoIndice: number }[] = []
  for (let vi = 0; vi < velhos.length; vi++) if (!velhoUsado[vi]) orfaos.push({ uid: uidDe(vi), velhoIndice: vi })

  const alinhamentos = match as Alinhamento[]
  const metrica = {
    total: novos.length,
    exatos: alinhamentos.filter((a) => a.origem === 'exato').length,
    posicionais: alinhamentos.filter((a) => a.origem === 'posicional').length,
    fuzzy: alinhamentos.filter((a) => a.origem === 'fuzzy').length,
    novos: alinhamentos.filter((a) => a.origem === 'novo').length,
    ambiguos: ambiguos.length,
  }
  return { alinhamentos, orfaos, ambiguos, metrica }
}

// Diagnóstico do ÍNDICE de um documento (Biblioteca, Fase 2 / plano §4 item 6). PURO (sem I/O): recebe os trechos
// (tipo/rótulo/texto opcional, na ORDEM do documento) e devolve contagens, anomalias de numeração e severidade.
// Só LÊ — nunca altera trechos/uids. Citações (tipo 'paragrafo' sem rótulo, tipo 'texto') não entram na análise de
// numeração: só trechos tipo 'artigo' e os estruturais (livro..subsecao) são avaliados.

export interface TrechoDiag {
  uid?: string | null
  tipo: string | null
  rotulo: string | null
  texto?: string | null
}

export type Severidade = 'ok' | 'revisar' | 'critico'

export interface PendenciaIndice {
  codigo:
    | 'salto_numeracao' | 'duplicado' | 'fora_de_ordem' | 'capitulo_sem_artigo'
    | 'artigos_sem_estrutura' | 'inicio_numeracao' | 'sem_trechos'
  mensagem: string
  severidade: Severidade
  trechoUid?: string
}

export interface SaltoNumeracao { de: number; para: number; faltantes: number; trechoUid?: string }
export interface DuplicadoIndice { rotulo: string; trechoUid?: string; ocorrencias: number }
export interface ForaDeOrdem { rotulo: string; trechoUid?: string; esperadoApos: number }

export interface DiagnosticoIndice {
  contagemPorTipo: Record<string, number>
  totalArtigos: number
  saltos: SaltoNumeracao[]
  duplicados: DuplicadoIndice[]
  foraDeOrdem: ForaDeOrdem[]
  /** uids (ou rótulos, se sem uid) de capítulos/seções/subseções que não contêm nenhum artigo. */
  capitulosSemArtigo: { rotulo: string | null; trechoUid?: string }[]
  /** true = há artigos mas 0 livros/partes/títulos/capítulos/seções/subseções. */
  artigosSemEstrutura: boolean
  /** Primeiro nº base de artigo numerado (null = nenhum). */
  numeracaoComecaEm: number | null
  severidade: Severidade
  pendencias: PendenciaIndice[]
}

// ── Limiares (explícitos) ───────────────────────────────────────────────────────────────────────────────────────────
export const LIMIARES = {
  /** Abaixo disso não se analisa sequência (aulas com poucas citações "Art. X" não são lei). */
  MIN_ARTIGOS_SEQUENCIA: 3,
  /** Qualquer salto (>=1 artigo faltando) => 'revisar'. */
  SALTO_REVISAR_FALTANTES: 1,
  /** Um único salto >= 50 artigos => 'critico'. */
  SALTO_CRITICO_FALTANTES: 50,
  /** >= 10 saltos => 'critico'. */
  SALTO_CRITICO_QTD: 10,
  /** Faltantes / (faltantes + artigos distintos) >= 20% => 'critico'. */
  SALTO_CRITICO_PERCENTUAL: 0.2,
  /** ...mas só se faltarem pelo menos 5 artigos no total (evita crítico em docs pequenos). */
  SALTO_CRITICO_PERCENTUAL_MIN_FALTANTES: 5,
  /** >= 1 duplicado => 'revisar'; >= 5 ou >= 10% dos artigos => 'critico'. */
  DUPLICADO_CRITICO_QTD: 5,
  DUPLICADO_CRITICO_PERCENTUAL: 0.1,
  /** >= 1 fora de ordem => 'revisar'; >= 5 => 'critico'. */
  FORA_ORDEM_CRITICO_QTD: 5,
  /** Artigos sem NENHUM título/capítulo: só conta a partir de N artigos (lei de verdade) => 'revisar'. */
  ARTIGOS_SEM_ESTRUTURA_MIN: 10,
  /** Numeração começando acima de 1 => 'revisar' (faltam os primeiros); >= 50 faltando => 'critico'. */
  INICIO_CRITICO_FALTANTES: 50,
  /** Capítulos sem artigo: >= 1 => 'revisar'; >= 5 => 'critico'. */
  CAPITULO_SEM_ARTIGO_CRITICO_QTD: 5,
} as const

const ESTRUTURAIS = ['livro', 'parte', 'titulo', 'capitulo', 'secao', 'subsecao'] as const
const NIVEL: Record<string, number> = { livro: 0, parte: 1, titulo: 2, capitulo: 3, secao: 4, subsecao: 5 }
/** Níveis que devem conter artigos (títulos/livros agrupam outros níveis, não são cobrados). */
const COBRADOS = new Set(['capitulo', 'secao', 'subsecao'])

const RE_NUM = /^\s*(?:art(?:igo)?\.?\s*)?(\d{1,4}(?:\.\d{3})*)\s*[º°˚]?(?:-([A-Za-z]))?(?![A-Za-zÀ-ú0-9])/i

/** Número base e sufixo de um artigo ("Art. 5º-A" → {5,'A'}). null p/ "único", romano ou sem número. */
export function numeroDoArtigo(t: TrechoDiag): { base: number; sufixo: string | null; chave: string } | null {
  for (const fonte of [t.rotulo, t.texto]) {
    if (!fonte) continue
    const m = RE_NUM.exec(fonte.trim().replace(/^art(?:igo)?\.?\s*/i, 'Art. '))
    const mm = m ?? null
    if (!mm) continue
    const base = parseInt(mm[1].replace(/\./g, ''), 10)
    if (!Number.isFinite(base)) continue
    const sufixo = mm[2] ? mm[2].toUpperCase() : null
    return { base, sufixo, chave: `${base}${sufixo ? '-' + sufixo : ''}` }
  }
  return null
}

const ORDEM_SEV: Record<Severidade, number> = { ok: 0, revisar: 1, critico: 2 }
const maxSev = (a: Severidade, b: Severidade): Severidade => (ORDEM_SEV[a] >= ORDEM_SEV[b] ? a : b)
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

export function diagnosticarIndice(trechos: TrechoDiag[]): DiagnosticoIndice {
  const L = LIMIARES
  const contagemPorTipo: Record<string, number> = {}
  for (const t of trechos) {
    const k = t.tipo || 'texto'
    contagemPorTipo[k] = (contagemPorTipo[k] ?? 0) + 1
  }
  const artigos = trechos.filter((t) => t.tipo === 'artigo')
  const totalArtigos = artigos.length
  const totalEstrut = ESTRUTURAIS.reduce((s, k) => s + (contagemPorTipo[k] ?? 0), 0)
  const pendencias: PendenciaIndice[] = []

  const saltos: SaltoNumeracao[] = []
  const duplicados: DuplicadoIndice[] = []
  const foraDeOrdem: ForaDeOrdem[] = []
  let numeracaoComecaEm: number | null = null

  // ── Sequência de artigos (só se há artigos suficientes) ──
  if (totalArtigos >= L.MIN_ARTIGOS_SEQUENCIA) {
    const vistos = new Map<string, { n: number; idx: number }>()
    const dupJa = new Map<string, DuplicadoIndice>()
    let max: number | null = null
    let distintos = 0
    for (const a of artigos) {
      const num = numeroDoArtigo(a)
      if (!num) continue
      const uid = a.uid ?? undefined
      const rot = a.rotulo?.trim() || `Art. ${num.chave}`
      if (numeracaoComecaEm === null) numeracaoComecaEm = num.base
      const ant = vistos.get(num.chave)
      if (ant) {
        ant.n++
        let d = dupJa.get(num.chave)
        if (!d) { d = { rotulo: rot, trechoUid: uid, ocorrencias: 2 }; dupJa.set(num.chave, d); duplicados.push(d) } else d.ocorrencias = ant.n
        continue // duplicata não entra na análise de ordem/salto
      }
      vistos.set(num.chave, { n: 1, idx: 0 })
      distintos++
      if (max === null) { max = num.base; continue }
      if (num.base === max) continue // -A/-B: mesmo número base, tolerado
      if (num.base === max + 1) { max = num.base; continue }
      if (num.base > max + 1) {
        saltos.push({ de: max, para: num.base, faltantes: num.base - max - 1, trechoUid: uid })
        max = num.base
        continue
      }
      // num.base < max: só é "fora de ordem" se o número base já não apareceu antes (ex.: 5,6,5-A é tolerado)
      const baseJaVista = [...vistos.keys()].some((k) => k !== num.chave && parseInt(k, 10) === num.base)
      if (!baseJaVista) foraDeOrdem.push({ rotulo: rot, trechoUid: uid, esperadoApos: max })
    }

    const faltTotal = saltos.reduce((s, x) => s + x.faltantes, 0)
    if (numeracaoComecaEm !== null && numeracaoComecaEm > 1) {
      const falt = numeracaoComecaEm - 1
      pendencias.push({
        codigo: 'inicio_numeracao',
        severidade: falt >= L.INICIO_CRITICO_FALTANTES ? 'critico' : 'revisar',
        mensagem: `A numeração começa no Art. ${numeracaoComecaEm} (faltam ${plural(falt, 'artigo anterior', 'artigos anteriores')}).`,
      })
    }
    for (const s of saltos) {
      pendencias.push({
        codigo: 'salto_numeracao', trechoUid: s.trechoUid,
        severidade: s.faltantes >= L.SALTO_CRITICO_FALTANTES ? 'critico' : s.faltantes >= L.SALTO_REVISAR_FALTANTES ? 'revisar' : 'ok',
        mensagem: `Salto na numeração: do Art. ${s.de} para o Art. ${s.para} (${plural(s.faltantes, 'artigo faltando', 'artigos faltando')}).`,
      })
    }
    // agregados que elevam a crítico
    const pctFalt = distintos + faltTotal > 0 ? faltTotal / (distintos + faltTotal) : 0
    if (saltos.length >= L.SALTO_CRITICO_QTD || (faltTotal >= L.SALTO_CRITICO_PERCENTUAL_MIN_FALTANTES && pctFalt >= L.SALTO_CRITICO_PERCENTUAL)) {
      pendencias.push({
        codigo: 'salto_numeracao', severidade: 'critico',
        mensagem: `Numeração muito incompleta: ${plural(saltos.length, 'salto', 'saltos')}, ${faltTotal} artigos faltando (${Math.round(pctFalt * 100)}%).`,
      })
    }
    for (const d of duplicados) {
      pendencias.push({ codigo: 'duplicado', trechoUid: d.trechoUid, severidade: 'revisar', mensagem: `${d.rotulo} aparece ${d.ocorrencias} vezes.` })
    }
    if (duplicados.length >= L.DUPLICADO_CRITICO_QTD || (totalArtigos > 0 && duplicados.length / totalArtigos >= L.DUPLICADO_CRITICO_PERCENTUAL)) {
      pendencias.push({ codigo: 'duplicado', severidade: 'critico', mensagem: `Muitos artigos duplicados (${duplicados.length}).` })
    }
    for (const f of foraDeOrdem) {
      pendencias.push({ codigo: 'fora_de_ordem', trechoUid: f.trechoUid, severidade: 'revisar', mensagem: `${f.rotulo} está fora de ordem (depois do Art. ${f.esperadoApos}).` })
    }
    if (foraDeOrdem.length >= L.FORA_ORDEM_CRITICO_QTD) {
      pendencias.push({ codigo: 'fora_de_ordem', severidade: 'critico', mensagem: `Muitos artigos fora de ordem (${foraDeOrdem.length}).` })
    }
  }

  // ── Capítulos/seções sem artigo (só em documentos que têm artigos) ──
  const capitulosSemArtigo: DiagnosticoIndice['capitulosSemArtigo'] = []
  if (totalArtigos > 0) {
    for (let i = 0; i < trechos.length; i++) {
      const t = trechos[i]
      const tipo = t.tipo ?? ''
      if (!COBRADOS.has(tipo)) continue
      let achou = false
      for (let j = i + 1; j < trechos.length; j++) {
        const u = trechos[j]
        if (u.tipo === 'artigo') { achou = true; break }
        const nj = NIVEL[u.tipo ?? '']
        if (nj !== undefined && nj <= NIVEL[tipo]) break
      }
      if (!achou) capitulosSemArtigo.push({ rotulo: t.rotulo, trechoUid: t.uid ?? undefined })
    }
    for (const c of capitulosSemArtigo) {
      pendencias.push({ codigo: 'capitulo_sem_artigo', trechoUid: c.trechoUid, severidade: 'revisar', mensagem: `${c.rotulo ?? 'Capítulo sem rótulo'} não contém nenhum artigo.` })
    }
    if (capitulosSemArtigo.length >= L.CAPITULO_SEM_ARTIGO_CRITICO_QTD) {
      pendencias.push({ codigo: 'capitulo_sem_artigo', severidade: 'critico', mensagem: `Muitos capítulos sem artigo (${capitulosSemArtigo.length}).` })
    }
  }

  // ── Artigos sem estrutura (LegProc sem títulos/capítulos) ──
  const artigosSemEstrutura = totalArtigos > 0 && totalEstrut === 0
  if (artigosSemEstrutura && totalArtigos >= L.ARTIGOS_SEM_ESTRUTURA_MIN) {
    pendencias.push({ codigo: 'artigos_sem_estrutura', severidade: 'revisar', mensagem: `O documento tem ${totalArtigos} artigos mas nenhum título/capítulo — o índice ficará plano.` })
  }

  if (!trechos.length) {
    pendencias.push({ codigo: 'sem_trechos', severidade: 'ok', mensagem: 'Documento sem trechos (ex.: PDF) — índice não diagnosticável.' })
  }

  let severidade: Severidade = 'ok'
  for (const p of pendencias) severidade = maxSev(severidade, p.severidade)
  return {
    contagemPorTipo, totalArtigos, saltos, duplicados, foraDeOrdem, capitulosSemArtigo,
    artigosSemEstrutura, numeracaoComecaEm, severidade, pendencias,
  }
}

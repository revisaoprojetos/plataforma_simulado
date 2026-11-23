/**
 * REGRAS DO MOTOR DO CRONOGRAMA ADAPTATIVO COMO DADOS (`RegrasMotor`).
 *
 * Reúne as constantes de DECISÃO que até a 3.2.0 estavam hard-coded em motor30.ts/motor28.ts (faixas de carga, tetos de PDFull,
 * periodicidade/modo da revisão, limites por dia, limiares de desempenho, reta final, Jurisprudência, prioridades…).
 * `REGRAS_PADRAO` reproduz EXATAMENTE o comportamento atual (provado pelo golden: `node scripts/_golden-motor.mjs --conferir`).
 *
 * Complementa `params.ts` (ParamsAdaptativo: durações, offsets, ritmo, limites do 2.8). Aqui ficam as regras estruturais do 3.x.
 *
 * Módulo PURO — sem 'server-only', sem zod (é compilado junto do motor p/ o iframe). A validação com zod fica em
 * `regras-validacao.ts` (só servidor/testes). Sem Date.now/Math.random.
 */
import { prioridadesPadrao } from './tipos-meta'
import {
  FAIXAS_PADRAO, MAX_FAIXAS, MAX_MINUTOS_SEMANA, MODOS_QUESTOES, MODOS_REVISAO, SECOES_OVERRIDE, classeDaFaixa, faixaDoTeto, faixaPorMinutos, indiceDaFaixa,
  type FaixaCarga, type OverridesFaixa, type SecaoOverride,
} from './faixas-carga'
export type { FaixaCarga, OverridesFaixa } from './faixas-carga'

export const VERSAO_SCHEMA_REGRAS = 1

/** Tipos de restrição declarativa por personagem (tipo de meta). */
export type TipoRestricao = 'max_por_dia' | 'nao_mesmo_dia' | 'nao_dias_seguidos' | 'so_na_sobra' | 'depois_de'
export const TIPOS_RESTRICAO: readonly TipoRestricao[] = ['max_por_dia', 'nao_mesmo_dia', 'nao_dias_seguidos', 'so_na_sobra', 'depois_de']
/** Família do personagem (pf inclui as partes; fl inclui a revisão especial; qu inclui questões da revisão). */
export type FamiliaRestricao = 'pf' | 'fl' | 'qu' | 'lp' | 'jp'
export const FAMILIAS_RESTRICAO: readonly FamiliaRestricao[] = ['pf', 'fl', 'qu', 'lp', 'jp']
/**
 * Restrição declarativa. `tipoA` é o personagem restringido; `tipoB` só nos tipos relacionais (nao_mesmo_dia / depois_de).
 * `valor`: max_por_dia = máximo por dia (1–6); depois_de = atraso mínimo em dias (0–60; 0 = no mesmo dia ou depois). `faixas` vazio = todas.
 */
export interface RestricaoRegra {
  id: string
  tipo: TipoRestricao
  ativa: boolean
  rotulo: string
  tipoA: FamiliaRestricao
  tipoB: FamiliaRestricao | null
  valor: number
  /** Faixas de carga (1/2/3) em que vale; vazio = todas. */
  faixas: number[]
}

export interface RegrasMotor {
  versaoSchema: number
  /** Horizonte de planejamento. */
  horizonte: {
    /** Teto de semanas que o motor planeja à frente (MAX_SEM). Se o plano não cabe, nada é gravado. */
    maxSemanas: number
  }
  /**
   * Faixas de carga semanal (soma das horas da rotina vigente, em minutos), em ordem crescente, sem lacunas nem sobreposição.
   * Cada faixa define teto de PDFulls novos, modo de revisão, modo de questões, "equilibra" e overrides de parâmetros (ver faixas-carga.ts).
   */
  faixas: FaixaCarga[]
  /** Revisão (semana especial/obrigatória). */
  revisao: {
    /** Periodicidade fixa do ciclo (semanas) — padrão global; cada faixa pode sobrescrever. */
    cicloSemanas: number
    /** Periodicidade da semana especial por desempenho — opções oferecidas em planos NOVOS. */
    opcoesNovas: number[]
    /** Opções que só são preservadas em planos legados que já as tinham. */
    opcoesLegado: number[]
    /** Periodicidade padrão da semana especial (hoje 8). */
    padrao: number
    /** O retorno pode ser ANTECIPADO na revisão em ciclo: semanas mínimas após a leitura (PDFlash / questões). */
    antecipaMinSemanas: { fl: number; qu: number }
    /** Rotação das disciplinas essenciais externas entre semanas especiais. */
    giroExternas: number
  }
  /** Limites por dia. */
  limitesDia: {
    /** PDFulls DISTINTOS por dia (parcelas da mesma leitura contam 1). */
    pdfDistintos: number
    /** PDFlashes por dia. */
    revisoes: number
    /** Questões por dia. */
    questoes: number
    /** PDFulls novos por dia (base). */
    pdfNovosBase: number
    /** PDFulls novos por dia na faixa 3, no dia corrente, após um PDFull concluído. */
    pdfNovosAposConclusao: number
  }
  /** Divisão (parcelamento) das leituras. */
  divisao: {
    /** Datas máximas em que uma leitura pode ser dividida (hoje 3). */
    maxDatas: number
    /** Sobra mínima (min) que permite iniciar um trecho na reta final / revisão obrigatória. */
    sobraMinAvancarMin: number
    /** Janela (semanas à frente) em que se procura um dia que comporte a aula inteira. */
    janelaLeituraInteiraSemanas: number
  }
  /** LegProc por dia. */
  legproc: {
    /** Metas por dia no 2º bloco (hoje 4). */
    metasDiaMax: number
    /** Metas por dia no 1º bloco (hoje 2). */
    metasDiaBase: number
    /** Metas da mesma lei por dia (hoje 2). */
    mesmaLei: number
    /** Leis distintas por dia, no reagendamento (hoje 2). */
    leisDistintas: number
  }
  /** Limiares de desempenho. */
  desempenho: {
    /** Diagnóstico histórico: acerto (%) >= isto encerra (ok). */
    historicoOkMin: number
    /** Diagnóstico histórico: acerto (%) >= isto (e < ok) vira PDFlash; abaixo, PDFull. */
    historicoFlashMin: number
    /** Semana especial: acerto (%) ABAIXO disto → releitura (PDFull). */
    especialPdfAbaixo: number
    /** Semana especial: acerto (%) até isto, INCLUSIVE, → PDFlash; acima → fora. */
    especialFlashAte: number
    /** Acerto (%) abaixo do qual o tema é "fraco" no ranking da semana especial. */
    acertoFracoPct: number
    /** Ranking: bônus fixo por acerto fraco. */
    rankingBonusFraco: number
    /** Ranking: peso da distância ao limiar (pontos por 100% de distância). */
    rankingPesoDistancia: number
    /** Ranking: penalidade para tema já revisado. */
    rankingPenalidadeRevisado: number
  }
  /** Reta final (fase final do plano). */
  retaFinal: {
    /** Só entra em reta final a partir desta semana (exclusivo: `sem > semanaMinima`). Fila vazia também ativa. */
    semanaMinima: number
    /** Restam ≤ N tetos de PDFull nas leituras pendentes (até a semana de corte). */
    limiarTetos: number
    /** … e ≤ N tetos após a semana de corte. */
    limiarTetosApos: number
    /** Semana de corte entre os dois limiares. */
    semanaCorteLimiar: number
    /** Após esta semana o PDFull extra (na sobra) pode ultrapassar o teto semanal. */
    semanaEncaixeExtra: number
  }
  /** Jurisprudência semanal. */
  juris: {
    /** Carga mínima da semana (min) para reservar a meta (hoje 14h30 = 870). */
    minSemanalMin: number
    /** Dias preferidos (0 = segunda … 6 = domingo). */
    diasPreferidos: number[]
    /** A meta só é reservada se o aluno marcou Jurisprudência (opt-in). */
    exigeOptIn: boolean
    /** Minutos descontados da capacidade da semana de revisão quando a Jurisprudência está marcada (hoje 60). */
    reservaCapacidadeRevisaoMin: number
  }
  /** Diagnóstico dos temas anteriores ("Já estuda pelo Revisão?"). */
  historico: {
    /** Metas por semana na carga normal (hoje 2). */
    metaSemanalBase: number
    /** Metas por semana na carga alta (hoje 3). */
    metaSemanalAlta: number
    /** Carga semanal (min, inclusivo) a partir da qual vale a meta alta (hoje 24h = 1440). */
    corteAltaMin: number
  }
  /** Rotina da semana. */
  rotina: {
    /** Fim de semana é "concentrado" quando soma >= esta fração da carga da semana (hoje 0,4). */
    fimSemanaFracao: number
    /** … e o maior dia do fim de semana supera a média dos úteis em ≥ N horas (hoje 2). */
    fimSemanaDiferencaHoras: number
    /** Dias de PDFull: segunda até (exclusivo) este dow (hoje 4 = seg–qui). */
    diasPdfAteDow: number
    /** Dias de revisão/questões (0 = segunda … 6 = domingo; hoje sexta e sábado). */
    diasRevisao: number[]
    /** Aquecimento: semanas iniciais que antecipam retornos, com questões ligadas (hoje 2) ou só PDFlash (hoje 1). */
    aquecimentoComQuestoes: number
    aquecimentoSoRevisao: number
  }
  /** Rodízio de disciplinas. */
  rodizio: {
    /** Disciplina "atrasada" quando o progresso fica ≥ N abaixo do maior (hoje 0,15). */
    atrasoLimiar: number
  }
  /** Faixa equilibrada (ver `faixas[].equilibra`). */
  equilibrio: {
    /** Teto diário de PDFlash/questões de retorno (hoje 2). */
    retornosDiaMax: number
    /** Questões por dia (hoje 2). */
    questoesDia: number
    /** PDFlashes por dia no reagendamento (hoje 2). */
    flashesDia: number
  }
  /** Prioridades no reagendamento (menor = primeiro). */
  prioridades: {
    /** Por tipo de meta (padrão = registro `tipos-meta.ts`). */
    porTipo: Record<string, number>
    /** Tipo desconhecido. */
    outros: number
    /** Faixa 3 (≥25h): PDFlash antes, depois questões, depois PDFull. */
    faixa3: { fl: number; qu: number; pdf: number }
  }
  /** Restrições declarativas por personagem. Padrão VAZIO = comportamento idêntico ao motor sem restrições. */
  restricoes: RestricaoRegra[]
  /**
   * Interruptores da ADAPTAÇÃO por desempenho/ação do aluno, sobre a MESMA base de metas. Padrão = tudo ligado (comportamento atual).
   * Desligado: dominó (só adia a meta, sem refluxo); reforço do diagnóstico (nenhuma meta :reforco:); semana especial por desempenho
   * (nenhuma meta :revisao:/rf/rq); antecipar retorno (PDFlash/questões nunca antes do due).
   */
  adaptacao: AdaptacaoRegras
  /** Constantes numéricas que eram estruturais no motor (padrão = comportamento anterior). */
  constantes: ConstantesMotor
}
/** Constantes estruturais expostas como regra. */
export interface ConstantesMotor {
  /** Bloco mínimo de tempo (min): granularidade das divisões de leitura, sobras e vagas (hoje 30). */
  blocoMin: number
  /** Questões/dia fora da faixa equilibrada: base da fórmula "base + heranças" (hoje 1). */
  questoesBaseDia: number
  /** Reserva do ciclo: divisor das vagas de questões que limita os PDFulls do ciclo (hoje 3 → vagas/3). */
  reservaCicloDivisor: number
  /** Prioridades relativas no dominó (menor = primeiro): revisão/questões no dia de revisão, a mesma família repetida, e o rebaixamento (hoje 1/2/4). */
  prioridadesDomino: { revisaoDia: number; revisaoRepetida: number; rebaixada: number }
  /** Duração (min) assumida na cota de PDFlash por dia quando não informada (hoje 60). */
  cotaPdflashDuracaoMin: number
  /** Carga semanal mínima (min) para gerar o plano; abaixo, a geração é rejeitada. 0 = não rejeita (comportamento atual). */
  cargaMinimaMin: number
}
export const CONSTANTES_PADRAO: ConstantesMotor = {
  blocoMin: 30, questoesBaseDia: 1, reservaCicloDivisor: 3, prioridadesDomino: { revisaoDia: 1, revisaoRepetida: 2, rebaixada: 4 }, cotaPdflashDuracaoMin: 60, cargaMinimaMin: 0,
}
export interface AdaptacaoRegras { dominoAtivo: boolean; reforcoAtivo: boolean; semanaEspecialAtiva: boolean; antecipaRetornoAtivo: boolean }
export const ADAPTACAO_PADRAO: AdaptacaoRegras = { dominoAtivo: true, reforcoAtivo: true, semanaEspecialAtiva: true, antecipaRetornoAtivo: true }

export const REGRAS_PADRAO: RegrasMotor = {
  versaoSchema: VERSAO_SCHEMA_REGRAS,
  horizonte: { maxSemanas: 600 },
  faixas: FAIXAS_PADRAO,
  revisao: {
    cicloSemanas: 4,
    opcoesNovas: [4, 6, 8],
    opcoesLegado: [10, 12],
    padrao: 8,
    antecipaMinSemanas: { fl: 1, qu: 2 },
    giroExternas: 3,
  },
  limitesDia: { pdfDistintos: 2, revisoes: 2, questoes: 2, pdfNovosBase: 1, pdfNovosAposConclusao: 2 },
  divisao: { maxDatas: 3, sobraMinAvancarMin: 60, janelaLeituraInteiraSemanas: 3 },
  legproc: { metasDiaMax: 4, metasDiaBase: 2, mesmaLei: 2, leisDistintas: 2 },
  desempenho: { historicoOkMin: 70, historicoFlashMin: 50, especialPdfAbaixo: 50, especialFlashAte: 70, acertoFracoPct: 60, rankingBonusFraco: 2, rankingPesoDistancia: 8, rankingPenalidadeRevisado: 4 },
  retaFinal: { semanaMinima: 1, limiarTetos: 2, limiarTetosApos: 4, semanaCorteLimiar: 4, semanaEncaixeExtra: 4 },
  juris: { minSemanalMin: 870, diasPreferidos: [4, 5], exigeOptIn: true, reservaCapacidadeRevisaoMin: 60 },
  historico: { metaSemanalBase: 2, metaSemanalAlta: 3, corteAltaMin: 1440 },
  rotina: { fimSemanaFracao: 0.4, fimSemanaDiferencaHoras: 2, diasPdfAteDow: 4, diasRevisao: [4, 5], aquecimentoComQuestoes: 2, aquecimentoSoRevisao: 1 },
  rodizio: { atrasoLimiar: 0.15 },
  equilibrio: { retornosDiaMax: 2, questoesDia: 2, flashesDia: 2 },
  prioridades: { porTipo: prioridadesPadrao(), outros: 6, faixa3: { fl: 0, qu: 1, pdf: 2 } },
  restricoes: [],
  adaptacao: { ...ADAPTACAO_PADRAO },
  constantes: CONSTANTES_PADRAO,
}

// ── normalização (merge com o padrão + clamp) ────────────────────────────────────────────────────────
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const int = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : def
}
const real = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
}
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def)
const listaInt = (v: unknown, def: number[], min: number, max: number): number[] => {
  if (!Array.isArray(v)) return [...def]
  const out = [...new Set(v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= min && x <= max))].sort((a, b) => a - b)
  return out.length ? out : [...def]
}
/** múltiplo de 30 (os blocos do motor têm 30 min). */
const bloco30 = (v: unknown, def: number, min: number, max: number): number => Math.round(int(v, def, min, max) / 30) * 30

const RELACIONAIS: readonly TipoRestricao[] = ['nao_mesmo_dia', 'depois_de']
/** Sanitiza a lista de restrições (descarta entradas inválidas; ids únicos; no máximo 40). */
export function normalizarRestricoes(raw: unknown): RestricaoRegra[] {
  if (!Array.isArray(raw)) return []
  const out: RestricaoRegra[] = [], ids = new Set<string>()
  for (const x of raw) {
    const o = obj(x)
    const tipo = TIPOS_RESTRICAO.find((t) => t === o.tipo)
    const a = FAMILIAS_RESTRICAO.find((f) => f === o.tipoA)
    if (!tipo || !a) continue
    const rel = RELACIONAIS.includes(tipo)
    const b = rel ? (FAMILIAS_RESTRICAO.find((f) => f === o.tipoB) ?? null) : null
    if (rel && !b) continue
    let id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 40) : `${tipo}:${a}:${b ?? ''}`
    if (ids.has(id)) { let n = 2; while (ids.has(`${id}#${n}`)) n++; id = `${id}#${n}` }
    ids.add(id)
    out.push({
      id, tipo, ativa: bool(o.ativa, true), rotulo: (typeof o.rotulo === 'string' ? o.rotulo : '').slice(0, 80), tipoA: a, tipoB: b,
      valor: tipo === 'max_por_dia' ? int(o.valor, 1, 1, 6) : tipo === 'depois_de' ? int(o.valor, 1, 0, 60) : 0,
      faixas: listaInt(o.faixas, [], 1, 3),
    })
    if (out.length >= 40) break
  }
  return out
}

// ── faixas de carga (dinâmicas) ──────────────────────────────────────────────────────────────────────
const inteiroOuNull = (v: unknown, min: number, max: number): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.trunc(n))) : null
}
const MODO_REV = (v: unknown, def: FaixaCarga['revisaoModo']) => MODOS_REVISAO.find((m) => m === v) ?? def
const MODO_QU = (v: unknown, def: FaixaCarga['modoQuestoes']) => MODOS_QUESTOES.find((m) => m === v) ?? def

/** Overrides de faixa: reutiliza o clamp da normalização global por seção e mantém SÓ as chaves informadas. */
export function normalizarOverrides(raw: unknown): OverridesFaixa {
  const o = obj(raw), out: Record<string, Record<string, unknown>> = {}
  for (const sec of SECOES_OVERRIDE) {
    const parcial = obj(o[sec])
    const chaves = Object.keys(parcial).filter((k) => parcial[k] !== undefined)
    if (!chaves.length) continue
    const completo = (normalizarRegras({ [sec]: parcial }) as unknown as Record<string, Record<string, unknown>>)[sec]
    const sub: Record<string, unknown> = {}
    for (const k of chaves) if (k in completo) sub[k] = completo[k]
    if (Object.keys(sub).length) out[sec] = sub
  }
  return out as OverridesFaixa
}

/** Converte o formato legado (faixas{faixa1.., faixa2..} + tetosPdf[4] + revisao.cicloAteMin) em lista de faixas equivalente. */
function faixasDeLegado(r: Record<string, unknown>): FaixaCarga[] {
  const fx = obj(r.faixas), rv = obj(r.revisao), D = FAIXAS_PADRAO
  const f1 = int(fx.faixa1AteMinExclusivo, 900, 300, 3000), f2 = Math.max(f1, int(fx.faixa2AteMinInclusivo, 1470, 300, 5000)), ciclo = int(rv.cicloAteMin, 1470, 0, 6000)
  const linhas = Array.isArray(r.tetosPdf) ? r.tetosPdf : []
  let anterior = 0
  const out = D.map((d, k) => {
    const l = obj(linhas[k]), ultima = k === D.length - 1
    let ate: number | null = null
    if (!ultima) { ate = Math.max(anterior, int(l.ateMin, d.maxMin as number, 0, 6000)); anterior = ate }
    const rep = ate ?? anterior + 1
    const classe = rep < f1 ? 1 : rep <= f2 ? 2 : 3
    return {
      ...d, maxMin: ate, tetoPdf: int(l.teto, d.tetoPdf, 1, 12), soRegra23: bool(l.soRegra23, d.soRegra23), equilibra: bool(l.equilibra, d.equilibra),
      revisaoModo: rep <= ciclo ? 'ciclo' : 'desempenho', modoQuestoes: classe === 1 ? 'revisao' : classe === 2 ? 'revisao_pdf' : 'livre', overrides: {},
    } as FaixaCarga
  })
  let ant = -1
  for (const f of out) { f.minMin = ant + 1; ant = f.maxMin ?? f.minMin }
  return out
}

/**
 * Sanitiza a lista de faixas: campos com clamp, ordem por limite, contiguidade (min = máx anterior + 1), 1ª em 0 e última sem limite.
 * Aceita também o formato legado (converte). Entrada ausente/vazia = faixas padrão.
 */
export function normalizarFaixas(raw: unknown): FaixaCarga[] {
  const r = obj(raw)
  const lista = Array.isArray(r.faixas) ? r.faixas : null
  const legado = !lista && (Array.isArray(r.tetosPdf) || Object.keys(obj(r.faixas)).length > 0 || obj(r.revisao).cicloAteMin !== undefined)
  if (legado) return faixasDeLegado(r)
  if (!lista || !lista.length) return FAIXAS_PADRAO.map((f) => ({ ...f, overrides: {} }))
  const D = FAIXAS_PADRAO
  const itens = lista.slice(0, MAX_FAIXAS).map((x, k) => {
    const o = obj(x), d = D[Math.min(k, D.length - 1)]
    const opcoes = Array.isArray(o.opcoesNovas) ? listaInt(o.opcoesNovas, [], 2, 24) : []
    const opcoesOk = opcoes.length ? opcoes : null
    const padrao = inteiroOuNull(o.padrao, 2, 24)
    return {
      id: (typeof o.id === 'string' && o.id.trim() ? o.id.trim() : 'f' + (k + 1)).slice(0, 20),
      nome: (typeof o.nome === 'string' && o.nome.trim() ? o.nome.trim() : 'Faixa ' + (k + 1)).slice(0, 40),
      minMin: 0,
      maxMin: o.maxMin == null || o.maxMin === '' ? null : int(o.maxMin, d.maxMin ?? MAX_MINUTOS_SEMANA, 0, MAX_MINUTOS_SEMANA),
      tetoPdf: int(o.tetoPdf, d.tetoPdf, 1, 12), soRegra23: bool(o.soRegra23, false), equilibra: bool(o.equilibra, false),
      revisaoModo: MODO_REV(o.revisaoModo, d.revisaoModo),
      cicloSemanas: inteiroOuNull(o.cicloSemanas, 2, 12),
      opcoesNovas: opcoesOk,
      padrao: padrao != null && (!opcoesOk || opcoesOk.includes(padrao)) ? padrao : null,
      modoQuestoes: MODO_QU(o.modoQuestoes, d.modoQuestoes),
      overrides: normalizarOverrides(o.overrides),
    } as FaixaCarga
  })
  // ordena por limite superior (sem limite = por último), garante ids únicos e contiguidade
  itens.sort((a, b) => (a.maxMin ?? Infinity) - (b.maxMin ?? Infinity))
  const ids = new Set<string>()
  let ant = -1
  itens.forEach((f, k) => {
    let id = f.id
    if (ids.has(id)) { let n = 2; while (ids.has(id + '_' + n)) n++; id = id + '_' + n }
    ids.add(id); f.id = id
    f.minMin = ant + 1
    const ultima = k === itens.length - 1
    f.maxMin = ultima ? null : Math.max(f.minMin, f.maxMin ?? f.minMin)
    ant = f.maxMin ?? f.minMin
  })
  return itens
}

/** Constantes estruturais (com clamp). */
export function normalizarConstantes(raw: unknown): ConstantesMotor {
  const c = obj(raw), D = CONSTANTES_PADRAO, pd = obj(c.prioridadesDomino)
  return {
    blocoMin: int(c.blocoMin, D.blocoMin, 10, 120),
    questoesBaseDia: int(c.questoesBaseDia, D.questoesBaseDia, 1, 6),
    reservaCicloDivisor: int(c.reservaCicloDivisor, D.reservaCicloDivisor, 1, 12),
    prioridadesDomino: {
      revisaoDia: int(pd.revisaoDia, D.prioridadesDomino.revisaoDia, 0, 20),
      revisaoRepetida: int(pd.revisaoRepetida, D.prioridadesDomino.revisaoRepetida, 0, 20),
      rebaixada: int(pd.rebaixada, D.prioridadesDomino.rebaixada, 0, 20),
    },
    cotaPdflashDuracaoMin: int(c.cotaPdflashDuracaoMin, D.cotaPdflashDuracaoMin, 15, 240),
    cargaMinimaMin: int(c.cargaMinimaMin, D.cargaMinimaMin, 0, 6000),
  }
}

/** Faixa de carga (objeto) para a carga semanal em minutos. */
export const resolverFaixaCarga = (minutosSemana: number, regras: RegrasMotor = REGRAS_PADRAO): FaixaCarga => faixaPorMinutos(regras.faixas, minutosSemana)
/** Índice (0-based) da faixa para a carga semanal. */
export const resolverIndiceFaixa = (minutosSemana: number, regras: RegrasMotor = REGRAS_PADRAO): number => indiceDaFaixa(regras.faixas, minutosSemana)
/** Classe legada da faixa de carga (1/2/3) — define onde as questões caem no dia. Padrão: ≤14h30 → 1 · ≤24h30 → 2 · acima → 3. */
export function resolverFaixa(minutosSemana: number, regras: RegrasMotor = REGRAS_PADRAO): 1 | 2 | 3 {
  return classeDaFaixa(resolverFaixaCarga(minutosSemana, regras))
}

/** Teto de PDFulls novos para a carga semanal (min). `regra23=false` pula as faixas `soRegra23` (planos 3.1). */
export function resolverTetoPdf(minutosSemana: number, regra23: boolean, regras: RegrasMotor = REGRAS_PADRAO): { teto: number; equilibra: boolean; ateMin: number | null; faixa: FaixaCarga } {
  const f = faixaDoTeto(regras.faixas, minutosSemana, regra23)
  return { teto: f.tetoPdf, equilibra: f.equilibra, ateMin: f.maxMin, faixa: f }
}

/** Rotina na revisão em CICLO (obrigatória)? Carga semanal em minutos. */
export const revisaoEmCiclo = (minutosSemana: number, regras: RegrasMotor = REGRAS_PADRAO): boolean => resolverFaixaCarga(minutosSemana, regras).revisaoModo === 'ciclo'

/**
 * Merge profundo com `REGRAS_PADRAO` + clamp em limites seguros. Entrada qualquer → `RegrasMotor` completo e consistente.
 * `normalizarRegras(undefined)` ≡ `REGRAS_PADRAO` (mesmo conteúdo).
 */
export function normalizarRegras(raw: unknown): RegrasMotor {
  const r = obj(raw), D = REGRAS_PADRAO
  const hz = obj(r.horizonte), rv = obj(r.revisao), ld = obj(r.limitesDia), dv = obj(r.divisao), lp = obj(r.legproc)
  const ds = obj(r.desempenho), rf = obj(r.retaFinal), jr = obj(r.juris), hs = obj(r.historico), rt = obj(r.rotina), ro = obj(r.rodizio), eq = obj(r.equilibrio), pr = obj(r.prioridades)

  const faixas = normalizarFaixas(r)

  const okMin = int(ds.historicoOkMin, D.desempenho.historicoOkMin, 0, 100)
  const flMin = Math.min(okMin, int(ds.historicoFlashMin, D.desempenho.historicoFlashMin, 0, 100))
  const espFl = int(ds.especialFlashAte, D.desempenho.especialFlashAte, 0, 100)
  const espPf = Math.min(espFl, int(ds.especialPdfAbaixo, D.desempenho.especialPdfAbaixo, 0, 100))

  const opcoesNovas = listaInt(rv.opcoesNovas, D.revisao.opcoesNovas, 2, 24)
  const padrao = int(rv.padrao, D.revisao.padrao, 2, 24)
  const porTipo: Record<string, number> = { ...D.prioridades.porTipo }
  const pt = obj(pr.porTipo)
  for (const k of Object.keys(porTipo)) porTipo[k] = int(pt[k], porTipo[k], 0, 20)
  const f3 = obj(pr.faixa3)

  return {
    versaoSchema: VERSAO_SCHEMA_REGRAS,
    horizonte: { maxSemanas: int(hz.maxSemanas, D.horizonte.maxSemanas, 20, 600) },
    faixas,
    revisao: {
      cicloSemanas: int(rv.cicloSemanas, D.revisao.cicloSemanas, 2, 12),
      opcoesNovas,
      opcoesLegado: listaInt(rv.opcoesLegado, D.revisao.opcoesLegado, 2, 24),
      padrao: opcoesNovas.includes(padrao) ? padrao : (opcoesNovas.includes(D.revisao.padrao) ? D.revisao.padrao : opcoesNovas[opcoesNovas.length - 1]),
      antecipaMinSemanas: { fl: int(obj(rv.antecipaMinSemanas).fl, D.revisao.antecipaMinSemanas.fl, 0, 12), qu: int(obj(rv.antecipaMinSemanas).qu, D.revisao.antecipaMinSemanas.qu, 0, 12) },
      giroExternas: int(rv.giroExternas, D.revisao.giroExternas, 0, 20),
    },
    limitesDia: {
      pdfDistintos: int(ld.pdfDistintos, D.limitesDia.pdfDistintos, 1, 6),
      revisoes: int(ld.revisoes, D.limitesDia.revisoes, 1, 6),
      questoes: int(ld.questoes, D.limitesDia.questoes, 1, 6),
      pdfNovosBase: int(ld.pdfNovosBase, D.limitesDia.pdfNovosBase, 1, 6),
      pdfNovosAposConclusao: int(ld.pdfNovosAposConclusao, D.limitesDia.pdfNovosAposConclusao, 1, 6),
    },
    divisao: {
      maxDatas: int(dv.maxDatas, D.divisao.maxDatas, 1, 5),
      sobraMinAvancarMin: bloco30(dv.sobraMinAvancarMin, D.divisao.sobraMinAvancarMin, 30, 240),
      janelaLeituraInteiraSemanas: int(dv.janelaLeituraInteiraSemanas, D.divisao.janelaLeituraInteiraSemanas, 0, 12),
    },
    legproc: {
      metasDiaMax: int(lp.metasDiaMax, D.legproc.metasDiaMax, 1, 12),
      metasDiaBase: int(lp.metasDiaBase, D.legproc.metasDiaBase, 1, 12),
      mesmaLei: int(lp.mesmaLei, D.legproc.mesmaLei, 1, 12),
      leisDistintas: int(lp.leisDistintas, D.legproc.leisDistintas, 1, 6),
    },
    desempenho: {
      historicoOkMin: okMin,
      historicoFlashMin: flMin,
      especialPdfAbaixo: espPf,
      especialFlashAte: espFl,
      acertoFracoPct: int(ds.acertoFracoPct, D.desempenho.acertoFracoPct, 0, 100),
      rankingBonusFraco: real(ds.rankingBonusFraco, D.desempenho.rankingBonusFraco, 0, 20),
      rankingPesoDistancia: real(ds.rankingPesoDistancia, D.desempenho.rankingPesoDistancia, 0, 50),
      rankingPenalidadeRevisado: real(ds.rankingPenalidadeRevisado, D.desempenho.rankingPenalidadeRevisado, 0, 50),
    },
    retaFinal: {
      semanaMinima: int(rf.semanaMinima, D.retaFinal.semanaMinima, 0, 52),
      limiarTetos: int(rf.limiarTetos, D.retaFinal.limiarTetos, 0, 12),
      limiarTetosApos: int(rf.limiarTetosApos, D.retaFinal.limiarTetosApos, 0, 12),
      semanaCorteLimiar: int(rf.semanaCorteLimiar, D.retaFinal.semanaCorteLimiar, 0, 52),
      semanaEncaixeExtra: int(rf.semanaEncaixeExtra, D.retaFinal.semanaEncaixeExtra, 0, 52),
    },
    juris: {
      minSemanalMin: int(jr.minSemanalMin, D.juris.minSemanalMin, 0, 3000),
      diasPreferidos: listaInt(jr.diasPreferidos, D.juris.diasPreferidos, 0, 6),
      exigeOptIn: bool(jr.exigeOptIn, D.juris.exigeOptIn),
      reservaCapacidadeRevisaoMin: int(jr.reservaCapacidadeRevisaoMin, D.juris.reservaCapacidadeRevisaoMin, 0, 240),
    },
    historico: {
      metaSemanalBase: int(hs.metaSemanalBase, D.historico.metaSemanalBase, 0, 7),
      metaSemanalAlta: int(hs.metaSemanalAlta, D.historico.metaSemanalAlta, 0, 7),
      corteAltaMin: int(hs.corteAltaMin, D.historico.corteAltaMin, 0, 6000),
    },
    rotina: {
      fimSemanaFracao: real(rt.fimSemanaFracao, D.rotina.fimSemanaFracao, 0, 1),
      fimSemanaDiferencaHoras: real(rt.fimSemanaDiferencaHoras, D.rotina.fimSemanaDiferencaHoras, 0, 24),
      diasPdfAteDow: int(rt.diasPdfAteDow, D.rotina.diasPdfAteDow, 1, 7),
      diasRevisao: listaInt(rt.diasRevisao, D.rotina.diasRevisao, 0, 6),
      aquecimentoComQuestoes: int(rt.aquecimentoComQuestoes, D.rotina.aquecimentoComQuestoes, 0, 12),
      aquecimentoSoRevisao: int(rt.aquecimentoSoRevisao, D.rotina.aquecimentoSoRevisao, 0, 12),
    },
    rodizio: { atrasoLimiar: real(ro.atrasoLimiar, D.rodizio.atrasoLimiar, 0, 1) },
    equilibrio: {
      retornosDiaMax: int(eq.retornosDiaMax, D.equilibrio.retornosDiaMax, 1, 6),
      questoesDia: int(eq.questoesDia, D.equilibrio.questoesDia, 1, 6),
      flashesDia: int(eq.flashesDia, D.equilibrio.flashesDia, 1, 6),
    },
    prioridades: {
      porTipo,
      outros: int(pr.outros, D.prioridades.outros, 0, 20),
      faixa3: { fl: int(f3.fl, D.prioridades.faixa3.fl, 0, 20), qu: int(f3.qu, D.prioridades.faixa3.qu, 0, 20), pdf: int(f3.pdf, D.prioridades.faixa3.pdf, 0, 20) },
    },
    restricoes: normalizarRestricoes(r.restricoes),
    constantes: normalizarConstantes(r.constantes),
    adaptacao: (() => { const a = obj(r.adaptacao), A = ADAPTACAO_PADRAO; return { dominoAtivo: bool(a.dominoAtivo, A.dominoAtivo), reforcoAtivo: bool(a.reforcoAtivo, A.reforcoAtivo), semanaEspecialAtiva: bool(a.semanaEspecialAtiva, A.semanaEspecialAtiva), antecipaRetornoAtivo: bool(a.antecipaRetornoAtivo, A.antecipaRetornoAtivo) } })(),
  }
}

/** Resolve as regras de UMA chamada do motor: `ctx.regras` (parcial) normalizado, ou o padrão (mesma referência). */
export function resolverRegras(ctx?: { regras?: unknown } | null): RegrasMotor {
  const r = ctx?.regras
  return r && typeof r === 'object' ? normalizarRegras(r) : REGRAS_PADRAO
}

// ── hash estável ─────────────────────────────────────────────────────────────────────────────────────
function jsonEstavel(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(jsonEstavel).join(',') + ']'
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + jsonEstavel(o[k])).join(',') + '}'
  }
  return JSON.stringify(v) ?? 'null'
}
/** Hash curto (hex, 53 bits — cyrb53) das regras NORMALIZADAS; estável entre execuções e ordem das chaves. */
export function hashRegras(regras: unknown): string {
  const n = normalizarRegras(regras) as unknown as Record<string, unknown>
  // Compat: campos introduzidos depois não entram no hash enquanto estiverem no padrão — preserva o hash dos planos gravados antes deles existirem.
  const semRestr = Array.isArray(n.restricoes) && n.restricoes.length === 0, semAdapt = jsonEstavel(n.adaptacao) === jsonEstavel(ADAPTACAO_PADRAO)
  const semConst = jsonEstavel(n.constantes) === jsonEstavel(CONSTANTES_PADRAO)
  const faixasPadrao = jsonEstavel(n.faixas) === jsonEstavel(FAIXAS_PADRAO)
  const base: Record<string, unknown> = Object.fromEntries(Object.entries(n).filter(([k]) => !(k === 'restricoes' && semRestr) && !(k === 'adaptacao' && semAdapt) && !(k === 'constantes' && semConst)))
  if (faixasPadrao) {
    // faixas no padrão ≡ formato legado (faixas{} + tetosPdf[] + revisao.cicloAteMin) → mesmo hash de antes das faixas dinâmicas
    base.faixas = { faixa1AteMinExclusivo: 900, faixa2AteMinInclusivo: 1470 }
    base.tetosPdf = [
      { ateMin: 870, teto: 3, soRegra23: true, equilibra: false }, { ateMin: 1470, teto: 4, soRegra23: false, equilibra: false },
      { ateMin: 2100, teto: 5, soRegra23: false, equilibra: true }, { ateMin: null, teto: 6, soRegra23: false, equilibra: false },
    ]
    base.revisao = { ...(n.revisao as Record<string, unknown>), cicloAteMin: 1470 }
  }
  const s = jsonEstavel(base)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
/** Hash das regras padrão. Plano sem `cfg.regrasHash` = regras padrão. */
export const HASH_REGRAS_PADRAO = hashRegras(REGRAS_PADRAO)

// ── delta contra o padrão (persistência enxuta: só o que difere do padrão) ───────────────────────────
function difere(a: unknown, b: unknown): unknown {
  if (Array.isArray(a) || Array.isArray(b) || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return jsonEstavel(a) === jsonEstavel(b) ? undefined : a
  const o: Record<string, unknown> = {}
  for (const k of Object.keys(a as Record<string, unknown>)) {
    const d = difere((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    if (d !== undefined) o[k] = d
  }
  return Object.keys(o).length ? o : undefined
}
/** Só os campos de `regras` (normalizadas) que diferem de `REGRAS_PADRAO`; `{}` = padrão. Arrays vão inteiros. */
export function deltaDoPadrao(regras: unknown): Record<string, unknown> {
  const n = normalizarRegras(regras) as unknown as Record<string, unknown>
  const d = difere(n, REGRAS_PADRAO as unknown as Record<string, unknown>) as Record<string, unknown> | undefined
  if (!d) return {}
  const { versaoSchema: _v, ...resto } = d
  return resto
}

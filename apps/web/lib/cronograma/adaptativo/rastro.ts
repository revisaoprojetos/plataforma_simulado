/**
 * RASTRO DE DECISÃO do motor (D2) — coletor PURO e barato: registra, por meta, o MOTIVO pelo qual o motor adiou/barrou/encaixou
 * (restrição ativa, teto semanal de PDFull, limite diário, adaptação desligada…). Só existe quando o chamador pede (`ctx.rastro`):
 * sem coletor, o motor não executa nenhuma linha daqui (a saída do plano é idêntica). NUNCA entra no plano gravado nem no payload do aluno.
 *
 * Agrega por (meta × código): guarda a 1ª e a última data em que o motivo valeu e quantas vezes (n) — assim cabe em poucos KB
 * mesmo com milhares de consultas. Teto de `LIMITE_EVENTOS` chaves; o excedente só incrementa `descartados`.
 * Módulo puro (sem zod/server-only): compilado junto do motor.
 */

export type CodigoRastro =
  | 'restricao' // uma restrição declarativa ativa impediu a meta naquele dia
  | 'limite_dia' // limite diário de PDFull/PDFlash/Questões distintos (regras.limitesDia)
  | 'teto_semana' // teto semanal de PDFulls novos da faixa
  | 'limite_novos_dia' // PDFulls novos por dia
  | 'revisao_obrigatoria' // questões fora da semana de revisão obrigatória
  | 'adaptacao_off' // um interruptor de adaptação desligado removeu/impediu algo
  | 'adiada_sem_domino' // dominó desligado: a meta só foi adiada

export interface EventoRastro {
  /** meta (id) ou chave de contexto (ex.: `semana:12`). */
  id: string
  cod: CodigoRastro
  texto: string
  /** 1ª e última data (YYYY-MM-DD) em que o motivo foi aplicado; `n` = quantas consultas. */
  de: string
  ate: string
  n: number
}

export const LIMITE_EVENTOS = 1500

export class ColetorRastro {
  private mapa = new Map<string, EventoRastro>()
  descartados = 0
  constructor(readonly limite = LIMITE_EVENTOS) {}
  reg(id: string, cod: CodigoRastro, texto: string | (() => string), dia: string): void {
    const k = id + '|' + cod
    const e = this.mapa.get(k)
    if (e) { e.n++; if (dia < e.de) e.de = dia; if (dia > e.ate) e.ate = dia; return }
    if (this.mapa.size >= this.limite) { this.descartados++; return }
    this.mapa.set(k, { id, cod, texto: typeof texto === 'function' ? texto() : texto, de: dia, ate: dia, n: 1 })
  }
  eventos(): EventoRastro[] { return [...this.mapa.values()].sort((a, b) => a.de.localeCompare(b.de) || a.id.localeCompare(b.id) || a.cod.localeCompare(b.cod)) }
}

/** Resultado serializável do rastro (vai só para a tela admin). */
export interface RastroPlano { eventos: EventoRastro[]; descartados: number }
export const resultadoRastro = (c: ColetorRastro | null | undefined): RastroPlano | undefined => (c ? { eventos: c.eventos(), descartados: c.descartados } : undefined)

/** Rótulo curto de uma meta para as mensagens (ex.: `pf:12` → "PDFull #12"). */
export function rotuloMeta(id: string): string {
  const [t, i, ...r] = id.split(':')
  const nome: Record<string, string> = { pf: 'PDFull', pp: 'PDFull (parte)', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência', rf: 'PDFlash (revisão)', rq: 'Questões (revisão)' }
  return `${nome[t] ?? t}${i ? ' ' + i : ''}${r.length ? ' (' + r.join(':') + ')' : ''}`
}

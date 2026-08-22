// Grifos editoriais semânticos da Lei Seca (compartilhados admin ↔ leitor).
// `estrutural: true` = permanece no "modo sem grifos" (comentário/jurisprudência,
// com rótulo). `false` = decorativo (núcleo/complemento/prazo/exceção/alerta) →
// escondido no modo sem grifos, conforme a regra §10.3 do spec.

export type TipoGrifo = 'nucleo' | 'complemento' | 'prazo' | 'excecao' | 'comentario' | 'stf' | 'stj' | 'tst' | 'alerta'

export const GRIFOS: Record<TipoGrifo, { label: string; cor: string; estrutural: boolean }> = {
  nucleo: { label: 'Núcleo', cor: '#fde047', estrutural: false },
  complemento: { label: 'Complemento', cor: '#86efac', estrutural: false },
  prazo: { label: 'Prazo', cor: '#c4b5fd', estrutural: false },
  excecao: { label: 'Exceção', cor: '#fca5a5', estrutural: false },
  alerta: { label: 'Atenção', cor: '#fdba74', estrutural: false },
  comentario: { label: 'Comentário', cor: '#cbd5e1', estrutural: true },
  stf: { label: 'STF', cor: '#93c5fd', estrutural: true },
  stj: { label: 'STJ', cor: '#fda4af', estrutural: true },
  tst: { label: 'TST', cor: '#fcd34d', estrutural: true },
}

export const GRIFOS_LISTA = Object.entries(GRIFOS).map(([id, g]) => ({ id: id as TipoGrifo, ...g }))
export const corDoGrifo = (t?: string | null) => (t && t in GRIFOS ? GRIFOS[t as TipoGrifo].cor : '#fde047')
export const ehEstrutural = (t?: string | null) => !!(t && t in GRIFOS && GRIFOS[t as TipoGrifo].estrutural)

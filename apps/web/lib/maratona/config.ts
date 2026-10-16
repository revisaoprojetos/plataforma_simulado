// Config da "Maratona de Simulados" (desafio de simulados no estilo dos desafios).
// FASE 1 (interface): dados MOCK fiéis ao design. FASE 2 (depois): virá do admin/cadastro.
// O card de entrada (Home do Revisão) e a área interna (percurso/painel/ranking/medalhas) consomem isto.

export interface MaratonaConfig {
  id: string
  titulo: string
  /** Trecho em degradê do título (ex.: "ENAP + AGU") — não quebra linha. */
  destaque: string
  descricao: string
  capaUrl: string
  /** ISO (YYYY-MM-DD). */
  inscricoesAte: string
  inicio: string
  fim: string
  qtdSimulados: number
  padrao: string
  recompensa: { xp: number; extra?: string }
  inscritos: number
  regulamentoUrl: string
}

/** Dados do desafio em destaque (mock do design `desafio-maratona`). */
export const MARATONA: MaratonaConfig = {
  id: 'maratona-enap-agu',
  titulo: 'Maratona de Simulados',
  destaque: 'ENAP + AGU',
  descricao: 'Seis simulados em 15 dias para chegar afiado nas duas provas. Complete a maratona, dispute o ranking exclusivo e garanta recompensas.',
  capaUrl: '/maratona/capa-maratona-enap-agu.jpg',
  inscricoesAte: '2026-10-19',
  inicio: '2026-10-20',
  fim: '2026-11-03',
  qtdSimulados: 6,
  padrao: 'Cebraspe',
  recompensa: { xp: 500, extra: 'adesivo exclusivo' },
  inscritos: 1284,
  regulamentoUrl: '#',
}

/**
 * VERIFICAÇÃO DE LANÇAMENTO: enquanto `false`, o card NÃO aparece pra ninguém (nem quem tem acesso).
 * Vira `true` quando a maratona é lançada. (Fase 2: isto vira uma coluna/flag no admin.)
 */
export const MARATONA_LANCADA = true

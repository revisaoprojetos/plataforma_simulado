// URL da lista /admin/questoes ↔ EstadoQ (filtros multi "a|b"). Puro (cliente + servidor).
// Compatível com links antigos de valor único (?disciplina=<id>&dificuldade=...&status=...).

import { estadoQDeParams, type EstadoQ } from './biblioteca-questoes-tipos'

export function estadoQDeUrlAdmin(sp: URLSearchParams): EstadoQ {
  const p = new URLSearchParams(sp.toString())
  const disc = p.get('disciplina'); if (!p.get('disc') && disc) p.set('disc', disc)
  const dif = p.get('dificuldade'); if (!p.get('dif') && dif) p.set('dif', dif)
  // visão/nó/agrupamento são da Biblioteca: nunca vêm da URL desta tela
  p.delete('vis'); p.delete('no'); p.delete('ag')
  return estadoQDeParams(p)
}

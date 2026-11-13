// Segmento "de um grupo só": regra com exatamente 1 condição "está no grupo X". É o segmento que a aba Regras do Produto
// cria/reaproveita para dar uma regra (liberação/visibilidade) a um GRUPO — mesma forma do "Público rápido" com 1 grupo.
// Puro (client-safe).
import { novaCondicao, novoId, type RegraSegmento } from './tipos'

/** id do grupo se a regra é "está no grupo X" (e só isso); senão null. */
export function grupoUnicoDaRegra(r: RegraSegmento): string | null {
  if (!r || r.grupos.length !== 1) return null
  const cs = r.grupos[0].condicoes
  if (cs.length !== 1) return null
  const c = cs[0]
  if (c.campo !== 'grupo' || c.operador !== 'possui') return null
  if (c.ref) return c.ref
  if (c.refs && c.refs.length === 1) return c.refs[0]
  return null
}

/** Regra "está no grupo X". */
export function regraDoGrupo(grupoId: string): RegraSegmento {
  return { op: 'e', grupos: [{ id: novoId(), op: 'e', condicoes: [{ ...novaCondicao('grupo', grupoId), operador: 'possui' }] }] }
}

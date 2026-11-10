// Regra PURA de liberação: a meta (id do motor) pertence a este alvo (aula ou bloco de lei seca)?
//   aula: pf:i · pp:i:k · fl:i · qu:i · rf:s:i · rq:s:i · pf|fl:i:revisao:s · pf|fl:i:reforco:s · qu:i:hist:s  → liberam o material da aula i
//         (inclui a essencial EXTERNA rf:s:i: o material é o da aula i, que só abre quando a meta chega no plano do aluno)
//   lp:*  → só o bloco de lei seca que lista o id
//   jp:s  → Jurisprudência semanal: não tem documento do cronograma → nunca bloqueia nada nem libera nada
import { indiceAulaDaMeta } from './meta-ids'

export type AlvoMeta = { k: 'a'; i: number } | { k: 'lp'; ids: string[] }

export function metaDoAlvo(metaId: string, alvo: AlvoMeta): boolean {
  const t = metaId.split(':')[0]
  if (alvo.k === 'lp') return t === 'lp' && alvo.ids.includes(metaId)
  if (t === 'lp' || t === 'jp') return false
  return indiceAulaDaMeta(metaId) === alvo.i
}

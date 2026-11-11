// Regra PURA (sem servidor) de como os produtos viram cards na área de Cursos do aluno.
import type { ExtensivoCard } from './aluno'

/** Cards da área de Cursos: produtos "agrupados" entram DENTRO do card do produto-pai (se o aluno o tem); senão voltam a ser card próprio. */
export interface CardCursos { principal: ExtensivoCard; filhos: ExtensivoCard[]; largura: 1 | 2 }
export function organizarCardsCursos(produtos: ExtensivoCard[]): CardCursos[] {
  const porId = new Map(produtos.map((p) => [p.id, p]))
  const filhosDe = new Map<string, ExtensivoCard[]>()
  const proprios: ExtensivoCard[] = []
  for (const p of produtos) {
    const pai = p.cursos_modo === 'agrupado' && p.cursos_agrupar_em ? porId.get(p.cursos_agrupar_em) : undefined
    // pai precisa ser um card próprio (sem encadear grupos) — senão o produto volta a ter card próprio.
    if (pai && pai.id !== p.id && !(pai.cursos_modo === 'agrupado' && pai.cursos_agrupar_em && porId.has(pai.cursos_agrupar_em))) {
      const l = filhosDe.get(pai.id) ?? []; l.push(p); filhosDe.set(pai.id, l)
    } else proprios.push(p)
  }
  return proprios.map((p) => ({ principal: p, filhos: filhosDe.get(p.id) ?? [], largura: p.cursos_largura === 2 ? 2 : 1 }))
}

// Questões do caderno com GABARITO OCULTO (contrato: apêndice "Endurecimento de segurança"). Puro, sem DOM.
// Enquanto `gabarito_oculto` for true, o servidor manda `correta=false` em TODAS as alternativas e `comentario_professor=null`: o front
// nunca deve inferir "errada/certa" disso. Ao responder, POST /api/aluno/questao-resposta devolve `correta` (da alternativa escolhida).
export type AltCaderno = { id: string; correta: boolean; [k: string]: unknown }
export type QuestaoCaderno = { id: string; gabarito_oculto?: boolean; alternativas?: AltCaderno[]; comentario_professor?: string | null; [k: string]: unknown }

/** Pode mostrar alternativa correta/comentário do professor? (oculto => não; ausente => questão antiga/erros, com gabarito) */
export const gabaritoVisivel = (q: Pick<QuestaoCaderno, 'gabarito_oculto'>): boolean => q.gabarito_oculto !== true

/** Resultado local após responder: só sabemos se a ESCOLHIDA está certa; marca-a e mantém as demais sem "correta" (o gabarito completo só vem num próximo GET). */
export function aplicarResposta<T extends QuestaoCaderno>(q: T, escolhidaId: string, correta: boolean): T {
  if (gabaritoVisivel(q)) return q
  return { ...q, alternativas: (q.alternativas ?? []).map((a) => (a.id === escolhidaId ? { ...a, correta } : a)) }
}

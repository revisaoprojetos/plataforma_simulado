// Resolve o comentário/gabarito de uma questão objetiva a partir das fontes possíveis, na ordem:
//   1. comentário do professor (campo comentario_professor), quando existir;
//   2. gabarito comentado: junta os comentários de TODAS as alternativas comentadas (A) … B) …).
// Mostrar TODAS as alternativas comentadas (e não só a da correta) é proposital: os comentários
// do padrão PGE/AGU costumam se referenciar ("Vide comentário B"), então o gabarito só faz sentido
// completo. Se apenas uma alternativa tiver comentário, exibe só ela (com a letra).

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface AltComentario {
  ordem: number
  correta?: boolean
  comentario?: string | null
}

export function resolverComentarioGabarito(
  comentarioProfessor: string | null | undefined,
  alternativas: AltComentario[] | null | undefined,
): string | null {
  if (comentarioProfessor && String(comentarioProfessor).trim()) return String(comentarioProfessor).trim()
  const comentadas = [...(alternativas ?? [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .filter((a) => a.comentario && String(a.comentario).trim())
  if (comentadas.length) return comentadas.map((a) => `**${LETRAS[a.ordem] ?? '•'})** ${String(a.comentario).trim()}`).join('\n\n')
  return null
}

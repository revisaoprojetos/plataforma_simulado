// Resolve o comentário/gabarito de uma questão objetiva a partir das fontes possíveis:
//   1. comentário do professor (campo comentario_professor), quando existir;
//   2. gabarito comentado montado dos comentários das ALTERNATIVAS (padrão PGE/AGU).
//
// Layout do gabarito comentado (o que o aluno vê):
//   [TEXTO COMPLETO / explicação geral]   ← costuma vir embutido no comentário da CORRETA,
//                                            antes do marcador "X) CORRETA"; é extraído p/ o TOPO
//   A) …  B) …  C) …  D) …  E) …          ← cada alternativa comentada, na ordem
// A letra NÃO é duplicada quando o comentário já começa com ela (ex.: "A) INCORRETA").

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface AltComentario {
  ordem: number
  correta?: boolean
  comentario?: string | null
}

/** A alternativa já se auto-rotula? (ex.: "A) …", "A. …", "A - …", "A: …") */
function jaTemLetra(txt: string, letra: string): boolean {
  return new RegExp(`^\\s*${letra}\\s*[).\\-:]`, 'i').test(txt)
}

export function resolverComentarioGabarito(
  comentarioProfessor: string | null | undefined,
  alternativas: AltComentario[] | null | undefined,
): string | null {
  if (comentarioProfessor && String(comentarioProfessor).trim()) return String(comentarioProfessor).trim()

  const comentadas = [...(alternativas ?? [])]
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .filter((a) => a.comentario && String(a.comentario).trim())
  if (!comentadas.length) return null

  let geral = ''
  const partes: string[] = []
  for (const a of comentadas) {
    const letra = LETRAS[a.ordem] ?? '•'
    let txt = String(a.comentario).trim()
    // Na CORRETA, separa o "texto completo" (lead geral) que antecede o marcador "X) CORRETA".
    if (a.correta) {
      const m = txt.match(new RegExp(`(?:^|\\n)\\s*${letra}\\)\\s*(?:correta|certa|gabarito)`, 'i'))
      if (m && m.index != null && m.index > 0) { geral = txt.slice(0, m.index).trim(); txt = txt.slice(m.index).trim() }
    }
    partes.push(jaTemLetra(txt, letra) ? txt : `**${letra})** ${txt}`)
  }
  const corpo = partes.join('\n\n')
  return geral ? `${geral}\n\n${corpo}` : corpo
}

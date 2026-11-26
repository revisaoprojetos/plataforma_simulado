// Lógica PURA da edição ADMIN da marcação de uma resposta objetiva (sem I/O — testável).
// Regras:
//  - A marcação ORIGINAL do aluno é preservada só na PRIMEIRA edição (edições seguintes a mantêm).
//  - "Em branco" original = marcacao_editada=true + marcacao_original_alternativa_id=null.
//  - Voltar para a marcação original equivale a RESTAURAR (limpa os campos de edição).
//  - A correção (correta/pontuacao) segue o gabarito vigente da questão; a nota da sessão é recalculada
//    depois pela regra canônica (lib/simulado/nota.ts) — aqui só se decide o que gravar na resposta.

export type AltEdicao = { id: string; correta: boolean; ordem?: number | null }

export type RespostaAtual = {
  alternativa_id: string | null
  marcacao_editada?: boolean | null
  marcacao_original_alternativa_id?: string | null
} | null

export type PlanoEdicao =
  | { erro: string }
  | {
      /** 'gravar' = upsert da resposta; 'apagar' = remove a linha (volta ao "sem resposta" original). */
      acao: 'gravar' | 'apagar'
      alternativa_id: string | null
      correta: boolean | null
      pontuacao: number
      snapshot_gabarito: { alternativa_id: string; correta: boolean; letra: string } | null
      marcacao_editada: boolean
      marcacao_original_alternativa_id: string | null
      /** true quando é a 1ª edição (original acabou de ser capturada). */
      primeiraEdicao: boolean
      /** Marcação ORIGINAL do aluno (null = em branco) — para auditoria. */
      original: string | null
      restaurou: boolean
    }

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export function ordenarAlts<T extends AltEdicao>(alts: T[]): T[] {
  return [...alts].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
}

/** Letra (A–E…) de uma alternativa pela ordem; null se não achar. */
export function letraDaAlternativa(alts: AltEdicao[], id: string | null | undefined): string | null {
  if (!id) return null
  const i = ordenarAlts(alts).findIndex((a) => a.id === id)
  return i < 0 ? null : (LETRAS[i] ?? '?')
}

/**
 * Decide o que gravar ao editar a marcação.
 * @param nova alternativa escolhida pelo admin (null = deixar em branco)
 * @param restaurar true = voltar para a marcação original do aluno
 */
export function planejarEdicao(p: { alts: AltEdicao[]; atual: RespostaAtual; nova: string | null; restaurar?: boolean }): PlanoEdicao {
  const alts = ordenarAlts(p.alts)
  const atual = p.atual
  const jaEditada = !!atual?.marcacao_editada
  // Marcação original do aluno: se já editada, a guardada; senão, a marcação atual (null = em branco).
  const original: string | null = jaEditada ? (atual?.marcacao_original_alternativa_id ?? null) : (atual?.alternativa_id ?? null)

  let alvo: string | null
  if (p.restaurar) {
    if (!jaEditada) return { erro: 'Esta resposta não foi editada — não há o que restaurar.' }
    alvo = original
  } else {
    alvo = p.nova
    if (alvo !== null && !alts.some((a) => a.id === alvo)) return { erro: 'Alternativa não pertence a esta questão.' }
    if ((atual?.alternativa_id ?? null) === alvo) {
      return { erro: 'A marcação já é essa — nada a alterar.' }
    }
  }

  const restaurou = !!p.restaurar || alvo === original
  const alt = alvo ? alts.find((a) => a.id === alvo)! : null
  const snapshot = alt ? { alternativa_id: alt.id, correta: alt.correta, letra: letraDaAlternativa(alts, alt.id) ?? '?' } : null

  if (restaurou) {
    // De volta ao que o aluno marcou: limpa os campos de edição. Original em branco → remove a linha.
    if (alvo === null) {
      return { acao: 'apagar', alternativa_id: null, correta: null, pontuacao: 0, snapshot_gabarito: null, marcacao_editada: false, marcacao_original_alternativa_id: null, primeiraEdicao: false, original, restaurou: true }
    }
    return { acao: 'gravar', alternativa_id: alvo, correta: alt!.correta, pontuacao: alt!.correta ? 1 : 0, snapshot_gabarito: snapshot, marcacao_editada: false, marcacao_original_alternativa_id: null, primeiraEdicao: false, original, restaurou: true }
  }

  return {
    acao: 'gravar',
    alternativa_id: alvo,
    // Em branco editado: mantém a linha (guarda a original) mas sem acerto/erro — não conta na nota (nem CEBRASPE).
    correta: alt ? alt.correta : null,
    pontuacao: alt && alt.correta ? 1 : 0,
    snapshot_gabarito: snapshot,
    marcacao_editada: true,
    marcacao_original_alternativa_id: original,
    primeiraEdicao: !jaEditada,
    original,
    restaurou: false,
  }
}

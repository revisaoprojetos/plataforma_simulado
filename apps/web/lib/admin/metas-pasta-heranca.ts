// Herança PURA (sem I/O) da tela "Metas por pasta": tipo de material e disciplina efetivos de cada pasta.
// Mesmo critério do adaptativo (conteudo-banco.ts / meta-extras-server.ts): sobe por pai_id até a primeira pasta que marca.

import type { TipoMaterial } from './metas-pasta-tipos'

export const TIPOS_VALIDOS: ReadonlySet<string> = new Set(['pdfull', 'pdfight', 'pdflash', 'legproc', 'jurisclub', 'questoes'])
export const TIPO_PADRAO: TipoMaterial = 'pdfull'
/** Trava contra árvores absurdas/ciclos que escapem do `visto`. */
export const PROFUNDIDADE_MAX = 64

export interface PastaHeranca {
  id: string
  paiId: string | null
  disciplinaId: string | null
  tipoMaterial: string | null
}

export interface HerancaPasta {
  tipoEfetivo: TipoMaterial
  /** Id da pasta que originou o tipo (null = padrão pdfull). */
  origemTipoId: string | null
  disciplinaId: string | null
  /** Id da pasta que originou a disciplina (ela mesma ou ancestral). */
  origemDisciplinaId: string | null
}

/** Calcula a herança de TODAS as pastas numa passada (memoizada; tolera ciclo e pai inexistente). */
export function calcularHeranca(pastas: PastaHeranca[], slugsValidos: ReadonlySet<string> = TIPOS_VALIDOS): Map<string, HerancaPasta> {
  const porId = new Map(pastas.map((p) => [p.id, p]))
  const memo = new Map<string, HerancaPasta>()

  const resolver = (id: string): HerancaPasta => {
    const pronto = memo.get(id)
    if (pronto) return pronto
    const caminho: string[] = []
    const visto = new Set<string>()
    let cur: string | null = id
    let base: HerancaPasta | null = null
    while (cur && !visto.has(cur) && caminho.length < PROFUNDIDADE_MAX) {
      const m = memo.get(cur)
      if (m) { base = m; break }
      const p = porId.get(cur)
      if (!p) break
      visto.add(cur)
      caminho.push(cur)
      cur = p.paiId
    }
    // Da raiz para a folha: cada pasta herda do pai já resolvido, sobrescrevendo com a própria marcação.
    let acima: HerancaPasta = base ?? { tipoEfetivo: TIPO_PADRAO, origemTipoId: null, disciplinaId: null, origemDisciplinaId: null }
    for (let i = caminho.length - 1; i >= 0; i--) {
      const p = porId.get(caminho[i])!
      const t = p.tipoMaterial && slugsValidos.has(p.tipoMaterial) ? p.tipoMaterial : null
      acima = {
        tipoEfetivo: t ?? acima.tipoEfetivo,
        origemTipoId: t ? p.id : acima.origemTipoId,
        disciplinaId: p.disciplinaId ?? acima.disciplinaId,
        origemDisciplinaId: p.disciplinaId ? p.id : acima.origemDisciplinaId,
      }
      memo.set(p.id, acima)
    }
    return memo.get(id) ?? acima
  }

  for (const p of pastas) resolver(p.id)
  return memo
}

/** Ids de TODAS as descendentes de `raizId` (exclui a raiz), tolerante a ciclo. */
export function descendentes(pastas: { id: string; paiId: string | null }[], raizId: string): string[] {
  const filhos = new Map<string, string[]>()
  for (const p of pastas) if (p.paiId) filhos.set(p.paiId, [...(filhos.get(p.paiId) ?? []), p.id])
  const out: string[] = []
  const visto = new Set<string>([raizId])
  const pilha = [raizId]
  while (pilha.length) {
    const c = pilha.pop()!
    for (const f of filhos.get(c) ?? []) if (!visto.has(f)) { visto.add(f); out.push(f); pilha.push(f) }
  }
  return out
}

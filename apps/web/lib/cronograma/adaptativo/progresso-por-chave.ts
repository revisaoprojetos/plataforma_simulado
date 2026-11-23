import { parteAula } from './remap-as'

/**
 * PROGRESSO PRESO AO DOCUMENTO (módulo PURO, testado em __tests__/progresso-por-chave.test.ts).
 *
 * Cada linha de progresso (simulado_cronograma_adaptativo_meta) guarda, além do meta_id POSICIONAL (pf:<idx>…), a chave estável da aula
 * (`aula_key` = d:<uuid>|t:<disc>|<tema>|c:<id>) vigente quando a linha foi gravada. Se a posição daquela chave no AS atual mudou, a linha
 * deve acompanhar o DOCUMENTO (meta_id novo), mesmo que a assinatura do plano esteja carimbada errada.
 * Conservador: só age onde aula_key existe, a chave existe UMA vez no AS atual e o destino não colide com outra linha.
 */

export interface LinhaChave { meta_id: string; aula_key?: string | null }
export interface CorrecaoChave { de: string; para: string; chave: string; idxAntigo: number; idxNovo: number }
export interface IgnoradaChave { id: string; motivo: 'chave_ausente_no_as' | 'chave_duplicada_no_as' | 'destino_ocupado' | 'destino_duplicado' }
export interface ResultadoCorrecao { correcoes: CorrecaoChave[]; ignoradas: IgnoradaChave[] }

/** Chave da aula de uma meta posicional segundo o AS dado (null = meta sem aula: lp/jp/og ou índice fora do AS). */
export function aulaKeyDoMetaId(metaId: string, chaves: readonly string[] | null | undefined): string | null {
  const p = parteAula(metaId)
  if (!p || !chaves) return null
  const k = chaves[p.idx]
  return typeof k === 'string' && k && !k.startsWith('?:') ? k : null
}

/** id com a mesma forma de `metaId`, trocando o índice da aula. */
export function idComIndice(metaId: string, idx: number): string | null {
  const p = parteAula(metaId)
  return p ? `${p.pre}${idx}${p.pos}` : null
}

export function corrigirProgressoPorChave(linhas: readonly LinhaChave[], chavesAtuais: readonly string[]): ResultadoCorrecao {
  const ignoradas: IgnoradaChave[] = []
  const contagem = new Map<string, number>(), posicao = new Map<string, number>()
  chavesAtuais.forEach((k, i) => { contagem.set(k, (contagem.get(k) ?? 0) + 1); if (!posicao.has(k)) posicao.set(k, i) })

  let cand: CorrecaoChave[] = []
  for (const l of linhas) {
    const p = parteAula(l.meta_id)
    if (!p || !l.aula_key) continue
    if (chavesAtuais[p.idx] === l.aula_key) continue // já está na aula certa
    const novo = posicao.get(l.aula_key)
    if (novo == null) { ignoradas.push({ id: l.meta_id, motivo: 'chave_ausente_no_as' }); continue }
    if ((contagem.get(l.aula_key) ?? 0) > 1) { ignoradas.push({ id: l.meta_id, motivo: 'chave_duplicada_no_as' }); continue }
    const para = idComIndice(l.meta_id, novo)!
    cand.push({ de: l.meta_id, para, chave: l.aula_key, idxAntigo: p.idx, idxNovo: novo })
  }

  // colisões: destino duplicado entre candidatos ou ocupado por linha que NÃO está saindo (itera até estabilizar)
  const existentes = new Set(linhas.map((l) => l.meta_id))
  for (;;) {
    const saindo = new Set(cand.map((c) => c.de))
    const porDestino = new Map<string, number>()
    for (const c of cand) porDestino.set(c.para, (porDestino.get(c.para) ?? 0) + 1)
    const ruins = cand.filter((c) => (porDestino.get(c.para) ?? 0) > 1 || (existentes.has(c.para) && !saindo.has(c.para)))
    if (!ruins.length) break
    const set = new Set(ruins)
    for (const c of ruins) ignoradas.push({ id: c.de, motivo: (porDestino.get(c.para) ?? 0) > 1 ? 'destino_duplicado' : 'destino_ocupado' })
    cand = cand.filter((c) => !set.has(c))
  }
  return { correcoes: cand, ignoradas }
}

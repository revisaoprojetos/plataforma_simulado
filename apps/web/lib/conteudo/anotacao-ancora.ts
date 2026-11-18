// ÂNCORA DE TEXTO das anotações/grifos de texto (simulado_conteudo_anotacoes: docx/LegProc). O vínculo é por uid de trecho
// + offsets + `texto_ancora` (exact). Este módulo PURO reforça a reconciliação: antes de marcar 'alterada'/'órfã', tenta
// RE-LOCALIZAR o `texto_ancora` (exact + contexto) no trecho novo e, p/ órfã, em todos os trechos novos. Nada é apagado.
export const CTX = 40
const MIN_ORFA = 20 // busca entre trechos só p/ trechos longos o bastante p/ serem únicos

export interface AnotacaoRef { texto_ancora: string; inicio_offset: number; fim_offset: number; contexto_antes?: string | null; contexto_depois?: string | null }
export interface Localizacao { inicio: number; fim: number; metodo: 'offset' | 'unico' | 'contexto'; contextoAntes: string; contextoDepois: string }

const ocorrencias = (t: string, alvo: string) => { const o: number[] = []; for (let p = t.indexOf(alvo); p >= 0; p = t.indexOf(alvo, p + 1)) o.push(p); return o }
const comum = (a: string, b: string, fim: boolean) => { let n = 0; while (n < a.length && n < b.length && (fim ? a[a.length - 1 - n] === b[b.length - 1 - n] : a[n] === b[n])) n++; return n }

/** Contexto efetivo da anotação: colunas gravadas, senão derivado do texto ANTIGO do trecho quando os offsets ainda casam com ele. */
export function contextoDe(an: AnotacaoRef, textoAntigo?: string | null): { antes: string; depois: string } {
  if (an.contexto_antes || an.contexto_depois) return { antes: an.contexto_antes ?? '', depois: an.contexto_depois ?? '' }
  if (textoAntigo && textoAntigo.slice(an.inicio_offset, an.fim_offset) === an.texto_ancora)
    return { antes: textoAntigo.slice(Math.max(0, an.inicio_offset - CTX), an.inicio_offset), depois: textoAntigo.slice(an.fim_offset, an.fim_offset + CTX) }
  return { antes: '', depois: '' }
}

/** Acha o `texto_ancora` no `textoNovo` do MESMO trecho. null = não está (ou ambíguo sem contexto) → o chamador mantém 'alterada'. */
export function localizarNoTrecho(an: AnotacaoRef, textoNovo: string, textoAntigo?: string | null): Localizacao | null {
  const alvo = String(an.texto_ancora ?? ''); if (!alvo.trim()) return null
  const mk = (p: number, metodo: Localizacao['metodo']): Localizacao => ({ inicio: p, fim: p + alvo.length, metodo, contextoAntes: textoNovo.slice(Math.max(0, p - CTX), p), contextoDepois: textoNovo.slice(p + alvo.length, p + alvo.length + CTX) })
  if (textoNovo.slice(an.inicio_offset, an.fim_offset) === alvo) return mk(an.inicio_offset, 'offset') // intacto onde estava
  const pos = ocorrencias(textoNovo, alvo); if (!pos.length) return null
  if (pos.length === 1) return mk(pos[0], 'unico')
  const { antes, depois } = contextoDe(an, textoAntigo)
  if (!antes && !depois) return null
  const sc = pos.map((p) => {
    const a = antes ? comum(antes, textoNovo.slice(Math.max(0, p - antes.length), p), true) / antes.length : 0
    const d = depois ? comum(depois, textoNovo.slice(p + alvo.length, p + alvo.length + depois.length), false) / depois.length : 0
    return { p, s: (a + d) / ((antes ? 1 : 0) + (depois ? 1 : 0)) }
  }).sort((x, y) => y.s - x.s)
  return sc[0].s >= 0.5 && sc[0].s - sc[1].s >= 0.25 ? mk(sc[0].p, 'contexto') : null
}

/** Órfã (uid sumiu): acha o `texto_ancora` em TODOS os trechos novos; só aceita se for único no documento. */
export function localizarEntreTrechos(an: AnotacaoRef, trechos: { uid: string; texto: string }[]): (Localizacao & { uid: string }) | null {
  const alvo = String(an.texto_ancora ?? ''); if (alvo.trim().length < MIN_ORFA) return null
  const achados: { uid: string; p: number; texto: string }[] = []
  for (const t of trechos) for (const p of ocorrencias(t.texto, alvo)) { achados.push({ uid: t.uid, p, texto: t.texto }); if (achados.length > 1) return null }
  if (achados.length !== 1) return null
  const { uid, p, texto } = achados[0]
  return { uid, inicio: p, fim: p + alvo.length, metodo: 'unico', contextoAntes: texto.slice(Math.max(0, p - CTX), p), contextoDepois: texto.slice(p + alvo.length, p + alvo.length + CTX) }
}

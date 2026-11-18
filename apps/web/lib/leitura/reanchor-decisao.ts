// Decisão CONSERVADORA sobre o que fazer com um grifo quando o texto (espinha S) do documento muda (puro, sem I/O).
// Regra de ouro: grifo de aluno nunca é apagado e, na dúvida, NÃO é tocado.
//  - 'manter'  : o `exact` ainda existe em S (literal OU com espaçamento/aspas/travessões normalizados). Não mexe em
//                nada (nem offsets): o cliente reancora por texto. Isso protege contra a espinha do servidor diferir
//                da do cliente (leitor juris injeta numeral/aspas/rótulos; Lei Seca move células e troca tags).
//  - 'ajustar' : o texto realmente mudou e o que sobrou é de ALTA confiança → encurta/divide.
//  - 'revisar' : sumiu ou só sobrou algo de baixa confiança → só marca revisao_necessaria (sem alterar posições).
import { reancorarParcial, type AncoraParcial, type TrechoGrifo } from './reanchor-parcial'

/** Forma comparável: NBSP/espaços colapsados, aspas curvas→retas, travessões→hífen, minúsculas não (preserva caso). */
export function normalizarParaComparar(s: string): string {
  return s
    .replace(/[   ​﻿]/g, ' ')
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
const semEspaco = (s: string) => normalizarParaComparar(s).replace(/\s+/g, '')
const naoEsp = (s: string) => s.replace(/\s+/g, '').length

/** O `exact` existe em S de alguma forma (literal, normalizado ou ignorando todo espaçamento)? */
export function textoPresente(S: string, exact: string): boolean {
  if (!exact || !exact.trim()) return false
  if (S.includes(exact)) return true
  const nS = normalizarParaComparar(S), nE = normalizarParaComparar(exact)
  if (nE && nS.includes(nE)) return true
  const cE = semEspaco(exact)
  return !!cE && semEspaco(S).includes(cE)
}

export type DecisaoAjuste =
  | { acao: 'manter'; reposicionado?: TrechoGrifo }
  | { acao: 'ajustar'; trechos: TrechoGrifo[] }
  | { acao: 'revisar' }

const MIN_NAO_ESP = 25
const MIN_FRACAO = 0.6
const MIN_PEDACO = 12

/** Contexto coerente: o prefix (ou o suffix) original ainda cerca o que sobrou. Sem contexto original → coerente. */
function contextoCoerente(S: string, a: AncoraParcial, trechos: TrechoGrifo[]): boolean {
  const pre = semEspaco(a.prefix ?? '').slice(-10)
  const suf = semEspaco(a.suffix ?? '').slice(0, 10)
  if (!pre && !suf) return true
  const first = trechos[0], last = trechos[trechos.length - 1]
  let ok = false
  if (pre.length >= 4) ok = ok || semEspaco(S.slice(Math.max(0, first.inicio - 400), first.inicio + 20)).includes(pre)
  if (suf.length >= 4) ok = ok || semEspaco(S.slice(Math.max(0, last.fim - 20), last.fim + 400)).includes(suf)
  return ok
}

export function decidirAjuste(S: string, a: AncoraParcial): DecisaoAjuste {
  const ex = a.exact
  if (!ex || !ex.trim()) return { acao: 'revisar' }
  if (textoPresente(S, ex)) {
    // Achado literalmente: só reposiciona (mesmo texto, seguro) — usado no carry-over p/ nova versão. No save in-place NÃO se usa.
    if (S.includes(ex)) return { acao: 'manter', reposicionado: reancorarParcial(S, a)[0] }
    return { acao: 'manter' }
  }
  const seg = reancorarParcial(S, a)
  if (!seg.length) return { acao: 'revisar' }
  const orig = naoEsp(ex)
  const total = seg.reduce((s, t) => s + naoEsp(t.exact), 0)
  const alta = (total >= MIN_NAO_ESP || total >= orig * MIN_FRACAO)
    && seg.every((t) => naoEsp(t.exact) >= MIN_PEDACO)
    && contextoCoerente(S, a, seg)
  return alta ? { acao: 'ajustar', trechos: seg } : { acao: 'revisar' }
}

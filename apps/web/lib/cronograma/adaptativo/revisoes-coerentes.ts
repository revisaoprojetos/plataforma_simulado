import type { Grade } from './grade-diff'

// INVARIANTE: a revisão (PDFlash `fl:<aula>`) e as questões (`qu:<aula>`) de uma aula só fazem sentido DEPOIS do estudo (`pf:<aula>`).
// Quando o aluno desmarca o PDFull (ou o catálogo desloca a aula), a revisão agendada para antes do estudo vira "REVISÃO" de conteúdo novo
// (incidente Welber, 19/11). Esta função devolve os ajustes que recolocam a revisão depois do estudo — SÓ nas aulas cujo PDFull NÃO está feito.
// Questões de histórico (`qu:<aula>:hist:*`) são diagnóstico ANTES do estudo por desenho e nunca são tocadas.

/** Distância padrão (dias) entre PDFull → PDFlash e PDFlash → questões (medianas dos planos reais: 8 e ~6). */
export const GAP_FLASH_DIAS = 8
export const GAP_QUESTOES_DIAS = 6

const soma = (iso: string, n: number): string => {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, (m || 1) - 1, (d || 1) + n)).toISOString().slice(0, 10)
}

export interface AjusteRevisao { id: string; de: string; para: string }

export function revisoesAntesDoEstudo(plano: Grade, feitas: ReadonlySet<string>): AjusteRevisao[] {
  const out: AjusteRevisao[] = []
  for (const id of Object.keys(plano)) {
    const m = /^pf:(\d{1,6})$/.exec(id); if (!m) continue
    if (feitas.has(id)) continue // estudo feito: a revisão antes dele é problema de outro tipo, não mexe
    const k = m[1], pf = plano[id][0]
    const fl = plano['fl:' + k], qu = plano['qu:' + k]
    let flDestino: string | null = null
    if (fl && fl[0] < pf) { flDestino = soma(pf, GAP_FLASH_DIAS); out.push({ id: 'fl:' + k, de: fl[0], para: flDestino }) }
    if (qu && qu[0] < pf) out.push({ id: 'qu:' + k, de: qu[0], para: soma(flDestino ?? pf, flDestino ? GAP_QUESTOES_DIAS : GAP_FLASH_DIAS + GAP_QUESTOES_DIAS) })
  }
  return out
}

export function aplicarAjustes(plano: Grade, ajustes: AjusteRevisao[]): Grade {
  if (!ajustes.length) return plano
  const novo: Grade = { ...plano }
  for (const a of ajustes) if (novo[a.id]) novo[a.id] = [a.para, novo[a.id][1]]
  return novo
}

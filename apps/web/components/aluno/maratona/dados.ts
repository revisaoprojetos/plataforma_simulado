// Dados MOCK da Maratona (porte fiel do design MARATONADESIMULADOS). FASE 2: virão do admin/resultados reais.
// Medalhas mostradas BLOQUEADAS (aluno com 0 simulados feitos); ao concluir, troca pela versão conquistada.

export const PERCURSO = [
  { name: 'Aeroporto', code: 'LARGADA', km: '0', local: 'Aeroporto de Brasília', medal: null as string | null },
  { name: 'AGU', code: 'PC 1 · 17/10', km: '21', local: 'SAS Qd. 3', medal: 'medalha-agu-bloqueada.png' },
  { name: 'PGF', code: 'PC 2 · 24/10', km: '28', local: 'SAUN Qd. 5 [a confirmar]', medal: 'medalha-pgf-bloqueada.png' },
  { name: 'PGFN', code: 'PASSAGEM · 31/10', km: '35', local: 'SAUN Qd. 5', medal: 'medalha-pgfn-bloqueada.png' },
  { name: 'Ed. II da AGU', code: 'CHEGADA · 31/10', km: '42,195', local: 'SAUN Qd. 5, Lote C', medal: 'medalha-ed-ii-agu-bloqueada.png' },
]

export const SIMULADOS = [
  { label: 'Simulado 1 · 17/10', dest: 'AGU', km: '21', medalImg: 'medalha-agu-bloqueada.png' },
  { label: 'Simulado 2 · 24/10', dest: 'PGF', km: '28', medalImg: 'medalha-pgf-bloqueada.png' },
  { label: 'Simulado 3 · 31/10', dest: 'PGFN e chegada', km: '42,195', medalImg: 'medalha-ed-ii-agu-bloqueada.png' },
]

export const MEDALHAS = [
  { img: 'medalha-agu-bloqueada.png', txt: 'Simulado 1 · 17/10 · AGU' },
  { img: 'medalha-pgf-bloqueada.png', txt: 'Simulado 2 · 24/10 · PGF' },
  { img: 'medalha-pgfn-bloqueada.png', txt: 'Simulado 3 · 31/10 · passagem PGFN' },
  { img: 'medalha-ed-ii-agu-bloqueada.png', txt: 'Simulado 3 · 31/10 · chegada' },
]

export const SEMANAS = [
  { nome: 'Semana 1', data: '17/10', pontos: 'Simulado 1 · AGU', km: ['21'] },
  { nome: 'Semana 2', data: '24/10', pontos: 'Simulado 2 · PGF', km: ['28'] },
  { nome: 'Semana 3', data: '31/10', pontos: 'Simulado 3 · PGFN e chegada', km: ['35', '42,195'] },
]

// Ranking de exemplo (números de peito) — mesma semente do design. Troca por resultados reais na fase 2.
const NUMS = ['0142', '0007', '0389', '0051', '0233', '0410', '0018', '0297', '0076', '0315', '0128', '0064']
export function rankingSemana(wk: number): { n: string; pts: number; v: number }[] {
  const isGeral = wk === 3
  const seed = (wk + 1) * 7
  const order = NUMS.map((n, i) => ({ n, k: (i * 37 + seed * 13) % 97 })).sort((a, b) => a.k - b.k).map((x) => x.n)
  const maxPts = isGeral ? 420 : (wk === 2 ? 150 : 140)
  return order.slice(0, 10).map((n, i) => ({ n, pts: Math.max(0, maxPts - i * 7 - ((i * 3 + seed) % 6)), v: ((i * 5 + seed) % 7) - 3 }))
}

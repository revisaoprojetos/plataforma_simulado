import 'server-only'
import { DADOS_PREVIA } from '@/lib/teste/previa-dados'
import { slugVar, type QuestaoSim } from '@/lib/teste/simulado-dados'

// Cálculo dos DADOS da prévia a partir do simulado selecionado + reguladores (sliders). MESMA regra do
// relatório real (e do lab do Teste): dentro de cada disciplina, as PRIMEIRAS `acertos` questões (na ordem
// do simulado) são CERTAS e o resto ERRADAS → disciplinas (laço), assuntos das erradas, pilares + vars por
// slug. Compartilhado entre o lab do Teste e o da Biblioteca (mesmas funções nas 3 empresas).

const pct = (a: number, t: number) => (t > 0 ? `${Math.round((a / t) * 100)}%` : '0%')

export interface PreviaPayload {
  simuladoTitulo?: string
  disciplinas: { nome: string; acertos: number; total: number }[]
  questoes?: QuestaoSim[]
}

export function computarPreviaDados(payload: PreviaPayload): Record<string, unknown> {
  const discs = payload.disciplinas || []
  const questoes = payload.questoes || []
  const acertosDe = new Map(discs.map((d) => [d.nome, Math.max(0, Math.min(d.acertos || 0, d.total || 0))]))

  const byDisc = new Map<string, QuestaoSim[]>()
  for (const q of questoes) { const arr = byDisc.get(q.disciplina) ?? []; arr.push(q); byDisc.set(q.disciplina, arr) }
  const assuntosErr = new Map<string, Set<string>>()
  const pilarAc = new Map<string, number>(), pilarTot = new Map<string, number>()
  for (const [disc, qs] of byDisc) {
    qs.sort((a, b) => a.ordem - b.ordem)
    const nAc = acertosDe.get(disc) ?? 0
    qs.forEach((q, i) => {
      const certa = i < nAc
      if (q.pilar) { pilarTot.set(q.pilar, (pilarTot.get(q.pilar) ?? 0) + 1); if (certa) pilarAc.set(q.pilar, (pilarAc.get(q.pilar) ?? 0) + 1) }
      if (!certa && q.assunto) { const s = assuntosErr.get(disc) ?? new Set<string>(); s.add(q.assunto); assuntosErr.set(disc, s) }
    })
  }

  const total = discs.reduce((s, d) => s + (d.total || 0), 0)
  const acertos = discs.reduce((s, d) => s + (acertosDe.get(d.nome) ?? 0), 0)
  const assuntosDe = (nome: string) => [...(assuntosErr.get(nome) ?? [])].map((x) => `- ${x}`).join('\n')
  const disciplinas = discs.map((d) => {
    const a = acertosDe.get(d.nome) ?? 0
    return { nome: d.nome, assuntos: assuntosDe(d.nome), acertos: String(a), total: String(d.total || 0), pct: pct(a, d.total || 0) }
  })

  const pv = (nome: string, chave: string) => {
    const t = pilarTot.get(nome) ?? 0, a = pilarAc.get(nome) ?? 0
    const n = t ? Math.round((a / t) * 100) : 0
    return { [`${chave}_pct`]: `${n}%`, [`${chave}_acertos`]: String(a), [`${chave}_total`]: String(t), [`${chave}_f1`]: n <= 49, [`${chave}_f2`]: n >= 50 && n <= 80, [`${chave}_f3`]: n >= 81 }
  }

  const slugVars: Record<string, string> = {}
  for (const d of discs) {
    const s = slugVar(d.nome), a = acertosDe.get(d.nome) ?? 0
    slugVars[`acerto_${s}`] = String(a); slugVars[`total_${s}`] = String(d.total || 0); slugVars[`pct_${s}`] = pct(a, d.total || 0); slugVars[`assuntos_${s}`] = assuntosDe(d.nome)
  }
  for (const nome of ['Lei seca', 'Jurisprudência', 'Doutrina']) {
    const s = slugVar(nome), t = pilarTot.get(nome) ?? 0, a = pilarAc.get(nome) ?? 0
    slugVars[`acerto_pilar_${s}`] = String(a); slugVars[`total_pilar_${s}`] = String(t); slugVars[`pct_pilar_${s}`] = pct(a, t)
  }

  return {
    ...DADOS_PREVIA,
    simulado: payload.simuladoTitulo || DADOS_PREVIA.simulado,
    acertos: String(acertos), total_questoes: String(total), percentual: pct(acertos, total), erros: String(Math.max(0, total - acertos)),
    disciplinas,
    ...pv('Lei seca', 'ls'), ...pv('Jurisprudência', 'jur'), ...pv('Doutrina', 'dout'),
    ...slugVars,
  }
}

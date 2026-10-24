'use server'

import { DADOS_PREVIA } from '@/lib/teste/previa-dados'
import { escreverPrevia, limparPrevia, versaoPrevia } from '@/lib/teste/store'
import { carregarQuestoesSimulado, carregarPicker, slugVar } from '@/lib/teste/simulado-dados'
import type { QuestaoSim, PickerPasta as LPP, PickerSim as LPS } from '@/lib/teste/simulado-dados'

// Server actions do laboratório da PRÉVIA (chamadas pelos componentes React). A lógica de dados mora em
// lib/teste/simulado-dados.ts (compartilhada com as rotas de API do plugin do OnlyOffice).
export type PickerPasta = LPP
export type PickerSim = LPS

/** Questões do simulado (ordem/disciplina/assunto/pilar) + disciplinas com contagem (pros sliders). */
export async function obterDisciplinasDoSimulado(simuladoId: string) {
  return carregarQuestoesSimulado(simuladoId)
}

/** Dados do PICKER (pop-up): árvore de pastas + simulados com capa/visual. */
export async function carregarPickerSimulados() {
  return carregarPicker('simulado')
}

/** Dados do PICKER — aba DESAFIOS: pastas de desafio (maratona…) + simulados INTERNOS delas. */
export async function carregarPickerDesafios() {
  return carregarPicker('desafio')
}

const pct = (a: number, t: number) => (t > 0 ? `${Math.round((a / t) * 100)}%` : '0%')

/** Recebe o estado dos reguladores + as questões e grava o objeto que a /preview vai renderizar.
 *  REGRA (igual ao relatório real): dentro de cada disciplina, as PRIMEIRAS `acertos` questões (na ordem
 *  do simulado) contam como CERTAS e o resto como ERRADAS. Daí saem: disciplinas (laço), assuntos das
 *  ERRADAS, pilares (Lei seca/Jurisprudência/Doutrina) + as variáveis por-SLUG do relatório real
 *  (acerto_<disc>, pct_<disc>, assuntos_<disc>, pct_pilar_<p>…) — pra montar templates no padrão real. */
export async function aplicarPreviaSimulado(
  id: string,
  payload: { simuladoTitulo?: string; disciplinas: { nome: string; acertos: number; total: number }[]; questoes?: QuestaoSim[] },
): Promise<{ version: string; erro?: string }> {
  try {
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
        for (const p of (q.pilares?.length ? q.pilares : (q.pilar ? [q.pilar] : []))) { pilarTot.set(p, (pilarTot.get(p) ?? 0) + 1); if (certa) pilarAc.set(p, (pilarAc.get(p) ?? 0) + 1) }
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

    // Pilar (card) → %, acertos/total + flags de FAIXA (só a faixa do intervalo aparece, igual caderno).
    const pv = (nome: string, chave: string) => {
      const t = pilarTot.get(nome) ?? 0, a = pilarAc.get(nome) ?? 0
      const n = t ? Math.round((a / t) * 100) : 0
      return { [`${chave}_pct`]: `${n}%`, [`${chave}_acertos`]: String(a), [`${chave}_total`]: String(t), [`${chave}_f1`]: n <= 49, [`${chave}_f2`]: n >= 50 && n <= 80, [`${chave}_f3`]: n >= 81 }
    }

    // Variáveis por SLUG (padrão do relatório real) — pra templates montados por disciplina/pilar.
    const slugVars: Record<string, string> = {}
    for (const d of discs) {
      const s = slugVar(d.nome), a = acertosDe.get(d.nome) ?? 0
      slugVars[`acerto_${s}`] = String(a); slugVars[`total_${s}`] = String(d.total || 0); slugVars[`pct_${s}`] = pct(a, d.total || 0); slugVars[`assuntos_${s}`] = assuntosDe(d.nome)
    }
    for (const nome of ['Lei seca', 'Jurisprudência', 'Doutrina']) {
      const s = slugVar(nome), t = pilarTot.get(nome) ?? 0, a = pilarAc.get(nome) ?? 0
      slugVars[`acerto_pilar_${s}`] = String(a); slugVars[`total_pilar_${s}`] = String(t); slugVars[`pct_pilar_${s}`] = pct(a, t)
    }

    const data = {
      ...DADOS_PREVIA,
      simulado: payload.simuladoTitulo || DADOS_PREVIA.simulado,
      acertos: String(acertos), total_questoes: String(total), percentual: pct(acertos, total), erros: String(Math.max(0, total - acertos)),
      disciplinas,
      ...pv('Lei seca', 'ls'), ...pv('Jurisprudência', 'jur'), ...pv('Doutrina', 'dout'),
      ...slugVars,
    }
    await escreverPrevia(id, data)
    return { version: await versaoPrevia(id) }
  } catch (e) {
    return { version: String(Date.now()), erro: `Falha ao aplicar: ${(e as any)?.message || String(e)}` }
  }
}

/** Reseta a prévia para o exemplo estático (usado ao abrir o laboratório). */
export async function resetarPrevia(id: string): Promise<{ ok: true }> {
  await limparPrevia(id)
  return { ok: true }
}

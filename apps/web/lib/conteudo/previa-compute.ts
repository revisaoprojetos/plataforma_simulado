import 'server-only'
import { DADOS_PREVIA } from '@/lib/teste/previa-dados'
import { slugVar, type QuestaoSim } from '@/lib/teste/simulado-dados'

// Cálculo dos DADOS da prévia a partir do simulado selecionado + reguladores (sliders). MESMA regra do
// relatório real (e do lab do Teste): dentro de cada disciplina, as PRIMEIRAS `acertos` questões (na ordem
// do simulado) são CERTAS e o resto ERRADAS → disciplinas (laço), assuntos das erradas, pilares + vars por
// slug. FONTE ÚNICA compartilhada entre o lab do Teste e o da Biblioteca (mesmas funções nas 3 empresas).
//
// CONTRATO ÚNICO DE VARIÁVEIS (100% adaptativo — ver `emitir`): para TODA agrupação (geral, cada disciplina,
// cada pilar/sub-pilar) geramos o MESMO conjunto, de modo que qualquer `{X_pct}` tenha sempre `{X_acertos}`,
// `{X_total}` e as faixas `{#X_f1}`/`{#X_f2}`/`{#X_f3}` CASADAS com o %. Assim o card do plugin (sufixo
// `<slug>_*`) e os templates antigos (prefixo `pct_pilar_*` / `pct_*`) funcionam, a faixa NUNCA dessincroniza
// e um tipo novo de agrupação entra "de graça" — basta reusar o helper, sem tocar em template nem em deploy.

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
      for (const p of (q.pilares?.length ? q.pilares : (q.pilar ? [q.pilar] : []))) { pilarTot.set(p, (pilarTot.get(p) ?? 0) + 1); if (certa) pilarAc.set(p, (pilarAc.get(p) ?? 0) + 1) }
      if (!certa && q.assunto) { const s = assuntosErr.get(disc) ?? new Set<string>(); s.add(q.assunto); assuntosErr.set(disc, s) }
    })
  }

  const total = discs.reduce((s, d) => s + (d.total || 0), 0)
  const acertos = discs.reduce((s, d) => s + (acertosDe.get(d.nome) ?? 0), 0)
  const assuntosDe = (nome: string) => [...(assuntosErr.get(nome) ?? [])].map((x) => `- ${x}`).join('\n')
  const faixa = (n: number) => ({ f1: n <= 49, f2: n >= 50 && n <= 80, f3: n >= 81 })
  const disciplinas = discs.map((d) => {
    const a = acertosDe.get(d.nome) ?? 0, t = d.total || 0, n = t ? Math.round((a / t) * 100) : 0
    // flags de faixa TAMBÉM dentro do laço {#disciplinas} → card por disciplina pode usar {#f1}/{#f2}/{#f3}.
    return { nome: d.nome, assuntos: assuntosDe(d.nome), acertos: String(a), total: String(t), pct: pct(a, t), ...faixa(n) }
  })

  // ===== Emissão universal: <slug>_pct/_acertos/_total + faixas <slug>_f1/_f2/_f3 (casadas com o %). =====
  // Rótulo e nível da faixa (p/ usar numa frase ÚNICA, sem condicional): ex. "Desempenho {slug_nivel}".
  const faixaRotulo = (n: number) => (n <= 49 ? '0-49' : n <= 80 ? '50-80' : '81-100')
  const faixaNivel = (n: number) => (n <= 49 ? 'crítico' : n <= 80 ? 'intermediário' : 'excelente')
  const out: Record<string, unknown> = {}
  const emitir = (slug: string, a: number, t: number) => {
    if (!slug) return
    const n = t ? Math.round((a / t) * 100) : 0
    out[`${slug}_pct`] = `${n}%`; out[`${slug}_acertos`] = String(a); out[`${slug}_total`] = String(t)
    const f = faixa(n); out[`${slug}_f1`] = f.f1; out[`${slug}_f2`] = f.f2; out[`${slug}_f3`] = f.f3
    // Variáveis-ÚNICAS da medição da faixa (sem condicional): rótulo numérico + nível textual.
    out[`${slug}_faixa`] = faixaRotulo(n); out[`${slug}_nivel`] = faixaNivel(n)
  }

  // GERAL (nota do simulado) — permite {geral_pct} + faixa {#geral_f1}… no cabeçalho.
  emitir('geral', acertos, total)

  // DISCIPLINAS — sufixo <slug>_* (com faixa) + aliases de PREFIXO (pct_/acerto_/total_/assuntos_) p/ compat.
  for (const d of discs) {
    const s = slugVar(d.nome), a = acertosDe.get(d.nome) ?? 0, t = d.total || 0
    emitir(s, a, t)
    out[`acerto_${s}`] = String(a); out[`total_${s}`] = String(t); out[`pct_${s}`] = pct(a, t); out[`assuntos_${s}`] = assuntosDe(d.nome)
  }

  // PILARES + SUB-PILARES — os 3 canônicos SEMPRE (mesmo 0, p/ templates genéricos) + TODOS os presentes
  // (inclui STF/STJ/Sistemas Internacionais). Para cada um: sufixo pelo slug completo + chave CURTA canônica
  // (ls/jur/dout, compat com o bloco pronto) + aliases de prefixo (pct_pilar_/acerto_pilar_/total_pilar_).
  const CURTAS: Record<string, string> = { 'Lei seca': 'ls', 'Jurisprudência': 'jur', 'Doutrina': 'dout' }
  for (const nome of new Set<string>(['Lei seca', 'Jurisprudência', 'Doutrina', ...pilarTot.keys()])) {
    const s = slugVar(nome), a = pilarAc.get(nome) ?? 0, t = pilarTot.get(nome) ?? 0
    emitir(s, a, t)
    if (CURTAS[nome]) emitir(CURTAS[nome], a, t)
    out[`acerto_pilar_${s}`] = String(a); out[`total_pilar_${s}`] = String(t); out[`pct_pilar_${s}`] = pct(a, t)
  }

  return {
    ...DADOS_PREVIA,
    simulado: payload.simuladoTitulo || DADOS_PREVIA.simulado,
    acertos: String(acertos), total_questoes: String(total), percentual: pct(acertos, total), erros: String(Math.max(0, total - acertos)),
    disciplinas,
    ...out,
  }
}

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

// ── Banco de TEXTOS de desempenho (narrativa por faixa) — editado em "Textos de desempenho" (tema jsonb). ──
// O template usa só `{<slug>_texto}` (variável limpa, sem marcador de laço); a redação fica AQUI/no banco, então
// editar o texto nunca quebra o .docx. `{nome}` e `{pct}` são interpolados. Genérico (default) + override por slug.
export type TextosDesempenho = { default?: { f1?: string; f2?: string; f3?: string }; por_pilar?: Record<string, { f1?: string; f2?: string; f3?: string }> }
export const DEFAULT_TEXTOS: { f1: string; f2: string; f3: string } = {
  f1: 'Seu desempenho em {nome} ficou abaixo de 50% ({pct}) e merece atenção. Retome os fundamentos e pratique com questões no mesmo padrão da prova para consolidar a base.',
  f2: 'Seu desempenho em {nome} foi intermediário ({pct}): há base, mas ainda há espaço relevante para crescer. Reforce os pontos de maior incidência e mantenha a prática constante.',
  f3: 'Excelente desempenho em {nome} ({pct})! Você domina esta frente — mantenha o ritmo com revisões periódicas até a prova.',
}
const NOMES_SLUG: Record<string, string> = {
  ls: 'Lei seca', jur: 'Jurisprudência', dout: 'Doutrina', lei_seca: 'Lei seca', jurisprudencia: 'Jurisprudência',
  doutrina: 'Doutrina', stf: 'STF', stj: 'STJ', sistemas_internacionais: 'Sistemas Internacionais',
  lingua_portuguesa: 'Língua Portuguesa', outros: 'Outros', geral: 'desempenho geral',
}
/** Nome de exibição a partir do slug (p/ interpolar {nome} quando o chamador não tem o nome). */
export function nomeDoSlug(slug: string): string {
  if (NOMES_SLUG[slug]) return NOMES_SLUG[slug]
  return (slug || '').split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || slug
}
// Slug curto (usado em {ls_texto_alto}) → slug canônico do override na aba (editado como "Lei seca" etc.).
const ALIAS_SLUG: Record<string, string> = { ls: 'lei_seca', jur: 'jurisprudencia', dout: 'doutrina' }
/** Texto de UMA faixa específica (f1/f2/f3) daquele agrupamento: override por slug (ou seu alias canônico) >
 *  default do tenant > default do app, com {nome}/{pct} interpolados. */
export function textoDaFaixa(bank: TextosDesempenho | null | undefined, slug: string, nome: string, banda: 'f1' | 'f2' | 'f3', n: number): string {
  const ov = bank?.por_pilar?.[slug]?.[banda] || bank?.por_pilar?.[ALIAS_SLUG[slug] ?? '\u0000']?.[banda]
  const tpl = ov || bank?.default?.[banda] || DEFAULT_TEXTOS[banda]
  return String(tpl).replace(/\{nome\}/g, nome).replace(/\{pct\}/g, `${n}%`)
}
/** Texto da faixa ATUAL (pela nota n) — p/ o card de UMA linha ({slug_texto}). */
export function textoDesempenho(bank: TextosDesempenho | null | undefined, slug: string, nome: string, n: number): string {
  return textoDaFaixa(bank, slug, nome, n <= 49 ? 'f1' : n <= 80 ? 'f2' : 'f3', n)
}

/** Emissor ÚNICO do contrato de variáveis de UMA agrupação (pilar/sub-pilar/disciplina/geral), a partir de
 *  acertos/total REAIS. Gera `<slug>_pct/_acertos/_total`, as faixas `<slug>_f1/_f2/_f3` (casadas com o %),
 *  `<slug>_faixa`/`<slug>_nivel` e **`<slug>_texto`** (narrativa da faixa, pronta pra usar sem condicional).
 *  USADO TANTO na prévia (computarPreviaDados) QUANTO no relatório REAL do aluno — fonte única, sem divergir. */
export function emitirVarsAgrupamento(out: Record<string, unknown>, slug: string, a: number, t: number, ctx?: { nome?: string; textos?: TextosDesempenho | null }): void {
  if (!slug) return
  const n = t ? Math.round((a / t) * 100) : 0
  out[`${slug}_pct`] = `${n}%`; out[`${slug}_acertos`] = String(a); out[`${slug}_total`] = String(t)
  out[`${slug}_f1`] = n <= 49; out[`${slug}_f2`] = n >= 50 && n <= 80; out[`${slug}_f3`] = n >= 81
  out[`${slug}_faixa`] = n <= 49 ? '0-49' : n <= 80 ? '50-80' : '81-100'
  out[`${slug}_nivel`] = n <= 49 ? 'crítico' : n <= 80 ? 'intermediário' : 'excelente'
  // Narrativa: `{slug_texto}` = texto da faixa ATUAL (card de 1 linha) + `{slug_texto_f1/f2/f3}` = texto de
  // CADA faixa (card de 3 seções, dentro do condicional {#slug_f1}…). Ambos editados em "Textos de desempenho".
  const bk = ctx?.textos ?? null, nm = ctx?.nome ?? nomeDoSlug(slug)
  const banda: 'f1' | 'f2' | 'f3' = n <= 49 ? 'f1' : n <= 80 ? 'f2' : 'f3'
  const t1 = textoDaFaixa(bk, slug, nm, 'f1', n), t2 = textoDaFaixa(bk, slug, nm, 'f2', n), t3 = textoDaFaixa(bk, slug, nm, 'f3', n)
  // Texto de CADA faixa, sempre preenchido (o SE()/condição é que escolhe qual usar). Nomes técnicos
  // (_f1/f2/f3) E legíveis (_baixo/_medio/_alto). `{ls_texto}` = texto da faixa ATUAL (já escolhido).
  out[`${slug}_texto`] = banda === 'f1' ? t1 : banda === 'f2' ? t2 : t3
  out[`${slug}_texto_f1`] = out[`${slug}_texto_baixo`] = t1
  out[`${slug}_texto_f2`] = out[`${slug}_texto_medio`] = t2
  out[`${slug}_texto_f3`] = out[`${slug}_texto_alto`] = t3
}

export interface PreviaPayload {
  simuladoTitulo?: string
  disciplinas: { nome: string; acertos: number; total: number }[]
  questoes?: QuestaoSim[]
  textos?: TextosDesempenho | null
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
  // Contrato de variáveis via o emissor ÚNICO (mesmo usado no relatório REAL do aluno).
  const out: Record<string, unknown> = {}
  const textos = payload.textos ?? null
  const emitir = (slug: string, a: number, t: number, nome?: string) => emitirVarsAgrupamento(out, slug, a, t, { nome, textos })

  // GERAL (nota do simulado) — permite {geral_pct} + faixa {#geral_f1}… no cabeçalho.
  emitir('geral', acertos, total, 'desempenho geral')

  // DISCIPLINAS — sufixo <slug>_* (com faixa) + aliases de PREFIXO (pct_/acerto_/total_/assuntos_) p/ compat.
  for (const d of discs) {
    const s = slugVar(d.nome), a = acertosDe.get(d.nome) ?? 0, t = d.total || 0
    emitir(s, a, t, d.nome)
    out[`acerto_${s}`] = String(a); out[`total_${s}`] = String(t); out[`pct_${s}`] = pct(a, t); out[`assuntos_${s}`] = assuntosDe(d.nome)
  }

  // PILARES + SUB-PILARES — os 3 canônicos SEMPRE (mesmo 0, p/ templates genéricos) + TODOS os presentes
  // (inclui STF/STJ/Sistemas Internacionais). Para cada um: sufixo pelo slug completo + chave CURTA canônica
  // (ls/jur/dout, compat com o bloco pronto) + aliases de prefixo (pct_pilar_/acerto_pilar_/total_pilar_).
  const CURTAS: Record<string, string> = { 'Lei seca': 'ls', 'Jurisprudência': 'jur', 'Doutrina': 'dout' }
  for (const nome of new Set<string>(['Lei seca', 'Jurisprudência', 'Doutrina', ...pilarTot.keys()])) {
    const s = slugVar(nome), a = pilarAc.get(nome) ?? 0, t = pilarTot.get(nome) ?? 0
    emitir(s, a, t, nome)
    if (CURTAS[nome]) emitir(CURTAS[nome], a, t, nome)
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

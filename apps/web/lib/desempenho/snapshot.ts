import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { montarPerfilAnalytics } from '@/lib/aluno/perfil-analytics'
import { carregarPainel } from '@/lib/painel/snapshot'
import { agregarTempoEstudo } from '@/lib/desempenho/tempo-estudo'

// DESEMPENHO — serviço backend. TODA a computação pesada do "Meu desempenho" vive aqui
// (session-independent: roda do render-miss, da escrita e do worker). A página só LÊ o snapshot.
// Antes, a página chamava montarRelatorioEstudante + montarPerfilAnalytics no render; agora isso
// é precomputado e guardado. Migração: supabase/migrations/20261028030000_desempenho_snapshot.sql.
// Ver docs/ARQUITETURA-BACKEND-FIRST.md.

const T = 'simulado_desempenho_snapshot'
// Versão do shape do snapshot — ao mudar os campos, bump: linhas antigas (dia=hoje, shape velho)
// são tratadas como MISS e recomputadas, evitando servir um snapshot sem os campos novos.
const VERSAO = 3

export type DesempenhoDados = {
  v?: number
  /** Questões respondidas na janela de 6 meses (acertos + erros + brancos) — null quando sem dados. */
  totalQuestoes: number | null
  /** % de acerto médio (do relatório). */
  acertoMedio: number | null
  /** Nota média nos simulados. */
  notaMedia: number | null
  /** Melhor nota entre os simulados. */
  melhorNota: number | null
  /** Nº de simulados finalizados. */
  simulados: number
  /** Tempo médio por simulado, em minutos (da duração da sessão). */
  tempoMedioMin: number | null
  /** Acerto por disciplina: você × turma (top 15 por acerto do aluno). `disciplinaId` p/ link do banco. */
  porDisciplina: { nome: string; aluno: number; turma: number; disciplinaId: string | null }[]
  /** Evolução das notas nos simulados, em ordem cronológica. */
  evolucao: { rotulo: string; nota: number }[]
  /** Intensidade de estudo dos últimos 35 dias (nível 0..4 por dia, BRT). */
  constancia: number[]
  /** Foco atual (cronograma ativo) + data da prova, quando houver. */
  foco: { nome: string; provaEm: string | null } | null
  /** Metas do cronograma (cumprimento) — do painel. */
  metas: { pctSemana: number; feitasHoje: number; totalHoje: number; pendencias: number } | null
  /** Sequência de dias (gamificação). */
  streak: number
  /** ── Fase 2 (ledger de tempo diário por frente) — nulos até o rastreamento existir. ── */
  horasEstudo30d: number | null
  ritmoPagsHora: number | null
  tempoPorFrente: { frente: string; horas: number }[] | null
  divisaoTempo: { frente: string; min: number; pct: number }[] | null
}

const VAZIO: DesempenhoDados = { v: VERSAO, totalQuestoes: null, acertoMedio: null, notaMedia: null, melhorNota: null, simulados: 0, tempoMedioMin: null, porDisciplina: [], evolucao: [], constancia: Array(35).fill(0), foco: null, metas: null, streak: 0, horasEstudo30d: null, ritmoPagsHora: null, tempoPorFrente: null, divisaoTempo: null }

// ── Constância (dado real): últimos 35 dias (BRT) a partir do heatmap de atividade. ──
const DIA_MS = 86400000
function diaBrtDe(ms: number): string {
  const d = new Date(ms - 3 * 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
function constanciaUltimos35(atividade: { dias: { data: string; nivel: number }[] } | null): number[] {
  const mapa = new Map<string, number>()
  for (const d of atividade?.dias ?? []) mapa.set(d.data, d.nivel)
  const hoje = Date.now()
  const out: number[] = []
  for (let i = 34; i >= 0; i--) out.push(mapa.get(diaBrtDe(hoje - i * DIA_MS)) ?? 0)
  return out
}

function hojeISO(): string { return diaBrtDe(Date.now()) }

/** COMPUTA o desempenho (pesado). Session-independent — nunca chamado no render do caminho rápido. */
export async function computarDesempenho(svc: SupabaseClient, tenantId: string, estId: string): Promise<DesempenhoDados> {
  if (!tenantId || !estId) return VAZIO
  // Relatório (KPIs/disciplinas) + analytics (atividade/banca) — ambos já session-independent e cacheados.
  const rel = await montarRelatorioEstudante(svc, estId, tenantId)
  // Foco atual (emissão de cronograma ativa mais recente) + metas/streak (reusa o painel, já precomputado).
  const [foco, painel, tempo] = await Promise.all([focoDoCronograma(svc, tenantId, estId), carregarPainel(svc, tenantId, estId), agregarTempoEstudo(svc, tenantId, estId, 30)])
  const analytics = await montarPerfilAnalytics(svc, estId, tenantId, {
    porDisciplina: rel?.porDisciplina ?? [],
    notaMedia: rel?.notaMedia ?? null,
    acertoMedio: rel?.acertoMedio ?? null,
    // Esta tela não usa os blocos "Você x turma"/estatísticas → turma/percentil não são necessários.
    turmaNota: null,
    posicaoPercentil: null,
  })

  const totalQuestoes = analytics?.porBanca ? analytics.porBanca.acertos + analytics.porBanca.erros + analytics.porBanca.brancos : null
  // Mapa nome→id das disciplinas (p/ o link "Treinar" abrir o Banco já filtrado). Cacheado no snapshot.
  const discIdPorNome = new Map<string, string>()
  try {
    const { data: discs } = await svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId)
    for (const d of (discs as any[]) ?? []) if (d?.nome) discIdPorNome.set(String(d.nome).trim().toLowerCase(), d.id)
  } catch { /* sem disciplinas → link sem filtro */ }
  return {
    v: VERSAO,
    totalQuestoes,
    acertoMedio: rel?.acertoMedio ?? null,
    notaMedia: rel?.notaMedia ?? null,
    melhorNota: rel?.melhorNota ?? null,
    simulados: rel?.simulados ?? 0,
    tempoMedioMin: rel?.tempoMedioMin ?? null,
    porDisciplina: (rel?.porDisciplina ?? []).map((d) => ({ nome: d.nome, aluno: d.aluno, turma: d.turma, disciplinaId: discIdPorNome.get(String(d.nome).trim().toLowerCase()) ?? null })),
    evolucao: (rel?.evolucao ?? []).map((e) => ({ rotulo: e.rotulo, nota: e.nota })),
    constancia: constanciaUltimos35(analytics?.atividade ?? null),
    foco,
    metas: painel.temCronograma ? { pctSemana: painel.pctSemana, feitasHoje: painel.feitasHoje, totalHoje: painel.totalHoje, pendencias: painel.pendencias } : null,
    streak: painel.streak ?? 0,
    // Fase 2 — ledger de tempo (últimos 30 dias). Sem registros → listas vazias (a UI mostra estado honesto).
    horasEstudo30d: tempo?.horasEstudo ?? null,
    ritmoPagsHora: tempo?.ritmoPagsHora ?? null,
    tempoPorFrente: tempo?.tempoPorFrente ?? null,
    divisaoTempo: tempo?.divisaoTempo ?? null,
  }
}

/** Foco atual = emissão de cronograma ativa mais recente (nome + data da prova, se houver no formulário). */
async function focoDoCronograma(svc: SupabaseClient, tenantId: string, estId: string): Promise<{ nome: string; provaEm: string | null } | null> {
  try {
    const { data } = await svc.from('simulado_cronograma_emissoes').select('cronograma_nome, titulo, formulario')
      .eq('tenant_id', tenantId).eq('estudante_id', estId).eq('arquivada', false)
      .order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const row = data as { cronograma_nome?: string; titulo?: string; formulario?: any } | null
    if (!row) return null
    const nome = row.titulo?.trim() || row.cronograma_nome || 'Meu cronograma'
    const f = row.formulario ?? {}
    const provaEm = f.data_prova ?? f.prova_em ?? f.edital ?? f.dataProva ?? null
    return { nome, provaEm: typeof provaEm === 'string' ? provaEm : null }
  } catch { return null }
}

/** LÊ o desempenho (caminho rápido): 1 linha pronta. Só computa se não houver snapshot ou se o dia virou. */
export async function carregarDesempenho(svc: SupabaseClient, tenantId: string, estId: string): Promise<DesempenhoDados> {
  if (!tenantId || !estId) return VAZIO
  const hoje = hojeISO()
  try {
    const { data } = await svc.from(T).select('dia, dados').eq('tenant_id', tenantId).eq('estudante_id', estId).maybeSingle()
    const row = data as { dia?: string; dados?: DesempenhoDados } | null
    if (row && row.dia === hoje && row.dados && row.dados.v === VERSAO) return row.dados
  } catch { /* tabela ausente (sem migração) → computa direto */ }
  const dados = await computarDesempenho(svc, tenantId, estId)
  try {
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hoje, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* snapshot best-effort */ }
  return dados
}

/** WRITE-BEHIND: recomputa e grava o snapshot (chamado nas ações que mudam o desempenho). */
export async function atualizarDesempenhoSnapshot(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    const dados = await computarDesempenho(svc, tenantId, estId)
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hojeISO(), dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* best-effort */ }
}

/** STALE-MARK: marca o snapshot como DESATUALIZADO (1 UPDATE leve, SEM recompute) — a PRÓXIMA leitura
 * (read-through de `carregarDesempenho`) recomputa, pois `dia` deixa de ser hoje. Usado nos hot paths de
 * PRÁTICA (banco de questões / prática pessoal), onde o write-behind pesado seria proibitivo.
 * Best-effort; no-op se a linha não existe (read-through computa do zero) ou se já está stale (`neq`). */
export async function marcarDesempenhoDesatualizado(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    await svc.from(T).update({ dia: '2000-01-01' }).eq('tenant_id', tenantId).eq('estudante_id', estId).neq('dia', '2000-01-01')
  } catch { /* best-effort (tabela ausente/sem migração) → próxima leitura computa */ }
}

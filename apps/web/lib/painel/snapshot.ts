import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeISO } from '@/lib/cronograma/datas'
import { carregarAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { tipoBase, type AdaptativoSnapshot } from '@/lib/cronograma/adaptativo/snapshot'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao } from '@/lib/gamificacao/leitura'

// PAINEL — serviço backend (Fase 0 do backend-first). TODA a computação do "Meu painel de estudos"
// vive aqui (session-independent: roda do render-miss, da escrita e do worker). A página só LÊ o snapshot.
// FASE 2 (IA): a fonte das METAS passou de EMISSÕES para o CRONOGRAMA ADAPTATIVO 2.0 FIXADO
// (carregarAdaptativo → snapshot do plano em foco). O contrato de PainelDados é PRESERVADO, pois
// lib/desempenho/snapshot.ts também consome temCronograma/pctSemana/feitasHoje/totalHoje/pendencias/streak.
// Migração: supabase/migrations/20261028010000_painel_snapshot.sql. Ver docs/ARQUITETURA-BACKEND-FIRST.md.

const T = 'simulado_painel_snapshot'
// Versão do shape/fonte do snapshot. BUMP ao trocar a fonte (ex.: EMISSÕES → ADAPTATIVO): linhas
// antigas (dia=hoje, shape velho) viram MISS e recomputam — evita servir metas do motor anterior.
const VERSAO = 2

export type PainelMeta = {
  id: string
  sel: string; selKind: 'brand' | 'gold' | 'green'
  dur: string; titulo: string; sub: string
  concluida: boolean; data: string | null
}
export type PainelContinue = { docId: string; titulo: string; cursoNome: string | null; thumb: string | null } | null
export type PainelDados = {
  v?: number
  temCronograma: boolean
  feitasHoje: number; totalHoje: number; pctHoje: number
  pendencias: number; pctSemana: number; horasLabel: string
  streak: number
  metas: PainelMeta[]
  continue: PainelContinue
}

const VAZIO: PainelDados = { v: VERSAO, temCronograma: false, feitasHoje: 0, totalHoje: 0, pctHoje: 0, pendencias: 0, pctSemana: 0, horasLabel: '0min', streak: 0, metas: [], continue: null }

/** Minutos → rótulo "1h20" / "45min". */
function fmtDur(min: number): string {
  const h = Math.floor(min / 60), mm = min % 60
  return h > 0 ? (mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`) : `${mm}min`
}

/** Cor do selo da meta a partir do tipo do Adaptativo (lp=lei seca → gold; questões → green; resto → brand). */
function selKindDe(tipo: string): 'brand' | 'gold' | 'green' {
  if (tipo === 'lp') return 'gold'
  return tipoBase(tipo) === 'qu' ? 'green' : 'brand'
}

/** COMPUTA o painel (pesado). Session-independent — nunca chamado no render do caminho rápido. */
export async function computarPainel(svc: SupabaseClient, tenantId: string, estId: string): Promise<PainelDados> {
  // Fonte das metas = Cronograma Adaptativo 2.0 FIXADO (plano em foco). carregarAdaptativo já
  // devolve o snapshot pronto (metas do dia/semana + atrasadas) — nenhuma computação aqui.
  let snap: AdaptativoSnapshot | null = null
  try {
    const carga = await carregarAdaptativo(svc, tenantId, estId)
    if (carga.temPlano) snap = carga.snapshot
  } catch { /* sem plano / tabela ausente */ }

  const metasHoje = snap?.hoje.metas ?? []
  const feitasHoje = metasHoje.filter((m) => m.estado === 'done').length
  const totalHoje = metasHoje.length
  const pctHoje = totalHoje ? Math.round((feitasHoje / totalHoje) * 100) : 0
  const pendencias = snap?.hoje.atrasadas ?? 0
  const hojeData = snap?.hoje.data ?? null
  const semana = hojeData ? (snap?.semanas.find((s) => s.ini <= hojeData && hojeData <= s.fim) ?? null) : null
  const pctSemana = semana && semana.tot ? Math.round((semana.ok / semana.tot) * 100) : 0
  const minTotal = snap?.hoje.cargaMin ?? 0
  const horasLabel = fmtDur(minTotal)
  const metas: PainelMeta[] = metasHoje.map((m) => ({
    id: m.id,
    sel: m.tipoNome,
    selKind: selKindDe(m.tipo),
    dur: m.durMin ? fmtDur(m.durMin) : '',
    titulo: m.titulo,
    sub: [m.disc, m.aula ? `Aula ${m.aula}` : ''].filter(Boolean).join(' · '),
    concluida: m.estado === 'done',
    data: m.data,
  }))

  // Sequência (gamificação).
  let streak = 0
  try {
    const cfg = await getGamConfig(svc, tenantId)
    if (cfg && await gamAtivaParaAluno(svc, tenantId, estId, cfg)) {
      const r = await resumoGamificacao(svc, tenantId, estId, cfg)
      streak = r?.streakAtual ?? 0
    }
  } catch { /* gam off */ }

  // Continue de onde parou (query leve) + capa real.
  let cont: PainelContinue = null
  try {
    const { data: prog } = await svc.from('simulado_conteudo_leitura_progresso').select('documento_id')
      .eq('tenant_id', tenantId).eq('aluno_id', estId).order('ultima_leitura_em', { ascending: false }).limit(1).maybeSingle()
    const docId = (prog as { documento_id?: string } | null)?.documento_id
    if (docId) {
      const { data: doc } = await svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id')
        .eq('tenant_id', tenantId).eq('id', docId).eq('deletado', false).maybeSingle()
      if (doc) {
        const d = doc as { id: string; titulo: string; pasta_id?: string | null }
        let cursoNome: string | null = null
        if (d.pasta_id) {
          const { data: p } = await svc.from('simulado_pastas').select('nome').eq('tenant_id', tenantId).eq('id', d.pasta_id).maybeSingle()
          cursoNome = (p as { nome?: string } | null)?.nome ?? null
        }
        let thumb: string | null = null
        try { const { gerarThumbDocumento } = await import('@/lib/conteudo/thumb'); thumb = await gerarThumbDocumento(tenantId, d.id) } catch { /* capa best-effort */ }
        cont = { docId: d.id, titulo: d.titulo, cursoNome, thumb }
      }
    }
  } catch { /* best-effort */ }

  return { v: VERSAO, temCronograma: !!snap, feitasHoje, totalHoje, pctHoje, pendencias, pctSemana, horasLabel, streak, metas, continue: cont }
}

/** LÊ o painel (caminho rápido): 1 linha pronta. Só computa se não houver snapshot ou se o dia virou. */
export async function carregarPainel(svc: SupabaseClient, tenantId: string, estId: string): Promise<PainelDados> {
  if (!tenantId || !estId) return VAZIO
  const hoje = hojeISO()
  try {
    const { data } = await svc.from(T).select('dia, dados').eq('tenant_id', tenantId).eq('estudante_id', estId).maybeSingle()
    const row = data as { dia?: string; dados?: PainelDados } | null
    if (row && row.dia === hoje && row.dados && row.dados.v === VERSAO) return row.dados
  } catch { /* tabela ausente (sem migração) → computa direto */ }
  const dados = await computarPainel(svc, tenantId, estId)
  try {
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hoje, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* snapshot best-effort */ }
  return dados
}

/** WRITE-BEHIND: recomputa e grava o snapshot (chamado nas ações que mudam o painel). */
export async function atualizarPainelSnapshot(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    const dados = await computarPainel(svc, tenantId, estId)
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hojeISO(), dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* best-effort */ }
}

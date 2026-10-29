import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hojeISO, parseISO } from '@/lib/cronograma/datas'
import { getGamConfig, gamAtivaParaAluno } from '@/lib/gamificacao'
import { resumoGamificacao, missoesHoje, atividadeSemana } from '@/lib/gamificacao/leitura'
import { montarHomeData } from '@/lib/aluno/home-nova'
import type { HomeData, HomeDestaque } from '@/components/brand/interna/home/types'
import { R } from '@/lib/nova/rotas'
import { remember } from '@/lib/cache/relatorio-cache'

// HOME (Início nova) — serviço backend (Fase 1 do backend-first). TODA a computação da "Início nova"
// vive aqui (session-independent: roda do render-miss, da escrita e do worker). A página só LÊ o snapshot.
// Migração: supabase/migrations/20261028020000_home_snapshot.sql. Ver docs/ARQUITETURA-BACKEND-FIRST.md.
//
// O snapshot (por aluno) guarda: gamificação (homeData = Olá + nível + sequência + missões) e o
// calendário da semana (dias + agenda das metas do cronograma + rótulo do período).
// FORA do snapshot (ficam na página): os BANNERS (dado de TENANT → `carregarBannersHome` em remember)
// e as NOVIDADES (estado "lida" por aluno → lidas direto, têm backend próprio em lib/novidades).

const T = 'simulado_home_snapshot'

// ——— tipos próprios (estruturalmente compatíveis com os props dos componentes da Início) ———
export type HomeTagKind = 'brand' | 'gold' | 'green' | 'blue' | 'pink' | 'red' | 'gray'
export type HomeAgendaItem = { hora?: string | null; tag: string; kind: HomeTagKind; titulo: string; contexto?: string | null; acao?: string; href?: string }
export type HomeDiaCal = { iso: string; wd: string; dia: number; hoje: boolean; dots: HomeTagKind[] }

export type HomeDados = {
  /** Card "Olá + nível" e coluna lateral (gamificação REAL). Null = gamificação off → não renderiza. */
  homeData: HomeData | null
  /** Calendário de compromissos da semana (metas reais do cronograma por dia). */
  diasCal: HomeDiaCal[]
  agendaCal: Record<string, HomeAgendaItem[]>
  rangeCal: string
}

const VAZIO: HomeDados = { homeData: null, diasCal: [], agendaCal: {}, rangeCal: '' }

const WD = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** COMPUTA a Início (pesado). Session-independent — nunca chamado no render do caminho rápido. */
export async function computarHome(svc: SupabaseClient, tenantId: string, estId: string): Promise<HomeDados> {
  // Nome do aluno (session-independent): montarHomeData precisa dele p/ "Olá" e iniciais.
  let nome = 'Aluno'
  try {
    const { data } = await svc.from('simulado_estudantes').select('nome')
      .eq('tenant_id', tenantId).eq('id', estId).maybeSingle()
    nome = (data as { nome?: string } | null)?.nome ?? 'Aluno'
  } catch { /* sem nome → "Aluno" */ }

  // Card "Olá + nível" + coluna lateral (gamificação REAL) — mesmo mapeamento da Início (montarHomeData).
  let homeData: HomeData | null = null
  try {
    const cfg = await getGamConfig(svc, tenantId)
    const ativo = await gamAtivaParaAluno(svc, tenantId, estId, cfg)
    let gamResumo: any = null
    let gamMissoes: any[] = []
    let gamSemana: any[] = []
    if (cfg && ativo) {
      const r = await Promise.all([
        resumoGamificacao(svc, tenantId, estId, cfg),
        missoesHoje(svc, tenantId, estId, cfg),
        atividadeSemana(svc, tenantId, estId, cfg.timezone),
      ])
      gamResumo = r[0]; gamMissoes = (r[1] as any[]) ?? []; gamSemana = (r[2] as any[]) ?? []
    }
    homeData = montarHomeData({
      nomeCompleto: nome, gamResumo, gamMissoes, gamSemana,
      recentes: [], grupos: [], progresso: {}, destaquesReais: [], feitos: 0,
      chest: cfg?.xp_regras?.chest ?? null,
      gamAtivo: !!(cfg && ativo), cronogramaAtivo: true, brand: 'revisao',
    })
  } catch { /* tolerante: sem gamificação → não mostra o card */ }

  // Calendário de compromissos: metas REAIS do cronograma da SEMANA atual (seg–dom), por dia.
  const hojeIsoCal = hojeISO()
  const hojeDtCal = new Date(parseISO(hojeIsoCal))
  const seg = new Date(hojeDtCal); seg.setUTCDate(hojeDtCal.getUTCDate() - ((hojeDtCal.getUTCDay() + 6) % 7))
  const semanaDias = Array.from({ length: 7 }, (_, i) => { const d = new Date(seg); d.setUTCDate(seg.getUTCDate() + i); return d })
  const isoDe = (d: Date) => d.toISOString().slice(0, 10)

  const inicioIso = isoDe(semanaDias[0]); const fimIso = isoDe(semanaDias[6])
  const agendaCal: Record<string, HomeAgendaItem[]> = {}
  for (const d of semanaDias) agendaCal[isoDe(d)] = []

  // Calendário = APENAS o Cronograma Adaptativo (o cronograma ativo da Revisão, "fixado" no painel).
  // NÃO lê mais o cronograma legado (emissões) — assim a área fica BRANCA enquanto o aluno não gerar o
  // cronograma novo, e passa a refletir só o que ele montar no adaptativo. As metas da SEMANA atual
  // viram os compromissos do dia.
  try {
    const { carregarAdaptativo } = await import('@/lib/cronograma/adaptativo/dados')
    const ad = await carregarAdaptativo(svc, tenantId, estId, hojeIsoCal)
    if (ad.temPlano && ad.snapshot) {
      const kindAd = (tipo: string): HomeTagKind => tipo === 'lp' ? 'gold' : (tipo === 'qu' || tipo === 'rq') ? 'blue' : 'brand'
      for (const s of ad.snapshot.semanas) for (const dia of s.dias) {
        if (dia.data < inicioIso || dia.data > fimIso) continue
        for (const m of dia.metas) {
          ;(agendaCal[dia.data] ??= []).push({ hora: null, tag: m.tipoNome, kind: kindAd(m.tipo), titulo: m.titulo, contexto: m.disc || null, acao: 'Abrir', href: R.cronogramaHoje })
        }
      }
    }
  } catch { /* sem plano adaptativo → calendário em branco */ }
  const diasCal: HomeDiaCal[] = semanaDias.map((d) => { const iso = isoDe(d); return { iso, wd: WD[d.getUTCDay()], dia: d.getUTCDate(), hoje: iso === hojeIsoCal, dots: (agendaCal[iso] ?? []).map((it) => it.kind) } })
  const rangeCal = `DE ${seg.getUTCDate()} DE ${MES_LONGO[seg.getUTCMonth()].toUpperCase()} A ${semanaDias[6].getUTCDate()} DE ${MES_LONGO[semanaDias[6].getUTCMonth()].toUpperCase()}`

  return { homeData, diasCal, agendaCal, rangeCal }
}

/** LÊ a Início (caminho rápido): 1 linha pronta. Só computa se não houver snapshot ou se o dia virou. */
export async function carregarHome(svc: SupabaseClient, tenantId: string, estId: string): Promise<HomeDados> {
  if (!tenantId || !estId) return VAZIO
  const hoje = hojeISO()
  try {
    const { data } = await svc.from(T).select('dia, dados').eq('tenant_id', tenantId).eq('estudante_id', estId).maybeSingle()
    const row = data as { dia?: string; dados?: HomeDados } | null
    if (row && row.dia === hoje && row.dados) return row.dados
  } catch { /* tabela ausente (sem migração) → computa direto */ }
  const dados = await computarHome(svc, tenantId, estId)
  try {
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hoje, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* snapshot best-effort */ }
  return dados
}

/** WRITE-BEHIND: recomputa e grava o snapshot (chamado nas ações que mudam a Início). */
export async function atualizarHomeSnapshot(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    const dados = await computarHome(svc, tenantId, estId)
    await svc.from(T).upsert({ tenant_id: tenantId, estudante_id: estId, dia: hojeISO(), dados, atualizado_em: new Date().toISOString() }, { onConflict: 'estudante_id' })
  } catch { /* best-effort */ }
}

/** STALE-MARK: marca o snapshot como DESATUALIZADO (1 UPDATE leve, SEM recompute) — a PRÓXIMA leitura
 * (read-through de `carregarHome`) recomputa, pois `dia` deixa de ser hoje. Usado nos hot paths de
 * PRÁTICA (banco de questões / prática pessoal), onde o write-behind pesado seria proibitivo.
 * Best-effort; no-op se a linha não existe (read-through computa do zero) ou se já está stale (`neq`). */
export async function marcarHomeDesatualizado(svc: SupabaseClient, tenantId: string, estId: string): Promise<void> {
  if (!tenantId || !estId) return
  try {
    await svc.from(T).update({ dia: '2000-01-01' }).eq('tenant_id', tenantId).eq('estudante_id', estId).neq('dia', '2000-01-01')
  } catch { /* best-effort (tabela ausente/sem migração) → próxima leitura computa */ }
}

/** BANNERS da Início (dado de TENANT, igual p/ todos) — cacheados por tenant (remember), não vão ao snapshot. */
export async function carregarBannersHome(svc: SupabaseClient, tenantId: string): Promise<HomeDestaque[]> {
  if (!tenantId) return []
  return remember(`home-banners:${tenantId}`, 120, async () => {
    try {
      const { data: banRows } = await svc.from('simulado_banners')
        .select('tipo, titulo, mensagem, imagem_url, link, cor')
        .eq('tenant_id', tenantId).eq('ativo', true)
        .order('ordem', { ascending: true }).order('criado_em', { ascending: false })
      return ((banRows ?? []) as any[])
        .filter((b) => b.tipo !== 'popup')
        .map((b): HomeDestaque => ({
          eyebrow: '', titulo: b.titulo ?? '', subtitulo: b.mensagem ?? '', chips: [],
          cta: { rotulo: 'Abrir', url: b.link ?? '#' }, imagem: b.imagem_url ?? null, cores: b.cor ?? undefined,
        }))
    } catch { return [] as HomeDestaque[] }
  })
}

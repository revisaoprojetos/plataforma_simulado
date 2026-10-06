import 'server-only'
import { remember, chaveRelatorio, TTL_RELATORIO } from '@/lib/cache/relatorio-cache'
import {
  engajamentoGeralKpisSql,
  engajamentoGeralListaSql,
  engajamentoGeralAlunoDetalheSql,
  opcoesEngajamentoSql,
  type EngajArea,
  type EngajFiltro,
  type EngajSituacao,
} from 'data'

export type { EngajArea, EngajSituacao }

// ── Normalização dos searchParams ───────────────────────────────────────────────────────────────
export const AREAS: EngajArea[] = ['todos', 'simulados', 'desafios']
export const SITUACOES: EngajSituacao[] = ['todos', 'churn', 'conversao', 'pagantes', 'ativos']
export const ENGAJ_SORT_COLS = ['nome', 'situacao', 'ultima'] as const
export type EngajGeralSortCol = (typeof ENGAJ_SORT_COLS)[number]
export const ENGAJ_POR_PAGINA = 11

export function normArea(v?: string): EngajArea {
  return (AREAS as string[]).includes(v ?? '') ? (v as EngajArea) : 'todos'
}
export function normSituacao(v?: string): EngajSituacao {
  return (SITUACOES as string[]).includes(v ?? '') ? (v as EngajSituacao) : 'todos'
}
export function normSort(v?: string): EngajGeralSortCol {
  return (ENGAJ_SORT_COLS as readonly string[]).includes(v ?? '') ? (v as EngajGeralSortCol) : 'ultima'
}

// A chave de cache precisa distinguir área + alvo.
const alvoChave = (f: EngajFiltro) => `${f.area}:${f.alvoId ?? ''}`

// ── KPIs ─────────────────────────────────────────────────────────────────────────────────────────
export interface EngajGeralKpis {
  baseTotal: number
  pagantes: number
  engajados: number
  pagantesEngajados: number
  pagantesSemAtividade: number // RISCO DE CHURN
  engajadosNaoPagantes: number // OPORTUNIDADE DE CONVERSÃO
}

/** KPIs do cruzamento (memoizado no Redis; null = SQL agregado indisponível). */
export async function engajamentoKpis(tenantId: string, filtro: EngajFiltro): Promise<EngajGeralKpis | null> {
  return remember<EngajGeralKpis | null>(chaveRelatorio(tenantId, 'engaj-geral', 'kpis', alvoChave(filtro)), TTL_RELATORIO, async () => {
    const k = await engajamentoGeralKpisSql(tenantId, filtro)
    if (!k) return null
    const n = (v: string | number) => Number(v) || 0
    return {
      baseTotal: n(k.base_total), pagantes: n(k.pagantes), engajados: n(k.engajados),
      pagantesEngajados: n(k.pagantes_engajados), pagantesSemAtividade: n(k.pagantes_sem_atividade),
      engajadosNaoPagantes: n(k.engajados_nao_pagantes),
    }
  })
}

// ── Lista por aluno ──────────────────────────────────────────────────────────────────────────────
export interface EngajGeralLinha {
  id: string; nome: string; email: string | null
  paga: boolean; engajado: boolean; areasAtivas: string[]; ultimaAtividade: string | null
}

export async function engajamentoLista(
  tenantId: string,
  filtro: EngajFiltro,
  opts: { pagina?: number; q?: string; situacao?: string; sort?: string; dir?: string },
): Promise<{ linhas: EngajGeralLinha[]; total: number; pagina: number; porPagina: number; sort: EngajGeralSortCol; dir: 'asc' | 'desc'; sqlOff: boolean }> {
  const pagina = Math.max(1, opts.pagina ?? 1)
  const q = (opts.q ?? '').trim().slice(0, 80)
  const situacao = normSituacao(opts.situacao)
  const sort = normSort(opts.sort)
  const dir: 'asc' | 'desc' = opts.dir === 'asc' ? 'asc' : 'desc'
  const offset = (pagina - 1) * ENGAJ_POR_PAGINA
  const rows = await engajamentoGeralListaSql(tenantId, filtro, { q, situacao, sortCol: sort, sortDir: dir, limit: ENGAJ_POR_PAGINA, offset })
  if (rows == null) return { linhas: [], total: 0, pagina, porPagina: ENGAJ_POR_PAGINA, sort, dir, sqlOff: true }
  const total = rows.length ? Number(rows[0].total_rows) || 0 : 0
  return {
    linhas: rows.map((r) => ({
      id: r.id, nome: r.nome || r.email || 'Aluno', email: r.email,
      paga: !!r.paga, engajado: !!r.engajado,
      areasAtivas: Array.isArray(r.areas_ativas) ? r.areas_ativas : [],
      ultimaAtividade: r.ultima_atividade ? new Date(r.ultima_atividade as any).toISOString() : null,
    })),
    total, pagina, porPagina: ENGAJ_POR_PAGINA, sort, dir, sqlOff: false,
  }
}

// ── Detalhe de um aluno ────────────────────────────────────────────────────────────────────────
export interface EngajGeralAlunoInfo {
  id: string; nome: string; email: string | null; paga: boolean; avatar: string | null; avatarCor: string | null
}
export interface EngajGeralSim {
  simuladoId: string; titulo: string; tentativas: number; melhorNota: number | null; ultima: string | null
}
export interface EngajGeralDesafio {
  moduloId: string; moduloNome: string; area: string; aulasConcluidas: number; quizzesRespondidos: number; ultima: string | null
}

export async function engajamentoAlunoDetalhe(
  tenantId: string, estudanteId: string,
): Promise<{ info: EngajGeralAlunoInfo; simulados: EngajGeralSim[]; desafios: EngajGeralDesafio[]; sqlOff: boolean } | null> {
  const res = await engajamentoGeralAlunoDetalheSql(tenantId, estudanteId)
  if (res == null) {
    return { info: { id: estudanteId, nome: 'Aluno', email: null, paga: false, avatar: null, avatarCor: null }, simulados: [], desafios: [], sqlOff: true }
  }
  if (!res.info) return null
  return {
    info: {
      id: res.info.id, nome: res.info.nome || res.info.email || 'Aluno', email: res.info.email,
      paga: !!res.info.paga, avatar: res.info.avatar ?? null, avatarCor: res.info.avatar_cor ?? null,
    },
    simulados: res.simulados.map((s) => ({
      simuladoId: s.simulado_id, titulo: s.titulo || 'Simulado', tentativas: Number(s.tentativas) || 0,
      melhorNota: s.melhor_nota == null ? null : Number(s.melhor_nota),
      ultima: s.ultima ? new Date(s.ultima as any).toISOString() : null,
    })),
    desafios: res.desafios.map((d) => ({
      moduloId: d.modulo_id, moduloNome: d.modulo_nome || 'Módulo', area: d.area || 'leitura',
      aulasConcluidas: Number(d.aulas_concluidas) || 0, quizzesRespondidos: Number(d.quizzes_respondidos) || 0,
      ultima: d.ultima ? new Date(d.ultima as any).toISOString() : null,
    })),
    sqlOff: false,
  }
}

// ── Opções de sub-filtro ─────────────────────────────────────────────────────────────────────────
export interface OpcoesEngajamento {
  simulados: { id: string; titulo: string }[]
  desafios: { id: string; nome: string; area: string }[]
}

export async function opcoesEngajamento(tenantId: string): Promise<OpcoesEngajamento> {
  return remember<OpcoesEngajamento>(chaveRelatorio(tenantId, 'engaj-geral', 'opcoes'), TTL_RELATORIO, async () => {
    const o = await opcoesEngajamentoSql(tenantId)
    if (!o) return { simulados: [], desafios: [] }
    return o
  })
}

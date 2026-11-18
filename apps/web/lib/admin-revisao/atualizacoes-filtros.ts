// Funções PURAS (sem server-only) da Central de Atualizações: filtros do Histórico, especificação da atualização,
// lote e CSV. Testadas em atualizacoes-filtros.test.ts.
import { TIPOS_ATUALIZACAO, type TipoAtualizacao } from './biblioteca-tipos'
import { combinarDataHoraBrt } from '../conteudo/atualizacoes-tipos'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const LIMITE_LOTE = 100
export const LIMITE_CSV = 5000
export const LIMITES_ESPEC = { fonte: 300, url: 500, trecho: 300 } as const

export type OrdemHistorico = 'quando' | 'tipo'
export interface FiltroHistorico {
  q: string
  tipo: TipoAtualizacao | null
  disciplina: string | null
  /** YYYY-MM-DD (Brasília), inclusivo. */
  de: string | null
  ate: string | null
  registrador: string | null
  sort: OrdemHistorico
  dir: 'asc' | 'desc'
}

const um = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? ''
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Data YYYY-MM-DD válida (recusa 31/02) ou null. */
export function dataValida(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  return DATA_RE.test(s) && combinarDataHoraBrt(s, '') ? s : null
}

/** Lê/valida os filtros do Histórico a partir de searchParams (nunca confia na URL). */
export function lerFiltrosHistorico(sp: Record<string, string | string[] | undefined>): FiltroHistorico {
  const tipo = TIPOS_ATUALIZACAO.find((t) => t.id === um(sp.tipo))?.id ?? null
  let de = dataValida(um(sp.de)), ate = dataValida(um(sp.ate))
  if (de && ate && de > ate) [de, ate] = [ate, de]
  const reg = um(sp.reg)
  return {
    q: um(sp.q).trim().slice(0, 80),
    tipo: tipo as TipoAtualizacao | null,
    disciplina: um(sp.disc).trim().slice(0, 120) || null,
    de, ate,
    registrador: UUID_RE.test(reg) ? reg : null,
    sort: um(sp.sort) === 'tipo' ? 'tipo' : 'quando',
    dir: um(sp.dir) === 'asc' ? 'asc' : 'desc',
  }
}

/** Filtros → parâmetros de URL (só os preenchidos). Usado em links de paginação/ordenação/exportação. */
export function filtrosParaParams(f: FiltroHistorico, extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    q: f.q || undefined, tipo: f.tipo ?? undefined, disc: f.disciplina ?? undefined, de: f.de ?? undefined, ate: f.ate ?? undefined,
    reg: f.registrador ?? undefined, sort: f.sort !== 'quando' ? f.sort : undefined, dir: f.dir !== 'desc' ? f.dir : undefined, ...extra,
  }
}

/** Dia seguinte (YYYY-MM-DD) sem depender de fuso. */
function diaSeguinte(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** Período em dias de Brasília → [ini inclusivo, fim EXCLUSIVO] em ISO UTC (fim = 00:00 do dia seguinte a `ate`). */
export function periodoBrtParaIso(de: string | null, ate: string | null): { ini: string | null; fim: string | null } {
  const dd = dataValida(de), aa = dataValida(ate)
  return { ini: dd ? combinarDataHoraBrt(dd, '') : null, fim: aa ? combinarDataHoraBrt(diaSeguinte(aa), '') : null }
}

export interface EspecificacaoAtualizacao { fonteOrigem: string | null; fonteUrl: string | null; trechoAfetado: string | null; avisarJaBaixou: boolean }

/** URL http(s) válida (sem javascript:/data:) ou null. */
export function urlSegura(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s || s.length > LIMITES_ESPEC.url) return null
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null } catch { return null }
}

/** Normaliza a especificação vinda do cliente. `erro` quando a URL foi informada mas é inválida. */
export function normalizarEspecificacao(i: { fonteOrigem?: unknown; fonteUrl?: unknown; trechoAfetado?: unknown; avisarJaBaixou?: unknown }): { ok: true; espec: EspecificacaoAtualizacao } | { ok: false; error: string } {
  const fonte = String(i.fonteOrigem ?? '').trim()
  const trecho = String(i.trechoAfetado ?? '').trim()
  const urlBruta = String(i.fonteUrl ?? '').trim()
  if (fonte.length > LIMITES_ESPEC.fonte) return { ok: false, error: `A fonte/origem passou de ${LIMITES_ESPEC.fonte} caracteres.` }
  if (trecho.length > LIMITES_ESPEC.trecho) return { ok: false, error: `O trecho afetado passou de ${LIMITES_ESPEC.trecho} caracteres.` }
  const url = urlBruta ? urlSegura(urlBruta) : null
  if (urlBruta && !url) return { ok: false, error: 'O link da fonte precisa começar com http:// ou https://.' }
  return { ok: true, espec: { fonteOrigem: fonte || null, fonteUrl: url, trechoAfetado: trecho || null, avisarJaBaixou: i.avisarJaBaixou === true } }
}

/** A especificação tem algum campo preenchido (usado para decidir se a ausência da migração é bloqueante). */
export function temEspecificacao(e: EspecificacaoAtualizacao): boolean {
  return !!(e.fonteOrigem || e.fonteUrl || e.trechoAfetado || e.avisarJaBaixou)
}

/** Lote: só UUIDs válidos, sem duplicatas, no máx. `max`. `excedeu` quando passou do limite. */
export function normalizarIdsLote(brutos: unknown, max = LIMITE_LOTE): { ids: string[]; excedeu: boolean } {
  const lista = Array.isArray(brutos) ? brutos : []
  const ids = [...new Set(lista.map((x) => String(x ?? '').trim().toLowerCase()).filter((x) => UUID_RE.test(x)))]
  return { ids: ids.slice(0, max), excedeu: ids.length > max }
}

/** Célula CSV (`;`, aspas) com proteção contra injeção de fórmula em planilhas. */
export function celulaCsv(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com BOM UTF-8, separador `;` e CRLF (abre certo no Excel pt-BR). */
export function montarCsv(cabecalho: string[], linhas: unknown[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n')
}

import 'server-only'
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { lerCfgMetas } from './config-metas'
import { diffGrade, mudancaGrande, LIMIAR_AUDITORIA_GRADE, LIMIAR_SNAPSHOT_GRADE, type Grade } from './grade-diff'

// REGISTRO do Cronograma Adaptativo (aba admin "Análise de uso"). TUDO best-effort: nunca lança, nunca atrasa a resposta
// do aluno (a gravação roda em after()) e tolera a migração 20261119030000 ausente (a tabela some → o insert falha em silêncio).

export type AcaoGeracao = 'gerar' | 'recalcular' | 'migrar' | 'sync' | 'fixar' | 'arquivar' | 'apagar' | 'pausar' | 'remap_as' | 'remap_as'
export type OrigemGeracao = 'aluno' | 'equipe' | 'migracao' | 'iframe'

export interface RegistroGeracao {
  tenantId: string
  estudanteId: string
  planoId?: string | null
  acao: AcaoGeracao
  origem?: OrigemGeracao
  atorUserId?: string | null
  motor?: string | null
  catalogo?: string | null
  ok?: boolean
  erro?: string | null
  ms?: number | null
  nMetas?: number | null
  fim?: number | null
}

/** Roda `fn` depois da resposta quando há request ativo (after); fora de request, dispara solto. Nunca lança. */
function depois(fn: () => Promise<void>): void {
  const seguro = () => fn().catch(() => {})
  try { after(seguro) } catch { void seguro() }
}

/** Hash curto (12 hex) dos parâmetros do motor vigentes do tenant (tema.cronograma_adaptativo_cfg, sem metadados de edição). */
export async function hashParamsTenant(svc: SupabaseClient, tenantId: string): Promise<string | null> {
  try {
    const { atualizadoEm: _e, atualizadoPor: _p, ...params } = await lerCfgMetas(svc, tenantId)
    const ordenado = (v: unknown): unknown => Array.isArray(v) ? v.map(ordenado)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenado((v as Record<string, unknown>)[k])])) : v
    return createHash('sha1').update(JSON.stringify(ordenado(params))).digest('hex').slice(0, 12)
  } catch { return null }
}

/** Grava 1 linha em simulado_cronograma_adaptativo_geracao_log (em after()). */
export function registrarGeracao(svc: SupabaseClient, r: RegistroGeracao): void {
  depois(async () => {
    const params_hash = await hashParamsTenant(svc, r.tenantId)
    const linha = {
      tenant_id: r.tenantId, estudante_id: r.estudanteId, plano_id: r.planoId ?? null, acao: r.acao, origem: r.origem ?? 'aluno',
      ator_user_id: r.atorUserId ?? null, motor: r.motor ?? null, catalogo: r.catalogo ?? null, params_hash,
      ok: r.ok !== false, erro: r.erro ? String(r.erro).slice(0, 500) : null,
      ms: r.ms != null ? Math.max(0, Math.round(r.ms)) : null, n_metas: r.nMetas ?? null, fim: r.fim ?? null,
    }
    const { error } = await svc.from('simulado_cronograma_adaptativo_geracao_log').insert(linha)
    // 'remap_as' só existe no CHECK depois da migração 20261125000000: antes dela, registra como 'migrar' com o rótulo no texto.
    if (error && r.acao === 'remap_as') await svc.from('simulado_cronograma_adaptativo_geracao_log').insert({ ...linha, acao: 'migrar', erro: ('[remap_as] ' + (r.erro ?? '')).slice(0, 500) })
  })
}

const digest = (v: unknown): string => {
  const ord = (x: unknown): unknown => Array.isArray(x) ? x.map(ord)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, ord((x as Record<string, unknown>)[k])])) : x
  return createHash('sha1').update(JSON.stringify(ord(v ?? null))).digest('hex')
}

/**
 * Auto-save do iframe (acao 'sync'): grava SÓ quando a grade/cfg mudou em relação ao plano anterior (o auto-save dispara várias vezes por
 * minuto e inundaria o log) ou quando falhou. A comparação roda dentro do after(), fora do caminho da resposta.
 */
export function registrarSync(svc: SupabaseClient, r: {
  tenantId: string; estudanteId: string; planoId?: string | null; t0: number; erro?: string | null
  depois: { cfg: unknown; plano: unknown; fim?: number | null }; antes: { cfg: unknown; plano: unknown } | null
}): void {
  const ms = Date.now() - r.t0
  depois(async () => {
    const ok = !r.erro
    if (ok && r.antes && digest(r.antes.plano) === digest(r.depois.plano) && digest(r.antes.cfg) === digest(r.depois.cfg)) return
    // RASTREIO por identificação: reorganização grande (organizar atrasadas, regerar, mover em massa) grava ANTES×DEPOIS na auditoria
    // (estudante, plano, quantas metas mudaram e o deslocamento) e, quando muito grande, uma CÓPIA da grade anterior para provar/reverter.
    if (ok && r.antes && r.planoId) {
      try {
        const resumo = diffGrade(r.antes.plano as Grade, r.depois.plano as Grade)
        if (mudancaGrande(resumo, LIMIAR_AUDITORIA_GRADE)) {
          let snapshot: string | null = null
          if (mudancaGrande(resumo, LIMIAR_SNAPSHOT_GRADE)) {
            snapshot = `cronograma/backup-grade/${r.tenantId}/${r.planoId}-${Date.now()}.json`
            const corpo = new Blob([JSON.stringify({ planoId: r.planoId, estudanteId: r.estudanteId, em: new Date().toISOString(), plano: r.antes.plano, cfg: r.antes.cfg })], { type: 'application/json' })
            const { error: eUp } = await svc.storage.from('pdfs').upload(snapshot, corpo, { upsert: false, contentType: 'application/json' })
            if (eUp) snapshot = null
          }
          await svc.from('simulado_audit_logs').insert({
            tenant_id: r.tenantId, ator_tipo: 'estudante', ator_id: r.estudanteId, tabela: 'simulado_cronograma_adaptativo_plano', entidade: 'simulado_cronograma_adaptativo_plano', entidade_id: r.planoId, operacao: 'UPDATE',
            dados_anteriores: { estudante_id: r.estudanteId, plano_id: r.planoId, ids_grade: Object.keys((r.antes.plano ?? {}) as object).length },
            dados_novos: { estudante_id: r.estudanteId, plano_id: r.planoId, ...resumo, fim: r.depois.fim ?? null, copia_da_grade_anterior: snapshot },
            detalhes: { origem: 'sync_iframe', motivo: 'reorganizacao_grande_da_grade' }, criado_em: new Date().toISOString(),
          })
        }
      } catch { /* rastreio best-effort: nunca atrapalha o salvamento */ }
    }
    const cfg = (r.depois.cfg ?? {}) as { motor?: string; catalogo?: string }
    const params_hash = await hashParamsTenant(svc, r.tenantId)
    await svc.from('simulado_cronograma_adaptativo_geracao_log').insert({
      tenant_id: r.tenantId, estudante_id: r.estudanteId, plano_id: r.planoId ?? null, acao: 'sync', origem: 'iframe',
      motor: cfg.motor ?? null, catalogo: cfg.catalogo ?? null, params_hash, ok, erro: r.erro ? String(r.erro).slice(0, 500) : null, ms,
      n_metas: Object.keys((r.depois.plano ?? {}) as object).length, fim: r.depois.fim ?? null,
    })
  })
}

/** Evento de meta: marcar/desmarcar (de → para). Estado anterior lido ANTES do upsert. Em after().
 *  `origem` = canal da marcação ('meta_clique' = clique direto na meta; 'sync_iframe' = sincronização do cronograma) — coluna
 *  `origem` da migração 20261125010000; se ainda não existir, grava sem ela (nunca perde o evento). */
export function registrarEventoMeta(svc: SupabaseClient, e: { tenantId: string; planoId: string; estudanteId: string; metaId: string; de: string | null; para: string | null; origem?: 'meta_clique' | 'sync_iframe' | 'outro' }): void {
  if (e.de === e.para) return
  depois(async () => {
    const base = { tenant_id: e.tenantId, plano_id: e.planoId, estudante_id: e.estudanteId, meta_id: e.metaId, de: e.de, para: e.para }
    const r = await svc.from('simulado_cronograma_adaptativo_meta_evento').insert({ ...base, origem: e.origem ?? 'outro' })
    if (r.error && /origem/i.test(String(r.error.message))) await svc.from('simulado_cronograma_adaptativo_meta_evento').insert(base)
  })
}

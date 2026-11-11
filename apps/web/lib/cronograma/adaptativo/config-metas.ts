import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { type ParamsAdaptativo, PARAMS_PADRAO, normalizarParams } from './params'

/**
 * CONFIG DAS METAS DO CRONOGRAMA ADAPTATIVO por tenant (v3).
 *
 * Guarda os parâmetros do motor (ritmo, durações, offsets, limites de PDFull/LegProc, concentração,
 * inteligência de desempenho) em `simulado_tenants.tema.cronograma_adaptativo_cfg` — sem migração, mesmo
 * padrão de `liberacao.ts` (`cronograma_bloqueio`). Config vazia = `PARAMS_PADRAO` = comportamento 2.8.
 *
 * O motor lê estes valores por `ctx.params` (injetado no server em `dados.ts` e no iframe pelo GET da API).
 */

const CHAVE_TEMA = 'cronograma_adaptativo_cfg'
const kCfg = (t: string) => `crono-metas:cfg:${t}`

export interface CfgMetas extends ParamsAdaptativo {
  atualizadoEm?: string | null
  atualizadoPor?: string | null
}

/** Lê a config do tenant (cache curto; `salvarCfgMetas` invalida). Erro → PARAMS_PADRAO. */
export async function lerCfgMetas(svc: SupabaseClient, tenantId: string): Promise<CfgMetas> {
  return remember<CfgMetas>(kCfg(tenantId), 30, async () => {
    try {
      const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      const raw = ((data as { tema?: Record<string, unknown> } | null)?.tema ?? {})[CHAVE_TEMA]
      const base = normalizarParams(raw)
      const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      return { ...base, atualizadoEm: typeof r.atualizadoEm === 'string' ? r.atualizadoEm : null, atualizadoPor: typeof r.atualizadoPor === 'string' ? r.atualizadoPor : null }
    } catch {
      return { ...PARAMS_PADRAO, atualizadoEm: null, atualizadoPor: null }
    }
  })
}

/** Disciplinas com PDFull/LegProc desligados (tabela do admin Revisão › Cronograma › Disciplinas). Sem migração/tabela → {}. */
export async function lerDiscSemTipo(svc: SupabaseClient, tenantId: string): Promise<Record<string, string[]>> {
  try {
    const { data, error } = await svc.from('simulado_revisao_cron_disciplinas').select('nome, pdfull, legproc, juris').eq('tenant_id', tenantId).or('pdfull.eq.false,legproc.eq.false,juris.eq.false').limit(1000)
    if (error) return {}
    const out: Record<string, string[]> = { pf: [], lp: [], jp: [] }
    for (const r of (data ?? []) as Array<{ nome: string; pdfull: boolean | null; legproc: boolean | null; juris: boolean | null }>) {
      if (r.pdfull === false) out.pf.push(r.nome)
      if (r.legproc === false) out.lp.push(r.nome)
      if (r.juris === false) out.jp.push(r.nome)
    }
    return out
  } catch { return {} }
}

/** Só os parâmetros do motor (sem metadados), prontos p/ `ctx.params` (+ bloqueios por disciplina vindos do admin). */
export async function lerParamsMotor(svc: SupabaseClient, tenantId: string): Promise<ParamsAdaptativo> {
  const [{ atualizadoEm: _e, atualizadoPor: _p, ...params }, discSem] = await Promise.all([lerCfgMetas(svc, tenantId), remember(`crono-metas:discsem:${tenantId}`, 30, () => lerDiscSemTipo(svc, tenantId))])
  return { ...params, discSemTipo: discSem }
}

/** Grava a config (merge no `tema`, sem apagar outras chaves) e invalida o cache. */
export async function salvarCfgMetas(svc: SupabaseClient, tenantId: string, cfg: Partial<ParamsAdaptativo>, atorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...(((data as { tema?: Record<string, unknown> } | null)?.tema) ?? {}) }
  const { discSemTipo: _d, ...paraSalvar } = normalizarParams(cfg)
  tema[CHAVE_TEMA] = { ...paraSalvar, atualizadoEm: new Date().toISOString(), atualizadoPor: atorId }
  const { error } = await svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  if (error) return { ok: false, error: error.message }
  await esquecer(kCfg(tenantId)).catch(() => {})
  await esquecer(`crono-metas:discsem:${tenantId}`).catch(() => {})
  return { ok: true }
}

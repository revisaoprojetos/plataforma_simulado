'use server'
// Server actions das REGRAS DO MOTOR do Cronograma Adaptativo (regras como dados). Só exporta funções async;
// tipos ficam em `regras-actions-tipos.ts` (NUNCA `export type {}` aqui: quebra o next build).
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { REGRAS_PADRAO, hashRegras } from '@/lib/cronograma/adaptativo/regras'
import { validarRegras } from '@/lib/cronograma/adaptativo/regras-validacao'
import { lerRegistroRegras, salvarRegrasTenant } from '@/lib/cronograma/adaptativo/config-regras'
import { lerParamsMotor } from '@/lib/cronograma/adaptativo/config-metas'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { simularRegrasPuro } from '@/lib/cronograma/adaptativo/simular-regras'
import type { Cfg28, AulaAS, ItemLP } from '@/lib/cronograma/adaptativo/motor28'
import type { RegistroRegras, ResultadoRegras, VersaoRegras, DiffSimulacao, CfgExemplo } from './regras-actions-tipos'

async function acesso(acao: 'view' | 'update') {
  const a = await getCurrentAccess()
  if (!a.tenantId || !accessCan(a, `cronogramas:${acao}`)) return null
  return { tenantId: a.tenantId, userId: a.userId ?? null }
}

/** Regras vigentes do tenant (+ padrão, hash e versão para a checagem otimista). */
export async function obterRegras(): Promise<ResultadoRegras<RegistroRegras>> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const r = await lerRegistroRegras(createAdminClient(), g.tenantId)
  return { ok: true, dados: { versao: r.versao, hash: r.hash, regras: r.regras, padrao: REGRAS_PADRAO, atualizadoEm: r.atualizadoEm, atualizadoPor: r.atualizadoPor, ehPadrao: Object.keys(r.delta).length === 0 } }
}

/** Valida (zod) e grava as regras. `versaoEsperada` = a versão que o admin viu (conflito se mudou). Plano já gravado NÃO é alterado. */
export async function salvarRegras(regras: unknown, versaoEsperada: number, motivo?: string): Promise<ResultadoRegras<{ versao: number; hash: string }>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const v = validarRegras(regras)
  if (!v.ok) return { ok: false, error: v.erros[0] ?? 'Regras inválidas.', erros: v.erros }
  const r = await salvarRegrasTenant(createAdminClient(), g.tenantId, v.regras, Math.trunc(Number(versaoEsperada) || 0), g.userId, (motivo ?? '').slice(0, 300) || null)
  if (!r.ok) return { ok: false, error: r.error, conflito: r.conflito }
  return { ok: true, dados: { versao: r.versao, hash: r.hash }, avisos: v.avisos ?? [] }
}

/** Volta ao comportamento padrão (grava o padrão como nova versão; o histórico guarda a anterior). */
export async function restaurarPadrao(versaoEsperada: number): Promise<ResultadoRegras<{ versao: number; hash: string }>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const r = await salvarRegrasTenant(createAdminClient(), g.tenantId, REGRAS_PADRAO, Math.trunc(Number(versaoEsperada) || 0), g.userId, 'Restaurado o padrão')
  if (!r.ok) return { ok: false, error: r.error, conflito: r.conflito }
  return { ok: true, dados: { versao: r.versao, hash: r.hash } }
}

/** Versão atual + as últimas 20 (mais recente primeiro). */
export async function listarVersoes(): Promise<ResultadoRegras<VersaoRegras[]>> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const r = await lerRegistroRegras(createAdminClient(), g.tenantId)
  const atual: VersaoRegras[] = r.versao > 0 ? [{ versao: r.versao, hash: r.hash, atualizadoEm: r.atualizadoEm, atualizadoPor: r.atualizadoPor, delta: r.delta }] : []
  return { ok: true, dados: [...atual, ...r.historico.map((h) => ({ versao: h.versao, hash: h.hash, atualizadoEm: h.atualizadoEm, atualizadoPor: h.atualizadoPor, delta: h.delta, motivo: h.motivo ?? null }))] }
}

/**
 * Simula: gera o plano de exemplo com as regras PROPOSTAS × as VIGENTES e devolve o diff resumido (fim em semanas, metas por tipo,
 * 1ª/última data, ids que mudaram). Não grava nada.
 */
export async function simularRegras(regrasPropostas: unknown, cfgExemplo: CfgExemplo): Promise<ResultadoRegras<DiffSimulacao>> {
  const g = await acesso('update'); if (!g) return { ok: false, error: 'Sem permissão.' }
  const v = validarRegras(regrasPropostas)
  if (!v.ok) return { ok: false, error: v.erros[0] ?? 'Regras inválidas.', erros: v.erros }
  const c = (cfgExemplo ?? {}) as Partial<CfgExemplo>
  if (typeof c.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.start) || !Array.isArray(c.horas) || c.horas.length !== 7 || !Array.isArray(c.discs) || !c.discs.length)
    return { ok: false, error: 'Informe início (AAAA-MM-DD), 7 valores de horas por dia e ao menos uma disciplina.' }
  const svc = createAdminClient()
  const [vig, banco, params] = await Promise.all([lerRegistroRegras(svc, g.tenantId), carregarConteudoBanco(svc, g.tenantId), lerParamsMotor(svc, g.tenantId)])
  const cfg = { revisao: { ativa: true, cada: REGRAS_PADRAO.revisao.padrao }, metas: { pf: true, fl: true, qu: true, lp: true }, ...c } as unknown as Cfg28
  const diff = simularRegrasPuro(cfg, { AS: banco.AS as AulaAS[], LP: (banco.LP ?? []) as ItemLP[], ordem: banco.ordem ?? null, params, ...(banco.GX?.length ? { gx: banco.GX } : {}) }, v.regras, vig.regras, c.start, { detalhar: true })
  return { ok: true, dados: diff }
}

/** Hash das regras vigentes (carimbo informativo do plano). */
export async function hashRegrasVigentes(): Promise<ResultadoRegras<{ hash: string }>> {
  const g = await acesso('view'); if (!g) return { ok: false, error: 'Sem permissão.' }
  return { ok: true, dados: { hash: hashRegras((await lerRegistroRegras(createAdminClient(), g.tenantId)).regras) } }
}

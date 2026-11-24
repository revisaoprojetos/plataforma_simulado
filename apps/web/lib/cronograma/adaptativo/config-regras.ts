import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { registrarAudit } from '@/lib/audit'
import { aplicarRegrasUsuarioDoTenant } from './regras-usuario-server'
import { normalizarRegras, hashRegras, deltaDoPadrao, type RegrasMotor } from './regras'

/**
 * REGRAS DO MOTOR por tenant: `simulado_tenants.tema.cronograma_adaptativo_regras` (jsonb; ZERO migração — mesmo padrão de
 * `config-metas.ts`/`liberacao.ts`). Guarda só o DELTA contra `REGRAS_PADRAO` (o tema é lido em muitos lugares; fica pequeno),
 * mais `versao` (checagem otimista ao salvar) e as últimas 20 versões. Config vazia = REGRAS_PADRAO = comportamento da 3.2.0.
 * O motor lê por `ctx.regras` (servidor: dados.ts; iframe: GET /api/aluno/cronograma/adaptativo → conteudo.regras).
 */

export const CHAVE_TEMA_REGRAS = 'cronograma_adaptativo_regras'
export const MAX_HISTORICO_REGRAS = 20
const kCfg = (t: string) => `crono-regras:cfg:${t}`

export interface EntradaHistorico {
  versao: number
  hash: string
  delta: Record<string, unknown>
  atualizadoEm: string | null
  atualizadoPor: string | null
  motivo?: string | null
}
export interface RegistroBruto {
  versao: number
  delta: Record<string, unknown>
  atualizadoEm: string | null
  atualizadoPor: string | null
  historico: EntradaHistorico[]
}
export interface RegistroLido {
  versao: number
  regras: RegrasMotor
  hash: string
  delta: Record<string, unknown>
  atualizadoEm: string | null
  atualizadoPor: string | null
  historico: EntradaHistorico[]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null)

/** Interpreta o jsonb gravado (tolerante a lixo → registro vazio = padrão). */
export function lerRegistroBruto(raw: unknown): RegistroBruto {
  const r = obj(raw)
  const historico = (Array.isArray(r.historico) ? r.historico : []).map((h): EntradaHistorico => {
    const o = obj(h)
    return { versao: Math.max(0, Math.trunc(Number(o.versao) || 0)), hash: txt(o.hash) ?? '', delta: obj(o.delta), atualizadoEm: txt(o.atualizadoEm), atualizadoPor: txt(o.atualizadoPor), motivo: txt(o.motivo) }
  }).slice(0, MAX_HISTORICO_REGRAS)
  return { versao: Math.max(0, Math.trunc(Number(r.versao) || 0)), delta: obj(r.delta), atualizadoEm: txt(r.atualizadoEm), atualizadoPor: txt(r.atualizadoPor), historico }
}
function paraRegistro(b: RegistroBruto): RegistroLido {
  const regras = normalizarRegras(b.delta)
  return { ...b, regras, hash: hashRegras(regras) }
}

/** Lê o registro do tenant (cache de 30 s; `salvarRegrasTenant` invalida). Erro → padrão. */
export async function lerRegistroRegras(svc: SupabaseClient, tenantId: string): Promise<RegistroLido> {
  return remember<RegistroLido>(kCfg(tenantId), 30, async () => {
    try {
      const { data } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
      return paraRegistro(lerRegistroBruto(obj((data as { tema?: unknown } | null)?.tema)[CHAVE_TEMA_REGRAS]))
    } catch {
      return paraRegistro(lerRegistroBruto(null))
    }
  })
}

/**
 * Regras EFETIVAS do motor (para `ctx.regras`): as regras do tenant + as REGRAS DO USUÁRIO do Fluxo compiladas (`regras-usuario.ts`).
 * Sem overlay/regra com efeito = a mesma referência de `lerRegistroRegras(...).regras`. NÃO use para editar/salvar (use `lerRegistroRegras`).
 */
export async function lerRegrasMotor(svc: SupabaseClient, tenantId: string): Promise<RegrasMotor> {
  return aplicarRegrasUsuarioDoTenant(svc, tenantId, (await lerRegistroRegras(svc, tenantId)).regras)
}

export type ResultadoSalvar = { ok: true; versao: number; hash: string } | { ok: false; error: string; conflito?: boolean }

const MSG_CONFLITO = 'As regras foram alteradas por outra pessoa. Recarregue a página e tente de novo.'

/**
 * Grava as regras (já validadas pelo chamador) com checagem otimista: `versaoEsperada` deve ser a versão que o admin viu;
 * se alguém salvou antes → `conflito`. Guarda as últimas 20 versões no próprio jsonb e registra auditoria.
 * Lê SEM cache (a decisão otimista precisa do valor real).
 */
export async function salvarRegrasTenant(
  svc: SupabaseClient, tenantId: string, regras: unknown, versaoEsperada: number, atorId: string | null, motivo?: string | null,
): Promise<ResultadoSalvar> {
  const { data, error: e1 } = await svc.from('simulado_tenants').select('tema').eq('id', tenantId).maybeSingle()
  if (e1) return { ok: false, error: e1.message }
  const tema = { ...obj((data as { tema?: unknown } | null)?.tema) }
  const atual = lerRegistroBruto(tema[CHAVE_TEMA_REGRAS])
  if (atual.versao !== versaoEsperada) return { ok: false, error: MSG_CONFLITO, conflito: true }

  const novas = normalizarRegras(regras), delta = deltaDoPadrao(novas), hash = hashRegras(novas)
  const agora = new Date().toISOString(), versao = atual.versao + 1
  const anterior: EntradaHistorico = { versao: atual.versao, hash: hashRegras(atual.delta), delta: atual.delta, atualizadoEm: atual.atualizadoEm, atualizadoPor: atual.atualizadoPor, motivo: null }
  const historico = [anterior, ...atual.historico].filter((h) => h.versao > 0).slice(0, MAX_HISTORICO_REGRAS)
  tema[CHAVE_TEMA_REGRAS] = { versao, delta, atualizadoEm: agora, atualizadoPor: atorId, motivo: motivo ?? null, historico }

  // concorrência: só grava se a versão ainda é a lida (mesma chave no jsonb); sem registro prévio (versão 0) exige a chave ausente.
  let q = svc.from('simulado_tenants').update({ tema }).eq('id', tenantId)
  q = atual.versao === 0 ? q.is(`tema->${CHAVE_TEMA_REGRAS}`, null) : q.eq(`tema->${CHAVE_TEMA_REGRAS}->>versao`, String(atual.versao))
  const { data: upd, error } = await q.select('id')
  if (error) return { ok: false, error: error.message }
  if (!upd || upd.length === 0) return { ok: false, error: MSG_CONFLITO, conflito: true }

  await esquecer(kCfg(tenantId)).catch(() => {})
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'simulado_cronograma_adaptativo_regras', entidadeId: tenantId, tenantId, atorId,
    antes: { versao: atual.versao, delta: atual.delta }, depois: { versao, hash, delta, motivo: motivo ?? null },
  }).catch(() => {})
  return { ok: true, versao, hash }
}

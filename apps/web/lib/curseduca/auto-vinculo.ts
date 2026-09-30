import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolverCfg, executarImport } from '@/lib/curseduca/import-core'
import { listarTodosGrupos, type CurseducaCfg } from '@/lib/curseduca/client'

/**
 * Automação "Auto-vínculo Passaporte" (server-only, NÃO 'use server' — recebe tenant por parâmetro;
 * expor como server action permitiria disparo cross-tenant). Descobre TURMAS da Curseduca por NOME
 * (termos incluir/excluir configuráveis) e enfileira um import — que concede passaporte
 * automaticamente (classificação + grupo "Passaporte", via `executarImport`).
 */

export interface RegraAutoVinculo {
  id: string
  tenant_id: string
  ativo: boolean
  modo: 'horario' | 'intervalo'
  horario: number
  intervalo_min: number
  termos_incluir: string[]
  termos_excluir: string[]
  sincronizar: boolean
  ultima_execucao: string | null
  ultimo_resultado: any
}

const COLS = 'id, tenant_id, ativo, modo, horario, intervalo_min, termos_incluir, termos_excluir, sincronizar, ultima_execucao, ultimo_resultado'
const TZ = 'America/Sao_Paulo'

/** Normaliza para casar nome: minúsculas, sem acento, espaços colapsados. */
function norm(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Um grupo casa se o nome contém ALGUM termo de inclusão e NENHUM de exclusão. Inclusão vazia = casa nada. */
export function nomeCasa(nome: string, incluir: string[], excluir: string[]): boolean {
  const n = norm(nome)
  const inc = (incluir ?? []).map(norm).filter(Boolean)
  const exc = (excluir ?? []).map(norm).filter(Boolean)
  if (!inc.length) return false
  if (!inc.some((t) => n.includes(t))) return false
  if (exc.some((t) => n.includes(t))) return false
  return true
}

/** Lista as turmas Curseduca que casam a regra (id + nome). */
export async function descobrirGruposPassaporte(cfg: CurseducaCfg, incluir: string[], excluir: string[]): Promise<{ id: number; nome: string }[]> {
  const todos = await listarTodosGrupos(cfg)
  return todos.filter((g) => nomeCasa(g.nome, incluir, excluir)).map((g) => ({ id: g.id, nome: g.nome }))
}

/**
 * Executa a regra para UM tenant: descobre as turmas e ENFILEIRA um job de import (processado em
 * background por /api/cron/curseduca-jobs — evita o corte de 5min do proxy). Dedup: não cria job novo
 * se já há um pendente/processando cobrindo os mesmos grupos. Fallback inline (com teto) se a tabela
 * de jobs não existir. Retorna um resumo para gravar em `ultimo_resultado`.
 */
export async function executarAutoVinculo(svc: SupabaseClient, tenantId: string, regra: Pick<RegraAutoVinculo, 'termos_incluir' | 'termos_excluir' | 'sincronizar'>): Promise<any> {
  const cfg = await resolverCfg(tenantId)
  if (!cfg) return { ok: false, error: 'Credenciais Curseduca não configuradas/ativas.', em: new Date().toISOString() }

  let alvos: { id: number; nome: string }[]
  try {
    alvos = await descobrirGruposPassaporte(cfg, regra.termos_incluir, regra.termos_excluir)
  } catch (e: any) {
    return { ok: false, error: `Falha ao listar turmas na Curseduca: ${e?.message ?? e}`, em: new Date().toISOString() }
  }
  const nowISO = new Date().toISOString()
  if (!alvos.length) return { ok: true, status: 'sem_turmas', gruposEncontrados: 0, obs: 'Nenhuma turma casou os termos.', em: nowISO }

  const ids = alvos.map((g) => g.id)
  const amostraNomes = alvos.slice(0, 20).map((g) => g.nome)

  // Enfileira (dedup por grupos já pendentes/processando).
  try {
    const { data: pend } = await svc.from('simulado_curseduca_jobs').select('id')
      .eq('tenant_id', tenantId).in('status', ['pendente', 'processando']).contains('grupos', ids).limit(1).maybeSingle()
    if (pend?.id) {
      return { ok: null, status: 'agendado', dedup: true, jobId: (pend as any).id, gruposEncontrados: ids.length, gruposNomes: amostraNomes, em: nowISO }
    }
    const ins = await svc.from('simulado_curseduca_jobs')
      .insert({ tenant_id: tenantId, status: 'pendente', grupos: ids, destino: { tipo: 'nenhum' }, sincronizar: false, criado_por: null })
      .select('id').single()
    if (!ins.error) {
      return { ok: null, status: 'agendado', jobId: (ins.data as any).id, gruposEncontrados: ids.length, gruposNomes: amostraNomes, em: nowISO }
    }
    // Tabela de jobs ausente → roda inline COM teto (não estoura o timeout do tick).
    const r = await executarImport({ tenantId, cfg }, ids, { tipo: 'nenhum' }, false, 400)
    return { ...r, status: 'inline', gruposEncontrados: ids.length, gruposNomes: amostraNomes, em: nowISO }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha ao enfileirar.', gruposEncontrados: ids.length, em: nowISO }
  }
}

/** True se a regra deve rodar agora (por horário do dia em BRT, ou por intervalo). */
export function venceu(regra: Pick<RegraAutoVinculo, 'modo' | 'horario' | 'intervalo_min' | 'ultima_execucao'>, agora = new Date()): boolean {
  const ultima = regra.ultima_execucao ? new Date(regra.ultima_execucao) : null
  if (regra.modo === 'intervalo') {
    const min = Math.max(15, regra.intervalo_min || 1440)
    return !ultima || (agora.getTime() - ultima.getTime()) >= min * 60_000
  }
  // modo 'horario': roda 1x/dia quando passa da hora-alvo (em BRT). Brasil sem horário de verão → -03:00.
  const diaBrt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
  const h = Math.min(23, Math.max(0, regra.horario ?? 3))
  const alvo = new Date(`${diaBrt}T${String(h).padStart(2, '0')}:00:00-03:00`)
  return agora >= alvo && (!ultima || ultima < alvo)
}

/**
 * Varredura agendada (chamada no tick de curseduca-sync): roda as regras ATIVAS cujo agendamento
 * venceu, com lock otimista (só assume se `ultima_execucao` não mudou). Uma por tick, no máximo.
 */
export async function processarAutoVinculosDue(svc: SupabaseClient): Promise<{ rodadas: number }> {
  let regras: RegraAutoVinculo[] = []
  try {
    const { data, error } = await svc.from('simulado_auto_vinculo_passaporte').select(COLS).eq('ativo', true).limit(50)
    if (error) return { rodadas: 0 } // tabela ausente / migração não aplicada → no-op
    regras = (data ?? []) as RegraAutoVinculo[]
  } catch { return { rodadas: 0 } }

  const nowISO = new Date().toISOString()
  let rodadas = 0
  for (const r of regras) {
    if (!venceu(r)) continue
    // Lock otimista: só assume se ultima_execucao continua igual ao lido.
    let lockQ = svc.from('simulado_auto_vinculo_passaporte')
      .update({ ultima_execucao: nowISO, ultimo_resultado: { ok: null, status: 'em_andamento', iniciado_em: nowISO } }).eq('id', r.id)
    lockQ = r.ultima_execucao ? lockQ.eq('ultima_execucao', r.ultima_execucao) : lockQ.is('ultima_execucao', null)
    const { data: lock } = await lockQ.select('id')
    if (!lock?.length) continue // outro tick pegou

    const resultado = await executarAutoVinculo(svc, r.tenant_id, r)
    await svc.from('simulado_auto_vinculo_passaporte').update({ ultimo_resultado: resultado }).eq('id', r.id)
    rodadas++
    if (rodadas >= 2) break // poucas por tick; o resto vem no próximo
  }
  return { rodadas }
}

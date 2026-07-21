'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { executarRecorrecao, contarSessoesRecorrecao, type RecorrecaoJob } from '@/lib/simulado/recorrecao'
import { enfileirarRecorrecao } from '@/lib/queue/recorrecao-queue'

type Politica = 'pontua_todos' | 'desconsidera'
type Resultado = { ok: boolean; error?: string; afetados?: number; processando?: boolean }

// Acima deste nº de sessões finalizadas, a re-correção vai para a fila (assíncrona) — não
// trava o request. Abaixo, roda inline (resultado na hora). Ajustável por env.
const SYNC_MAX = Number(process.env.RECORRECAO_SYNC_MAX ?? 200)

/**
 * Despacha a re-correção: pequeno → inline (síncrono); grande → fila BullMQ (o worker
 * chama /api/internal/recorrecao). A lógica de nota é ÚNICA (lib/simulado/recorrecao.ts),
 * então sync e async produzem exatamente o mesmo resultado. Sem fila disponível, cai p/ inline.
 */
async function despachar(job: RecorrecaoJob, simuladoId: string): Promise<Resultado> {
  const svc = createAdminClient()
  const n = await contarSessoesRecorrecao(svc, simuladoId, job.tenantId)

  const rodarInline = async (): Promise<Resultado> => {
    const r = await executarRecorrecao(svc, job)
    if (r.ok) revalidatePath(`/admin/simulados/${simuladoId}`)
    return r
  }

  if (n <= SYNC_MAX) return rodarInline()

  try {
    await enfileirarRecorrecao(job)
  } catch {
    // Redis/fila indisponível → não deixa o admin sem re-correção: roda inline.
    return rodarInline()
  }
  revalidatePath(`/admin/simulados/${simuladoId}`)
  return { ok: true, processando: true, afetados: n }
}

async function validar(): Promise<{ tenantId: string; atorId: string | null } | { error: string }> {
  if (!(await checkPermission('simulados:update')) && !(await checkPermission('questoes:update'))) {
    return { error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { error: 'Tenant não resolvido.' }
  return { tenantId: access.tenantId, atorId: access.userId ?? null }
}

/** Anula uma questão e re-corrige as sessões finalizadas (nota + ranking + impacto antes/depois). */
export async function anularQuestao(simuladoId: string, questaoId: string, motivo: string, politica: Politica): Promise<Resultado> {
  const v = await validar()
  if ('error' in v) return { ok: false, error: v.error }
  return despachar({ tipo: 'anulacao', tenantId: v.tenantId, atorId: v.atorId, simuladoId, questaoId, motivo, politica }, simuladoId)
}

/** Troca a alternativa correta (gabarito) e re-corrige — ninguém perde ponto pela troca. */
export async function trocarAlternativa(simuladoId: string, questaoId: string, novaAlternativaId: string, motivo: string): Promise<Resultado> {
  const v = await validar()
  if ('error' in v) return { ok: false, error: v.error }
  return despachar({ tipo: 'troca_alternativa', tenantId: v.tenantId, atorId: v.atorId, simuladoId, questaoId, novaAlternativaId, motivo }, simuladoId)
}

/** Remove (desfaz) a correção de uma questão: reverte anulação/troca e re-corrige. */
export async function removerCorrecao(simuladoId: string, questaoId: string): Promise<Resultado> {
  const v = await validar()
  if ('error' in v) return { ok: false, error: v.error }
  return despachar({ tipo: 'remocao', tenantId: v.tenantId, atorId: v.atorId, simuladoId, questaoId }, simuladoId)
}

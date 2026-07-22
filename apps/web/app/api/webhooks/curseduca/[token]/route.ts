import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { executarImport } from '@/lib/curseduca/import-core'
import { resolverCfgCurseduca } from '@/lib/curseduca/cfg'
import { dentroDoLimite } from '@/lib/integracoes/ratelimit'
import { registrarInbox } from '@/lib/integracoes/inbox'

/**
 * Webhook de SINCRONIZAÇÃO da Curseduca por TENANT (igual ao padrão da Guru):
 * URL /api/webhooks/curseduca/<webhook_token>. O token resolve o tenant (sem env-secret).
 *
 * Curseduca é PULL: o POST dispara um import/sincronização dos grupos informados —
 * n8n/Curseduca chama isto quando um membro entra/sai. TODA requisição é logada no inbox
 * (aba Recebidos, fonte "curseduca"). Corpo: { grupos:[<idGrupo>], destino?, sincronizar? }.
 */
export const dynamic = 'force-dynamic'

async function resolverTenant(token: string) {
  const svc = createAdminClient()
  const { data } = await svc.from('simulado_integracao_config').select('tenant_id, ativo').eq('provider', 'curseduca').eq('webhook_token', token).maybeSingle()
  return { tenantId: (data as any)?.tenant_id ?? null, ativo: (data as any)?.ativo ?? false }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  const { tenantId } = await resolverTenant(token)
  await registrarInbox({ provider: 'curseduca', fonte: 'curseduca', metodo: 'GET', token, tenantId, ip, headers, query, status: 200, resultado: tenantId ? 'ping (GET)' : 'ping — token inválido' })
  return NextResponse.json({ ok: true, endpoint: 'curseduca-sync', reconhecido: !!tenantId, dica: 'POST { grupos:[ids], sincronizar? } para importar/sincronizar.' })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const raw = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  const query = Object.fromEntries(new URL(req.url).searchParams.entries())
  const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || null
  let tenantId: string | null = null

  const finish = async (status: number, body: any, resultado: string) => {
    await registrarInbox({ provider: 'curseduca', fonte: 'curseduca', metodo: 'POST', token, tenantId, ip, headers, query, raw, status, resultado })
    return NextResponse.json(body, { status })
  }

  const t = await resolverTenant(token)
  if (!t.tenantId) return finish(404, { ok: false, message: 'token inválido' }, 'token inválido')
  const tid: string = t.tenantId
  tenantId = tid
  if (!t.ativo) return finish(403, { ok: false, message: 'integração pausada' }, 'integração pausada (ative para sincronizar)')

  if (!(await dentroDoLimite('curseduca-sync', token, 120, 60_000))) return finish(429, { ok: false, message: 'rate limit' }, 'rate limit')

  let body: any
  try { body = raw ? JSON.parse(raw) : {} } catch { return finish(400, { ok: false, message: 'JSON inválido' }, 'payload não é JSON válido') }

  const grupos = Array.isArray(body?.grupos) ? body.grupos.map(Number).filter((n: number) => Number.isFinite(n)) : []
  if (!grupos.length) return finish(400, { ok: false, message: 'Informe grupos[] (ids dos grupos Curseduca a sincronizar).' }, 'sem grupos[] no corpo')

  const cfg = await resolverCfgCurseduca(tid)
  if (!cfg) return finish(400, { ok: false, message: 'Credenciais Curseduca não configuradas (Integrações → Curseduca).' }, 'credenciais Curseduca ausentes')

  const svc = createAdminClient()
  const destino = body?.destino ?? { tipo: 'nenhum' }
  const sincronizar = !!body?.sincronizar

  // ENFILEIRA em vez de processar inline: um sync grande travaria/estouraria o timeout do
  // webhook, e o provedor re-entregaria → processamento duplicado. O cron /api/cron/curseduca-jobs
  // processa em background (sem limite de detalhe). Dedup: se já há um job pendente que cobre
  // estes grupos, reaproveita (evita pile-up de webhooks repetidos do mesmo membro/grupo).
  try {
    const { data: pend } = await svc
      .from('simulado_curseduca_jobs')
      .select('id')
      .eq('tenant_id', tid)
      .eq('status', 'pendente')
      .contains('grupos', grupos)
      .limit(1)
      .maybeSingle()
    if (pend?.id) return finish(202, { ok: true, agendado: true, jobId: (pend as any).id, dedup: true }, `já agendado (${grupos.length} grupo(s))`)

    const { data, error } = await svc
      .from('simulado_curseduca_jobs')
      .insert({ tenant_id: tid, status: 'pendente', grupos, destino, sincronizar, criado_por: null })
      .select('id')
      .single()
    if (error) throw error
    return finish(202, { ok: true, agendado: true, jobId: (data as any).id }, `agendado: ${grupos.length} grupo(s) — processa em background`)
  } catch (e: any) {
    // Sem a tabela de jobs (migration não rodada) → processa inline COM limite p/ não estourar timeout.
    if (/relation|does not exist|schema cache|column/i.test(e?.message ?? '')) {
      try {
        const resultado = await executarImport({ tenantId: tid, cfg }, grupos, destino, sincronizar, 400)
        return finish(200, { ok: true, resultado }, `sincronizado inline (sem fila): ${grupos.length} grupo(s)`)
      } catch (e2: any) {
        return finish(500, { ok: false, message: e2?.message ?? 'Falha na importação.' }, `erro: ${e2?.message ?? 'import'}`)
      }
    }
    return finish(500, { ok: false, message: e?.message ?? 'Falha ao agendar.' }, `erro: ${e?.message ?? 'agendar'}`)
  }
}

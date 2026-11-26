import { NextRequest, NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/seguranca/cron-auth'
import { comLockCron } from '@/lib/cron/lock'
import { createAdminClient } from '@/lib/supabase/server'

// Drenador do OUTBOX (A6/Fase 7). O evento já é gravado na mutação (reconciliacao/documentos); aqui ele
// é consumido de forma assíncrona e idempotente. Protegido por segredo de cron (header x-cron-secret ou
// ?secret=) — pode ser chamado por um cron do VPS ou pelo worker BullMQ. Marca processado_em ao fim.
// Ganchos por tipo (notificação/IA) ficam centralizados aqui, fora do caminho da request do usuário.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function tratar(tipo: string, payload: any, tenantId: string | null): Promise<void> {
  // Ganchos futuros: 'anotacao.reconciliar' c/ revisao → fila de revisão/alinhamento por IA;
  // 'aviso.criado' → notificação in-app ao aluno; 'documento.*' → invalidação de cache.
  switch (tipo) {
    case 'documento.atualizado': {
      // Recontagem idempotente das páginas da versão atual (no-op se já contada) + invalidação de cache. Não re-emite evento.
      const docId = payload?.documento_id
      if (tenantId && typeof docId === 'string') {
        const { sincronizarPaginasDocumento } = await import('@/lib/conteudo/paginas-sync')
        await sincronizarPaginasDocumento(createAdminClient(), tenantId, docId)
      }
      return
    }
    case 'documento.importado':
    case 'anotacao.reconciliar':
    case 'aviso.criado':
    default:
      return // no-op idempotente por ora; o efeito principal já ocorreu na transação de origem
  }
}

// Limites por rodada (o consumidor 'documento.atualizado' pode baixar PDF/converter DOCX quando a versão
// não tem páginas contadas — caro). Rodada curta + orçamento de tempo; o worker chama a cada ~120s e o backlog
// drena aos poucos. Docs repetidos no backlog são processados 1x e TODOS os eventos pendentes do mesmo doc são baixados juntos.
const LIMITE_PADRAO = 25
const LIMITE_MAX = 100
const ORCAMENTO_MS = 40_000

async function executar(req: NextRequest) {
  const limite = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get('limite')) || LIMITE_PADRAO, LIMITE_MAX))
  const svc = createAdminClient()
  const { data: eventos, error } = await svc.from('simulado_conteudo_outbox')
    .select('id, tenant_id, tipo, payload').is('processado_em', null).order('criado_em', { ascending: true }).limit(limite)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const t0 = Date.now()
  const jaFeitos = new Set<string>() // tenant:doc já tratados nesta rodada
  let ok = 0, deduplicados = 0
  for (const ev of eventos ?? []) {
    if (Date.now() - t0 > ORCAMENTO_MS) break
    const tenantId = (ev as { tenant_id?: string | null }).tenant_id ?? null
    const docId = ev.tipo === 'documento.atualizado' ? (ev.payload as any)?.documento_id : null
    const chave = typeof docId === 'string' ? `${tenantId}:${docId}` : null
    try {
      if (chave && jaFeitos.has(chave)) { deduplicados++ } else {
        await tratar(ev.tipo, ev.payload, tenantId)
        if (chave) jaFeitos.add(chave)
      }
      const agora = new Date().toISOString()
      await svc.from('simulado_conteudo_outbox').update({ processado_em: agora }).eq('id', ev.id)
      // Baixa em massa os demais eventos pendentes do MESMO doc (o handler é idempotente/estado-atual): drena o backlog duplicado sem reprocessar.
      if (chave && tenantId && typeof docId === 'string') {
        const r = await svc.from('simulado_conteudo_outbox').update({ processado_em: agora })
          .eq('tenant_id', tenantId).eq('tipo', 'documento.atualizado').eq('payload->>documento_id', docId).is('processado_em', null).select('id')
        deduplicados += r.data?.length ?? 0
      }
      ok++
    }
    catch (e) { console.error('[outbox] evento', ev.id, (e as Error).message) }
  }
  return NextResponse.json({ ok: true, processados: ok, deduplicados, total: (eventos ?? []).length })
}

// Lock compartilhado (réplicas/worker): rodada anterior ainda rodando → 200 { skipped: true }. Autentica via CRON_SECRET (cronAutorizado).
export const POST = (req: NextRequest) => process.env.CONTEUDO_CRON_SECRET && cronAutorizado(req, ['CONTEUDO_CRON_SECRET']) && !cronAutorizado(req)
  ? executar(req) // segredo legado (CONTEUDO_CRON_SECRET): sem lock Redis
  : comLockCron(req, 'conteudo-outbox', () => executar(req), 3 * 60_000)

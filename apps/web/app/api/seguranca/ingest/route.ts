import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { cronAutorizado } from '@/lib/seguranca/auth'
import { ingestSchema } from '@/lib/seguranca/ingest-schema'
import {
  achadosDeAtualizacoes, contar, finalizarVarredura, iniciarVarredura, persistirAchados, persistirAtualizacoes,
} from '@/lib/seguranca/persistencia'

export const dynamic = 'force-dynamic'

/**
 * Ingestão de resultados das varreduras de CÓDIGO/DEPENDÊNCIAS (scripts de dev/CI, que têm o fonte).
 * Autorizada por CRON_SECRET; mesma persistência/dedupe/notificação da varredura de runtime.
 */
export async function POST(req: NextRequest) {
  if (!cronAutorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  let corpo: unknown
  try { corpo = await req.json() } catch { return NextResponse.json({ message: 'JSON inválido.' }, { status: 400 }) }
  const parsed = ingestSchema.safeParse(corpo)
  if (!parsed.success) return NextResponse.json({ message: 'Payload inválido.', erros: parsed.error.flatten() }, { status: 400 })
  const { prefixos, achados, atualizacoes, cobreAtualizacoes } = parsed.data

  const svc = createAdminClient()
  const varreduraId = await iniciarVarredura(svc, 'ci')
  const todos = [...achados, ...(atualizacoes ? achadosDeAtualizacoes(atualizacoes, 'audit') : [])]
  if (atualizacoes) await persistirAtualizacoes(svc, atualizacoes, 'ci', !!cobreAtualizacoes)
  const p = await persistirAchados(svc, todos, { origem: 'ci', varreduraId, prefixos })
  const c = contar(todos)
  await finalizarVarredura(svc, varreduraId, {
    checagens: prefixos, erros: [], novos: p.novos, reabertos: p.reabertos, piorados: p.piorados, resolvidos: p.resolvidos,
    persistentes: p.persistentes, notificados: p.notificados, atual: todos.map((a) => ({ fp: a.fingerprint, sev: a.severidade, titulo: a.titulo })),
  }, c)
  return NextResponse.json({ ok: true, varreduraId, ...c, novos: p.novos.length, resolvidos: p.resolvidos.length, notificados: p.notificados })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { hojeISO } from '@/lib/cronograma/datas'
import { atualizarHomeSnapshot } from '@/lib/home/snapshot'

export const dynamic = 'force-dynamic'

// Roll diário do snapshot da Início (backend-first): recomputa os snapshots cujo `dia` já virou
// (dia < hoje) para alunos que JÁ usaram a Início — assim a 1ª abertura do dia já vem pronta, sem o
// aluno pagar o custo do recálculo no render. Bounded (teto) p/ não varrer tudo. Protegido por CRON_SECRET;
// chamado periodicamente pelo worker. Idempotente e best-effort. Ver docs/ARQUITETURA-BACKEND-FIRST.md.
const TETO = 200

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()
  const hoje = hojeISO()
  let rolados = 0
  try {
    const { data } = await svc.from('simulado_home_snapshot')
      .select('tenant_id, estudante_id').lt('dia', hoje).order('atualizado_em', { ascending: true }).limit(TETO)
    for (const r of (data ?? []) as { tenant_id: string; estudante_id: string }[]) {
      try { await atualizarHomeSnapshot(svc, r.tenant_id, r.estudante_id); rolados++ } catch { /* best-effort */ }
    }
  } catch { /* tabela ausente (sem migração) → nada a rolar */ }
  return NextResponse.json({ ok: true, rolados })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { atualizarCatalogoSnapshot } from '@/lib/nova/cursos-snapshot'

export const dynamic = 'force-dynamic'

// Roll do snapshot de Cursos (backend-first): recomputa os snapshots MAIS ANTIGOS (por atualizado_em)
// para quem já usou o catálogo — assim a abertura fica pronta sem o aluno pagar o custo do recálculo da
// árvore no render. Diferente do painel-roll, NÃO há `dia` (o catálogo não vira por data) → a seleção é
// por "mais velhos primeiro", bounded (teto) p/ não varrer tudo. Protegido por CRON_SECRET; chamado
// periodicamente pelo worker. Idempotente e best-effort. Ver docs/ARQUITETURA-BACKEND-FIRST.md.
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
  let rolados = 0
  try {
    const { data } = await svc.from('simulado_cursos_snapshot')
      .select('tenant_id, estudante_id').order('atualizado_em', { ascending: true }).limit(TETO)
    for (const r of (data ?? []) as { tenant_id: string; estudante_id: string }[]) {
      try { await atualizarCatalogoSnapshot(svc, r.tenant_id, r.estudante_id); rolados++ } catch { /* best-effort */ }
    }
  } catch { /* tabela ausente (sem migração) → nada a rolar */ }
  return NextResponse.json({ ok: true, rolados })
}

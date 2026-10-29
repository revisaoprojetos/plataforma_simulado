import { NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { estadoParaRender } from '@/lib/cronograma/adaptativo/dados'
import { snapshotParaGrade } from '@/lib/cronograma/adaptativo/docx-adapter'
import { gerarDocxCronograma } from '@/lib/cronograma/docx/cronograma'
import { acharPaleta } from '@/lib/cronograma/paletas'

// GET /api/aluno/cronograma/adaptativo/docx — baixa o DOCX do Cronograma Adaptativo.
// Gerado no processo (lib `docx`), sem Chromium. A4 paisagem, 1 página por semana.
export const dynamic = 'force-dynamic'

export async function GET() {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  const svc = createAdminClient()
  const r = await estadoParaRender(svc, sessao.tenantId, sessao.estudanteId)
  if (!r) return NextResponse.json({ ok: false, message: 'Você ainda não tem cronograma.' }, { status: 404 })
  const grade = snapshotParaGrade(r.snapshot)
  const buf = await gerarDocxCronograma(grade, { nomeAluno: sessao.nome || 'Aluno', nomeCronograma: r.titulo || 'Cronograma Adaptativo', paleta: acharPaleta('revisao') })
  const nome = `cronograma-${(r.titulo || 'adaptativo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.docx`
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'no-store',
    },
  })
}

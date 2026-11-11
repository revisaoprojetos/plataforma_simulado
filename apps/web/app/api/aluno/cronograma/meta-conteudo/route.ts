import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { UUID_META_RE } from '@/lib/cronograma/meta-valida'
import { alunoPodeAbrirDocumento } from '@/lib/conteudo/leitor'

// GET /api/aluno/cronograma/meta-conteudo?emissaoId=<uuid>&docId=<uuid>
// Antes de o iframe do cronograma Revisão navegar para o leitor, confirma que o ALUNO pode abrir o documento
// (controle de acesso da Biblioteca: pasta + documento, herança pai_id). O leitor revalida ao abrir (defesa em profundidade).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  const emissaoId = req.nextUrl.searchParams.get('emissaoId') ?? ''
  const docId = req.nextUrl.searchParams.get('docId') ?? ''
  if (!UUID_META_RE.test(emissaoId) || !UUID_META_RE.test(docId)) return NextResponse.json({ ok: false, message: 'Dados inválidos.' }, { status: 400 })
  const { data: em } = await createAdminClient().from('simulado_cronograma_emissoes').select('id')
    .eq('id', emissaoId).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).maybeSingle()
  if (!em) return NextResponse.json({ ok: false, message: 'Cronograma não encontrado.' }, { status: 404 })
  const pode = await alunoPodeAbrirDocumento(sessao.tenantId, sessao.estudanteId, docId).catch(() => false)
  return NextResponse.json({ ok: true, pode }, { headers: { 'Cache-Control': 'no-store' } })
}

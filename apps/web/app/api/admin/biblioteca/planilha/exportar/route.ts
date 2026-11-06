import { NextRequest, NextResponse } from 'next/server'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarEscopo, gerarPlanilha, type CategoriaPlanilha } from '@/lib/conteudo/planilha'

// EXPORTA os conteúdos (sem pastas) de uma pasta + subpastas — ou da biblioteca inteira — em .xlsx, com
// todas as informações + os metadados editáveis. Rota de API (não server action): é download de arquivo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  if (!(await checkPermission('configuracoes:view'))) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Tenant não resolvido.' }, { status: 400 })

  const sp = req.nextUrl.searchParams
  const cat = sp.get('categoria')
  const categoria: CategoriaPlanilha = cat === 'jurisclub' ? 'jurisclub' : cat === 'modelo_caderno' ? 'modelo_caderno' : 'conteudo'
  const p = sp.get('pasta')
  const pastaId = p && UUID_RE.test(p) ? p : null

  try {
    const esc = await carregarEscopo(createAdminClient(), tenantId, categoria, pastaId)
    if ('erro' in esc) return NextResponse.json({ error: esc.erro }, { status: 404 })
    const buf = await gerarPlanilha(esc)
    const base = `conteudos-${esc.nomePasta}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'conteudos'
    const dia = new Date().toISOString().slice(0, 10)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}-${dia}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || 'Falha ao exportar.' }, { status: 500 })
  }
}

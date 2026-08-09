import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { normalizarBuilder } from '@/lib/caderno-teste/tipos'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import { gerarHtmlItem, type DiscBanco } from '@/lib/caderno-teste/exportar-html'
import { previewQuestoesBanco } from '@/app/admin/cadernos-teste/actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Renderiza INLINE (text/html) um grupo do caderno de teste — para preview em iframe na aba do banco.
 * Reusa o mesmo gerador (gerarHtmlItem) do download, então a prévia bate com a edição.
 * GET /imprimir/caderno-teste/[id]?grupo=<itemId>&aluno=<id>&embed=1
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) {
    return new NextResponse('Sem permissão.', { status: 403 })
  }
  const { id: cadernoId } = await ctx.params
  const url = new URL(req.url)
  const grupoId = url.searchParams.get('grupo') ?? ''
  const alunoId = url.searchParams.get('aluno') || undefined

  const svc = createAdminClient()
  const { data: cad } = await svc.from('simulado_cadernos_teste').select('nome, config').eq('id', cadernoId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!cad) return new NextResponse('Caderno não encontrado.', { status: 404 })

  const builder = normalizarBuilder((cad as any).config, (cad as any).nome)
  const item = builder.itens.find((i) => i.id === grupoId) ?? builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  if (!item) return new NextResponse('Grupo não encontrado.', { status: 404 })

  const bancoId = builder.bancoId
  let vars: Record<string, string> = {}
  let disciplinas: DiscBanco[] = []
  let questoes: any[] = []
  if (bancoId) {
    const { data: pasta } = await svc.from('simulado_pastas').select('nome, grupos').eq('id', bancoId).eq('tenant_id', access.tenantId).maybeSingle()
    const bancoNome = ((pasta as any)?.nome ?? 'Simulado') as string
    if (item.modalidade === 'diagnostico') {
      if (alunoId) { try { const regs = await carregarRegistros(svc, access.tenantId, bancoId, bancoNome, undefined, alunoId, 1); if (regs[0]) vars = regs[0].vars } catch { /* sem dados */ } }
      const nomes = new Set<string>()
      for (const g of (Array.isArray((pasta as any)?.grupos) ? (pasta as any).grupos : [])) for (const d of (g?.disciplinas ?? [])) if (typeof d === 'string' && d.trim()) nomes.add(d.trim())
      disciplinas = [...nomes].map((nome) => ({ nome, chave: slugDiag(nome) }))
      if (!disciplinas.length) {
        const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase())
        disciplinas = Object.keys(vars).filter((k) => k.startsWith('total_') && !k.startsWith('total_pilar_') && k !== 'total_questoes').map((k) => { const c = k.slice(6); return { nome: human(c), chave: c } })
      }
    } else {
      try { const r = await previewQuestoesBanco(bancoId); questoes = r.questoes ?? [] } catch { /* sem questões */ }
    }
  }

  const html = gerarHtmlItem(item, { vars, questoes, disciplinas })
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

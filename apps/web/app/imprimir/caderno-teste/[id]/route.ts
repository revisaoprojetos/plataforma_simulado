import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { normalizarBuilder } from '@/lib/caderno-teste/tipos'
import { gerarHtmlItem, type DiscBanco } from '@/lib/caderno-teste/exportar-html'
import { previewQuestoesBanco, dadosBancoTeste } from '@/app/admin/cadernos-teste/actions'

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
    if (item.modalidade === 'diagnostico') {
      // MESMA fonte do editor: disciplinas reais (das questões do banco) + dados do aluno (1º por padrão),
      // para os cards de disciplina e os textos aparecerem populados na prévia.
      try {
        const rd = await dadosBancoTeste(bancoId)
        disciplinas = rd.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave, pilar: d.pilar }))
        const reg = alunoId ? rd.registros.find((r) => r.id === alunoId) : rd.registros[0]
        if (reg) vars = reg.vars
      } catch { /* segue com o conteúdo do modelo */ }
    } else {
      try { const r = await previewQuestoesBanco(bancoId); questoes = r.questoes ?? [] } catch { /* sem questões */ }
    }
  }

  const html = gerarHtmlItem(item, { vars, questoes, disciplinas })
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { normalizarBuilder, novoItem, type Modalidade } from '@/lib/caderno-teste/tipos'
import { slugDiag } from '@/lib/caderno-teste/diagnostico'
import { gerarHtmlItem, gerarWordDiagnostico, type DiscBanco } from '@/lib/caderno-teste/exportar-html'
import { previewQuestoesBanco } from '@/app/admin/cadernos-teste/actions'

const MODS: Modalidade[] = ['folha_respostas', 'caderno_questoes', 'diagnostico']
function baixar(html: string, nome: string, formato: string) {
  const arq = (nome || 'caderno').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'caderno'
  const ext = formato === 'word' ? 'doc' : 'html'
  const ct = formato === 'word' ? 'application/msword; charset=utf-8' : 'text/html; charset=utf-8'
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': ct, 'Content-Disposition': `attachment; filename="${arq}.${ext}"` } })
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Download do grupo (caderno de teste) em HTML ou Word (.doc HTML). GET ?caderno&grupo&aluno&formato */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) {
    return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
  }
  const url = new URL(req.url)
  const cadernoId = url.searchParams.get('caderno') ?? ''
  const grupoId = url.searchParams.get('grupo') ?? ''
  const alunoId = url.searchParams.get('aluno') || undefined
  const formato = url.searchParams.get('formato') === 'word' ? 'word' : 'html'

  // Modo MODELO: baixa direto um modelo do pop-up (sem caderno salvo) — já com o conteúdo do modelo.
  const modeloId = url.searchParams.get('modelo')
  const modalidadeParam = url.searchParams.get('modalidade')
  if (modeloId && modalidadeParam) {
    const mod = (MODS.includes(modalidadeParam as Modalidade) ? modalidadeParam : 'caderno_questoes') as Modalidade
    const item = novoItem(mod, modeloId)
    return baixar(gerarHtmlItem(item, {}), item.ajustes.titulo || 'modelo', formato)
  }

  if (!cadernoId) return NextResponse.json({ ok: false, error: 'Caderno não informado.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: cad } = await svc.from('simulado_cadernos_teste').select('nome, config').eq('id', cadernoId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!cad) return NextResponse.json({ ok: false, error: 'Caderno não encontrado.' }, { status: 404 })

  const builder = normalizarBuilder((cad as any).config, (cad as any).nome)
  const item = builder.itens.find((i) => i.id === grupoId) ?? builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  if (!item) return NextResponse.json({ ok: false, error: 'Grupo não encontrado.' }, { status: 404 })

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

  // Word do diagnóstico = documento SEMÂNTICO (editar + reimportar, tokens preservados). Demais
  // formatos/modalidades usam o HTML visual.
  const html = (formato === 'word' && item.modalidade === 'diagnostico')
    ? gerarWordDiagnostico(item, disciplinas)
    : gerarHtmlItem(item, { vars, questoes, disciplinas })
  return baixar(html, item.ajustes.titulo || (cad as any).nome || 'caderno', formato)
}

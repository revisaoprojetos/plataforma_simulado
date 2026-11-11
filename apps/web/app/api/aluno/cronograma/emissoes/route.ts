import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { regenerarEmissaoDoAluno } from '@/lib/cronograma/regenerar-emissao'
import { revalidatePath } from 'next/cache'
import { renomearEmissao, arquivarEmissao, apagarEmissao } from '@/app/aluno/(portal)/cronograma/emissoes-actions'
import { fixarCronograma } from '@/lib/cronograma/fixar'
import { refrescarAposMudarFoco } from '@/lib/cronograma/foco-refresh'

// POST /api/aluno/cronograma/emissoes — fixar/renomear/arquivar um cronograma Revisão (emissão) do aluno.
// Rota de API (server actions são rejeitadas em domínio custom / iframe Curseduca). A autorização por dono fica
// nas próprias funções (sessão + tenant + estudante).
//  { acao:'regenerar', id } → cria NOVA emissão a partir do formulário e migra checks/notas (idempotente: 2 cliques = 1 emissão)
//  { acao:'fixar', id }   { acao:'renomear', id, titulo }   { acao:'arquivar', id, arquivar?: boolean }
// Fixar é ATÔMICO (RPC cronograma_fixar_plano) e vale para os dois tipos de cronograma (só 1 em foco por aluno).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 }) }
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ ok: false, message: 'Cronograma ausente.' }, { status: 400 })
  const acao = String(body.acao || '')
  const { tenantId, estudanteId } = sessao
  // O hub faz router.refresh() logo após a resposta → o snapshot do painel precisa estar pronto (await).
  const atualizarFoco = () => refrescarAposMudarFoco(createAdminClient(), tenantId, estudanteId).catch(() => {})

  if (acao === 'regenerar') {
    const r = await regenerarEmissaoDoAluno({ tenantId, estudanteId, nome: sessao.nome }, id)
    if (r.ok) revalidatePath('/aluno/cronograma')
    return NextResponse.json(r.ok ? r : { ok: false, message: r.error ?? 'Não foi possível gerar novamente.' }, { status: r.ok ? 200 : /não encontrado|acesso/i.test(r.error ?? '') ? 404 : 400 })
  }
  if (acao === 'fixar') {
    const r = await fixarCronograma(createAdminClient(), tenantId, estudanteId, 'revisao', id)
    if (r.ok) await atualizarFoco()
    const msg = r.error === 'migracao_pendente' ? 'Fixar cronograma Revisão ainda não está disponível (atualização pendente).' : r.error === 'nao_encontrado' ? 'Cronograma não encontrado.' : r.error
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, message: msg }, { status: r.ok ? 200 : r.error === 'nao_encontrado' ? 404 : 500 })
  }
  if (acao === 'renomear') {
    const r = await renomearEmissao(id, String(body.titulo || ''))
    if (r.ok) await atualizarFoco() // o nome do plano em foco aparece no painel
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (acao === 'arquivar') {
    const r = await arquivarEmissao(id, body.arquivar !== false)
    if (r.ok) await atualizarFoco()
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }
  if (acao === 'apagar') {
    const r = await apagarEmissao(id)
    // O snapshot do painel só depende do plano em FOCO: apagar um que não está em foco não muda nada (resposta imediata).
    if (r.ok && r.eraFixada) await atualizarFoco()
    return NextResponse.json({ ok: r.ok, error: r.error }, { status: r.ok ? 200 : 400 })
  }
  return NextResponse.json({ ok: false, message: 'Ação inválida.' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { acessoAoProduto } from '@/lib/produtos/aluno'
import { arvoreBibliotecaAluno, alunoPodeAbrirDocumento } from '@/lib/conteudo/leitor'
import { documentosDoProduto, atualizacoesParaAluno } from '@/lib/conteudo/atualizacoes-registro'

// GET /api/aluno/atualizacoes?produtoId=<uuid>|cursoId=<pasta-uuid>|documentoId=<uuid>&page=1&pp=10
// Registro de atualizações (pontos de versão) PUBLICADAS e visíveis dos materiais a que o aluno tem acesso.
//  - produtoId: exige acesso ao produto (acessoAoProduto); materiais = documentos do currículo do produto.
//  - documentoId: aba "Atualizações" do leitor; exige o MESMO gate do leitor (alunoPodeAbrirDocumento); só aquele documento, mais recente primeiro.
//  - cursoId (curso = pasta da Biblioteca): materiais = os que o aluno enxerga na árvore da pasta (já filtrada por acesso).
// Rota de API (não server action) para funcionar em domínio custom / iframe Curseduca. Paginada no servidor; sem cálculo no render.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Documentos visíveis ao aluno numa pasta-curso e subpastas (profundidade/volume limitados). */
async function docsDaPasta(estudanteId: string, raizId: string): Promise<string[]> {
  const docs = new Set<string>()
  const fila: { id: string; nivel: number }[] = [{ id: raizId, nivel: 0 }]
  let chamadas = 0
  while (fila.length && chamadas < 30) {
    const { id, nivel } = fila.shift()!
    chamadas++
    const arv = await arvoreBibliotecaAluno(estudanteId, id).catch(() => null)
    if (!arv) continue
    for (const d of arv.documentos ?? []) docs.add(d.id)
    if (nivel < 3) for (const p of arv.pastas ?? []) fila.push({ id: p.id, nivel: nivel + 1 })
  }
  return [...docs]
}

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })

  const sp = new URL(request.url).searchParams
  const produtoId = sp.get('produtoId')
  const cursoId = sp.get('cursoId')
  const documentoId = sp.get('documentoId')
  const page = Math.max(1, Math.floor(Number(sp.get('page'))) || 1)
  const pp = Math.min(30, Math.max(1, Math.floor(Number(sp.get('pp'))) || 10))
  const ehDoc = !!documentoId && UUID.test(documentoId)
  if (!ehDoc && (!produtoId || !UUID.test(produtoId)) && (!cursoId || !UUID.test(cursoId))) return NextResponse.json({ message: 'Informe documentoId, produtoId ou cursoId.' }, { status: 400 })

  const svc = createAdminClient()
  let docIds: string[] = []
  if (ehDoc) {
    // Mesmo gate do leitor (publicado, não excluído, acesso por pasta/documento/grupo); sem acesso → 403 (não revela existência).
    const pode = await alunoPodeAbrirDocumento(sessao.tenantId, sessao.estudanteId, documentoId!).catch(() => false)
    if (!pode) return NextResponse.json({ message: 'Sem acesso a este material.' }, { status: 403 })
    docIds = [documentoId!]
  } else if (produtoId && UUID.test(produtoId)) {
    const acesso = await acessoAoProduto(svc, sessao.tenantId, sessao.estudanteId, produtoId).catch(() => null)
    if (!acesso) return NextResponse.json({ message: 'Sem acesso a este produto.' }, { status: 403 })
    docIds = await documentosDoProduto(svc, sessao.tenantId, produtoId)
  } else if (cursoId) {
    docIds = await docsDaPasta(sessao.estudanteId, cursoId)
  }

  const r = await atualizacoesParaAluno(svc, sessao.tenantId, { docIds, produtoId: !ehDoc && produtoId && UUID.test(produtoId) ? produtoId : null, page, pp })
  return NextResponse.json({ rows: r.rows, total: r.total, page, pp })
}

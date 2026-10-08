import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission } from '@/lib/auth/permissions'
import { lerDesafioJogo, mapearParaDESAFIO, preencherTesesPorQuiz, temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'

// GET /api/jurisprudencia/conteudo?desafio=<pastaId>
// Devolve { CONFIG, MATERIAS, FINAL, DIAS } (mapeado de desafio_jogo). Gate por sessão + acesso à pasta.
// Prévia do admin (Designer): sem sessão de aluno, um admin com permissão vê o conteúdo real.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  const admin = sessao ? false : await checkPermission('leitura:view')
  if (!sessao && !admin) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const desafioId = request.nextUrl.searchParams.get('desafio')
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  const dj = await lerDesafioJogo(svc, desafioId)
  if (dj === null) return NextResponse.json({ error: 'Desafio não encontrado.' }, { status: 404 })

  // Aluno passa pelo gate de acesso à pasta; admin (prévia) vê tudo.
  if (sessao && !(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  // As teses do arcade vêm das "Questões do conteúdo" (QuizConteudoAdmin) de cada dia — mesma fonte da Lei Seca.
  dj.dias = await preencherTesesPorQuiz(svc, dj.dias ?? {})

  return NextResponse.json(mapearParaDESAFIO(dj))
}

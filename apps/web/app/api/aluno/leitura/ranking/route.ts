import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarRankingModulo, anonimizarRankingParaAluno } from '@/lib/leitura/ranking'

// GET /api/aluno/leitura/ranking?modulo=<id> — ranking do módulo de leitura, carregado SOB DEMANDA
// (lazy) só quando o aluno abre a aba Ranking. Tira o ranking (1000+ alunos) da leva crítica de abrir
// o desafio, que ficava lenta (RPC pesado + payload grande enviado mesmo pra quem só vê a Trilha).
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const modulo = request.nextUrl.searchParams.get('modulo')
  if (!modulo) return NextResponse.json({ itens: [], gamAtivo: false, pontuacao: null })
  try {
    const raw = await carregarRankingModulo(modulo, sessao.tenantId)
    // PRIVACIDADE: outros alunos só por iniciais (sem nome/e-mail); a linha do próprio aluno mantém o nome.
    const ranking = anonimizarRankingParaAluno(raw, sessao.estudanteId)
    return NextResponse.json(ranking)
  } catch {
    return NextResponse.json({ itens: [], gamAtivo: false, pontuacao: null })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { gerarCronograma } from '@/app/aluno/(portal)/cronograma/actions'
import { proximaSegunda, hojeISO } from '@/lib/cronograma/datas'
import type { PeriodicidadeRevisao } from '@/lib/cronograma/tipos'

// POST /api/aluno/cronograma/gerar — cria uma emissão a partir do cronograma-base escolhido no wizard
// do design novo. Rota de API (não server action — landmine domínio custom). Datas/revisão com defaults
// sensatos (início = próxima segunda; revisão a cada 6 blocos quando ativa).
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 })
  let body: { cronogramaId?: string; nome?: string; inicio?: string; revisaoAtiva?: boolean; revisaoCada?: number; semDatas?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 }) }
  if (!body.cronogramaId) return NextResponse.json({ ok: false, message: 'Escolha um cronograma base.' }, { status: 400 })

  const inicio = proximaSegunda(body.inicio && /^\d{4}-\d{2}-\d{2}$/.test(body.inicio) ? body.inicio : hojeISO())
  const cadaOk: PeriodicidadeRevisao[] = [4, 6, 8, 10, 12]
  const cada = (cadaOk.includes((body.revisaoCada ?? 6) as PeriodicidadeRevisao) ? body.revisaoCada : 6) as PeriodicidadeRevisao
  const opcoes = { inicio, revisao: { ativo: body.revisaoAtiva !== false, cada }, recesso: { modo: 'nenhum' as const } }
  const nome = (body.nome || 'Meu cronograma').trim().slice(0, 80)

  const r = await gerarCronograma(body.cronogramaId, opcoes, { nome, paleta: 'revisao', semDatas: !!body.semDatas }, true)
  if (!r.ok) return NextResponse.json({ ok: false, message: r.error ?? 'Falha ao gerar.' }, { status: r.semAcesso ? 403 : 500 })
  return NextResponse.json({ ok: true, emissaoId: r.emissaoId ?? null })
}

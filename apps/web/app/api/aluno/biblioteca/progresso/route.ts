import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'
import { registrarProgressoLeituraAluno } from '@/lib/conteudo/leitor'

// POST /api/aluno/biblioteca/progresso — auto-save do progresso de leitura de uma aula da Biblioteca.
// Aceita sendBeacon (text/plain ou application/json): parse tolerante.
export const dynamic = 'force-dynamic'

const schema = z.object({
  documentoId: z.string().uuid(),
  versaoId: z.string().uuid().nullish(),
  pagina: z.number().int().min(1).max(100000).nullish(),
  totalPaginas: z.number().int().min(1).max(100000).nullish(),
  pct: z.number().min(0).max(100).nullish(),
  tempoIncSeg: z.number().min(0).max(600).optional(),
  concluir: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  // Admin visualizando a conta do aluno (impersonation) NUNCA grava progresso em nome dele.
  if (sessao.impersonation) return NextResponse.json({ ok: true, ignorado: true })

  let raw: unknown
  try { raw = JSON.parse(await request.text()) } catch { return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 }) }
  const p = schema.safeParse(raw)
  if (!p.success) return NextResponse.json({ message: 'Dados inválidos.' }, { status: 400 })

  // Teto de abuso por aluno (o rate-limit de 5s/doc fica no helper, por banco).
  if (!rateLimit(`bib-prog:${sessao.tenantId}:${sessao.estudanteId}`, 120, 60_000).ok) {
    return NextResponse.json({ ok: true, ignorado: true })
  }

  try {
    const r = await registrarProgressoLeituraAluno(sessao.tenantId, sessao.estudanteId, p.data.documentoId, p.data)
    if (!r) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
    return NextResponse.json(r)
  } catch {
    return NextResponse.json({ message: 'Erro ao gravar progresso.' }, { status: 500 })
  }
}

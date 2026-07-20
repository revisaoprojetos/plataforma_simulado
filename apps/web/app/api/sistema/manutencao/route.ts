import { NextResponse } from 'next/server'
import { getManutencaoSistema, emManutencaoAgora } from '@/lib/sistema/manutencao'

export const dynamic = 'force-dynamic'

// GET /api/sistema/manutencao — estado atual da manutenção (usado pelo monitor do aluno).
export async function GET() {
  const m = await getManutencaoSistema()
  return NextResponse.json(
    {
      ativo: m.ativo,
      inicio: m.inicio,
      fim: m.fim,
      avisos: m.avisos,
      titulo: m.titulo,
      mensagem: m.mensagem,
      agora: emManutencaoAgora(m),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

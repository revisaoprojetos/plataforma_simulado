import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { listarHistoricoParaExportar } from '@/lib/admin-revisao/atualizacoes'
import { LIMITE_CSV, lerFiltrosHistorico, montarCsv } from '@/lib/admin-revisao/atualizacoes-filtros'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { formatBrt, hojeBrtISO } from '@/lib/brt'

export const dynamic = 'force-dynamic'

const CABECALHO = ['Material', 'Disciplina', 'Tipo', 'Rótulo', 'O que mudou', 'Fonte/origem', 'Link da fonte', 'Trecho afetado', 'Data da mudança', 'Registrado por', 'Alunos avisados', 'Avisar quem já baixou']

/**
 * GET /api/admin/revisao/atualizacoes/exportar?<filtros do Histórico> — CSV do histórico FILTRADO (até 5.000 linhas).
 * Exige configuracoes:view (mesma da página); sempre limitado ao tenant da sessão.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'configuracoes:view')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const f = lerFiltrosHistorico(Object.fromEntries(req.nextUrl.searchParams.entries()))
  const r = await listarHistoricoParaExportar(createAdminClient(), access.tenantId, f, LIMITE_CSV)
  if (r.semTabela) return NextResponse.json({ message: 'Aplique a migração 20261112010000 (Central de Atualizações).' }, { status: 409 })
  const linhas = r.rows.map((x) => [
    x.material, x.disciplina ?? '', NOME_TIPO_ATUALIZACAO[x.tipo] ?? x.tipo, x.rotulo ?? '', x.texto, x.fonteOrigem ?? '', x.fonteUrl ?? '', x.trechoAfetado ?? '',
    formatBrt(x.quando) ?? '', x.registradoPor ?? '', x.avisou ? 'Sim' : 'Não', x.avisarJaBaixou ? 'Sim' : 'Não',
  ])
  return new NextResponse(montarCsv(CABECALHO, linhas), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="atualizacoes-${hojeBrtISO()}.csv"`,
      'Cache-Control': 'no-store',
      // Avisa que o arquivo foi cortado no limite.
      ...(r.total > LIMITE_CSV ? { 'X-Linhas-Totais': String(r.total), 'X-Linhas-Exportadas': String(LIMITE_CSV) } : {}),
    },
  })
}

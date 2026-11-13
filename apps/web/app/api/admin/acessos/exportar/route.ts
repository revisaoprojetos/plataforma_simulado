import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { sessoesParaCsv, ROTULO_METODO, ROTULO_ORIGEM, ROTULO_ATIVIDADE, statusSessao, duracaoMin, MSG_NAO_ATIVADO } from '@/lib/acessos/leitura'

export const dynamic = 'force-dynamic'

/** CSV injection: prefixa com apóstrofo valores que começam com = + - @ (planilhas). */
function cel(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/admin/acessos/exportar?estudante=<id> — CSV do histórico (sessões + atividades) do aluno.
 * Exige `acessos:export` (IP é dado pessoal). Limitado a 5000 sessões + 5000 atividades. Auditado.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId || !accessCan(access, 'acessos:export')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  const estudanteId = req.nextUrl.searchParams.get('estudante') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(estudanteId)) return NextResponse.json({ message: 'Aluno inválido.' }, { status: 400 })
  const { data: est } = await createAdminClient().from('simulado_estudantes').select('id, nome, email').eq('id', estudanteId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!est) return NextResponse.json({ message: 'Aluno não encontrado.' }, { status: 404 })

  const { indisponivel, acessos, atividades } = await sessoesParaCsv(access.tenantId, estudanteId)
  if (indisponivel) return NextResponse.json({ message: MSG_NAO_ATIVADO }, { status: 409 })

  const agora = Date.now()
  const linhas: string[] = ['registro;inicio_brt_utc;ultimo_visto_ou_fim;duracao_min;ip;navegador;so;dispositivo;metodo_ou_tipo;origem_ou_item;status']
  for (const a of acessos) {
    linhas.push([
      'sessao', a.iniciado_em, a.ultimo_visto_em, duracaoMin(a), a.ip, a.navegador, a.so, a.dispositivo,
      ROTULO_METODO[a.metodo] ?? a.metodo, ROTULO_ORIGEM[a.origem] ?? a.origem,
      a.impersonado_por ? 'visualizacao_admin' : statusSessao(a, agora) + (a.motivo_encerramento ? `:${a.motivo_encerramento}` : ''),
    ].map(cel).join(';'))
  }
  for (const t of atividades) {
    linhas.push(['atividade', t.criado_em, '', '', t.ip, '', '', '', ROTULO_ATIVIDADE[t.tipo] ?? t.tipo, t.titulo ?? t.ref_id ?? '', JSON.stringify(t.meta ?? {})].map(cel).join(';'))
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'aluno_acessos_exportacao', entidadeId: estudanteId, tenantId: access.tenantId, atorId: access.userId, atorTipo: 'admin',
    depois: { acao: 'exportar_csv_acessos', sessoes: acessos.length, atividades: atividades.length },
  })
  const nome = `acessos-${((est as { nome?: string }).nome ?? 'aluno').normalize('NFD').replace(/[^\w]+/g, '-').slice(0, 40)}.csv`
  return new NextResponse('\uFEFF' + linhas.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nome}"`, 'Cache-Control': 'no-store' },
  })
}

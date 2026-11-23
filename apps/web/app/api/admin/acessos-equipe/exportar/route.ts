import { NextRequest, NextResponse } from 'next/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { membroParaCsv, ROTULO_TIPO_ADMIN, MSG_NAO_ATIVADO_ADMIN } from '@/lib/admin-rastreio/leitura'

export const dynamic = 'force-dynamic'

/** CSV injection: prefixa com apóstrofo valores que começam com = + - @ (planilhas). */
function cel(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * GET /api/admin/acessos-equipe/exportar?user=<id> — CSV (sessões + atividades) de um membro da equipe.
 * Exige `acessos:export` (IP é dado pessoal). Limite 5000 + 5000. Auditado.
 */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !(await isSuperAdmin()) || !access.tenantId || !accessCan(access, 'acessos:export')) {
    return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  }
  const alvo = req.nextUrl.searchParams.get('user') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(alvo)) return NextResponse.json({ message: 'Usuário inválido.' }, { status: 400 })
  const { indisponivel, sessoes, atividades } = await membroParaCsv(access.tenantId, alvo)
  if (indisponivel) return NextResponse.json({ message: MSG_NAO_ATIVADO_ADMIN }, { status: 409 })

  const linhas: string[] = ['registro;inicio_ou_quando_utc;ultimo_visto;ip;navegador;so;dispositivo;tipo;pagina;rota_api;metodo;status;duracao_seg;sessao;request_id']
  for (const s of sessoes) {
    linhas.push(['sessao', s.iniciado_em, s.ultimo_visto_em, s.ip, s.navegador, s.so, s.dispositivo, s.encerrado_em ? `encerrada:${s.motivo ?? ''}` : 'aberta', s.rota_atual, '', '', '', s.tempo_ativo_seg, s.id, ''].map(cel).join(';'))
  }
  for (const a of atividades) {
    linhas.push(['atividade', a.criado_em, '', a.ip, '', '', '', ROTULO_TIPO_ADMIN[a.tipo] ?? a.tipo, a.rota, a.rota_api, a.metodo, a.status, a.duracao_seg, a.sessao_id, a.request_id].map(cel).join(';'))
  }
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'admin_acessos_exportacao', entidadeId: alvo, tenantId: access.tenantId, atorId: access.userId, atorTipo: 'admin', metodo: 'GET',
    depois: { acao: 'exportar_csv_acessos_equipe', sessoes: sessoes.length, atividades: atividades.length },
  })
  return new NextResponse('﻿' + linhas.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="acessos-equipe.csv"', 'Cache-Control': 'no-store' },
  })
}

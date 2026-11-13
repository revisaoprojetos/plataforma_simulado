import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

const csv = (v: unknown) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // evita formula injection no Excel
  return `"${s.replace(/"/g, '""')}"`
}

/** GET /api/admin/seguranca/exportar?varredura=<id> — CSV dos achados (da varredura, ou todos os abertos). */
export async function GET(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:view')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const svc = createAdminClient()
  const varredura = req.nextUrl.searchParams.get('varredura')
  let linhas: any[] = []

  if (varredura && /^[0-9a-f-]{36}$/i.test(varredura)) {
    const { data: v } = await svc.from('seguranca_varreduras').select('resumo').eq('id', varredura).maybeSingle()
    const atual: { fp: string; sev: string; titulo: string }[] = v?.resumo?.atual ?? []
    const fps = atual.map((a) => a.fp).slice(0, 2000)
    for (let i = 0; i < fps.length; i += 80) {
      const { data } = await svc.from('seguranca_achados').select('categoria, severidade, titulo, arquivo, status, recomendacao, primeira_vez, ultima_vez').in('fingerprint', fps.slice(i, i + 80))
      linhas.push(...(data ?? []))
    }
  } else {
    const { data } = await svc.from('seguranca_achados').select('categoria, severidade, titulo, arquivo, status, recomendacao, primeira_vez, ultima_vez').eq('status', 'aberto').order('ultima_vez', { ascending: false }).limit(5000)
    linhas = data ?? []
  }
  const cab = ['categoria', 'severidade', 'titulo', 'arquivo', 'status', 'recomendacao', 'primeira_vez', 'ultima_vez']
  const corpo = [cab.join(','), ...linhas.map((l) => cab.map((c) => csv(l[c])).join(','))].join('\r\n')
  return new NextResponse('﻿' + corpo, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="seguranca-${varredura ? varredura.slice(0, 8) : 'abertos'}.csv"` },
  })
}

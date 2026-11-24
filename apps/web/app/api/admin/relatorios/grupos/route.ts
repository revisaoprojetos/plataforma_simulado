import { NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { listarGruposPorAluno, normalizarFiltroGrupos } from '@/lib/relatorios/grupos-aluno'

// Exportação (CSV/Excel) do relatório "Grupos por aluno": entrega o conjunto COMPLETO do filtro atual,
// fora do payload RSC da página (que só carrega a página visível).
export const dynamic = 'force-dynamic'

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export async function GET(req: Request) {
  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || accessCan(access, 'relatorios:view'))) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const f = normalizarFiltroGrupos({ q: sp.get('q') ?? '', grupo: sp.get('grupo') ?? '', ord: sp.get('ord') ?? '', dir: sp.get('dir') ?? '' })
  const { linhas } = await listarGruposPorAluno(access.tenantId, f, null, 0)

  let nomeGrupo = ''
  if (f.grupo) {
    const { data } = await createAdminClient().from('simulado_grupos').select('nome').eq('id', f.grupo).eq('tenant_id', access.tenantId).maybeSingle()
    nomeGrupo = (data as any)?.nome ?? f.grupo
  }
  const matriz: (string | number | null)[][] = [
    ['Grupos por aluno'],
    ...(f.grupo ? [['Filtro de grupo', nomeGrupo]] : []),
    [],
    ['Estudante', 'Qtd. grupos', 'Último vínculo', 'Grupos (recentes primeiro)'],
    ...linhas.map((e) => [e.nome, e.total, fmtData(e.ultimoEm), e.grupos.map((g) => g.nome).join(' · ')]),
  ]
  return NextResponse.json({ linhas: matriz.filter((l) => l.length), nomeGrupo })
}

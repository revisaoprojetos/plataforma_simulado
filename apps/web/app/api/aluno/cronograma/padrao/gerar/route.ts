import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { gerarCronograma } from '@/app/aluno/(portal)/cronograma/actions'
import { corpoPadraoSchema } from '@/lib/cronograma/padrao-schema'
import { fixarCronograma, temFixado } from '@/lib/cronograma/fixar'
import { refrescarAposMudarFoco } from '@/lib/cronograma/foco-refresh'

// POST /api/aluno/cronograma/padrao/gerar — monta E GRAVA a emissão (ÚNICO ponto de gravação do cronograma PADRÃO)
// (salvar=true). Rota de API (não server action: rejeitadas em domínio custom / iframe Curseduca).
// O 1º cronograma do aluno (de qualquer tipo) vira o plano em FOCO sozinho; os seguintes só via "Fixar".
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ ok: false, error: 'Sua sessão expirou. Entre novamente.' }, { status: 401 })
  const parsed = corpoPadraoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Requisição inválida.' }, { status: 400 })
  const b = parsed.data
  const r = await gerarCronograma(b.cronogramaId, b.opcoes, { nome: b.nome, paleta: b.paleta, semDatas: b.semDatas }, true)
  if (r.ok && r.emissaoId) {
    try {
      const svc = createAdminClient()
      // temFixado conta a própria emissão nova só se já veio fixada (não vem) → só fixa se NÃO havia foco.
      if (!(await temFixado(svc, sessao.tenantId, sessao.estudanteId))) {
        const f = await fixarCronograma(svc, sessao.tenantId, sessao.estudanteId, 'revisao', r.emissaoId)
        if (f.ok) await refrescarAposMudarFoco(svc, sessao.tenantId, sessao.estudanteId)
      }
    } catch { /* foco é best-effort: a emissão já foi gravada */ }
  }
  return NextResponse.json(r, { status: r.ok ? 200 : r.semAcesso ? 403 : 422 })
}

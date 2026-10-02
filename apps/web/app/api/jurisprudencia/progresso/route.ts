import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission } from '@/lib/auth/permissions'
import { temAcessoDesafio, perfilAlunos } from '@/lib/jurisprudencia/conteudo'

// Progresso do aluno no Desafio de Jurisprudência (tabela simulado_jurisprudencia_progresso).
//   dom  = {"<dia>": [índices de teses dominadas]}
//   best = {"<dia>": melhorPontuação}
//   recorde = int
export const dynamic = 'force-dynamic'

// GET /api/jurisprudencia/progresso?desafio=<id> -> { dom, best, recorde } (defaults vazios).
export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  // Prévia do admin (Designer): sem sessão de aluno, não há progresso/perfil — devolve vazio.
  if (!sessao) {
    if (!(await checkPermission('leitura:view'))) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    return NextResponse.json({ dom: {}, best: {}, recorde: 0, perfil: null })
  }

  const desafioId = request.nextUrl.searchParams.get('desafio')
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  const [{ data }, perfis] = await Promise.all([
    svc.from('simulado_jurisprudencia_progresso').select('dom, best, recorde').eq('desafio_id', desafioId).eq('estudante_id', sessao.estudanteId).maybeSingle(),
    perfilAlunos(svc, sessao.tenantId, [sessao.estudanteId]),
  ])
  const perfil = perfis.get(sessao.estudanteId) ?? null

  return NextResponse.json({
    dom: (data as any)?.dom ?? {},
    best: (data as any)?.best ?? {},
    recorde: (data as any)?.recorde ?? 0,
    perfil, // { nome, iniciais, cargo, nivel, avatar, avatarCor } — card do jogador
  })
}

// POST /api/jurisprudencia/progresso { desafio, dom, best, recorde } -> upsert -> { ok:true }.
export async function POST(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  let b: { desafio?: string; dom?: unknown; best?: unknown; recorde?: unknown }
  try { b = await request.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }
  const desafioId = typeof b.desafio === 'string' ? b.desafio : ''
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  if (!(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  // Sanitiza: dom/best objetos, recorde inteiro >= 0.
  const dom = b.dom && typeof b.dom === 'object' && !Array.isArray(b.dom) ? b.dom : {}
  const best = b.best && typeof b.best === 'object' && !Array.isArray(b.best) ? b.best : {}
  const recorde = Math.max(0, Math.trunc(Number(b.recorde) || 0))

  const { error } = await svc.from('simulado_jurisprudencia_progresso').upsert(
    {
      tenant_id: sessao.tenantId,
      desafio_id: desafioId,
      estudante_id: sessao.estudanteId,
      dom,
      best,
      recorde,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'desafio_id,estudante_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

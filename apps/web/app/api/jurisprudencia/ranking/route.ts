import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { lerDesafioJogo, temAcessoDesafio, perfilAlunos } from '@/lib/jurisprudencia/conteudo'

// GET /api/jurisprudencia/ranking?desafio=<id>&tab=geral|dia|materia&ref=<n|materiaId>
//   -> { rows:[ { nome, ini, pts, selos, you } ] } top 10 + a linha do aluno (you:true).
//   pts: 'geral' = soma dos best por dia; 'dia' = best[ref]; 'materia' = soma dos 2 dias da matéria.
//   selos: nº de dias dominados (dom) no escopo da aba.
export const dynamic = 'force-dynamic'

interface Linha { estudanteId: string; pts: number; selos: number }

export async function GET(request: NextRequest) {
  // Aluno (sessão) OU prévia do admin (Designer): sem sessão, um admin com permissão vê o ranking real.
  const sessao = await getSessaoAluno()
  let tenantId: string | null = sessao?.tenantId ?? null
  const estudanteId: string | null = sessao?.estudanteId ?? null
  if (!sessao) {
    if (!(await checkPermission('leitura:view'))) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    tenantId = (await getCurrentAccess()).tenantId
  }
  if (!tenantId) return NextResponse.json({ error: 'Sem tenant.' }, { status: 401 })

  const sp = request.nextUrl.searchParams
  const desafioId = sp.get('desafio')
  const tab = (sp.get('tab') ?? 'geral') as 'geral' | 'dia' | 'materia'
  const ref = sp.get('ref') ?? ''
  if (!desafioId) return NextResponse.json({ error: 'Desafio não informado.' }, { status: 400 })

  const svc = createAdminClient()
  const dj = await lerDesafioJogo(svc, desafioId)
  if (dj === null) return NextResponse.json({ error: 'Desafio não encontrado.' }, { status: 404 })
  // Aluno passa pelo gate de acesso à pasta; admin (prévia) vê tudo.
  if (estudanteId && !(await temAcessoDesafio(estudanteId, tenantId, desafioId))) {
    return NextResponse.json({ error: 'Sem acesso a este desafio.' }, { status: 403 })
  }

  // Dias que entram no cálculo conforme a aba. 'geral' = todos; 'dia' = [ref]; 'materia' = os dias da matéria.
  let diasEscopo: string[] | null = null // null = todos (geral)
  if (tab === 'dia') {
    diasEscopo = ref ? [String(Number(ref))] : []
  } else if (tab === 'materia') {
    const materias: any[] = Array.isArray(dj.materias) ? dj.materias : []
    const m = materias.find((x) => String(x?.id) === ref)
    const final = dj.final
    const alvo = m ?? (final && String(final?.id) === ref ? final : null)
    diasEscopo = (alvo?.dias ?? []).map((n: number) => String(n))
  }

  // Progresso de TODOS os alunos do desafio (1 linha por aluno) — paginado (nunca trunca em 1000).
  const progresso = await fetchAll<{ estudante_id: string; dom: any; best: any }>(() =>
    svc.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best').eq('desafio_id', desafioId).order('estudante_id', { ascending: true }),
  )

  const pontosDe = (best: any): number => {
    if (!best || typeof best !== 'object') return 0
    const chaves = diasEscopo ?? Object.keys(best)
    let soma = 0
    for (const d of chaves) soma += Math.max(0, Number(best[d]) || 0)
    return soma
  }
  const selosDe = (dom: any): number => {
    if (!dom || typeof dom !== 'object') return 0
    const chaves = diasEscopo ?? Object.keys(dom)
    let n = 0
    for (const d of chaves) { const arr = dom[d]; if (Array.isArray(arr) && arr.length) n++ }
    return n
  }

  const linhas: Linha[] = progresso.map((p) => ({
    estudanteId: p.estudante_id,
    pts: pontosDe(p.best),
    selos: selosDe(p.dom),
  }))
  // Ordena por pontos, depois selos.
  linhas.sort((a, b) => b.pts - a.pts || b.selos - a.selos)

  // Top 10 + garante a linha do próprio aluno (fora do top 10 → anexa). Admin (prévia) não tem linha própria.
  const top = linhas.slice(0, 10)
  const euIncluido = estudanteId ? top.some((l) => l.estudanteId === estudanteId) : true
  const minha = estudanteId ? linhas.find((l) => l.estudanteId === estudanteId) : undefined
  const selecionadas = euIncluido || !minha ? top : [...top, minha]

  // Posição absoluta de cada aluno no ranking completo (p/ pódio/"Você" mesmo fora do top 10).
  const posPorId = new Map(linhas.map((l, i) => [l.estudanteId, i + 1]))

  // Perfil (iniciais/cargo/nível/avatar) — PRIVACIDADE: não expõe o nome completo dos outros, só iniciais.
  const ids = [...new Set(selecionadas.map((l) => l.estudanteId))]
  const perfis = await perfilAlunos(svc, tenantId, ids)
  const rows = selecionadas.map((l) => {
    const p = perfis.get(l.estudanteId)
    return {
      ini: p?.iniciais ?? '?', cargo: p?.cargo ?? '', cargoIcone: p?.cargoIcone ?? '', nivel: p?.nivel ?? 1,
      avatar: p?.avatar ?? null, avatarCor: p?.avatarCor ?? null,
      pos: posPorId.get(l.estudanteId) ?? 0,
      pts: l.pts, selos: l.selos, you: estudanteId ? l.estudanteId === estudanteId : false,
    }
  })
  const meu = estudanteId ? perfis.get(estudanteId) : null
  return NextResponse.json({ rows, me: meu ?? null, total: linhas.length })
}

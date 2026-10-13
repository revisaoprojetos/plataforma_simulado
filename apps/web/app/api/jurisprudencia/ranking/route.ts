import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { lerDesafioJogo, temAcessoDesafio, perfilAlunos, preencherTesesPorQuiz } from '@/lib/jurisprudencia/conteudo'
import { diasAtivosPorAluno, streakDe } from '@/lib/jurisprudencia/sequencia'

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

  // MODO RICO (rico=1): devolve o ranking COMPLETO no formato do Lei Seca (RankingLeitura) para reusar o
  // componente LeituraRanking do aluno (pódio + cards "Sua posição" + classificação PAGINADA). Anonimiza
  // p/ o aluno (iniciais; "Você" por extenso). Cacheado via carregarRankingJuris (mesmo do admin).
  if (sp.get('rico') === '1') {
    const { carregarRankingJuris } = await import('@/lib/jurisprudencia/ranking')
    const { anonimizarRankingParaAluno } = await import('@/lib/leitura/ranking')
    const rk = await carregarRankingJuris(desafioId, tenantId)
    const ranking = estudanteId ? anonimizarRankingParaAluno(rk, estudanteId) : rk
    let titulos: unknown[] = []
    try { const { getGamConfig } = await import('@/lib/gamificacao'); const gc = (await getGamConfig(svc, tenantId)) as any; titulos = gc?.nivel_curva?.titulos ?? gc?.config?.nivel_curva?.titulos ?? [] } catch { /* sem títulos → [] */ }
    const totalDesafio = Object.keys(dj.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}).length
    return NextResponse.json({ ranking, meuId: estudanteId, titulos, totalDesafio })
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

  // Contas OCULTAS do ranking: ranking_ocultos da pasta (estudantes + membros dos grupos) + testadores
  // (modo teste / acesso exclusivo). Mesma regra do ranking ADMIN (lib/jurisprudencia/ranking.ts) — o
  // aviso no admin diz que essas contas "não contabilizam nada (sem XP, sequência ou ranking)".
  const ocultosSet = new Set<string>()
  try {
    const { data: ro } = await svc.from('simulado_pastas').select('ranking_ocultos').eq('id', desafioId).eq('tenant_id', tenantId).maybeSingle()
    const cfg = (ro as any)?.ranking_ocultos ?? {}
    for (const id of (Array.isArray(cfg.estudantes) ? cfg.estudantes : [])) ocultosSet.add(id)
    const grps = Array.isArray(cfg.grupos) ? cfg.grupos : []
    if (grps.length) { const mem = await fetchAllByIn<{ estudante_id: string }>(grps, (chunk) => svc.from('simulado_grupo_membros').select('estudante_id').in('grupo_id', chunk)); for (const m of mem) ocultosSet.add(m.estudante_id) }
  } catch { /* coluna ranking_ocultos ausente */ }
  try { const { testadoresDoModulo } = await import('@/lib/leitura/testadores'); for (const id of await testadoresDoModulo(svc, tenantId, desafioId)) ocultosSet.add(id) } catch { /* ausente */ }

  // Progresso de TODOS os alunos do desafio (1 linha por aluno) — paginado (nunca trunca em 1000).
  // Remove as contas ocultas/teste para não contaminarem pontos/selos/posições/total.
  const progresso = (await fetchAll<{ estudante_id: string; dom: any; best: any; atualizado_em: string | null }>(() =>
    svc.from('simulado_jurisprudencia_progresso').select('estudante_id, dom, best, atualizado_em').eq('desafio_id', desafioId).order('estudante_id', { ascending: true }),
  )).filter((p) => !ocultosSet.has(p.estudante_id))

  const pontosDe = (best: any): number => {
    if (!best || typeof best !== 'object') return 0
    // 'geral' (diasEscopo null) soma só os dias com TESES REAIS — o dia final/selo (0 teses próprias,
    // reusa um pool) não pode somar pontos, senão duplicaria (ficava 3340 em vez de 3000).
    const chaves = diasEscopo ?? Object.keys(best).filter((d) => tesesDoDia(d) > 0)
    let soma = 0
    for (const d of chaves) soma += Math.max(0, Number(best[d]) || 0)
    return soma
  }

  // SELO = MATÉRIA CONCLUÍDA (todas as teses de todos os dias da matéria dominadas) — igual ao jogo
  // (matDone/selosCount). O bug anterior contava "dias com qualquer tese", inflando o número.
  const diasComTeses = await preencherTesesPorQuiz(svc, dj.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}).catch(() => (dj.dias as Record<string, any>) ?? {})
  const materias: any[] = Array.isArray(dj.materias) ? dj.materias : []
  const final = dj.final
  const matIdOfDay = (dayKey: string): string | null => {
    const d = diasComTeses[dayKey]
    if (d?.materia) return String(d.materia)
    const m = materias.find((x) => (x?.dias ?? []).includes(Number(dayKey)))
    if (m) return String(m.id)
    if (final && (final?.dias ?? []).includes(Number(dayKey))) return String(final.id)
    return null
  }
  const diasDaMateria = (mId: string): string[] => Object.keys(diasComTeses).filter((k) => matIdOfDay(k) === mId)
  const tesesDoDia = (dayKey: string): number => { const t = diasComTeses[dayKey]?.teses; return Array.isArray(t) ? t.length : 0 }
  const diaCompleto = (dom: any, dayKey: string): boolean => {
    const arr = dom?.[dayKey]; const n = tesesDoDia(dayKey)
    return n > 0 && Array.isArray(arr) && arr.length >= n
  }
  const materiaCompleta = (dom: any, m: any): boolean => {
    const ds = diasDaMateria(String(m?.id))
    return ds.length > 0 && ds.every((d) => diaCompleto(dom, d))
  }
  const totalSelos = materias.length
  const selosDe = (dom: any): number => {
    if (!dom || typeof dom !== 'object') return 0
    // Por aba: 'geral' = matérias completas; 'dia'/'materia' = dias completos no escopo.
    if (!diasEscopo) return materias.filter((m) => materiaCompleta(dom, m)).length
    return diasEscopo.filter((d) => diaCompleto(dom, d)).length
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
  // Sequência (streak) — dias de atividade do ledger (+ backfill por atualizado_em). Só p/ as linhas
  // exibidas (top 10 + você); não varia por aba. Reduz a varredura do ledger.
  const atualizadoPorAluno = new Map<string, string | null>(
    progresso.filter((p) => ids.includes(p.estudante_id)).map((p) => [p.estudante_id, p.atualizado_em ?? null]),
  )
  const diasPorAluno = await diasAtivosPorAluno(svc, tenantId, desafioId, atualizadoPorAluno, ids).catch(() => new Map())
  const streakDeId = (id: string) => streakDe(diasPorAluno.get(id) ?? new Set<string>())
  const perfis = await perfilAlunos(svc, tenantId, ids)
  // ADMIN (sem sessão de aluno) vê o NOME COMPLETO, igual ao ranking do Lei Seca. O ALUNO continua
  // só com iniciais (privacidade — não expor nome dos outros no jogo).
  const ehAdmin = !estudanteId
  const rows = selecionadas.map((l) => {
    const p = perfis.get(l.estudanteId)
    return {
      ...(ehAdmin ? { nome: p?.nome ?? '?' } : {}),
      ini: p?.iniciais ?? '?', cargo: p?.cargo ?? '', cargoIcone: p?.cargoIcone ?? '', nivel: p?.nivel ?? 1,
      avatar: p?.avatar ?? null, avatarCor: p?.avatarCor ?? null,
      pos: posPorId.get(l.estudanteId) ?? 0,
      pts: l.pts, selos: l.selos, streak: streakDeId(l.estudanteId), you: estudanteId ? l.estudanteId === estudanteId : false,
    }
  })
  const meu = estudanteId ? perfis.get(estudanteId) : null
  return NextResponse.json({ rows, me: meu ?? null, total: linhas.length, totalSelos })
}

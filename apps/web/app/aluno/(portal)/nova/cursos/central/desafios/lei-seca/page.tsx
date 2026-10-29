import { redirect } from 'next/navigation'
import { Crumbs, Card, Muted } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarTrilhaLeituraAluno, carregarModuloCompleto } from '@/lib/leitura/trilha'
import { carregarGamRail } from '@/lib/aluno/trilhas'
import { carregarRankingModulo, anonimizarRankingParaAluno, calcularMinhaLinhaLeitura } from '@/lib/leitura/ranking'
import { DesafioInterno, type DesafioDados, type AulaLinha, type ProximaParada, type PodioItem, type ClassifLinha, type Situacao } from './_desafio'

export const dynamic = 'force-dynamic'

const pct = (d: number, t: number) => (t > 0 ? Math.round((d / t) * 100) : 0)
const inicial = (nome: string) => (nome.trim()[0] ?? 'A').toUpperCase()
const sitDe = (estado: 'concluido' | 'atual' | 'disponivel'): Situacao =>
  estado === 'concluido' ? 'Concluída' : estado === 'atual' ? 'Em andamento' : 'Bloqueada'

export default async function Page() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { estudanteId, tenantId, nome } = sessao
  const svc = createAdminClient()

  // Escolhe o módulo a exibir: o ÚLTIMO com atividade (último evento de leitura → documento → pasta);
  // fallback = o primeiro módulo disponível. A rota /nova não carrega um [modulo], então mostramos o
  // desafio de Lei Seca em que o aluno está atuando.
  const trilhas = await carregarTrilhaLeituraAluno(estudanteId, tenantId)
  let ultimoModuloId: string | null = null
  try {
    const { data: ultEv } = await svc.from('simulado_xp_eventos').select('meta').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('origem', 'leitura').order('criado_em', { ascending: false }).limit(1).maybeSingle()
    const docId = (ultEv as { meta?: { documentoId?: string } } | null)?.meta?.documentoId
    if (docId) {
      const { data: doc } = await svc.from('simulado_documentos').select('pasta_id').eq('id', docId).maybeSingle()
      ultimoModuloId = (doc as { pasta_id?: string | null } | null)?.pasta_id ?? null
    }
  } catch { /* tolerante */ }
  const chosenId = (ultimoModuloId && trilhas.some((t) => t.id === ultimoModuloId)) ? ultimoModuloId : (trilhas[0]?.id ?? null)

  if (!chosenId) {
    return (
      <>
        <Crumbs items={[['Central de Estudos', R.central], ['Desafio de Lei Seca', '#']]} />
        <Card style={{ alignItems: 'center', textAlign: 'center', padding: '48px 24px' }}>
          <Muted size={13}>Nenhum desafio de Lei Seca disponível para você ainda.</Muted>
        </Card>
      </>
    )
  }

  const [mod, gam, rankingRaw, minhaCalc] = await Promise.all([
    carregarModuloCompleto(estudanteId, tenantId, chosenId),
    carregarGamRail(svc, tenantId, estudanteId),
    carregarRankingModulo(chosenId, tenantId),
    calcularMinhaLinhaLeitura(chosenId, tenantId, estudanteId).catch(() => null),
  ])

  const moduloNome = mod.nome ?? trilhas.find((t) => t.id === chosenId)?.nome ?? 'Lei Seca'
  const aulaNodes = (mod.trilha?.nodes ?? []).filter((n) => !n.id.startsWith('intro:'))
  const done = mod.trilha?.done ?? 0
  const total = mod.trilha?.total ?? aulaNodes.length
  const desempById = new Map(mod.desempenho.map((d) => [d.id, d]))

  const idxAtual = aulaNodes.findIndex((n) => n.estado === 'atual')
  const atualNode = idxAtual >= 0 ? aulaNodes[idxAtual] : null
  const dAtual = atualNode ? desempById.get(atualNode.id) : null
  const aulaAtual = atualNode ? {
    num: idxAtual + 1,
    titulo: atualNode.titulo,
    leituraPct: dAtual?.leituraPct ?? 0,
    questoesResp: dAtual?.questoesRespondidas ?? 0,
    questoesTotal: dAtual?.questoesTotal ?? atualNode.questoes,
    pontos: dAtual ? dAtual.pontos + dAtual.pontosExtra : 0,
  } : null

  const startFrom = idxAtual >= 0 ? idxAtual + 1 : 0
  const proximas: ProximaParada[] = aulaNodes.slice(startFrom).filter((n) => n.estado !== 'concluido').slice(0, 4)
    .map((n) => ({ dia: n.titulo, quando: n.quando ?? n.statusLabel }))

  const energia = gam ? {
    streakAtual: gam.resumo.streakAtual,
    recorde: gam.resumo.streakMaior,
    nivel: gam.resumo.nivel,
    xpTotal: gam.resumo.xpTotal,
    semana: gam.semana.map((d) => ({ label: d.label.toUpperCase(), on: d.ativo })),
  } : null

  const questoesResp = mod.desempenho.reduce((s, d) => s + d.questoesRespondidas, 0)

  // Ranking anonimizado (terceiros só por iniciais; a própria linha mantém o nome → "Você").
  const ranking = anonimizarRankingParaAluno(rankingRaw, estudanteId)
  const reais = ranking.itens.filter((i) => !i.oculto)
  const meu = ranking.itens.find((i) => i.estudanteId === estudanteId) ?? null

  const alturas = [128, 100, 84]
  const podio: PodioItem[] = reais.slice(0, 3).map((it, i) => ({
    pos: `${i + 1}º`,
    ini: it.estudanteId === estudanteId ? 'Você' : it.nome,
    pts: it.score,
    seq: it.streakAtual,
    h: alturas[i] ?? 84,
  }))

  const classif: ClassifLinha[] = reais.slice(0, 20).map((it) => ({
    pos: it.posicao,
    ini: it.estudanteId === estudanteId ? nome : it.nome,
    nome: it.nome,
    aulas: it.aulasConcluidas,
    seq: it.streakAtual,
    pts: it.score,
    eu: it.estudanteId === estudanteId,
  }))

  // Acerto nos quizzes (%) do próprio aluno: acertos / questões respondidas.
  const meusAcertos = meu?.acertos ?? minhaCalc?.acertos ?? null
  const acertoPct = (meusAcertos != null && questoesResp > 0) ? Math.min(100, Math.round((meusAcertos / questoesResp) * 100)) : null

  // Minha linha do card "Você" (posição real quando no ranking; senão calculada pela pontuação).
  let minha: DesafioDados['ranking']['minha'] = null
  const baseMinha = meu ?? minhaCalc
  if (baseMinha) {
    let pos = meu?.posicao ?? 0
    if (!pos && minhaCalc) pos = reais.filter((i) => i.score > minhaCalc.score).length + 1
    const aulas = baseMinha.aulasConcluidas
    minha = {
      pos: pos || 1,
      nome,
      inicial: inicial(nome),
      aulas,
      seq: baseMinha.streakAtual,
      pts: baseMinha.score,
      pct: pct(aulas, total),
    }
  }

  const aulas: AulaLinha[] = aulaNodes.map((n, i) => {
    const d = desempById.get(n.id)
    return {
      dia: i + 1,
      arts: n.titulo,
      tema: '',
      situacao: sitDe(n.estado),
      leitura: d ? (d.leituraConcluida ? 'Concluída' : d.leituraPct > 0 ? `${d.leituraPct}%` : '—') : '—',
      questoes: d && d.questoesTotal > 0 ? `${d.questoesRespondidas}/${d.questoesTotal}` : '—',
      seq: d && d.sequencia > 0 ? String(d.sequencia) : '—',
      pts: d && d.pontos + d.pontosExtra > 0 ? `+${d.pontos + d.pontosExtra}` : '—',
    }
  })

  const dados: DesafioDados = {
    moduloNome,
    done,
    total,
    pct: pct(done, total),
    aulaAtual,
    proximas,
    energia,
    desempenhoStats: {
      aulasConcluidas: done,
      aulasTotal: total,
      questoesResp,
      acertoPct,
      pontos: meu?.score ?? minhaCalc?.score ?? mod.desempenho.reduce((s, d) => s + d.pontos + d.pontosExtra, 0),
      melhorSeq: gam?.resumo.streakMaior ?? minhaCalc?.streakAtual ?? meu?.streakAtual ?? 0,
    },
    aulas,
    ranking: { podio, minha, classif, totalAlunos: reais.length },
  }

  return (
    <>
      <Crumbs items={[['Central de Estudos', R.central], ['Desafio de Lei Seca', '#']]} />
      <DesafioInterno dados={dados} />
    </>
  )
}

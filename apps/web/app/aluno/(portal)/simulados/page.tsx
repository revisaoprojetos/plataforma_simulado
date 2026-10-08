import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverPastasArvore } from '@/lib/aluno/grupos-catalogo'
import { resolverCardView } from '@/lib/card-view'
import { MeusSimuladosCatalogo } from '@/components/aluno/meus-simulados-catalogo'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { PlatformRealizados } from '@/components/brand/interna/realizados'
import type { RealizadosData } from '@/components/brand/interna/realizados/data'

export default async function MeusSimuladosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const estId = sessao.estudanteId

  // Simulados atribuídos: matrícula (liberada) + acesso avulso. O passaporte NÃO enxerga
  // tudo automaticamente — recebe matrícula via grupo "Passaporte" vinculado ao banco.
  const [{ data: mats }, { data: acs }, { data: sessAll }, { data: tenantRow }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id').eq('estudante_id', estId),
    // Sessões dela (independem do acesso ATUAL): garantem que os simulados JÁ FEITOS apareçam
    // em "Concluídos" mesmo se a matrícula/acesso mudou depois de concluir (histórico não some).
    svc.from('simulado_sessoes_prova').select('id, simulado_id, status, nota, finalizado_em, tentativa_num').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    // Estilo dos cards definido no console (tema.card_view) — o aluno apenas obedece.
    svc.from('simulado_tenants').select('tema').eq('id', sessao.tenantId).maybeSingle(),
  ])
  const cardView = resolverCardView((tenantRow?.tema as any)?.card_view)
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]

  let simulados: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    // owner_estudante_id IS NULL: NÃO trazer simulados PESSOAIS do aluno (aba Personalizados) para
    // o catálogo oficial — a sessão do runner pessoal poderia arrastá-los para "Concluídos".
    const { data: sims } = await svc.from('simulado_simulados').select('id, titulo, modo_aplicacao, status, data_inicio, data_fim, embed_token, regras, created_at').in('id', ids).eq('deletado', false).is('owner_estudante_id', null)
    simulados = sims ?? []
    for (const s of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(s.simulado_id) ?? []; arr.push(s); sessoesPorSim.set(s.simulado_id, arr) }
  }

  // Classifica cada simulado (o `vis` visual e os grupos vêm DEPOIS, em paralelo — não bloqueiam aqui).
  const itens = simulados.map((s) => {
    const sess = sessoesPorSim.get(s.id) ?? []
    const finalizadas = sess.filter((x) => x.status === 'finalizada')
    const emAndamento = sess.some((x) => x.status !== 'finalizada')
    const notas = finalizadas.map((x) => (x.nota != null ? Number(x.nota) : null)).filter((n): n is number => n != null)
    const melhor = notas.length ? Math.max(...notas) : null
    const concluido = finalizadas.length > 0
    const { notaLiberada } = resolverLiberacoes(s.regras, s)
    const ultimo = finalizadas.map((x) => x.finalizado_em).filter(Boolean).sort().pop() ?? null
    return { ...s, concluido, emAndamento, tentativas: finalizadas.length, melhor, notaLiberada, ultimo }
  })

  const concluidos = itens
    .filter((i) => i.concluido)
    // Mais recente → mais antigo (mesma antiguidade do catálogo).
    .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  const emAndamentoItens = itens.filter((i) => i.emAndamento && !i.concluido)

  // Sempre renderiza o catálogo (com as abas) — mesmo sem concluídos, para a aba "Personalizados"
  // continuar acessível (ex.: "Voltar" da tela de fazer personalizado). A aba Revisão mostra o vazio.

  // Visual (capa/cor) + ÁRVORE de pastas (pasta-folha + ancestrais) de cada concluído — em PARALELO.
  const [visual, { pastaPorSim, pastas }] = await Promise.all([
    resolverVisualSimulados(svc, [...concluidos, ...emAndamentoItens].map((s: any) => ({ id: s.id, regras: s.regras }))),
    resolverPastasArvore(svc, concluidos.map((s: any) => ({ id: s.id, regras: s.regras }))),
  ])

  // ── NOVO VISUAL INTERNO (ligado aos dados reais): Realizados redesenhado + links reais. ──
  const aparencia = await resolverInterno()
  if (aparencia.ativo) {
    // Progresso dos EM ANDAMENTO (respondidas/total) — só para os poucos em andamento (2 queries).
    const emIds = emAndamentoItens.map((s: any) => s.id)
    const emSessIds = emAndamentoItens.map((s: any) => (sessoesPorSim.get(s.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id).filter(Boolean) as string[]
    const totalPorSim = new Map<string, number>()
    const respPorSess = new Map<string, number>()
    if (emIds.length) {
      const [{ data: pqRows }, { data: rsRows }] = await Promise.all([
        svc.from('simulado_prova_questoes').select('simulado_id').in('simulado_id', emIds),
        emSessIds.length ? svc.from('simulado_respostas_objetivas').select('sessao_id').in('sessao_id', emSessIds) : Promise.resolve({ data: [] as any[] }),
      ])
      for (const r of (pqRows ?? []) as any[]) totalPorSim.set(r.simulado_id, (totalPorSim.get(r.simulado_id) ?? 0) + 1)
      for (const r of (rsRows ?? []) as any[]) respPorSess.set(r.sessao_id, (respPorSess.get(r.sessao_id) ?? 0) + 1)
    }
    const progDe = (s: any) => {
      const total = totalPorSim.get(s.id) ?? 0
      const sessId = (sessoesPorSim.get(s.id) ?? []).find((x: any) => x.status !== 'finalizada')?.id
      const resp = sessId ? (respPorSess.get(sessId) ?? 0) : 0
      const pct = total ? Math.round((resp / total) * 100) : 0
      return { questaoAtual: Math.min(resp + 1, total || resp + 1), total, pct }
    }
    const svis = (s: any): RealizadosData['concluidos'][number]['capa'] => {
      const v = visual.get(s.id) as any
      return { rotulo: (s.titulo || 'Simulado').slice(0, 20), sub: '', cor: v?.cor ?? null, capa: v?.capa ?? null }
    }
    const dm = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '')
    // Nome da pasta-folha (área) de cada simulado — subtítulo da tabela MEQ (§4). Sem dado pessoal.
    const nomePorPasta = new Map<string, string>((pastas ?? []).map((p: any) => [p.id, p.nome]))
    const areaDe = (s: any) => {
      const pid = pastaPorSim.get(s.id)
      return pid ? (nomePorPasta.get(pid) ?? undefined) : undefined
    }
    const notasOk = concluidos.map((c: any) => c.melhor).filter((n: any): n is number => n != null)
    // KPIs §4: "+N este mês" (concluídos no mês corrente) e origem da melhor nota.
    const agora = new Date()
    const noMes = (iso: string | null) => {
      if (!iso) return false
      const d = new Date(iso)
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear()
    }
    const novosNoMes = concluidos.filter((c: any) => noMes(c.ultimo ?? c.created_at)).length
    const feitos = concluidos.length + emAndamentoItens.length
    const melhorNotaVal = notasOk.length ? Math.max(...notasOk) : null
    const melhorNotaSim = melhorNotaVal != null ? concluidos.find((c: any) => c.melhor === melhorNotaVal) : null
    const melhorNotaOrigem = melhorNotaSim ? (areaDe(melhorNotaSim) ?? melhorNotaSim.titulo) : null
    const { data: persRows } = await svc
      .from('simulado_simulados')
      .select('id, titulo, status')
      .eq('owner_estudante_id', estId).eq('tenant_id', sessao.tenantId).eq('deletado', false)
      .order('created_at', { ascending: false })
    const data: RealizadosData = {
      stats: {
        feitos,
        concluidos: concluidos.length,
        // 1 casa decimal (evita dízima tipo 21.3333…% na exibição).
        mediaGeral: notasOk.length ? Math.round((notasOk.reduce((a, b) => a + b, 0) / notasOk.length) * 10) / 10 : null,
        melhorNota: melhorNotaVal,
        novosNoMes: novosNoMes || null,
        pctConcluidos: feitos > 0 ? Math.round((concluidos.length / feitos) * 100) : null,
        melhorNotaOrigem,
      },
      emAndamento: emAndamentoItens.map((s: any) => ({ id: s.id, titulo: s.titulo, capa: svis(s), area: areaDe(s), ...progDe(s), continuarHref: `/aluno/simulados/${s.id}` })),
      concluidos: concluidos.map((s: any) => ({ id: s.id, titulo: s.titulo, capa: svis(s), area: areaDe(s), data: dm(s.ultimo ?? s.created_at), nota: s.melhor, notaLiberada: s.notaLiberada, href: `/aluno/simulados/${s.id}`, correcaoHref: `/aluno/simulados/${s.id}`, refazerHref: `/aluno/simulados/${s.id}`, baixarHref: `/aluno/simulados/${s.id}` })),
      personalizados: {
        criarHref: '/aluno/simulados/personalizados/novo',
        itens: ((persRows ?? []) as any[]).map((p) => ({ id: p.id, nome: p.titulo, status: p.status === 'rascunho' ? 'rascunho' as const : 'concluido' as const, href: `/aluno/simulados/personalizados/${p.id}`, refazerHref: `/aluno/simulados/personalizados/${p.id}`, editarHref: `/aluno/simulados/personalizados/${p.id}`, baixarHref: `/aluno/simulados/personalizados/${p.id}` })),
      },
    }
    return <PlatformRealizados brand={aparencia.brand} theme={aparencia.theme} data={data} />
  }

  const concluidosCat = concluidos.map((s: any) => ({
    id: s.id, titulo: s.titulo, modo_aplicacao: s.modo_aplicacao, tentativas: s.tentativas,
    melhor: s.melhor, notaLiberada: s.notaLiberada, vis: visual.get(s.id) ?? null, grupoId: pastaPorSim.get(s.id) ?? null,
  }))

  return <MeusSimuladosCatalogo itens={concluidosCat} pastas={pastas} view={cardView} />
}

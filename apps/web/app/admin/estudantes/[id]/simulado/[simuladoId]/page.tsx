import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { textoSobre, veuTexto } from '@/lib/cor-contraste'
import { iconeBanco } from '@/lib/banco-visual'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { modalidadesDoAlunoV2, temEntregaV2, carregarEntregaBanco, type ModalidadeAluno } from '@/lib/caderno-teste/entrega-aluno'
import { TipoSimuladoBadge } from '@/components/admin/tipo-simulado-badge'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { montarComparativo } from '@/lib/simulado/comparativo'
import { montarResultadoAluno, type SessaoInput } from '@/lib/simulado/resultado-aluno'
import { MeuSimuladoView } from '@/components/aluno/meu-simulado-view'

export const dynamic = 'force-dynamic'

export default async function EstudanteSimuladoPage({ params }: { params: Promise<{ id: string; simuladoId: string }> }) {
  const { id, simuladoId } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const TID = tenantId ?? '00000000-0000-0000-0000-000000000000'
  type Visual = { cor: string | null; icone: string | null; capa: string | null; bancoId: string | null }

  // Batch único: estudante, simulado, tentativas, visual do banco e tipo — tudo depende só de
  // (id, simuladoId, tenant), então roda em paralelo (o `visual` é um encadeamento próprio).
  const [{ data: est }, { data: sim }, { data: sessoes }, visual, tipo] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome').eq('id', id).eq('tenant_id', TID).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo, status, regras').eq('id', simuladoId).eq('tenant_id', TID).maybeSingle(),
    svc.from('simulado_sessoes_prova')
      .select('id, tentativa_num, nota, posicao_ranking, iniciado_em, finalizado_em')
      .eq('estudante_id', id).eq('simulado_id', simuladoId).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
      .order('iniciado_em', { ascending: true }),
    // Banco (capa/cor/ícone) do simulado — mesma imagem do card do banco de questões.
    (async (): Promise<Visual> => {
      const vazio: Visual = { cor: null, icone: null, capa: null, bancoId: null }
      const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId)
      const qIds = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
      if (!qIds.length) return vazio
      const { data: qp } = await svc.from('simulado_questao_pasta').select('pasta_id').in('questao_id', qIds)
      const cont = new Map<string, number>()
      for (const r of qp ?? []) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
      const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      if (!melhor) return vazio
      try {
        const { data: p } = await svc.from('simulado_pastas').select('id, cor, icone, capa_url').eq('id', melhor[0]).maybeSingle()
        if (p) return { cor: (p as any).cor ?? null, icone: (p as any).icone ?? null, capa: (p as any).capa_url ?? null, bancoId: (p as any).id }
      } catch { /* colunas podem não existir */ }
      return vazio
    })(),
    tiposDeSimulados(svc, [simuladoId]).then((m) => m.get(simuladoId) ?? null),
  ])
  if (!est || !sim) notFound()
  const finalizadas = (sessoes ?? []) as any[]
  const Icon = iconeBanco(visual.icone)
  const c = visual.cor ?? '#6d28d9'

  if (!finalizadas.length) {
    return (
      <div className="animate-page space-y-5">
        <Hero est={est} sim={sim} tipo={tipo} visual={visual} Icon={Icon} c={c} id={id} tentativas={0} />
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Este estudante ainda não concluiu este simulado.</div>
      </div>
    )
  }

  // Melhor tentativa (nota; desempate pela mais recente) — usada no comparativo.
  const melhor = [...finalizadas].sort((a, b) => (Number(b.nota ?? -1) - Number(a.nota ?? -1)) || (new Date(b.finalizado_em ?? 0).getTime() - new Date(a.finalizado_em ?? 0).getTime()))[0]

  const bancoBaseId = (sim.regras as any)?.banco_base_id as string | undefined
  const cadernoId: string | null = null

  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))

  // Admin vê TUDO liberado (nota + gabarito) — por isso montarResultadoAluno recebe revelar=true.
  const [{ tentativas, questoes }, comparativo] = await Promise.all([
    montarResultadoAluno(svc, simuladoId, sessoesInput, true),
    montarComparativo(svc, simuladoId, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id }, tenantId),
  ])

  // Cadernos do aluno (entrega V2, fonte única). Aqui o admin vê tudo liberado.
  let modalidades: ModalidadeAluno[] = []
  if (bancoBaseId) {
    const entrega = await carregarEntregaBanco(svc, null, bancoBaseId)
    if (temEntregaV2(entrega)) modalidades = modalidadesDoAlunoV2(entrega)
  }

  return (
    <div className="animate-page space-y-5">
      <Hero est={est} sim={sim} tipo={tipo} visual={visual} Icon={Icon} c={c} id={id} tentativas={tentativas.length} />

      {/* Aviso: admin enxerga tudo liberado, inclusive downloads não liberados ao aluno. */}
      <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.04] px-3.5 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <span>Visão de administrador: nota, gabarito e todos os cadernos aparecem liberados aqui — inclusive os que ainda não foram liberados para o aluno.</span>
      </div>

      <MeuSimuladoView
        tentativas={tentativas}
        questoes={questoes}
        comparativo={comparativo}
        notaLiberada
        gabaritoLiberado
        cadernoLiberado
        cadernoId={cadernoId}
        modalidades={modalidades}
        estId={id}
        simuladoId={simuladoId}
        simuladoTitulo={sim.titulo}
        adminMode
      />
    </div>
  )
}

function Hero({ est, sim, tipo, visual, Icon, c, id, tentativas }: {
  est: any; sim: any; tipo: any
  visual: { cor: string | null; icone: string | null; capa: string | null; bancoId: string | null }
  Icon: React.ComponentType<{ className?: string }>; c: string; id: string; tentativas: number
}) {
  // Contraste AUTOMÁTICO: texto/ícones seguem a luminância da COR do banco (que o admin escolhe).
  // Fundo claro → texto escuro; fundo escuro → texto claro. Com capa (imagem) há véu escuro → texto claro.
  const txt = visual.capa ? '#ffffff' : textoSobre(c)
  const veu = (p: number) => (visual.capa ? `rgba(255,255,255,${p / 100})` : veuTexto(c, p))
  const fundo = visual.capa ? undefined : { background: `linear-gradient(120deg, ${c} 0%, color-mix(in oklab, ${c} 78%, #000) 100%)` }
  return (
    <div className="overflow-hidden rounded-2xl border shadow-sm">
      <div className="relative flex flex-wrap items-center gap-4 p-5" style={{ color: txt, ...(fundo ?? {}) }}>
        {visual.capa && <><img src={visual.capa} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/55" /></>}
        <Link href={`/admin/estudantes/${id}`} aria-label="Voltar" className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:opacity-70" style={{ color: txt }}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: veu(16), color: txt }}><Icon className="h-7 w-7" /></span>
        <div className="relative z-10 min-w-0">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: txt, opacity: 0.7 }}>Desempenho de {est.nome}</p>
          <div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold" style={{ color: txt }}>{sim.titulo}</h1><TipoSimuladoBadge tipo={tipo} /></div>
          <p className="text-sm" style={{ color: txt, opacity: 0.8 }}>{tentativas} tentativa(s)</p>
        </div>
        {visual.bancoId && <Link href={`/admin/banco-questoes/${visual.bancoId}`} className="relative z-10 ml-auto inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:opacity-80" style={{ color: txt, borderColor: veu(35), background: veu(12) }}>Abrir banco</Link>}
      </div>
    </div>
  )
}

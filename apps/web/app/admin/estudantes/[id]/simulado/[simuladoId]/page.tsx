import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { iconeBanco } from '@/lib/banco-visual'
import { tiposDeSimulados } from '@/lib/simulado/tipo'
import { filtrarModsPorTipo } from '@/lib/simulado/tipo'
import { mesclarModalidades } from '@/lib/caderno-designer/types'
import { usaPdfImportado } from '@/lib/caderno-designer/material'
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

  const [{ data: est }, { data: sim }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo, status, regras').eq('id', simuladoId).maybeSingle(),
  ])
  if (!est || !sim) notFound()

  // Tentativas (sessões finalizadas, exceto teste) em ordem cronológica.
  const { data: sessoes } = await svc
    .from('simulado_sessoes_prova')
    .select('id, tentativa_num, nota, posicao_ranking, iniciado_em, finalizado_em')
    .eq('estudante_id', id).eq('simulado_id', simuladoId).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
    .order('iniciado_em', { ascending: true })
  const finalizadas = (sessoes ?? []) as any[]

  // Banco (capa/cor/ícone) do simulado — mesma imagem do card do banco de questões.
  let visual = { cor: null as string | null, icone: null as string | null, capa: null as string | null, bancoId: null as string | null }
  {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId)
    const qIds = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
    if (qIds.length) {
      const { data: qp } = await svc.from('simulado_questao_pasta').select('pasta_id').in('questao_id', qIds)
      const cont = new Map<string, number>()
      for (const r of qp ?? []) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
      const melhor = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      if (melhor) {
        try {
          const { data: p } = await svc.from('simulado_pastas').select('id, cor, icone, capa_url').eq('id', melhor[0]).maybeSingle()
          if (p) visual = { cor: (p as any).cor ?? null, icone: (p as any).icone ?? null, capa: (p as any).capa_url ?? null, bancoId: (p as any).id }
        } catch { /* colunas podem não existir */ }
      }
    }
  }

  const tipo = (await tiposDeSimulados(svc, [simuladoId])).get(simuladoId) ?? null
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

  // Caderno do designer: regras.caderno_id → banco_base_id → banco das questões (espelha o portal do aluno).
  let cadernoId = ((sim.regras as any)?.caderno_id as string | undefined) ?? null
  const bancoBaseId = (sim.regras as any)?.banco_base_id as string | undefined
  if (!cadernoId && bancoBaseId) {
    const { data: banco } = await svc.from('simulado_pastas').select('caderno_id').eq('id', bancoBaseId).maybeSingle()
    cadernoId = ((banco as any)?.caderno_id as string | undefined) ?? null
  }
  if (!cadernoId) {
    const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId)
    const qIds = [...new Set((pq ?? []).map((r: any) => r.questao_id).filter(Boolean))]
    if (qIds.length) {
      const { data: qp } = await svc.from('simulado_questao_pasta').select('questao_id, pasta_id').in('questao_id', qIds)
      const pastaIds = [...new Set((qp ?? []).map((r: any) => r.pasta_id))]
      const { data: pastas } = pastaIds.length ? await svc.from('simulado_pastas').select('id, caderno_id').in('id', pastaIds) : { data: [] as any[] }
      const cadDaPasta = new Map<string, string>((pastas ?? []).filter((p: any) => p.caderno_id).map((p: any) => [p.id, p.caderno_id]))
      const cont = new Map<string, number>()
      for (const r of qp ?? []) if (cadDaPasta.has((r as any).pasta_id)) cont.set((r as any).pasta_id, (cont.get((r as any).pasta_id) ?? 0) + 1)
      const escolha = [...cont.entries()].sort((a, b) => b[1] - a[1])[0]
      if (escolha) cadernoId = cadDaPasta.get(escolha[0])!
    }
  }

  const sessoesInput: SessaoInput[] = finalizadas.map((s) => ({
    id: s.id, tentativa_num: s.tentativa_num, nota: s.nota, iniciado_em: s.iniciado_em, finalizado_em: s.finalizado_em, posicao_ranking: s.posicao_ranking,
  }))

  // Admin vê TUDO liberado (nota + gabarito) — por isso montarResultadoAluno recebe revelar=true.
  const [{ tentativas, questoes }, comparativo] = await Promise.all([
    montarResultadoAluno(svc, simuladoId, sessoesInput, true),
    montarComparativo(svc, simuladoId, { minhaNota: melhor.nota != null ? Number(melhor.nota) : null, minhaSessaoId: melhor.id }),
  ])

  // Modalidades do caderno do designer (só as com conteúdo real), filtradas pelo tipo do simulado.
  const temConteudo = (d: any) => !!d && Array.isArray(d.pages) && d.pages.some((p: any) => (p.blocks ?? []).some((b: any) => b.type !== 'plano-fundo'))
  let modalidades: { id: string; nome: string; semGab: boolean; comGab: boolean; pdfUrl?: string }[] = []
  if (cadernoId) {
    const { data: cad } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoId).maybeSingle()
    const cfg = ((cad as any)?.config ?? {}) as any
    const pdf = usaPdfImportado(cfg)
    if (pdf) {
      modalidades = [{ id: 'pdf-importado', nome: pdf.nome, semGab: true, comGab: false, pdfUrl: pdf.url }]
    } else {
      const docs = (cfg.docsV2 ?? {}) as Record<string, unknown>
      // semGab (como você fez): tudo menos Diagnóstico | comGab (com correção): tudo menos Caderno de Questões (só enunciado)
      modalidades = filtrarModsPorTipo(mesclarModalidades(cfg.modalidadesV2), tipo)
        .filter((m) => temConteudo(docs[m.id]) || m.id === 'caderno_perguntas')
        .map((m) => ({ id: m.id, nome: m.nome, semGab: m.id !== 'diagnostico', comGab: m.id !== 'caderno_perguntas' }))
    }
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
        desempenho={[]}
        notaLiberada
        gabaritoLiberado
        cadernoLiberado
        cadernoId={cadernoId}
        modalidades={modalidades}
        estId={id}
        simuladoId={simuladoId}
        simuladoTitulo={sim.titulo}
      />
    </div>
  )
}

function Hero({ est, sim, tipo, visual, Icon, c, id, tentativas }: {
  est: any; sim: any; tipo: any
  visual: { cor: string | null; icone: string | null; capa: string | null; bancoId: string | null }
  Icon: React.ComponentType<{ className?: string }>; c: string; id: string; tentativas: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border shadow-sm">
      <div className="relative flex flex-wrap items-center gap-4 p-5 text-white" style={visual.capa ? undefined : { background: `linear-gradient(120deg, ${c} 0%, #0f172a 130%)` }}>
        {visual.capa && <><img src={visual.capa} alt="" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-black/55" /></>}
        <Link href={`/admin/estudantes/${id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative z-10 shrink-0 text-white hover:bg-white/15 hover:text-white')}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/25" style={{ background: c }}><Icon className="h-7 w-7" /></span>
        <div className="relative z-10 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-white/70">Desempenho de {est.nome}</p>
          <div className="flex items-center gap-2"><h1 className="truncate text-2xl font-bold">{sim.titulo}</h1><TipoSimuladoBadge tipo={tipo} /></div>
          <p className="text-sm text-white/80">{tentativas} tentativa(s)</p>
        </div>
        {visual.bancoId && <Link href={`/admin/banco-questoes/${visual.bancoId}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'relative z-10 ml-auto border-white/30 bg-white/10 text-white hover:bg-white/20')}>Abrir banco</Link>}
      </div>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageShell } from '@/components/brand/interna/page-shell'
import { CronogramaAdaptativoEmbed } from '@/components/brand/interna/cronograma/adaptativo-embed'
import { carregarMeusCronogramas, type OrdemMeus } from '@/lib/cronograma/meus'
import { CronogramaHome } from './_hub/home'
import { EscolherTipo } from './_hub/escolher-tipo'
import { CriarRevisao } from './_hub/criar-revisao'
export const dynamic = 'force-dynamic'

// PÁGINA ÚNICA do Cronograma (fonte única: Meus cronogramas + Modelos + Criar novo).
//   /aluno/cronograma                          → HOME
//   ?criar                                     → etapa 1 (tipo) — pula se só há um tipo
//   ?criar=adaptativo                          → embed (modo criar)
//   ?criar=revisao[&modelo=<id>]               → CronogramaClient (padrão/catálogo)
//   ?ver=adaptativo                            → embed (modo ver, plano fixado)
//   ?novo=1 (legado)                           → redireciona p/ ?criar
// Nada é gravado ao navegar entre as etapas; só em "Gerar/Salvar". Emissões: /cronograma/[emissaoId] e /meus.
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function CronogramaAlunoPage({ searchParams }: { searchParams: Promise<SP> }) {
  // O tenant vem da SESSÃO (não do host, que falha dentro de iframe).
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const sp = await searchParams

  if (um(sp.novo) === '1') redirect('/aluno/cronograma?criar')

  const it = await resolverInterno()
  const ord: OrdemMeus = ['recentes', 'antigos', 'nome'].includes(um(sp.ord) ?? '') ? (um(sp.ord) as OrdemMeus) : 'recentes'
  const q = (um(sp.q) ?? '').trim().slice(0, 80)
  const pagina = Math.max(0, parseInt(um(sp.pg) ?? '0', 10) || 0)
  const dados = await carregarMeusCronogramas(sessao.tenantId, sessao.estudanteId, { q, ord, pagina })

  const criar = sp.criar !== undefined ? (um(sp.criar) ?? '') : null
  const ver = um(sp.ver)

  // ── Adaptativo: visualizar o plano fixado ──
  if (ver === 'adaptativo' && dados.tipos.adaptativo) {
    return <CronogramaAdaptativoEmbed modo="ver" theme={it.theme} />
  }

  // ── Criar ──
  if (criar !== null) {
    const { revisao, adaptativo } = dados.tipos
    if (!revisao && !adaptativo) redirect('/aluno/cronograma')
    const alvo = criar === 'adaptativo' && adaptativo ? 'adaptativo' : criar === 'revisao' && revisao ? 'revisao' : null

    if (alvo === 'adaptativo') return <CronogramaAdaptativoEmbed modo="criar" theme={it.theme} />

    if (alvo === 'revisao') {
      const modeloId = um(sp.modelo)
      const inicial = modeloId && dados.modelos.some((m) => m.id === modeloId) ? modeloId : undefined
      // A escolha do tipo é feita no modal "Novo cronograma" do Painel de estudos → "Voltar" retorna ao Painel
      // (não à home do cronograma, que reabre o plano em foco).
      const voltarPara = '/aluno/nova/painel'
      return (
        <InternaPageShell brand={it.brand} theme={it.theme} titulo="Novo cronograma" subtitulo="Escolha o modelo, defina sua rotina e gere o plano." icone={<CalendarDays className="h-6 w-6" />}>
          <CriarRevisao modelos={dados.modelosBrutos} modeloInicialId={inicial} voltarPara={voltarPara} />
        </InternaPageShell>
      )
    }

    // Só um tipo disponível → pula a etapa 1.
    if (revisao !== adaptativo) {
      const modeloId = um(sp.modelo)
      redirect(revisao ? `/aluno/cronograma?criar=revisao${modeloId ? `&modelo=${encodeURIComponent(modeloId)}` : ''}` : '/aluno/cronograma?criar=adaptativo')
    }
    return (
      <InternaPageShell brand={it.brand} theme={it.theme} titulo="Novo cronograma" subtitulo="Monte seu plano de estudo." icone={<CalendarDays className="h-6 w-6" />}>
        <EscolherTipo tipos={dados.tipos} modeloId={um(sp.modelo)} />
      </InternaPageShell>
    )
  }

  // ── HOME ──
  return (
    <InternaPageShell brand={it.brand} theme={it.theme} titulo="Cronograma de estudos" subtitulo="Monte, salve e acompanhe seus planos de estudo." icone={<CalendarDays className="h-6 w-6" />}>
      <CronogramaHome dados={dados} q={q} ord={ord} />
    </InternaPageShell>
  )
}

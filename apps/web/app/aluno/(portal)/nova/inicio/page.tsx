// Início (novo) — InicioRevisao. BACKEND-FIRST: a página SÓ LÊ dado pronto (carregarHome = snapshot do
// aluno: gamificação + calendário da semana; carregarBannersHome = banners do tenant em cache). Toda a
// computação vive em lib/home/snapshot.ts (worker/escrita/render-miss). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
// As Novidades têm backend próprio (estado "lida" por aluno) e continuam lidas direto. Dados 100% reais.
import { Fragment } from 'react'
import { Card, Col, Muted, Btn, SecHead } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import type { HomeDestaque } from '@/components/brand/interna/home/types'
import { carregarHome, carregarBannersHome, carregarPopupsHome, type HomeDados } from '@/lib/home/snapshot'
import { BannersPortal } from '@/components/aluno/banners-portal'
import { BannerInicio } from './_banner-inicio'
import { CardNivelInicio } from './_card-nivel'
import { RailInicio } from './_rail-inicio'
import { CalendarioInicio } from './_calendario'
import { listarNovidadesAluno } from '@/lib/novidades/novidades'
import type { NovidadeComLeitura } from '@/lib/novidades/tipos'
import { NovidadesCard } from './_novidades'
import { MaratonaCardDestaque } from '@/components/aluno/maratona/maratona-card-destaque'
import { MARATONA, type MaratonaConfig } from '@/lib/maratona/config'
import { getCurrentTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export default async function InicioPage() {
  const sessao = await getSessaoAluno()
  const svc = createAdminClient()
  const primeiroNome = (sessao?.nome || 'Aluno').trim().split(/\s+/)[0] || 'Aluno'

  // 1 leitura de dado PRONTO (snapshot do aluno): gamificação (Olá + nível + sequência + missões) + calendário.
  const d: HomeDados = sessao
    ? await carregarHome(svc, sessao.tenantId, sessao.estudanteId)
    : { homeData: null, diasCal: [], agendaCal: {}, rangeCal: '' }

  // Banner = MESMO carrossel da Início padrão: "Bom estudo" (por aluno) + banners REAIS do tenant (em cache).
  const bomEstudo: HomeDestaque = {
    eyebrow: 'CAMPANHA',
    titulo: `Bom estudo, ${primeiroNome}!`,
    subtitulo: 'Veja o que acontece na sua semana e vá direto para o estudo de hoje.',
    chips: [],
    cta: { rotulo: 'Ir para o painel de estudos', url: R.painel },
    imagem: null,
    cores: 'var(--np-bom-bg)', // claro = roxo mais claro; escuro = gradiente escuro (ver _banner-inicio.tsx)
  }
  const realBanners = sessao ? await carregarBannersHome(svc, sessao.tenantId, sessao.estudanteId) : []
  // Pop-ups ao entrar (CS › Avisos e pop-ups): a Início nova não os exibia.
  const popups = sessao ? await carregarPopupsHome(svc, sessao.tenantId, sessao.estudanteId) : []
  const destaques: HomeDestaque[] = [bomEstudo, ...realBanners]

  // Novidades (changelog real + estado "lida" por aluno) — backend próprio, lidas direto (não vão ao snapshot).
  let novidades: NovidadeComLeitura[] = []
  try { if (sessao) novidades = await listarNovidadesAluno(svc, sessao.tenantId, sessao.estudanteId) } catch { /* sem a migração → vazio */ }

  // Card "Maratona ENAP" — MESMO da Início padrão (MaratonaCardDestaque), gated: só p/ quem tem acesso
  // (Guru/Curseduca) + desafio lançado. Fica ABAIXO do Calendário de compromissos.
  let maratona: { estado: 'aceitar' | 'continuar'; recolhido: boolean; config?: MaratonaConfig; progresso: number } | null = null
  if (sessao) {
    try {
      const { estadoMaratonaAluno } = await import('@/lib/maratona/participacao')
      const { carregarDesafioMaratona, carregarProgressoMaratona } = await import('@/lib/maratona/carregar')
      const [est, des] = await Promise.all([
        estadoMaratonaAluno(svc, sessao.tenantId, sessao.estudanteId),
        carregarDesafioMaratona(svc, sessao.tenantId),
      ])
      if (est.visivel && des.lancada) {
        const progresso = des.pastaId ? await carregarProgressoMaratona(svc, sessao.tenantId, sessao.estudanteId, des.pastaId) : 0
        maratona = { estado: est.iniciado ? 'continuar' : 'aceitar', recolhido: est.recolhido, config: des.config, progresso }
      }
    } catch { /* gating indisponível → não mostra o card */ }
  }

  // Ordem dos blocos (Admin › Aparência › Ordem dos blocos do Início = tema.home_blocos). Só reordena o que existe
  // aqui (avisos=banner, calendário, novidades, vitrine=cursos em foco); 'destaques' e 'simulado' não têm bloco ainda.
  // Tolerante: tema ausente/inválido → ordem original.
  let ordem: string[] = []
  try { const t = (await getCurrentTenant())?.tema as { home_blocos?: unknown } | undefined; if (Array.isArray(t?.home_blocos)) ordem = (t!.home_blocos as unknown[]).filter((x): x is string => typeof x === 'string') } catch { /* padrão */ }
  const pos = (id: string, padrao: number) => { const i = ordem.indexOf(id); return i < 0 ? padrao : i }
  const colEsq: [number, React.ReactNode][] = [
    // Maratona fica sempre colada logo abaixo do calendário (como antes).
    [pos('calendario', 1), <Col key="cal" gap={24}><CalendarioInicio dias={d.diasCal} agenda={d.agendaCal} range={d.rangeCal} />{maratona ? <MaratonaCardDestaque config={maratona.config ?? MARATONA} estado={maratona.estado} recolhidoInicial={maratona.recolhido} feitos={maratona.progresso} /> : null}</Col>],
    [pos('novidades', 5), <NovidadesCard key="nov" novidades={novidades} />],
  ].sort((x, y) => (x[0] as number) - (y[0] as number)) as [number, React.ReactNode][]
  const ordenadoEsq = colEsq.map(([, el]) => el)
  const blocoPrincipal = (
    <div key="principal" className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
      <Col gap={24}>{ordenadoEsq}</Col>
      {d.homeData && <RailInicio data={d.homeData} />}
    </div>
  )
  const blocoVitrine = (
    <Card key="vitrine">
      <SecHead title="Cursos para o seu foco" right={<Btn kind="link" href={R.cursos}>Ver cursos</Btn>} />
      <Col gap={6} style={{ padding: '22px 4px', alignItems: 'center', textAlign: 'center' }}>
        <Muted size={13}>Você ainda não tem um curso em foco.</Muted>
        <Muted size={12}>Ative o foco em um curso na área de Cursos para acompanhá-lo aqui.</Muted>
      </Col>
    </Card>
  )
  const blocoAvisos = (
    <Fragment key="avisos">
      {popups.length > 0 && <BannersPortal banners={popups} />}
      <BannerInicio destaques={destaques} />
      {/* "Olá + nível" lado a lado (componentes REAIS da Início padrão) */}
      {d.homeData && <CardNivelInicio data={d.homeData} />}
    </Fragment>
  )
  const topo: [number, React.ReactNode][] = [
    [pos('avisos', 0), blocoAvisos],
    [Math.min(pos('calendario', 1), pos('novidades', 5)), blocoPrincipal],
    [pos('vitrine', 3), blocoVitrine],
  ]
  topo.sort((a, b) => a[0] - b[0])

  return <>{topo.map(([, el]) => el)}</>
}

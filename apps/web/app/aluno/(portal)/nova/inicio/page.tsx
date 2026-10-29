// Início (novo) — InicioRevisao. BACKEND-FIRST: a página SÓ LÊ dado pronto (carregarHome = snapshot do
// aluno: gamificação + calendário da semana; carregarBannersHome = banners do tenant em cache). Toda a
// computação vive em lib/home/snapshot.ts (worker/escrita/render-miss). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
// As Novidades têm backend próprio (estado "lida" por aluno) e continuam lidas direto. Dados 100% reais.
import { Card, Col, Muted, Btn, SecHead } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import type { HomeDestaque } from '@/components/brand/interna/home/types'
import { carregarHome, carregarBannersHome, type HomeDados } from '@/lib/home/snapshot'
import { BannerInicio } from './_banner-inicio'
import { CardNivelInicio } from './_card-nivel'
import { RailInicio } from './_rail-inicio'
import { CalendarioInicio } from './_calendario'
import { listarNovidadesAluno } from '@/lib/novidades/novidades'
import type { NovidadeComLeitura } from '@/lib/novidades/tipos'
import { NovidadesCard } from './_novidades'
import { MaratonaCardDestaque } from '@/components/aluno/maratona/maratona-card-destaque'
import { MARATONA, type MaratonaConfig } from '@/lib/maratona/config'

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
  const realBanners = sessao ? await carregarBannersHome(svc, sessao.tenantId) : []
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

  return (
    <>
      {/* Banner = MESMO carrossel da Início padrão; "Bom estudo" entra como um slide */}
      <BannerInicio destaques={destaques} />

      {/* "Olá + nível" lado a lado (componentes REAIS da Início padrão) */}
      {d.homeData && <CardNivelInicio data={d.homeData} />}

      {/* Calendário da semana + nível/liga */}
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 24, alignItems: 'start' }}>
        <Col gap={24}>
          <CalendarioInicio dias={d.diasCal} agenda={d.agendaCal} range={d.rangeCal} />

          {/* Card "Maratona ENAP" (mesmo da Início padrão) — logo abaixo do Calendário, quando há acesso. */}
          {maratona ? (
            <MaratonaCardDestaque
              config={maratona.config ?? MARATONA}
              estado={maratona.estado}
              recolhidoInicial={maratona.recolhido}
              feitos={maratona.progresso}
            />
          ) : null}

          {/* Novidades (FUNCIONAL): changelog real do tenant + filtro + estado "lida" por aluno */}
          <NovidadesCard novidades={novidades} />
        </Col>

        {/* Coluna lateral = Meta diária + Sequência + Missões de hoje REAIS */}
        {d.homeData && <RailInicio data={d.homeData} />}
      </div>

      {/* Cursos para o foco — SEM curso em foco por enquanto (não há foco ativo na plataforma ainda).
          Quando o aluno ativar o foco em um curso, ele aparece aqui. O "Top 3 julgados" (JurisClub)
          ficou OCULTO a pedido. */}
      <Card>
        <SecHead title="Cursos para o seu foco" right={<Btn kind="link" href={R.cursos}>Ver cursos</Btn>} />
        <Col gap={6} style={{ padding: '22px 4px', alignItems: 'center', textAlign: 'center' }}>
          <Muted size={13}>Você ainda não tem um curso em foco.</Muted>
          <Muted size={12}>Ative o foco em um curso na área de Cursos para acompanhá-lo aqui.</Muted>
        </Col>
      </Card>
    </>
  )
}

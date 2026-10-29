// Entrada do simulado (nova) — SimEntradaRevisao. Avisos/regras + identificação por e-mail e início.
// Subtela: só o botão voltar no topo (Crumbs). CONTEÚDO DE EXEMPLO (marcado). Layout fiel ao canvas.
import { Crumbs, Card, Field, Btn, GBAR } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

// ——— exemplo (trocar por dados reais) ———
// TODO(dados): ligar informações do simulado (título, datas, nº de questões, estado) ao backend.
const SIM = {
  titulo: 'Simulado Mensal – 10/2026',
  status: 'Em andamento',
  duracao: 'Sem limite · pause quando quiser',
  inicio: '05/10/2026 · 08:00',
  encerra: '12/10/2026 · 23:59',
  questoes: '100 · objetiva A–E',
}

// Linha de informação dentro do card (helper local).
function Info({ icon, label, valor, full }: { icon: Parameters<typeof Icon>[0]['n']; label: string; valor: string; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 14, background: 'var(--surface2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        <Icon n={icon} size={14} />{label}
      </span>
      <b style={{ fontSize: 15, color: 'var(--ink)' }}>{valor}</b>
    </div>
  )
}

// Cabeçalho de card com faixa de degradê (token GBAR) e título com ícone.
function SimCard({ icon, titulo, children }: { icon: Parameters<typeof Icon>[0]['n']; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 24px 50px -36px rgba(40,20,110,.45)', overflow: 'hidden' }}>
      <span style={{ display: 'block', height: 5, background: GBAR }} />
      <div style={{ padding: '26px 28px' }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 16 }}>
          <span style={{ color: 'var(--brand)' }}><Icon n={icon} size={20} /></span>{titulo}
        </b>
        {children}
      </div>
    </div>
  )
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const prova = `/nova/simulado/${id}/prova`
  const resultado = `/nova/simulado/${id}/resultado`

  return (
    <>
      <Crumbs items={[['Questões e Simulados', R.questoes], ['Simulado', '#']]} />

      <div style={{ maxWidth: 880, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* título do simulado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--brand)', flexShrink: 0 }}>
            <svg viewBox="0 0 68 66" aria-hidden style={{ width: 52, height: 52 }}>
              <path fillRule="evenodd" fill="currentColor" d="M6 5.5H32C43.5 5.5 49 13 49 23C49 31 45 37 39.5 40.5L62 61H6Z M9.2 9.2H19.2V57.6H9.2Z" />
            </svg>
          </span>
          <div style={{ minWidth: 0 }}>
            <span style={{ display: 'inline-flex', height: 26, padding: '0 12px', borderRadius: 99, background: 'var(--gold)', color: 'var(--goldInk)', fontSize: 12, fontWeight: 800, alignItems: 'center' }}>{SIM.status}</span>
            <h1 style={{ margin: '8px 0 0', fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: 'var(--brand)', textTransform: 'uppercase' }}>{SIM.titulo}</h1>
          </div>
        </div>

        {/* informações do simulado */}
        <SimCard icon="book" titulo="Informações do simulado">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Info icon="clock" label="Duração" valor={SIM.duracao} full />
            <Info icon="cal" label="Início" valor={SIM.inicio} />
            <Info icon="cal" label="Encerra" valor={SIM.encerra} />
            <Info icon="list" label="Questões" valor={SIM.questoes} />
          </div>
        </SimCard>

        {/* identificação */}
        <SimCard icon="user" titulo="Identifique-se para iniciar">
          <span style={{ display: 'block', margin: '-6px 0 16px', fontSize: 13, color: 'var(--muted)' }}>
            Use o e-mail cadastrado na <b style={{ color: 'var(--brand)' }}>plataforma do Simulado Revisão</b>.
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="E-mail cadastrado na plataforma" icon="mail" type="email" placeholder="seu@email.com" h={50} />
            <Btn kind="primary" icon="play" href={prova} style={{ width: '100%', height: 52 }}>Iniciar simulado</Btn>
            <Btn kind="secondary" icon="list" href={prova} style={{ width: '100%', height: 48 }}>Responder só a folha de respostas</Btn>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />OU<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <a href={resultado} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
              <Icon n="chart" size={15} />Já fiz — ver meus resultados
            </a>
            <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center' }}>
              Ao iniciar você concorda com as regras do simulado. Seus dados não são exibidos no ranking — apenas as iniciais.
            </span>
          </div>
        </SimCard>
      </div>
    </>
  )
}

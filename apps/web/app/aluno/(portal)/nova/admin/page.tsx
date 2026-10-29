// Admin · início (novo) — AdminRevisao. Tela inicial do painel admin (sem caminho).
// Números do dia + fila "Precisa de você" (ordem de urgência) + calendário + atalhos.
// CONTEÚDO DE EXEMPLO — marcado com TODO(dados). Layout fiel ao canvas.
import { PageHeader, Card, Row, Col, H2, H3, Muted, Grid, Btn, IBtn, IconBox, SecHead } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'

export const dynamic = 'force-dynamic'

// ——— números do dia (TODO(dados): ações dos alunos nas últimas 24h) ———
const NUMEROS = [
  { v: 20104, l: 'alunos com acesso', alerta: false },
  { v: 2318, l: 'estudaram hoje', alerta: false },
  { v: 3, l: 'dúvidas sem resposta', alerta: true },
  { v: 3, l: 'materiais com problema', alerta: true },
]

// ——— fila "Precisa de você" (ordem de urgência) ———
const FILA = [
  { cor: 'var(--gold)', t: '1.204 alunos ainda não escolheram como estudar a Reta Final PGE/RS', s: 'Edital publicado em 15/10 · prova em 06/12' },
  { cor: 'var(--danger)', t: '3 dúvidas sem resposta', s: 'A mais antiga é de ontem' },
  { cor: 'var(--accentInk)', t: '3 problemas reportados em materiais', s: '2 no PDFULL da Aula 19' },
  { cor: 'var(--accentInk)', t: '2 avaliações de 1 ou 2 estrelas', s: 'Leia antes de trocar o material' },
  { cor: 'var(--muted)', t: '722 acessos vencem em 30 dias', s: 'Sprint Final PGE e Prova Oral PGM/RJ' },
  { cor: 'var(--brand)', t: '1 videoaula processando', s: 'Aula 20 – Improbidade administrativa' },
]

// ——— calendário ———
const HOJE = { cor: 'var(--pink)', t: 'Live JurisClub · julgados de outubro', s: '22/10 · 19:00 · Todos' }
const PROXIMOS = [
  { cor: 'var(--gold)', t: 'Simulado PGE/BA 15', s: '24/10 · 09:00 · Extensivo Advocacia Pública 2026' },
  { cor: 'var(--ok)', t: 'Mentoria coletiva · cronograma', s: '27/10 · 20:00 · Passaporte | Turma Setembro 2026' },
  { cor: 'var(--info)', t: 'Aula ao vivo · Improbidade', s: '29/10 · 19:30 · Extensivo Advocacia Pública 2026' },
]

// ——— atalhos ———
type Atalho = { icon: IconName; t: string; s: string; destaque?: boolean }
const ATALHOS: Atalho[] = [
  { icon: 'upload', t: 'Subir material', s: 'PDF, LegProc, JurisClub ou vídeo', destaque: true },
  { icon: 'chat', t: 'Responder dúvidas', s: '3 esperando resposta' },
  { icon: 'cal', t: 'Criar evento', s: 'Live, simulado, mentoria ou prazo' },
  { icon: 'mail', t: 'Enviar e-mail', s: 'Para um grupo ou para todos' },
  { icon: 'book', t: 'Criar curso', s: 'Com capa, cores e aulas' },
  { icon: 'key', t: 'Liberar acesso', s: 'Criar grupo ou turma nova' },
  { icon: 'mega', t: 'Publicar aviso', s: 'Faixa, banner ou destaque' },
  { icon: 'chart', t: 'Ver relatórios', s: 'Desempenho, leitura e feedbacks' },
]

const DESTAQUE_GRAD = 'linear-gradient(135deg,#2A1E4A,#4A31B8)'

function EventoRow({ cor, t, s }: { cor: string; t: string; s: string }) {
  return (
    <Row style={{ alignItems: 'stretch', gap: 12, flexWrap: 'nowrap' }}>
      <span style={{ width: 3, borderRadius: 99, background: cor, flexShrink: 0 }} />
      <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{t}</b>
        <Muted size={12}>{s}</Muted>
      </Col>
      <IBtn icon="trash" label="Excluir evento" size={34} />
    </Row>
  )
}

export default function AdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin da plataforma"
        title="Bom dia. Isto é o que precisa de você hoje."
        sub="Os números abaixo vêm das ações dos alunos nas últimas 24 horas."
      />

      {/* números do dia */}
      <Grid cols={4} gap={16}>
        {NUMEROS.map((n, i) => (
          <Card key={i} pad={20} style={{ gap: 4, background: n.alerta ? 'var(--peachBg)' : 'var(--surface)', border: `1px solid ${n.alerta ? 'var(--line2)' : 'var(--line)'}` }}>
            <b style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{n.v.toLocaleString('pt-BR')}</b>
            <Muted size={12.5}>{n.l}</Muted>
          </Card>
        ))}
      </Grid>

      {/* Precisa de você + calendário */}
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 24, alignItems: 'start' }}>
        <Card>
          <SecHead title="Precisa de você" right={<Muted size={12}>Em ordem de urgência</Muted>} />
          <Col gap={0}>
            {FILA.map((f, i) => (
              <a key={i} href="#" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: f.cor, flexShrink: 0 }} />
                <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.35 }}>{f.t}</b>
                  <Muted size={12}>{f.s}</Muted>
                </Col>
                <Icon n="ext" size={16} style={{ color: 'var(--muted2)', flexShrink: 0 }} />
              </a>
            ))}
          </Col>
        </Card>

        <Card>
          <SecHead title="Hoje no calendário" right={<Btn kind="secondary" size="sm" icon="plus">Criar evento</Btn>} />
          <EventoRow {...HOJE} />
          <H3>Próximos dias</H3>
          <Col gap={14}>
            {PROXIMOS.map((p, i) => <EventoRow key={i} {...p} />)}
          </Col>
        </Card>
      </div>

      {/* atalhos */}
      <Col gap={16}>
        <H2>O que você quer fazer?</H2>
        <Grid cols={4} gap={16}>
          {ATALHOS.map((a, i) => (
            <a key={i} href="#" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 18, border: a.destaque ? 'none' : '1px solid var(--line)', background: a.destaque ? DESTAQUE_GRAD : 'var(--surface)', color: a.destaque ? '#fff' : 'var(--ink)' }}>
              {a.destaque
                ? <IconBox icon={a.icon} bg="var(--gold)" fg="var(--goldInk)" s={44} />
                : <IconBox icon={a.icon} s={44} />}
              <Col gap={2}>
                <b style={{ fontSize: 15, fontWeight: 800, color: a.destaque ? '#fff' : 'var(--ink)' }}>{a.t}</b>
                <span style={{ fontSize: 12.5, color: a.destaque ? '#C9BEF0' : 'var(--muted)' }}>{a.s}</span>
              </Col>
            </a>
          ))}
        </Grid>
      </Col>
    </>
  )
}

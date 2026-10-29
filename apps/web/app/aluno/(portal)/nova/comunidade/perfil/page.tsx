// Ligas e Comunidade → Perfil e conquistas (atualizada) — PerfilRevisao. Subtela: caminho + abas de área.
// Porte fiel de PerfilRevisao.dc.html/.png (só claro). BACKEND-FIRST: a página só LÊ o snapshot pronto
// (carregarPerfil); todo o cálculo pesado (relatório do estudante + gamificação + perfil-analytics) vive
// em lib/perfil/snapshot.ts (session-independent). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
// Blocos sem fonte real wirada na /nova seguem // TODO(dados) com fallback de exemplo.
import { Crumbs, Tabs, Card, Grid, Row, Col, H2, Muted, P, Tag, Btn, Bar, GBAR, Stat, Seg, Avatar, Soft } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarPerfil } from '@/lib/perfil/snapshot'

export const dynamic = 'force-dynamic'

const fmtInt = (n: number) => n.toLocaleString('pt-BR')
const inicialDe = (nome: string) => (nome.trim()[0] ?? 'A').toUpperCase()

// ——— exemplo (usado só como fallback quando não há dado real) ———
// TODO(dados): preferências de estudo do estudante (foco/horário/ritmo/dias) — sem loader na /nova.
const PREFS = [
  ['Foco', 'Procuradorias (PGE/BA)'], ['Melhor horário', 'Noite (20h–23h)'],
  ['Ritmo de leitura', '16,3 páginas/h'], ['Dias de estudo', 'Seg a Sáb'],
]

export default async function PerfilPage() {
  // ── Caminho rápido: 1 leitura do snapshot pronto (sessão garantida pelo layout da /nova). ──
  const sessao = await getSessaoAluno()
  const dados = sessao ? await carregarPerfil(createAdminClient(), sessao.tenantId, sessao.estudanteId) : null

  const nome = dados?.nome ?? sessao?.nome ?? 'Aluno'
  const prog = dados?.prog ?? null
  const nivel = dados?.nivel ?? null
  const temGam = dados?.temGam ?? false
  const CARIMBOS = dados?.carimbos ?? []
  const carimbosExtra = dados?.carimbosExtra ?? 0
  const STATS = dados?.stats ?? []
  const RESUMO_SEMANA = dados?.resumoSemana ?? []
  const streakAtual = dados?.streakAtual ?? 0
  const streakMaior = dados?.streakMaior ?? 0

  return (
    <>
      <Crumbs items={[['Ligas e Comunidade', R.comunidade], ['Perfil e conquistas', R.perfil]]} />
      <Tabs items={['Comunidade', 'Ligas', 'Perfil e conquistas']} active={2} links={[R.comunidade, R.ligas, R.perfil]} />

      {/* Capa */}
      <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 22, background: 'linear-gradient(120deg,#241A52 0%,#3A27A0 55%,#4A31B8 100%)', color: '#fff', height: 180 }}>
        <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
        <span aria-hidden style={{ position: 'absolute', right: 28, top: 10, fontSize: 180, fontWeight: 800, fontStyle: 'italic', color: 'rgba(255,255,255,.06)', lineHeight: 1, fontFamily: 'Montserrat, sans-serif' }}>R</span>
        <Col gap={10} style={{ position: 'relative', padding: '22px 28px' }}>
          {/* TODO(dados): "aluno desde" (data de criação do estudante) não exposta na /nova. */}
          <span style={{ display: 'inline-flex', width: 'fit-content', alignItems: 'center', gap: 7, height: 28, padding: '0 12px', borderRadius: 99, background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 12, fontWeight: 700 }}><Icon n="cal" size={13} />Perfil do estudante</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.22em', color: 'var(--gold)' }}>RUMO À PROCURADORIA</span>
        </Col>
      </section>

      {/* Identidade */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 20 }}>
          <Row gap={18} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span style={{ marginTop: -56, padding: 5, borderRadius: '50%', background: `conic-gradient(var(--gold) ${prog?.pct ?? 0}%, var(--track) 0)`, flexShrink: 0 }}>
              <Avatar bg="var(--surface)" fg="var(--brand)" s={96}>{inicialDe(nome)}</Avatar>
            </span>
            <Col gap={8} style={{ paddingTop: 6 }}>
              <Row gap={10}><h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--ink)' }}>{nome}</h1><Tag kind="brand">{nivel != null ? `Nv ${nivel}${prog?.titulo ? ` · ${prog.titulo}` : ''}` : 'Estudante'}</Tag></Row>
              <Muted size={13}>
                {temGam
                  ? `Liga ${dados!.liga?.nome ?? ''}${dados!.posicao ? ` · ${dados!.posicao}º` : ''} · Recorde: ${fmtInt(streakMaior)} ${streakMaior === 1 ? 'dia' : 'dias'} seguidos`
                  : 'Continue estudando para entrar nas ligas e ganhar conquistas'}
              </Muted>
              {prog && (
                <Row gap={12} style={{ flexWrap: 'nowrap', maxWidth: 420 }}>
                  <div style={{ flex: 1 }}><Bar pct={prog.pct} color={GBAR} /></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtInt(prog.xpNoNivel)}/{fmtInt(prog.xpDoNivel)} XP</span>
                </Row>
              )}
            </Col>
          </Row>
          <Col gap={12} style={{ alignItems: 'flex-end' }}>
            <Row gap={0} style={{ flexWrap: 'nowrap' }}>
              {CARIMBOS.map((c, i) => (
                <span key={i} style={{ width: 32, height: 32, borderRadius: '50%', background: c.c, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--surface)', marginLeft: i ? -8 : 0 }}><Icon n={c.icon as IconName} size={15} /></span>
              ))}
              {carimbosExtra > 0 && <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>+{carimbosExtra}</span>}
            </Row>
            <Row gap={8}>
              <Btn kind="secondary" size="sm" icon="palette">Decorar perfil</Btn>
              <Btn kind="gold" size="sm" icon="pen">Editar perfil</Btn>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Indicadores */}
      <Grid cols={6} min={160}>
        {STATS.map((s) => <Stat key={s.l} value={s.v} label={s.l} icon={s.icon as IconName} />)}
      </Grid>

      {/* Abas internas do perfil */}
      <Seg items={['Informações', 'Histórico', 'Conquistas', 'Estatísticas']} active={0} />

      {/* Aba Informações (padrão) — TODO(dados): demais abas (Histórico, Conquistas, Estatísticas). */}
      <Grid cols={2} min={320}>
        <Col gap={16}>
          <Card>
            <H2>Perfil de estudos</H2>
            <P size={13}>Em reta final para procuradorias. Prioriza leitura de PDF e revisão de jurisprudência, com simulados semanais para medir evolução.</P>
            {/* TODO(dados): preferências de estudo (foco/horário/ritmo/dias) — sem loader na /nova. */}
            <Col gap={10}>
              {PREFS.map(([k, v]) => (
                <Row key={k} style={{ justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                  <Muted size={12.5}>{k}</Muted>
                  <b style={{ fontSize: 13, color: 'var(--ink)' }}>{v}</b>
                </Row>
              ))}
            </Col>
          </Card>
          <Card>
            <H2>Meta diária</H2>
            {/* TODO(dados): meta diária em HORAS não tem fonte na /nova (perfil-prefs é por questões). */}
            <Row style={{ justifyContent: 'space-between' }}><Muted size={12.5}>Progresso de hoje</Muted><b style={{ fontSize: 13, color: 'var(--ink)' }}>2h40 / 3h00</b></Row>
            <Bar pct={89} color={GBAR} />
            <Muted size={12}>Faltam 20 minutos para fechar a meta de hoje.</Muted>
          </Card>
        </Col>

        <Col gap={16}>
          <Card>
            <H2>Meu Desafio de Lei Seca</H2>
            <Row gap={12} style={{ flexWrap: 'nowrap' }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--peachBg)', color: 'var(--accentInk)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="flame" size={22} /></span>
              <Col gap={2}>
                <b style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{temGam ? `${fmtInt(streakAtual)} ${streakAtual === 1 ? 'dia' : 'dias'} de sequência` : 'Comece sua sequência'}</b>
                <Muted size={12}>{temGam ? `Recorde pessoal: ${fmtInt(streakMaior)} ${streakMaior === 1 ? 'dia' : 'dias'}` : 'Estude todo dia para manter a chama acesa'}</Muted>
              </Col>
            </Row>
            <Btn kind="secondary" size="sm" icon="play" href={R.desafioLeiSecaArea} style={{ width: 'fit-content' }}>Continuar desafio</Btn>
          </Card>
          <Card>
            <H2>Resumo da semana</H2>
            {/* REAL: tempo/simulados do analytics (resumoSemana) + XP da semana (gamificação). */}
            <Grid cols={3} gap={10}>
              {RESUMO_SEMANA.map(([v, l]) => (
                <Soft key={l} pad={12} style={{ alignItems: 'center' }}>
                  <b style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{v}</b>
                  <Muted size={11.5}>{l}</Muted>
                </Soft>
              ))}
            </Grid>
          </Card>
          <Card>
            <H2>Preferências</H2>
            {/* TODO(dados): preferências de privacidade/comunicação — sem loader wirado na /nova. */}
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted size={12.5}>Mostrar meus números no ranking da liga</Muted>
              <Tag kind="green" icon="check">Ativo</Tag>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted size={12.5}>Receber recados de colegas</Muted>
              <Tag kind="green" icon="check">Ativo</Tag>
            </Row>
          </Card>
        </Col>
      </Grid>
    </>
  )
}

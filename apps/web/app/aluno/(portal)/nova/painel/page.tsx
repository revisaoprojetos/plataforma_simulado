// Meu painel de estudos — MeuPainelRevisao. BACKEND-FIRST: a página SÓ LÊ o snapshot pronto
// (carregarPainel). Toda a computação vive em lib/painel/snapshot.ts (worker/escrita/render-miss).
// Ver docs/ARQUITETURA-BACKEND-FIRST.md. Dados 100% reais (cronograma + gamificação + última leitura).
import { Hero, Card, Col, Row, Grid, Split, SecHead, Muted, P, Btn, Bar, GBAR, Cover, GR, Eyebrow, IconBox } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { carregarPainel } from '@/lib/painel/snapshot'
import { listarPlanosAdaptativo } from '@/lib/cronograma/adaptativo/dados'
import { MetasPainel, type MetaPainel } from './_metas-painel'
import { CronogramasHub, type PlanoHub } from './_cronogramas-hub'
import { RefreshOnReturn } from './_refresh-on-return'

export const dynamic = 'force-dynamic'

// HUB do cronograma: o "Meu painel de estudos" é a casa do CRONOGRAMA ADAPTATIVO 2.0 (multi-plano).
// As metas de hoje vêm do plano FIXADO (snapshot). O embed do Adaptativo (iframe) é renderizado em
// /aluno/cronograma (shell interno, com título/marca como as demais páginas) — FORA da sidebar.
const CRONOGRAMA = '/aluno/cronograma'

export default async function PainelPage() {
  const sessao = await getSessaoAluno()
  const svc = createAdminClient()
  // Metas do dia (plano FIXADO, via snapshot) + lista de cronogramas do aluno (multi-plano).
  const [d, planos] = sessao
    ? await Promise.all([
        carregarPainel(svc, sessao.tenantId, sessao.estudanteId),
        listarPlanosAdaptativo(svc, sessao.tenantId, sessao.estudanteId),
      ])
    : [{ temCronograma: false, feitasHoje: 0, totalHoje: 0, pctHoje: 0, pendencias: 0, pctSemana: 0, horasLabel: '0min', streak: 0, metas: [], continue: null }, [] as PlanoHub[]]
  const primeiroNome = (sessao?.nome ?? 'Aluno').trim().split(/\s+/)[0] || 'Aluno'
  const cont = d.continue
  const temCronograma = planos.length > 0
  const focoNome = (planos.find((p) => p.fixado)?.titulo || '').trim() // cronograma em foco → nome ao lado de "Metas de hoje"

  return (
    <>
      <RefreshOnReturn />
      {/* Hero COERENTE com ter ou não cronograma (fonte única = planos). Sem cronograma não há
          "Continuar estudando" nem stats de metas — só o convite para criar o primeiro.
          Bg ADAPTATIVO (var --nova-hero-bg): claro = tom da sidebar; escuro = tom do "Meu Desempenho". */}
      <Hero>
        {temCronograma ? (
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 28 }}>
            <Col gap={14} style={{ maxWidth: 560 }}>
              <Eyebrow color="#C9B8FF">Painel de estudos</Eyebrow>
              <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, color: '#fff' }}>Olá, {primeiroNome}. Seu estudo de hoje</h1>
              <P size={14}><span style={{ color: '#D8CEF5' }}>{d.totalHoje > 0 ? `${d.totalHoje} ${d.totalHoje === 1 ? 'meta' : 'metas'} para hoje no seu Cronograma Adaptativo.` : 'Nenhuma meta para hoje — abra seu cronograma para ajustar o plano.'}</span></P>
              <Row gap={10} style={{ marginTop: 2 }}>
                <Btn kind="gold" icon="play" href={CRONOGRAMA}>Continuar estudando</Btn>
                <Btn kind="ghostdark" icon="chart" href={R.desempenho}>Meu desempenho</Btn>
              </Row>
            </Col>
            <Grid cols={2} gap={12} style={{ width: 'min(340px, 42%)', flexShrink: 0 }}>
              <HeroStat value={`${d.feitasHoje} de ${d.totalHoje}`} label="metas de hoje" />
              <HeroStat value={`${d.streak}`} label={d.streak === 1 ? 'dia de sequência' : 'dias de sequência'} gold />
              <HeroStat value={`${d.pendencias}`} label="metas atrasadas" />
              <HeroStat value={`${d.pctSemana}%`} label="da semana concluída" />
            </Grid>
          </Row>
        ) : (
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 28 }}>
            <Col gap={14} style={{ maxWidth: 640 }}>
              <Eyebrow color="#C9B8FF">Painel de estudos</Eyebrow>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.12, color: '#fff' }}>Olá, {primeiroNome}. Vamos montar seu estudo?</h1>
              <P size={14}><span style={{ color: '#D8CEF5' }}>Você ainda não tem um cronograma. Crie o seu — o Cronograma Adaptativo organiza seu estudo semana a semana e as metas de cada dia passam a aparecer aqui no painel.</span></P>
              <Row gap={10} style={{ marginTop: 2 }}>
                <Btn kind="gold" icon="plus" href={CRONOGRAMA}>Criar cronograma</Btn>
                <Btn kind="ghostdark" icon="chart" href={R.desempenho}>Meu desempenho</Btn>
              </Row>
            </Col>
            <div style={{ width: 'min(300px, 40%)', flexShrink: 0, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
              <IconBox icon="cal" s={92} />
            </div>
          </Row>
        )}
      </Hero>

      {temCronograma ? (
      <Split
        main={
          <Card>
            <SecHead eyebrow="Cronograma adaptativo" title={focoNome ? <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>Metas de hoje<span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--brand)', alignSelf: 'center' }} /><span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>{focoNome}</span></span> : 'Metas de hoje'} right={<Btn kind="link" href={CRONOGRAMA}>Abrir cronograma</Btn>} />
            {d.totalHoje > 0 ? (
              <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                <Bar pct={d.pctHoje} color={GBAR} style={{ flex: 1 }} />
                <b style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{d.feitasHoje} de {d.totalHoje}{d.horasLabel ? ` · ${d.horasLabel}` : ''}</b>
              </Row>
            ) : null}
            <MetasPainel metas={d.metas as MetaPainel[]} />
          </Card>
        }
        aside={
          <Col gap={16}>
            {/* Continue de onde parou (última leitura real + capa real) */}
            <Card>
              <SecHead title="Continue de onde parou" />
              {cont ? (
                <>
                  <Row gap={12} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <div style={{ width: 84, flexShrink: 0, borderRadius: 12, overflow: 'hidden', aspectRatio: '3 / 4', background: 'var(--surface2)' }}>
                      {cont.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cont.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                      ) : (
                        <Cover line="LEITURA" sigla={(cont.cursoNome ?? 'Material').slice(0, 10)} grad={GR.EXT} big={15} />
                      )}
                    </div>
                    <Col gap={4} style={{ minWidth: 0 }}>
                      {cont.cursoNome ? <Eyebrow>{cont.cursoNome}</Eyebrow> : null}
                      <b style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{cont.titulo}</b>
                    </Col>
                  </Row>
                  <Btn kind="primary" icon="file" href={`/aluno/biblioteca/${cont.docId}`}>Retomar o material</Btn>
                </>
              ) : (
                <Muted size={13}>Você ainda não abriu nenhum material. Comece pela Biblioteca ou por um curso.</Muted>
              )}
            </Card>

            {/* Resumo do cronograma (real) */}
            <Card>
              <SecHead title="Resumo do cronograma" />
              <Row style={{ justifyContent: 'space-between' }}>
                <Muted size={13}>Esta semana</Muted>
                <b style={{ fontSize: 13, color: 'var(--ink)' }}>{d.pctSemana}%</b>
              </Row>
              <Bar pct={d.pctSemana} color={GBAR} />
              <Row gap={16} style={{ marginTop: 4 }}>
                <Col gap={0}><b style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{d.pendencias}</b><Muted size={11.5}>metas atrasadas</Muted></Col>
                <Col gap={0}><b style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{d.streak}</b><Muted size={11.5}>dias de sequência</Muted></Col>
              </Row>
              <Btn kind="secondary" size="sm" icon="cal" href={CRONOGRAMA}>Abrir cronograma</Btn>
            </Card>
          </Col>
        }
      />
      ) : null}

      {/* Meus cronogramas (multi-plano): fixar troca o foco → metas de hoje acima; renomear/arquivar/+novo. */}
      {temCronograma ? <CronogramasHub planos={planos as PlanoHub[]} /> : null}
    </>
  )
}

function HeroStat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div style={{ borderRadius: 14, padding: '14px 16px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: gold ? 'var(--gold)' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#CDBFF2', lineHeight: 1.35 }}>{label}</div>
    </div>
  )
}

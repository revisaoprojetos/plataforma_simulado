'use client'
// "Meus cronogramas" do Meu painel de estudos (HUB) — opera sobre o CRONOGRAMA ADAPTATIVO 2.0.
// Lista os planos (dado REAL via listarPlanosAdaptativo, passado pronto pelo server) e expõe as
// ações do motor multi-plano: FIXAR (vira o foco), RENOMEAR, ARQUIVAR e + NOVO. Tudo via ROTA DE API
// (POST /api/aluno/cronograma/adaptativo) — nunca server action (landmine de domínio custom/Traefik).
// O plano FIXADO é a fonte das "Metas de hoje" do painel; ao fixar/arquivar, router.refresh() relê o snapshot.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, Row, Col, Muted, Btn, Grid, IconBox, IBtn } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'

export type PlanoHub = { id: string; titulo: string | null; fixado: boolean; criado_em: string; atualizado_em: string }

const API = '/api/aluno/cronograma/adaptativo'
// Home do embed do Adaptativo (área que renderiza o iframe do plano FIXADO). As rotas
// O embed do Adaptativo é renderizado em /aluno/cronograma (shell interno) — fora da sidebar.
const CRONOGRAMA = '/aluno/cronograma'
const fmtD = (iso?: string | null) => { try { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '' } catch { return '' } }
// Data local (YYYY-MM-DD) para o start do cronograma em branco do "+ Novo".
const hojeLocal = () => new Date().toLocaleDateString('en-CA')
// cfg em branco (espelha o cfgVazia do modelo): sem dias/disciplinas → plano vazio que o aluno
// configura na própria tela de Montar do embed, logo após o + Novo.
const CFG_NOVO = {
  start: hojeLocal(), horas: [0, 0, 0, 0, 0, 0, 0], discs: [] as string[],
  metas: { pf: true, fl: true, qu: true, lp: true }, arranjo: 'pdf', revModelo: 'pdflash', revisao: { ativa: true, cada: 12 },
}

export function CronogramasHub({ planos }: { planos: PlanoHub[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.json().catch(() => ({ ok: false }))
  }

  const fixar = (id: string) => { setBusy(id); post({ acao: 'fixar', planoId: id }).then((j) => { if (j?.ok) router.refresh() }).finally(() => setBusy(null)) }
  const renomear = (p: PlanoHub) => {
    const nome = window.prompt('Novo nome do cronograma:', p.titulo || 'Meu cronograma')
    if (nome == null) return
    setBusy(p.id); post({ acao: 'renomear', planoId: p.id, titulo: nome }).then((j) => { if (j?.ok) router.refresh() }).finally(() => setBusy(null))
  }
  const arquivar = (p: PlanoHub) => {
    if (!window.confirm(`Arquivar o cronograma "${p.titulo || 'Meu cronograma'}"? Ele sai da lista; você pode gerar outro quando quiser.`)) return
    setBusy(p.id); post({ acao: 'arquivar', planoId: p.id, arquivar: true }).then((j) => { if (j?.ok) router.refresh() }).finally(() => setBusy(null))
  }
  const novo = () => {
    setBusy('novo')
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* acende a linha de carregamento já no clique */ }
    post({ acao: 'gerar', novo: true, cfg: CFG_NOVO }).then((j) => {
      if (j?.ok) router.push(`${CRONOGRAMA}?novo=1`)
      else setBusy(null)
    }).catch(() => setBusy(null))
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Col gap={2}>
          <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Meus cronogramas</b>
          <Muted size={12.5}>O cronograma <b style={{ color: 'var(--ink)' }}>em foco</b> define as metas de hoje. Fixe outro para trocar o foco.</Muted>
        </Col>
        <Btn kind="gold" size="sm" icon="plus" onClick={novo}>{busy === 'novo' ? 'Criando…' : 'Novo cronograma'}</Btn>
      </Row>

      <Grid min={330} gap={14}>
        {planos.map((p) => {
          const pend = busy === p.id
          const nome = p.titulo || 'Meu cronograma'
          const criado = fmtD(p.criado_em), ativo = fmtD(p.atualizado_em)
          return (
            <Card key={p.id} pad={0} style={{ position: 'relative', gap: 0, overflow: 'hidden', border: p.fixado ? '1.5px solid var(--brand)' : '1px solid var(--line)' }}>
              {p.fixado ? <div style={{ height: 4, background: 'var(--brand)' }} /> : null}
              {/* "Em foco" = ícone no canto superior direito (sem pill no corpo) */}
              {p.fixado ? (
                <span title="Em foco" aria-label="Em foco" style={{ position: 'absolute', top: 14, right: 12, width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--brand) 14%, transparent)', color: 'var(--brand)', zIndex: 1 }}>
                  <Icon n="tack" size={15} />
                </span>
              ) : null}
              <Col gap={12} style={{ padding: 16 }}>
                {/* cabeçalho: ícone + nome + datas */}
                <Row gap={11} style={{ minWidth: 0, paddingRight: p.fixado ? 34 : 0 }}>
                  <IconBox icon="cal" s={42} fg={p.fixado ? 'var(--brand)' : 'var(--muted)'} />
                  <Col gap={3} style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</b>
                    <Muted size={11.5}>Criado em {criado}{ativo && ativo !== criado ? ` · ativo em ${ativo}` : ''}</Muted>
                  </Col>
                </Row>

                {/* linha explicativa: o que este cronograma é/faz agora */}
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: p.fixado ? 'var(--ink)' : 'var(--muted)', padding: '9px 11px', borderRadius: 12, background: p.fixado ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'var(--surface2)' }}>
                  {p.fixado
                    ? <>É este cronograma que está <b>guiando o seu dia</b> — as <b>“Metas de hoje”</b> acima vêm dele.</>
                    : <>Fixe para que as <b>“Metas de hoje”</b> passem a ser as deste cronograma.</>}
                </div>

                {/* ações: 1 principal + secundárias discretas (só ícone, com rótulo em tooltip) */}
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  {p.fixado
                    ? <Btn kind="primary" size="sm" icon="cal" href={CRONOGRAMA}>Abrir · Hoje</Btn>
                    : <Btn kind="primary" size="sm" icon="tack" onClick={() => fixar(p.id)}>{pend ? 'Fixando…' : 'Fixar como foco'}</Btn>}
                  <Row gap={6}>
                    <IBtn icon="pen" label="Renomear cronograma" size={34} onClick={() => renomear(p)} />
                    <IBtn icon="trash" label="Arquivar cronograma" size={34} onClick={() => arquivar(p)} />
                  </Row>
                </Row>
              </Col>
            </Card>
          )
        })}
      </Grid>
    </Card>
  )
}

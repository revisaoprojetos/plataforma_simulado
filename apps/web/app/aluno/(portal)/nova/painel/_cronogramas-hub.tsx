'use client'
// "Meus cronogramas" do Meu painel de estudos (HUB) — lista os planos dos DOIS tipos (Cronograma Revisão =
// emissões do modelo/metas do admin; Cronograma Adaptativo 2.0) já prontos do servidor (carregarMeusCronogramas).
// Ações: FIXAR (vira o foco — alimenta "Metas de hoje"), RENOMEAR, ARQUIVAR e + NOVO (escolhe o tipo em modal).
// Tudo via ROTA DE API (nunca server action — landmine de domínio custom/Traefik/iframe Curseduca):
//   Adaptativo → /api/aluno/cronograma/adaptativo ; Revisão → /api/aluno/cronograma/emissoes.
// Só 1 plano em foco por aluno ENTRE os dois tipos (fixar é atômico no banco). Ao mudar, router.refresh() relê o snapshot.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, Row, Col, Muted, Btn, Grid, IconBox, IBtn, Tag } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { NovaModal } from '@/components/nova/modal'
import type { ItemCronograma, TiposDisponiveis } from '@/lib/cronograma/meus'

const API_ADAPT = '/api/aluno/cronograma/adaptativo'
const API_REV = '/api/aluno/cronograma/emissoes'
// O embed do Adaptativo e a escolha/criação do Revisão vivem em /aluno/cronograma (shell interno) — fora da sidebar.
const CRONOGRAMA = '/aluno/cronograma'

type Pedido = { url: string; body: Record<string, unknown> }
const INPUT: React.CSSProperties = { height: 44, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', padding: '0 12px', fontSize: 14, width: '100%' }

const OPCOES_NOVO = [
  {
    t: 'revisao' as const, icon: 'list' as const, selo: 'Modelo pronto', titulo: 'Cronograma Revisão',
    desc: 'Um plano montado pela equipe, semana a semana, com as aulas e os materiais já definidos.',
    itens: ['Metas e ordem definidas pela equipe', 'Conteúdo da Biblioteca a um clique', 'Você escolhe o modelo, o início e os recessos'],
    cta: 'Criar cronograma Revisão',
  },
  {
    t: 'adaptativo' as const, icon: 'sliders' as const, selo: 'Personalizado', titulo: 'Cronograma Adaptativo',
    desc: 'Um plano sob medida para a sua rotina, que se reorganiza conforme você estuda.',
    itens: ['Monta o plano pelas suas horas e disciplinas', 'Reorganiza atrasos e ajusta ao seu desempenho', 'Revisões e questões no momento certo'],
    cta: 'Criar cronograma Adaptativo',
  },
]

function OpcaoNovo({ o, onEscolher }: { o: (typeof OPCOES_NOVO)[number]; onEscolher: () => void }) {
  const [sobre, setSobre] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setSobre(true)} onMouseLeave={() => setSobre(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 18, border: `1px solid ${sobre ? 'var(--brand)' : 'var(--line)'}`, background: sobre ? 'color-mix(in srgb, var(--brand) 6%, var(--surface))' : 'var(--surface2)', boxShadow: sobre ? '0 18px 32px -24px color-mix(in srgb, var(--brand) 70%, transparent)' : 'none', transform: sobre ? 'translateY(-2px)' : 'none', transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease' }}
    >
      <Row gap={12} style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
        <IconBox icon={o.icon} s={46} fg="var(--brand)" />
        <Col gap={5} style={{ minWidth: 0 }}>
          <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{o.titulo}</b>
          <span><Tag kind="brand">{o.selo}</Tag></span>
        </Col>
      </Row>
      <Muted size={13}>{o.desc}</Muted>
      <Col gap={8} style={{ margin: 0 }}>
        {o.itens.map((x) => (
          <Row key={x} gap={8} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--brand)', display: 'inline-flex', marginTop: 2, flexShrink: 0 }}><Icon n="check" size={14} /></span>
            <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--ink)' }}>{x}</span>
          </Row>
        ))}
      </Col>
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <Btn kind="primary" size="md" onClick={onEscolher} style={{ width: '100%' }}>{o.cta}</Btn>
      </div>
    </div>
  )
}

export function CronogramasHub({ itens, tipos, total }: { itens: ItemCronograma[]; tipos: TiposDisponiveis; total: number }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [novoAberto, setNovoAberto] = React.useState(false)
  const [renomeando, setRenomeando] = React.useState<ItemCronograma | null>(null)
  const [arquivando, setArquivando] = React.useState<ItemCronograma | null>(null)
  const [nome, setNome] = React.useState('')

  // Mensagem da API (campo `message`) quando falhar — nunca engolir o erro em silêncio.
  const post = async ({ url, body }: Pedido): Promise<{ ok: boolean; message?: string }> => {
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) return { ok: false, message: j?.message || j?.error || `Não foi possível concluir (erro ${r.status}).` }
      return j
    } catch { return { ok: false, message: 'Sem conexão com o servidor. Tente de novo.' } }
  }
  const executar = (id: string, p: Pedido, depois?: () => void) => {
    setBusy(id); setErro(null)
    return post(p).then((j) => { if (j.ok) { depois?.(); router.refresh() } else setErro(j.message || 'Não foi possível concluir.') }).finally(() => setBusy(null))
  }

  const pedido = (i: ItemCronograma, acao: 'fixar' | 'renomear' | 'apagar', extra: Record<string, unknown> = {}): Pedido =>
    i.tipo === 'adaptativo'
      ? { url: API_ADAPT, body: { acao, planoId: i.id, ...extra } }
      : { url: API_REV, body: { acao, id: i.id, ...extra } }

  const fixar = (i: ItemCronograma) => executar(i.id, pedido(i, 'fixar'))
  const confirmarRenome = () => {
    const alvo = renomeando
    if (!alvo) return
    const t = nome.trim()
    if (!t) return
    executar(alvo.id, pedido(alvo, 'renomear', { titulo: t }), () => setRenomeando(null))
  }
  const confirmarApagar = () => {
    const alvo = arquivando
    if (!alvo) return
    executar(alvo.id, pedido(alvo, 'apagar'), () => setArquivando(null))
  }
  const abrirRenomear = (i: ItemCronograma) => { setNome(i.titulo); setRenomeando(i); setErro(null) }

  const irPara = (href: string) => {
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* acende a linha de carregamento já no clique */ }
    router.push(href)
  }
  const hrefCriar = (t: 'revisao' | 'adaptativo') => `${CRONOGRAMA}?criar=${t}`
  // "Novo cronograma": com os 2 tipos liberados → modal com as 2 opções; com 1 só → vai direto. Nada é gravado ao navegar.
  const novo = () => {
    setErro(null)
    if (tipos.revisao && tipos.adaptativo) setNovoAberto(true)
    else if (tipos.revisao) irPara(hrefCriar('revisao'))
    else irPara(hrefCriar('adaptativo'))
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Col gap={2}>
          <b style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Meus cronogramas</b>
          <Muted size={12.5}>O cronograma <b style={{ color: 'var(--ink)' }}>em foco</b> define as metas de hoje. Fixe outro para trocar o foco — vale para os dois tipos.</Muted>
        </Col>
        <Btn kind="gold" size="sm" icon="plus" onClick={novo}>Novo cronograma</Btn>
      </Row>
      {erro && !renomeando && !arquivando ? (
        <div role="alert" style={{ fontSize: 13, fontWeight: 600, padding: '9px 12px', borderRadius: 12, color: 'var(--ink)', background: 'color-mix(in srgb, var(--danger, var(--brand)) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--danger, var(--brand)) 40%, transparent)' }}>{erro}</div>
      ) : null}

      <Grid min={330} gap={14}>
        {itens.map((p) => {
          const pend = busy === p.id
          const adapt = p.tipo === 'adaptativo'
          return (
            <Card key={`${p.tipo}-${p.id}`} pad={0} style={{ position: 'relative', gap: 0, overflow: 'hidden', border: p.fixado ? '1.5px solid var(--brand)' : '1px solid var(--line)' }}>
              {p.fixado ? <div style={{ height: 4, background: 'var(--brand)' }} /> : null}
              {/* "Em foco" = ícone no canto superior direito (sem pill no corpo) */}
              {p.fixado ? (
                <span title="Em foco" aria-label="Em foco" style={{ position: 'absolute', top: 14, right: 12, width: 28, height: 28, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--brand) 14%, transparent)', color: 'var(--brand)', zIndex: 1 }}>
                  <Icon n="tack" size={15} />
                </span>
              ) : null}
              <Col gap={12} style={{ padding: 16 }}>
                <Row gap={11} style={{ minWidth: 0, paddingRight: p.fixado ? 34 : 0, flexWrap: 'nowrap' }}>
                  <IconBox icon="cal" s={42} fg={p.fixado ? 'var(--brand)' : 'var(--muted)'} />
                  <Col gap={4} style={{ minWidth: 0 }}>
                    <b title={p.titulo} style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</b>
                    <Row gap={6}>
                      <Tag kind={adapt ? 'brand' : 'gray'}>{adapt ? 'Adaptativo' : 'Revisão'}</Tag>
                    </Row>
                    <Muted size={11.5}>Criado em {p.criadoEmFmt}{p.atualizadoEmFmt && p.atualizadoEmFmt !== p.criadoEmFmt ? ` · ativo em ${p.atualizadoEmFmt}` : ''}</Muted>
                  </Col>
                </Row>

                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: p.fixado ? 'var(--ink)' : 'var(--muted)', padding: '9px 11px', borderRadius: 12, background: p.fixado ? 'color-mix(in srgb, var(--brand) 8%, transparent)' : 'var(--surface2)' }}>
                  {p.fixado
                    ? <>É este cronograma que está <b>guiando o seu dia</b> — as <b>“Metas de hoje”</b> acima vêm dele.</>
                    : <>Fixe para que as <b>“Metas de hoje”</b> passem a ser as deste cronograma.</>}
                </div>

                <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  {p.fixado
                    ? <Btn kind="primary" size="sm" icon="cal" href={p.href}>Abrir · Hoje</Btn>
                    : <Btn kind="primary" size="sm" icon="tack" onClick={() => fixar(p)}>{pend ? 'Fixando…' : 'Fixar como foco'}</Btn>}
                  <Row gap={6}>
                    {!adapt && !p.fixado ? <IBtn icon="cal" label="Abrir cronograma" size={34} href={p.href} /> : null}
                    <IBtn icon="pen" label="Renomear cronograma" size={34} onClick={() => abrirRenomear(p)} />
                    <IBtn icon="trash" label="Apagar cronograma" size={34} onClick={() => { setArquivando(p); setErro(null) }} />
                  </Row>
                </Row>
              </Col>
            </Card>
          )
        })}
      </Grid>
      {total > itens.length ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Muted size={12.5}>Mostrando {itens.length} de {total} cronogramas.</Muted>
          <Btn kind="link" href={CRONOGRAMA}>Ver todos</Btn>
        </Row>
      ) : null}

      {novoAberto ? (
        <NovaModal titulo="Novo cronograma" sub="Escolha o tipo de plano. Você pode ter os dois ao mesmo tempo — só um fica em foco, e é ele que traz as “Metas de hoje”." onClose={() => setNovoAberto(false)} w={680}>
          <Grid min={250} gap={14}>
            {OPCOES_NOVO.map((o) => (
              <OpcaoNovo key={o.t} o={o} onEscolher={() => { setNovoAberto(false); irPara(hrefCriar(o.t)) }} />
            ))}
          </Grid>
        </NovaModal>
      ) : null}

      {renomeando ? (
        <NovaModal titulo="Renomear cronograma" onClose={() => setRenomeando(null)} w={460}>
          <input autoFocus value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmarRenome() }} aria-label="Novo nome do cronograma" style={INPUT} />
          {erro ? <div role="alert" style={{ fontSize: 13, color: 'var(--ink)' }}>{erro}</div> : null}
          <Row gap={8} style={{ justifyContent: 'flex-end' }}>
            <Btn kind="secondary" size="sm" onClick={() => setRenomeando(null)}>Cancelar</Btn>
            <Btn kind="primary" size="sm" onClick={confirmarRenome}>{busy === renomeando.id ? 'Salvando…' : 'Salvar'}</Btn>
          </Row>
        </NovaModal>
      ) : null}

      {arquivando ? (
        <NovaModal titulo="Apagar cronograma?" sub={<>“{arquivando.titulo}” será apagado de vez, com todas as marcações e anotações. Não dá para desfazer; se quiser, você pode gerar outro depois.{arquivando.fixado ? ' Como ele está em foco, o cronograma mais recente passa a ser o foco.' : ''}</>} onClose={() => setArquivando(null)} w={460}>
          {erro ? <div role="alert" style={{ fontSize: 13, color: 'var(--ink)' }}>{erro}</div> : null}
          <Row gap={8} style={{ justifyContent: 'flex-end' }}>
            <Btn kind="secondary" size="sm" onClick={() => setArquivando(null)}>Cancelar</Btn>
            <Btn kind="primary" size="sm" icon="trash" onClick={confirmarApagar}>{busy === arquivando.id ? 'Apagando…' : 'Apagar definitivamente'}</Btn>
          </Row>
        </NovaModal>
      ) : null}
    </Card>
  )
}

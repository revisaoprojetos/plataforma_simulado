// Resultado do simulado (nova) — SimResultadoRevisao. Tela cheia de foco: topo só a seta ‹.
// Nota, materiais/downloads, desempenho por matéria, posição entre alunos, correção questão a questão.
// CONTEÚDO DE EXEMPLO (marcado). Layout fiel ao canvas.
import { Card, Grid, Row, Col, H2, Muted, Tag, Bar, GBAR, Btn, Avatar, Aviso, IconBox } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'

export const dynamic = 'force-dynamic'

// ——— exemplo (trocar por dados reais) ———
// TODO(dados): ligar resultado real (nota, acertos por matéria, ranking, correção) do backend.
const RESUMO = { data: '05/10/2026', inicio: '08:12', termino: '11:47', tempo: '3h35' }
const TILES: { icon: IconName; valor: string; label: string; bg: string; fg: string }[] = [
  { icon: 'check', valor: '62', label: 'Acertos', bg: 'var(--okBg)', fg: 'var(--ok)' },
  { icon: 'x', valor: '31', label: 'Erros', bg: 'var(--dangerBg)', fg: 'var(--danger)' },
  { icon: 'info', valor: '7', label: 'Em branco', bg: 'var(--surface2)', fg: 'var(--muted)' },
  { icon: 'trophy', valor: '62%', label: 'Nota final', bg: 'var(--peachBg)', fg: 'var(--accentInk)' },
]
const MINI = [
  { label: 'Posição', valor: '214º de 1.380' },
  { label: 'Média geral', valor: '53%' },
  { label: 'Acima da média', valor: '+9 p.p.', ok: true },
  { label: 'Top', valor: '16%' },
]
const DOWNLOADS_FEZ: { icon: IconName; titulo: string; sub: string }[] = [
  { icon: 'book', titulo: 'Caderno de questões', sub: 'PDF · como você fez' },
  { icon: 'list', titulo: 'Folha de respostas', sub: 'PDF · suas marcações' },
]
const DOWNLOADS_GAB: { icon: IconName; titulo: string; sub: string; destaque?: boolean }[] = [
  { icon: 'clip', titulo: 'Folha com gabarito', sub: 'certo × errado' },
  { icon: 'chart', titulo: 'Diagnóstico', sub: 'relatório por matéria' },
  { icon: 'bulb', titulo: 'Gabarito comentado', sub: 'todas as justificativas', destaque: true },
]
const MATERIAS = [
  { nome: 'Direito Constitucional', acertos: '9/13', pct: 69, media: 62 },
  { nome: 'Direito Administrativo', acertos: '8/11', pct: 73, media: 68 },
  { nome: 'Direito Processual Civil', acertos: '7/11', pct: 64, media: 61 },
  { nome: 'Direito Civil', acertos: '6/10', pct: 60, media: 58 },
  { nome: 'Direito Ambiental', acertos: '6/10', pct: 60, media: 55 },
  { nome: 'Direito Tributário', acertos: '5/8', pct: 62, media: 57 },
  { nome: 'Direito Financeiro', acertos: '4/8', pct: 50, media: 54 },
  { nome: 'Direito do Trabalho', acertos: '3/5', pct: 60, media: 59 },
]
const RANKING = [
  { pos: '1º', nome: 'Aluno A.L.', pct: '91%' },
  { pos: '2º', nome: 'Aluno M.C.', pct: '89%' },
  { pos: '3º', nome: 'Aluno R.S.', pct: '88%' },
]
const HISTO = [20, 34, 52, 70, 86, 64, 40, 28]
const VOCE_BIN = 4
// correção: 100 questões (C=certa, E=errada, B=branco) — exemplo determinístico.
const CORR: ('C' | 'E' | 'B')[] = Array.from({ length: 100 }, (_, n) => (n % 9 === 3 ? 'B' : n % 3 === 1 ? 'E' : 'C'))

export default function Page() {
  return (
    <div style={{ margin: '-28px -28px -48px', minHeight: 'calc(100vh - 66px)', background: 'var(--bg)' }}>
      {/* barra superior de foco */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 10 }}>
        <a href="#" aria-label="Voltar" title="Voltar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, flexShrink: 0, borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }}>
          <Icon n="back" size={17} />
        </a>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ok)' }}>
          <Icon n="check" size={16} />Simulado finalizado
        </span>
        <span style={{ flex: 1 }} />
        <Btn kind="secondary" icon="shuffle" size="sm" href="#">Refazer como treino</Btn>
        <Btn kind="primary" icon="home" size="sm" href="#">Início da plataforma</Btn>
      </header>

      <div style={{ maxWidth: 1080, width: '100%', margin: '0 auto', padding: '26px 24px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* card de resultado */}
        <div style={{ borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: 5, background: GBAR }} />
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accentInk)' }}>Simulado finalizado</span>
              <h1 style={{ margin: '6px 0 2px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--brand)' }}>Simulado Mensal – 10/2026</h1>
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>Joao</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {([['Data', RESUMO.data], ['Início', RESUMO.inicio], ['Término', RESUMO.termino], ['Tempo utilizado', RESUMO.tempo]] as const).map(([l, v]) => (
                <div key={l}>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{l}</span>
                  <b style={{ fontSize: 15, color: 'var(--ink)' }}>{v}</b>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {TILES.map((t) => (
                <div key={t.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '16px 12px', borderRadius: 16, background: t.bg }}>
                  <span style={{ color: t.fg }}><Icon n={t.icon} size={16} /></span>
                  <b style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: t.fg }}>{t.valor}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{t.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {MINI.map((m) => (
                <div key={m.label} style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--surface2)' }}>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{m.label}</span>
                  <b style={{ fontSize: 16, color: m.ok ? 'var(--ok)' : 'var(--ink)' }}>{m.valor}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* próximo passo */}
        <Aviso icon="bulb" action={<Btn kind="gold" icon="cal" size="sm" href="#">Montar cronograma</Btn>}>
          <b>Próximo passo sugerido pela Revisão.</b> Você ficou acima da média em 11 de 15 matérias. Monte um cronograma focado em Direito Financeiro e Urbanístico.
        </Aviso>

        {/* materiais e downloads */}
        <Card>
          <H2>Materiais e downloads</H2>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Como você fez</span>
          <Grid min={240}>
            {DOWNLOADS_FEZ.map((d) => <Download key={d.titulo} {...d} />)}
          </Grid>
          <span style={{ marginTop: 4, fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Com gabarito</span>
          <Grid min={220}>
            {DOWNLOADS_GAB.map((d) => <Download key={d.titulo} {...d} />)}
          </Grid>
        </Card>

        {/* experiência */}
        <Card>
          <Row gap={14}>
            <IconBox icon="star" bg="var(--peachBg)" fg="var(--accentInk)" />
            <Col gap={2}>
              <b style={{ fontSize: 15, color: 'var(--ink)' }}>Como foi sua experiência?</b>
              <Muted size={12.5}>De 0 a 10, o quanto você recomendaria este simulado?</Muted>
            </Col>
            <span style={{ flex: 1 }} />
            <Row gap={6}>
              {Array.from({ length: 11 }).map((_, n) => (
                <span key={n} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'var(--muted)' }}>{n}</span>
              ))}
            </Row>
          </Row>
        </Card>

        {/* desempenho por matéria */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Desempenho por matéria</H2>
            <Muted size={12}>| média geral dos alunos</Muted>
          </Row>
          <Col gap={14}>
            {MATERIAS.map((m) => (
              <div key={m.nome}>
                <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.nome}</b>
                  <Row gap={10}>
                    <Muted size={12}>{m.acertos}</Muted>
                    <b style={{ fontSize: 13, color: m.pct >= 65 ? 'var(--ok)' : 'var(--accentInk)' }}>{m.pct}%</b>
                  </Row>
                </Row>
                <div style={{ position: 'relative' }}>
                  <Bar pct={m.pct} color={m.pct >= 65 ? 'var(--ok)' : 'var(--gold)'} h={10} />
                  <span aria-hidden title="média dos alunos" style={{ position: 'absolute', top: -2, bottom: -2, left: `${m.media}%`, width: 2, background: 'var(--ink)', opacity: 0.55 }} />
                </div>
              </div>
            ))}
          </Col>
          <Muted size={12}>Role para ver todas as matérias</Muted>
        </Card>

        {/* posição entre os alunos */}
        <Card>
          <Col gap={2}>
            <H2>Sua posição entre os alunos</H2>
            <Muted size={12.5}>Distribuição das notas · alunos aparecem só com as iniciais</Muted>
          </Col>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, padding: '0 4px' }}>
            {HISTO.map((h, n) => {
              const voce = n === VOCE_BIN
              return (
                <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: '100%', height: `${h}%`, borderRadius: '8px 8px 0 0', background: voce ? 'var(--brand)' : 'var(--chip)' }} />
                  {voce ? <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)' }}>você</span> : null}
                </div>
              )
            })}
          </div>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted size={11}>menor nota</Muted>
            <Muted size={11}>maior nota</Muted>
          </Row>
          <Col gap={8}>
            {RANKING.map((r) => (
              <Row key={r.pos} style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: 12, background: 'var(--surface2)' }}>
                <Row gap={10}>
                  <b style={{ fontSize: 12.5, color: 'var(--muted)', width: 28 }}>{r.pos}</b>
                  <Avatar s={30} bg="var(--chip)" fg="var(--brand)">{r.nome.replace('Aluno ', '')}</Avatar>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.nome}</b>
                </Row>
                <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.pct}</b>
              </Row>
            ))}
            <Row style={{ justifyContent: 'space-between', padding: '8px 12px', borderRadius: 12, background: 'var(--chip)' }}>
              <Row gap={10}>
                <b style={{ fontSize: 12.5, color: 'var(--brand)', width: 28 }}>214º</b>
                <Avatar s={30}>EU</Avatar>
                <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>Você</b>
              </Row>
              <b style={{ fontSize: 13.5, color: 'var(--brand)' }}>62%</b>
            </Row>
          </Col>
        </Card>

        {/* correção questão a questão */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>Correção questão a questão</H2>
            <Row gap={8}>
              {[['Todas', 100], ['Erradas', 31], ['Certas', 62], ['Em branco', 7]].map(([l, n], k) => (
                <span key={l as string} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 99, background: k === 0 ? 'var(--chip)' : 'var(--surface2)', color: k === 0 ? 'var(--brand)' : 'var(--muted)', fontSize: 12, fontWeight: 800 }}>{l} · {n}</span>
              ))}
            </Row>
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>
            <Col gap={12}>
              <Row gap={10}>
                <Btn kind="secondary" icon="back" size="sm" href="#">Anterior</Btn>
                <Btn kind="secondary" icon="x" size="sm" href="#">Próxima errada</Btn>
                <Btn kind="primary" icon="chev" size="sm" href="#">Próxima</Btn>
              </Row>
              <Muted size={12.5}>Selecione uma questão no navegador para ver o enunciado, sua resposta, o gabarito e o comentário.</Muted>
            </Col>
            <div style={{ background: 'var(--surface2)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b style={{ fontSize: 14, color: 'var(--ink)' }}>Navegador</b>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {CORR.map((c, n) => {
                  const bg = c === 'C' ? 'var(--okBg)' : c === 'E' ? 'var(--dangerBg)' : 'var(--surface)'
                  const fg = c === 'C' ? 'var(--ok)' : c === 'E' ? 'var(--danger)' : 'var(--muted)'
                  return <span key={n} style={{ height: 30, borderRadius: 8, border: '1px solid var(--line)', background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 800 }}>{n + 1}</span>
                })}
              </div>
              <Row gap={14} style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                <Row gap={5}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ok)' }} />Certa</Row>
                <Row gap={5}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--danger)' }} />Errada</Row>
                <Row gap={5}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--line2)' }} />Branco</Row>
              </Row>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Download({ icon, titulo, sub, destaque }: { icon: IconName; titulo: string; sub: string; destaque?: boolean }) {
  return (
    <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, border: `1px solid ${destaque ? 'var(--brand)' : 'var(--line)'}`, background: destaque ? 'var(--chip)' : 'var(--surface)' }}>
      <IconBox icon={icon} />
      <Col gap={1} style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{titulo}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </Col>
      <Icon n="download" size={16} />
    </a>
  )
}

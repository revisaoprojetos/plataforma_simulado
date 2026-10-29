// Central de Dúvidas (novo) — DuvidasRevisao. Tela de menu (sem caminho), com barra de área.
// Lista de dúvidas do aluno (real) + conversa 1:1 com o professor (real). Compor/responder/resolver
// via client (_duvidas.tsx) chamando as server actions. Busca global, chips de categoria, "Mais vistas"
// e "N acharam útil" seguem como EXEMPLO (KB pública = FASE SEGUINTE) — marcados TODO(dados).
import { PageHeader, Card, Soft, Row, Col, H2, Muted, P, Tag, Seg, Chips, Field, Avatar } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatBrt } from '@/lib/brt'
import { listarDuvidasAluno, carregarDuvida, STATUS_DUVIDA_LABEL } from '@/lib/duvidas/duvidas'
import type { Duvida, DuvidaMensagem, OrigemDuvida } from '@/lib/duvidas/tipos'
import { NovaDuvida, ResolverAcoes, ResponderBox } from './_duvidas'

export const dynamic = 'force-dynamic'

// Categorias de EXEMPLO p/ os chips de filtro (KB pública, FASE SEGUINTE) e p/ o seletor da nova dúvida.
const CATEGORIAS = ['Todas', 'Administrativo', 'Constitucional', 'Tributário', 'Processo Civil', 'Financeiro', 'Plataforma e acesso']
// TODO(dados): "Mais vistas nesta semana" = KB pública (FASE SEGUINTE). Exemplo, não inventar números reais.
const MAIS_VISTAS = [
  { titulo: 'Tema 1.199: o que retroage na improbidade?', tema: '# Improbidade administrativa', n: 212 },
  { titulo: 'Precatório e RPV: qual o limite no Estado?', tema: '# Precatórios e RPV', n: 148 },
  { titulo: 'Como acesso o espelho do simulado?', tema: '# Simulados e resultados', n: 97 },
]

// ——— helpers locais ———
function tempoAtras(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return 'agora'
  const min = Math.floor(s / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
  return formatBrt(iso) ?? ''
}
const TIPO_LABEL: Record<string, string> = { pdf: 'PDF', aula: 'Aula', questao: 'Questão', geral: '' }
/** Rótulo curto da origem (ex.: "PDF · Improbidade · pág. 9"); null se geral/sem origem. */
function origemTexto(o?: OrigemDuvida | null): string | null {
  if (!o || o.tipo === 'geral') return null
  const partes = [TIPO_LABEL[o.tipo] || '', o.label || '', o.pagina ? `pág. ${o.pagina}` : '']
  const txt = partes.filter(Boolean).join(' · ')
  return txt || null
}
function inicial(nome?: string | null): string {
  return (nome?.trim()?.[0] ?? '?').toUpperCase()
}

type Props = { searchParams: Promise<{ d?: string; f?: string }> }

export default async function DuvidasPage({ searchParams }: Props) {
  const { d: dParam, f } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()

  // Lista do aluno (RUNTIME: tabela só existe após a migração → degrada p/ "sem dúvidas").
  let minhas: Duvida[] = []
  try {
    minhas = await listarDuvidasAluno(svc, sessao.tenantId, sessao.estudanteId)
  } catch {
    minhas = []
  }

  // Filtro por link (?f=abertas|respondidas). "Respondidas" inclui as já resolvidas.
  const filtroAtivo = f === 'abertas' ? 1 : f === 'respondidas' ? 2 : 0
  const filtradas = filtroAtivo === 1
    ? minhas.filter((m) => m.status === 'aberta')
    : filtroAtivo === 2
      ? minhas.filter((m) => m.status === 'respondida' || m.status === 'resolvida')
      : minhas
  const fQS = f ? `&f=${f}` : ''
  const filterLinks = [R.duvidas, `${R.duvidas}?f=abertas`, `${R.duvidas}?f=respondidas`]

  // Dúvida selecionada: ?d= válida (na lista completa) ou a 1ª da lista filtrada.
  const selId = dParam && minhas.some((m) => m.id === dParam) ? dParam : filtradas[0]?.id
  let conversa: { duvida: Duvida; mensagens: DuvidaMensagem[] } | null = null
  if (selId) {
    try {
      conversa = await carregarDuvida(svc, sessao.tenantId, sessao.estudanteId, selId)
    } catch {
      conversa = null
    }
  }

  const temDuvidas = minhas.length > 0
  const catSelect = CATEGORIAS.filter((c) => c !== 'Todas')

  return (
    <>
      {/* barra de área (Dúvidas / Requerimentos) */}
      <Seg items={['Dúvidas', 'Requerimentos']} active={0} links={[R.duvidas, R.requerimentos]} />

      <PageHeader
        title="Central de Dúvidas e Requerimentos"
        sub="Pergunte direto de uma aula, questão, artigo ou PDF. A dúvida já chega ao professor com o trecho em que ela surgiu."
        right={<NovaDuvida categorias={catSelect} />}
      />

      {/* TODO(dados): busca global na KB pública de dúvidas respondidas (FASE SEGUINTE) — exemplo */}
      <Field icon="search" placeholder="Busque por matéria, tema ou palavra nas dúvidas já respondidas pelos professores" />

      {/* TODO(dados): filtro por categoria da KB pública (FASE SEGUINTE) — exemplo */}
      <Chips items={CATEGORIAS} active={0} />

      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: '430px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        {/* ——— coluna esquerda: minhas dúvidas (real) + mais vistas (exemplo) ——— */}
        <Col gap={16}>
          <Card>
            <H2>Minhas dúvidas</H2>
            <Seg items={['Todas', 'Abertas', 'Respondidas']} active={filtroAtivo} links={filterLinks} />
            {filtradas.length === 0 ? (
              <P><span style={{ color: 'var(--muted)' }}>
                {temDuvidas ? 'Nenhuma dúvida neste filtro.' : 'Você ainda não enviou dúvidas. Toque em “Nova dúvida” para perguntar ao professor.'}
              </span></P>
            ) : (
              <Col gap={0}>
                {filtradas.map((m, i) => {
                  const st = STATUS_DUVIDA_LABEL[m.status]
                  const ativa = m.id === selId
                  const ol = origemTexto(m.origem)
                  const sub = [ol ? `# ${m.origem?.label || TIPO_LABEL[m.origem?.tipo ?? 'geral']}` : (m.categoria ? `# ${m.categoria}` : ''), tempoAtras(m.ultima_msg_em)].filter(Boolean).join(' · ')
                  return (
                    <a key={m.id} href={`${R.duvidas}?d=${m.id}${fQS}`} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 12px', borderRadius: 12, background: ativa ? 'var(--chip)' : 'transparent', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                      <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.35 }}>{m.titulo}</b>
                      <Row gap={6}>
                        <Tag kind={st.kind}>{st.label}</Tag>
                        {m.categoria ? <Tag kind="gray">{m.categoria}</Tag> : null}
                      </Row>
                      {sub ? <Muted size={11.5}>{sub}</Muted> : null}
                    </a>
                  )
                })}
              </Col>
            )}
          </Card>

          {/* TODO(dados): "Mais vistas nesta semana" = KB pública (FASE SEGUINTE) — exemplo */}
          <Card>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Mais vistas nesta semana</span>
            <Col gap={0}>
              {MAIS_VISTAS.map((v, i) => (
                <Row key={i} style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--line)', flexWrap: 'nowrap' }}>
                  <Col gap={3} style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.35 }}>{v.titulo}</b>
                    <Muted size={11.5}>{v.tema}</Muted>
                  </Col>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', flexShrink: 0 }}>{v.n.toLocaleString('pt-BR')}<Icon n="check" size={12} /></span>
                </Row>
              ))}
            </Col>
          </Card>
        </Col>

        {/* ——— coluna direita: conversa real da dúvida selecionada ——— */}
        <Col gap={16}>
          {conversa ? (
            <Conversa duvida={conversa.duvida} mensagens={conversa.mensagens} nomeAluno={sessao.nome} />
          ) : (
            <Card>
              <H2>{temDuvidas ? 'Selecione uma dúvida' : 'Comece uma conversa com o professor'}</H2>
              <P><span style={{ color: 'var(--muted)' }}>
                {temDuvidas
                  ? 'Escolha uma dúvida na lista ao lado para ver a conversa.'
                  : 'Envie a sua primeira dúvida. O professor responde por aqui e você acompanha tudo nesta conversa.'}
              </span></P>
              <div style={{ marginTop: 4 }}><NovaDuvida categorias={catSelect} /></div>
            </Card>
          )}
        </Col>
      </div>
    </>
  )
}

// ——— conversa (render server; ações interativas via client) ———
function Conversa({ duvida, mensagens, nomeAluno }: { duvida: Duvida; mensagens: DuvidaMensagem[]; nomeAluno: string }) {
  const st = STATUS_DUVIDA_LABEL[duvida.status]
  const ol = origemTexto(duvida.origem)
  return (
    <>
      <Row gap={6}>
        <Tag kind={st.kind}>{st.label}</Tag>
        {duvida.categoria ? <Tag kind="blue">{duvida.categoria}</Tag> : null}
        {duvida.origem?.label ? <Tag kind="gold"># {duvida.origem.label}</Tag> : null}
      </Row>
      <H2>{duvida.titulo}</H2>
      {ol ? (
        <Soft pad={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, width: 'fit-content' }}>
          <Icon n="file" size={14} style={{ color: 'var(--muted)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{ol}</span>
        </Soft>
      ) : null}

      {mensagens.map((msg) => {
        const aluno = msg.autor_tipo === 'aluno'
        const nome = aluno ? 'Você' : (msg.autor_nome || 'Professor(a)')
        const letra = aluno ? inicial(nomeAluno) : inicial(msg.autor_nome)
        return (
          <Card key={msg.id} style={aluno ? undefined : { background: 'var(--peachBg)', border: '1px solid var(--line2)' }}>
            <Row gap={10}>
              <Avatar>{letra}</Avatar>
              <Col gap={1}>
                <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{nome}</b>
                <Muted size={11.5}>{formatBrt(msg.criado_em) ?? tempoAtras(msg.criado_em)}</Muted>
              </Col>
            </Row>
            <P size={14}><span style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{msg.texto}</span></P>
          </Card>
        )
      })}

      {/* resolver / reabrir */}
      <ResolverAcoes duvidaId={duvida.id} resolvida={duvida.status === 'resolvida'} />

      {/* responder nesta conversa */}
      <ResponderBox duvidaId={duvida.id} />
    </>
  )
}

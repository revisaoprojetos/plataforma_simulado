// LegProc (nova) — LegProcRevisao. "Lei seca anotada, por assunto, ligada à aula do Extensivo, com
// grifos do Revisão e progresso de leitura." É, na prática, LEITURA de documentos de legislação —
// então REUSA o backend da Biblioteca/Leitor do aluno (sem tabela/migração nova):
//   • lista de leis  = documentos da Biblioteca acessíveis ao aluno (arvoreBibliotecaAluno)
//   • "lido"/progresso = simulado_conteudo_leitura_progresso (histórico de leitura do aluno)
//   • nº de assuntos  = trechos estruturais (titulo/capitulo) da versão atual de cada lei
//   • leitor (dir.)   = carregarLeitura() → trechos da versão + grifos do aluno (anotações)
//   • "Abrir no leitor" → R.painelLeitor(docId) = leitor anotado completo (mesmo carregarLeitura)
// O que NÃO existe como dado (mapeamento lei→assunto→aula do Extensivo; % de leitura por fração;
// grifos CURADOS do Revisão; "já cobrado em prova") fica como EXEMPLO marcado // TODO(dados).
// Navegação 100% por href (?pasta / ?lei) → server component puro. Visual = porte fiel do canvas.
import { PageHeader, Card, Row, Col, H3, Muted, Tag, Btn, Bar, Field, Crumbs, Soft, Aviso } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { arvoreBibliotecaAluno, carregarLeitura } from '@/lib/conteudo/leitor'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const T_TR = 'simulado_conteudo_trechos'
const T_LP = 'simulado_conteudo_leitura_progresso'
// trechos ESTRUTURAIS = "assuntos" da lei (cabeçalhos do documento).
const TIPOS_ASSUNTO = ['titulo', 'capitulo']

function Stepper({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
      <b style={{ fontSize: 13, color: 'var(--ink)' }}>{value}</b>
    </span>
  )
}
function Check({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
      <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
      {children}
    </label>
  )
}
function FootLink({ icon, children, href }: { icon: IconName; children: React.ReactNode; href?: string }) {
  return (
    <a href={href ?? '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
      <Icon n={icon} size={14} />{children}
    </a>
  )
}

// Mantém os params ao navegar (pasta/lei) sem perder o contexto de leitura.
function href(base: string, p: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export default async function LegProcPage({ searchParams }: { searchParams: Promise<{ pasta?: string; lei?: string }> }) {
  const { pasta, lei } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // ── Árvore da Biblioteca do aluno (já FILTRADA por acesso) no nível atual ──
  const arvore = await arvoreBibliotecaAluno(sessao.estudanteId, pasta ?? null).catch(() => null)
  const colecoes = arvore?.pastas ?? []       // subpastas = coleções de legislação
  const leis = arvore?.documentos ?? []        // documentos = leis (textos legais)
  const breadcrumb = arvore?.breadcrumb ?? []

  // ── Dados reais por lei: "lido" (progresso) + nº de assuntos (trechos estruturais) ──
  const lidoSet = new Set<string>()
  const assuntosPorDoc = new Map<string, number>()
  if (leis.length) {
    const svc = createAdminClient()
    const verIds = [...new Set(leis.map((d) => d.versaoAtualId).filter(Boolean))]
    const [progresso, trechosSec] = await Promise.all([
      // histórico de leitura do aluno → quais leis ele já abriu/leu
      fetchAll<{ documento_id: string }>(() => svc.from(T_LP)
        .select('documento_id').eq('tenant_id', sessao.tenantId).eq('aluno_id', sessao.estudanteId)
        .order('documento_id', { ascending: true })).catch(() => []),
      // só os trechos ESTRUTURAIS (poucos) → nº de assuntos por versão, em 1 query chunk 80
      verIds.length
        ? fetchAllByIn<{ versao_id: string }>(verIds, (c) => svc.from(T_TR)
            .select('versao_id').eq('tenant_id', sessao.tenantId).in('versao_id', c).in('tipo', TIPOS_ASSUNTO)
            .order('versao_id', { ascending: true })).catch(() => [])
        : Promise.resolve([]),
    ])
    for (const r of progresso) lidoSet.add(r.documento_id)
    const porVer = new Map<string, number>()
    for (const t of trechosSec) porVer.set(t.versao_id, (porVer.get(t.versao_id) ?? 0) + 1)
    for (const d of leis) assuntosPorDoc.set(d.id, porVer.get(d.versaoAtualId) ?? 0)
  }

  // ── Lei selecionada (?lei) ou a 1ª do nível → leitura real (trechos + grifos do aluno) ──
  const selId = (lei && leis.some((d) => d.id === lei) ? lei : leis[0]?.id) || ''
  const leitura = selId ? await carregarLeitura(selId, sessao.estudanteId).catch(() => null) : null
  // Sumário por assunto = trechos estruturais da versão (REAL). O 1º é o "atual".
  const assuntos = (leitura?.trechos ?? []).filter((t) => TIPOS_ASSUNTO.includes(t.tipo))
  const meusGrifos = leitura?.anotacoes.length ?? 0

  // Biblioteca vazia / sem acesso → estado elegante.
  if (!arvore || (!leis.length && !colecoes.length)) {
    return (
      <>
        <Crumbs items={[['Cursos', R.cursos], ['Central de Estudos', R.central], ['LegProc', R.legproc]]} />
        <PageHeader eyebrow="Legislação anotada" title="LegProc" sub="Lei seca do edital, grifada pelo Revisão e organizada por assunto." />
        <Card>
          <Aviso icon="book" action={<Btn kind="secondary" icon="back" href={R.central}>Voltar à Central</Btn>}>
            Nenhuma legislação disponível para você ainda. Assim que o Revisão publicar os textos legais, eles aparecem aqui.
          </Aviso>
        </Card>
      </>
    )
  }

  return (
    <>
      <Crumbs items={[['Cursos', R.cursos], ['Central de Estudos', R.central], ['LegProc', R.legproc]]} />
      <PageHeader
        eyebrow="Legislação anotada"
        title="LegProc"
        sub="Lei seca do edital, grifada pelo Revisão e organizada por assunto. Cada assunto mostra a aula do Extensivo em que ele é estudado."
      />

      {/* Navegação por coleções (pastas da Biblioteca) — só quando existem/estamos dentro de uma */}
      {(colecoes.length > 0 || breadcrumb.length > 0) && (
        <Row gap={8} style={{ alignItems: 'center' }}>
          {breadcrumb.length > 0 && (
            <a href={href(R.legproc, { pasta: breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2].id : undefined })}
              aria-label="Voltar uma coleção"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
              <Icon n="back" size={14} />{breadcrumb[breadcrumb.length - 1]?.nome ?? 'Coleções'}
            </a>
          )}
          {colecoes.map((c) => (
            <a key={c.id} href={href(R.legproc, { pasta: c.id })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', borderRadius: 99, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
              <Icon n="layers" size={14} style={{ color: 'var(--brand)' }} />
              {c.nome}<Muted size={12}>· {c.totalDocs}</Muted>
            </a>
          ))}
        </Row>
      )}

      {/* Escolha da lei (documentos do nível atual) */}
      {leis.length > 0 ? (
        <Row gap={12} style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          {leis.map((l) => {
            const on = l.id === selId
            const lido = lidoSet.has(l.id)
            const nAssuntos = assuntosPorDoc.get(l.id) ?? 0
            return (
              <a key={l.id} href={href(R.legproc, { pasta, lei: l.id })}
                style={{ minWidth: 172, flex: '1 0 auto', padding: '14px 16px', borderRadius: 16, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none' }}>
                <b style={{ fontSize: 14, color: 'var(--ink)' }}>{l.titulo}</b>
                {/* % de leitura por fração não existe no modelo — mostramos o estado REAL (lido/não lido). */}
                {/* TODO(dados): % de leitura por lei exigiria progresso por trecho/assunto. */}
                <Muted size={12}>{nAssuntos > 0 ? `${nAssuntos} assunto${nAssuntos > 1 ? 's' : ''} · ` : ''}{lido ? 'Lido' : 'Não lido'}</Muted>
                <span style={{ height: 4, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: lido ? '100%' : '0%', background: 'var(--gold)', borderRadius: 99 }} />
                </span>
              </a>
            )
          })}
        </Row>
      ) : (
        <Card><Muted size={13}>Esta coleção não tem textos legais diretos — abra uma subcoleção acima.</Muted></Card>
      )}

      {/* Sumário (esq) + Leitor (dir) */}
      {leitura ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
          {/* Sumário por assunto — REAL (trechos estruturais da versão) */}
          <Card pad={16}>
            <Row style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>Sumário por assunto</span>
              <Muted size={12}>{assuntos.length.toLocaleString('pt-BR')}</Muted>
            </Row>
            {assuntos.length ? (
              <Col gap={6}>
                {assuntos.map((s, i) => {
                  const atual = i === 0
                  return (
                    <a key={s.uid} href={`#${s.uid}`} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 14px', borderRadius: 13, background: atual ? 'var(--chip)' : 'transparent', border: `1px solid ${atual ? 'var(--brandLine)' : 'transparent'}` }}>
                      <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{s.texto.slice(0, 80) || s.rotulo || 'Assunto'}</b>
                      {/* TODO(dados): aula do Extensivo por assunto não existe como vínculo (lei→aula). */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>No Extensivo · a definir</span>
                      {s.rotulo ? <Muted size={11.5}>{s.rotulo}</Muted> : null}
                    </a>
                  )
                })}
              </Col>
            ) : (
              <Muted size={12.5}>Este texto ainda não tem divisão por assunto.</Muted>
            )}
          </Card>

          {/* Leitor */}
          <Col gap={16}>
            {/* Controles de leitura — visuais (porte do canvas); interação no leitor completo. */}
            {/* TODO(dados): modos de leitura (Rolar/Capítulo/Virar), fonte/zoom e "lacunas" vivem no leitor interativo. */}
            <Card pad={16}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={10}>
                  <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)' }}>
                    {['Rolar', 'Capítulo', 'Virar'].map((t, k) => (
                      <span key={t} style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 14px', borderRadius: 10, fontSize: 13, fontWeight: k === 0 ? 800 : 700, background: k === 0 ? 'var(--surface)' : 'transparent', color: k === 0 ? 'var(--ink)' : 'var(--muted)', boxShadow: k === 0 ? '0 2px 8px rgba(30,15,80,.1)' : undefined }}>{t}</span>
                    ))}
                  </div>
                  <Stepper label="Fonte" value="18" />
                  <Stepper label="Blocos" value="100%" />
                  <Stepper label="Texto" value="100%" />
                </Row>
                <Check>Só os mais cobrados</Check>
              </Row>
              <Check>Treinar lacunas</Check>
            </Card>

            {/* Cabeçalho do recorte + legenda */}
            <Card pad={18}>
              <Row style={{ justifyContent: 'space-between' }}>
                <H3>{leitura.titulo}</H3>
                <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                  <Field icon="search" placeholder="Buscar no texto" h={40} style={{ width: 220 }} />
                  <Row gap={8} style={{ flexWrap: 'nowrap' }}>
                    {/* progresso por fração não existe → barra reflete o estado REAL (lido/não lido). */}
                    <Bar pct={lidoSet.has(selId) ? 100 : 0} color="var(--brand)" style={{ width: 110 }} />
                    <b style={{ fontSize: 13, color: 'var(--ink)' }}>{lidoSet.has(selId) ? 'Lido' : 'Novo'}</b>
                  </Row>
                  <Btn kind="primary" icon="book" size="sm" href={R.painelLeitor(selId)}>Abrir no leitor</Btn>
                </Row>
              </Row>
              <Row gap={10}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'var(--muted)' }}>LEGENDA</span>
                <Tag kind="gold">Núcleo</Tag>
                <Tag kind="green">Complemento</Tag>
                <Tag kind="brand">Prazos</Tag>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>crucial</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--danger)' }}>exceção</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--info)' }}>STF</span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--info)' }}>STJ</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                  {/* "Grifos do Revisão" (curadoria) ainda não é fonte separada; "Meus grifos" é REAL. */}
                  {/* TODO(dados): grifos curados do Revisão (fonte distinta das anotações do aluno). */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12.5, fontWeight: 800 }}><Icon n="highlight" size={13} />Grifos do Revisão</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 99, border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 12.5, fontWeight: 700 }}><Icon n="highlight" size={13} />Meus grifos · {meusGrifos.toLocaleString('pt-BR')}</span>
                </span>
              </Row>
            </Card>

            {/* Texto da lei — trechos REAIS da versão atual (ancorados por uid p/ o sumário). */}
            <Card pad={18}>
              {assuntos[0] ? (
                <Row style={{ justifyContent: 'space-between' }}>
                  <Col gap={4}>
                    {assuntos[0].rotulo ? <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', color: 'var(--muted)' }}>{assuntos[0].rotulo}</span> : null}
                    <H3>{assuntos[0].texto.slice(0, 90) || 'Texto da lei'}</H3>
                  </Col>
                </Row>
              ) : null}

              {/* TODO(dados): vínculo documento→aula do Extensivo (PDFULL/PDFLASH/Videoaula) não existe no modelo. */}
              <Soft style={{ background: 'var(--peachBg)', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon n="qbook" size={18} style={{ color: 'var(--accentInk)' }} />
                <Col gap={2} style={{ flex: 1 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', color: 'var(--accentInk)' }}>NO EXTENSIVO</span>
                  <b style={{ fontSize: 13, color: 'var(--ink)' }}>Vínculo com a aula do Extensivo — a definir</b>
                </Col>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accentInk)' }}>PDFULL · PDFLASH · Videoaula</span>
              </Soft>

              {/* Corpo real: percorre os trechos da versão (cabeçalhos em destaque, parágrafos no corpo). */}
              <div style={{ maxHeight: 560, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6 }}>
                {leitura.trechos.map((t) => {
                  if (TIPOS_ASSUNTO.includes(t.tipo)) {
                    return <h4 key={t.uid} id={t.uid} style={{ margin: '8px 0 0', fontSize: 15, fontWeight: 800, color: 'var(--ink)', scrollMarginTop: 16 }}>{t.rotulo ? `${t.rotulo} ` : ''}{t.texto}</h4>
                  }
                  return (
                    <p key={t.uid} id={t.uid} style={{ margin: 0, fontFamily: 'var(--font-read)', fontSize: 17, lineHeight: 1.7, color: 'var(--ink)', scrollMarginTop: 16 }}>
                      {t.rotulo ? <b>{t.rotulo} </b> : null}{t.texto}
                    </p>
                  )
                })}
              </div>

              {/* TODO(dados): "Já cobrado em prova" exigiria mapear dispositivo→provas/questões. */}
              <details>
                <summary style={{ listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
                  Já cobrado em prova
                  <Icon n="chevd" size={16} style={{ color: 'var(--muted2)' }} />
                </summary>
                <div style={{ padding: '12px 14px' }}><Muted size={12.5}>Mapeamento de provas por dispositivo ainda não disponível.</Muted></div>
              </details>

              <Row gap={8}>
                {lidoSet.has(selId) ? <Tag kind="green" icon="check">Lido</Tag> : <Tag kind="gray">Não lido</Tag>}
                {/* TODO(dados): contagem de questões por dispositivo e "Caderno/Dúvida" por trecho. */}
                <FootLink icon="qbook" href={R.banco}>Questões</FootLink>
                <FootLink icon="bookmark" href={R.cadernos}>Caderno</FootLink>
                <FootLink icon="chat" href={R.duvidas}>Dúvida</FootLink>
              </Row>
            </Card>
          </Col>
        </div>
      ) : (
        <Card>
          <Aviso icon="book">Selecione uma lei acima para abrir o texto anotado.</Aviso>
        </Card>
      )}
    </>
  )
}

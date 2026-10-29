// Leitor de PDF (novo) — LeitorRevisao. Subtela do painel de estudos: lê a aula com sumário por
// assunto/página, marcações em 5 cores, tamanho de letra, videoaula opcional e caderno de anotações.
// DADO REAL ligado: título do material, conteúdo (HTML fiel da versão atual), contagem de grifos do
// aluno e link de download. O que ainda não tem loader (sumário por página/lida, progresso, novidades
// da versão, tempo de leitura, contagem de páginas do PDF, disciplina/curso, data de atualização,
// videoaula) permanece EXEMPLO marcado com // TODO(dados). Layout fiel ao canvas. Cores via tokens.
import { Card, Col, Row, H2, Muted, Tag, Btn, Bar, Seg, Field, Crumbs, Eyebrow, Aviso } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarLeitura, urlDownloadAluno } from '@/lib/conteudo/leitor'
import { minhaAvaliacao } from '@/lib/demandas/demandas'
import { createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ConcluirLeituraButton, ReportarButton } from './_leitor-modais'

export const dynamic = 'force-dynamic'

// ——— exemplo (sem loader hoje) ———
// TODO(dados): sumário real por assunto/página + estado "lida" e progresso de leitura do aluno.
// Os trechos reais (carregarLeitura().trechos) trazem ordem/tipo/rótulo/texto, mas NÃO página nem
// estado de leitura, então o sumário por página do canvas segue como exemplo.
const SUMARIO: { pg: string; t: string; lida?: boolean; ativo?: boolean; sub?: boolean }[] = [
  { pg: '01', t: '1. Evolução histórica', lida: true },
  { pg: '03', t: '2. Fundamento constitucional', lida: true },
  { pg: '06', t: '3. Teoria do risco administrativo', lida: true, ativo: true },
  { pg: '08', t: '3.1 Excludentes de responsabilidade', sub: true },
  { pg: '10', t: '3.2 Omissão estatal', sub: true },
  { pg: '13', t: '4. Dupla garantia' },
  { pg: '17', t: '5. Ação regressiva' },
  { pg: '21', t: '6. Questões comentadas' },
]

// Marcações em 5 cores (+ borracha) — bg/fg via tokens de estado.
const MARCAS: { t: string; bg: string; fg: string }[] = [
  { t: 'Importante', bg: 'var(--peachBg)', fg: 'var(--accentInk)' },
  { t: 'Revisar', bg: 'var(--okBg)', fg: 'var(--ok)' },
  { t: 'Conceito', bg: 'var(--infoBg)', fg: 'var(--info)' },
  { t: 'Dúvida', bg: 'var(--pinkBg)', fg: 'var(--pink)' },
  { t: 'Exceção', bg: 'var(--dangerBg)', fg: 'var(--danger)' },
]
const LETRAS = ['A−', 'P', 'M', 'G', 'GG', 'A+']
const LETRA_ATIVA = 2 // M

export default async function LeitorPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  // Metadados + conteúdo real da versão atual + grifos do aluno; link de download (gate de acesso).
  const [leitura, downloadUrl] = await Promise.all([
    carregarLeitura(materialId, sessao.estudanteId),
    urlDownloadAluno(materialId, sessao.estudanteId),
  ])

  // Sem acesso / não publicado / inexistente → estado vazio elegante (não quebra).
  if (!leitura) {
    return (
      <>
        <Crumbs items={[['Meu painel', R.painel], ['Leitor de material', R.painel]]} />
        <Card>
          <Aviso icon="info" action={<Btn kind="secondary" icon="back" href={R.painel}>Voltar ao painel</Btn>}>
            Este material não foi encontrado ou você não tem acesso a ele.
          </Aviso>
        </Card>
      </>
    )
  }

  const totalGrifos = leitura.anotacoes.length

  // Avaliação que o aluno já deu a este material (pré-preenche as estrelas). Degrade elegante:
  // antes da migração a tabela não existe → engole o erro e segue sem nota.
  let avaliacaoAtual: Awaited<ReturnType<typeof minhaAvaliacao>> = null
  try {
    avaliacaoAtual = await minhaAvaliacao(createAdminClient(), sessao.tenantId, sessao.estudanteId, materialId)
  } catch {
    avaliacaoAtual = null
  }

  return (
    <>
      <Crumbs items={[['Meu painel', R.painel], [`Leitor · ${leitura.titulo}`, R.painelLeitor(materialId)]]} />

      {/* Cabeçalho do material + barra de ações */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Col gap={8} style={{ minWidth: 0 }}>
            <H2>{leitura.titulo}</H2>
            <Row gap={10}>
              {/* TODO(dados): data de atualização e disciplina/curso do material (sem loader hoje) */}
              <Tag kind="green" icon="cal">Atualizado em 10/10/2026</Tag>
              <Muted size={12.5}>Direito Administrativo · Extensivo Advocacia Pública</Muted>
            </Row>
          </Col>
          {/* Concluir leitura → abre a avaliação 0 a 5 (pré-preenchida com a nota atual do aluno) */}
          <ConcluirLeituraButton documentoId={materialId} notaAtual={avaliacaoAtual?.nota ?? null} comentarioAtual={avaliacaoAtual?.comentario ?? null} />
        </Row>
        <div style={{ height: 1, background: 'var(--line)' }} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Field placeholder="Buscar no material" icon="search" style={{ width: 320, maxWidth: '100%' }} />
          <Row gap={10}>
            <Btn kind="secondary" size="sm" icon="file">Caderno de Anotações</Btn>
            <Btn kind="secondary" size="sm" icon="highlight" href={R.painelGrifos}>Meus grifos<span style={{ marginLeft: 2, fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{totalGrifos.toLocaleString('pt-BR')}</span></Btn>
            <Btn kind="secondary" size="sm" icon="cards" href={R.painelFlashcards}>Flashcards</Btn>
            {/* TODO(dados): videoaula vinculada ao material (sem loader hoje) */}
            <Btn kind="secondary" size="sm" icon="play">Videoaula <span style={{ color: 'var(--muted)' }}>(opcional)</span></Btn>
          </Row>
        </Row>
      </Card>

      {/* Sumário (esquerda) + leitor (direita) */}
      <div className="np-split" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        {/* Sumário — TODO(dados): estrutura por página/estado de leitura (sem loader hoje) */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Eyebrow>Sumário</Eyebrow>
            <Muted size={12}>6 de 26 lidas</Muted>
          </Row>
          <Row gap={10} style={{ flexWrap: 'nowrap' }}>
            <Bar pct={23} style={{ flex: 1 }} />
            <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>23%</b>
          </Row>
          <Seg items={['Por assunto', 'Por página']} active={0} />
          <Col gap={2}>
            {SUMARIO.map((s) => (
              <a
                key={s.pg}
                href="#"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: s.sub ? '8px 12px 8px 26px' : '10px 12px', borderRadius: 11,
                  background: s.ativo ? 'var(--chip)' : 'transparent',
                  border: `1px solid ${s.ativo ? 'var(--brandLine)' : 'transparent'}`,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted2)', width: 18, flexShrink: 0 }}>{s.pg}</span>
                <span style={{ flex: 1, fontSize: s.sub ? 13 : 13.5, fontWeight: s.ativo ? 800 : 700, color: s.ativo ? 'var(--brand)' : 'var(--ink)' }}>{s.t}</span>
                {s.lida ? <Icon n="check" size={15} style={{ color: 'var(--ok)' }} /> : null}
              </a>
            ))}
          </Col>
          {/* TODO(dados): novidades da versão atual (changelog por versão — sem loader hoje) */}
          <div style={{ padding: 14, borderRadius: 14, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Row gap={8}><Icon n="spark" size={14} style={{ color: 'var(--accentInk)' }} /><b style={{ fontSize: 13, color: 'var(--ink)' }}>Novidades da versão</b></Row>
            <Muted size={12}>10/10/2026 · incluído o Tema 1.199 do STF no item 4.</Muted>
          </div>
          {/* TODO(dados): tempo de leitura real do aluno neste material (sem loader hoje) */}
          <Row style={{ justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'var(--surface2)' }}>
            <Muted size={12}>Tempo de leitura na meta</Muted>
            <b style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>00:42:18</b>
          </Row>
        </Card>

        {/* Leitor */}
        <Col gap={16}>
          {/* Barra de ferramentas do PDF */}
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              {/* TODO(dados): contagem real de páginas das variantes PDFULL/PDFLASH (sem loader hoje) */}
              <Seg items={['PDFULL · 26 págs.', 'PDFLASH · 5 págs.']} active={0} />
              <Row gap={10}>
                <Muted size={13}>pág. <b style={{ color: 'var(--ink)' }}>7</b> / 26</Muted>
                <Btn kind="secondary" size="sm" icon="zoom">Tela grande</Btn>
                {/* Baixar → URL assinada do arquivo original (null quando sem permissão de baixar) */}
                <Btn kind="secondary" size="sm" icon="download" href={downloadUrl ?? '#'}>Baixar</Btn>
              </Row>
            </Row>
            <Row>
              {/* Reportar problema → abre o modal de reporte (envia à Central de Demandas) */}
              <ReportarButton documentoId={materialId} />
            </Row>
            <div style={{ height: 1, background: 'var(--line)' }} />
            {/* Marcar em 5 cores + borracha */}
            <Row gap={10}>
              <Eyebrow>Marcar</Eyebrow>
              {MARCAS.map((m) => (
                <button key={m.t} type="button" style={{ height: 32, padding: '0 14px', borderRadius: 99, border: 0, background: m.bg, color: m.fg, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{m.t}</button>
              ))}
              <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 99, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}><Icon n="x" size={13} />Borracha</button>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted size={12.5}>Selecione um trecho para marcar ou incluir no caderno.</Muted>
              <Row gap={8}>
                <Eyebrow>Letra</Eyebrow>
                {LETRAS.map((l, i) => {
                  const on = i === LETRA_ATIVA
                  return <button key={l} type="button" style={{ minWidth: 34, height: 34, padding: '0 10px', borderRadius: 10, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#FFFFFF' : 'var(--ink)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{l}</button>
                })}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: 'var(--brand)', width: 15, height: 15 }} />
                  Mostrar marcações
                </label>
              </Row>
            </Row>
          </Card>

          {/* Conteúdo REAL da versão atual (HTML fiel com data-uid por bloco). A interação de grifos/
              seleção é feita pelo leitor existente (leitor-jus) — aqui o conteúdo é renderizado fiel. */}
          <Card pad={28} style={{ fontFamily: 'var(--font-read)' }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Eyebrow>{leitura.titulo}</Eyebrow>
              {/* TODO(dados): disciplina do material (sem loader hoje) */}
              <Eyebrow>Direito Administrativo</Eyebrow>
            </Row>
            <div
              className="np-leitura"
              style={{ fontFamily: 'var(--font-read)', fontSize: 17, lineHeight: 1.75, color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 14 }}
              dangerouslySetInnerHTML={{ __html: leitura.html }}
            />
          </Card>
        </Col>
      </div>
    </>
  )
}

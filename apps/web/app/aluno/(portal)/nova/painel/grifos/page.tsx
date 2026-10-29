// Meus grifos (novo) — GrifosRevisao. Subtela do painel: revisão pelos TRECHOS que o aluno marcou
// no leitor. DADO REAL ligado: grifos do aluno (simulado_conteudo_anotacoes) + título do documento.
// Cor/categoria do grifo são derivadas do que o leitor realmente salva (conteudo.cor). Filtro por cor
// é server-side via ?cor=. Layout fiel ao canvas; cores sempre via tokens.
import { Hero, Col, Row, Card, Tag, Btn, Eyebrow, Muted, Crumbs, Aviso } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const T_AN = 'simulado_conteudo_anotacoes'
const T_DOC = 'simulado_conteudo_documentos'

type TagKind = 'gold' | 'green' | 'blue' | 'pink' | 'red' | 'gray'

// Cor/categoria do grifo — derivada do que o LEITOR realmente salva em `conteudo` (jsonb).
// O leitor (public/leitura/leitor-jus.html) grava `conteudo.cor` com o HEX da cor ativa
// (COR_HEX: y/g/b/v/r/k). Aqui mapeamos cada cor para o tag/label da tela. A paleta do leitor tem 6
// cores; o mock tem 5 (Importante/Conceito/Revisar/Exceção/Dúvida). Mapeamento por proximidade:
//   amarelo→Importante · verde→Revisar · azul→Conceito · roxo→Dúvida · vermelho→Exceção · (grafite→Riscado, fallback)
const COR_TAG: Record<string, { tag: TagKind; label: string }> = {
  // chaves de cor do leitor (caso conteudo.cor venha como chave)
  y: { tag: 'gold', label: 'Importante' },
  g: { tag: 'green', label: 'Revisar' },
  b: { tag: 'blue', label: 'Conceito' },
  v: { tag: 'pink', label: 'Dúvida' },
  r: { tag: 'red', label: 'Exceção' },
  k: { tag: 'gray', label: 'Riscado' },
  // HEX equivalentes (forma realmente persistida por grifoPayload → corToHex())
  '#fde047': { tag: 'gold', label: 'Importante' },
  '#86efac': { tag: 'green', label: 'Revisar' },
  '#93c5fd': { tag: 'blue', label: 'Conceito' },
  '#c4b5fd': { tag: 'pink', label: 'Dúvida' },
  '#fca5a5': { tag: 'red', label: 'Exceção' },
  '#374151': { tag: 'gray', label: 'Riscado' },
}

type Anot = { id: string; documento_id: string; tipo: string; texto_ancora: string; conteudo: any }

function derivarTag(a: Anot): { tag: TagKind; label: string } {
  const cor = typeof a?.conteudo?.cor === 'string' ? a.conteudo.cor.toLowerCase() : ''
  if (cor && COR_TAG[cor]) return COR_TAG[cor]
  // Sem cor salva → cai no tipo da anotação (riscado = grafite; demais = Importante).
  if (a.tipo === 'riscado') return COR_TAG.k
  return COR_TAG['#fde047']
}

// Filtros por cor (dot). Primeiro = "Todas". `label` casa com derivarTag().label; `dot` via tokens.
const FILTROS: { t: string; dot?: string }[] = [
  { t: 'Todas' },
  { t: 'Importante', dot: 'var(--gold)' },
  { t: 'Revisar', dot: 'var(--ok)' },
  { t: 'Conceito', dot: 'var(--info)' },
  { t: 'Dúvida', dot: 'var(--pink)' },
  { t: 'Exceção', dot: 'var(--danger)' },
]

function HeaderToggle({ active, docId }: { active: 'pdflash' | 'flashcards' | 'grifos'; docId: string }) {
  const items: { k: typeof active; t: string; href: string }[] = [
    { k: 'pdflash', t: 'PDFlash', href: R.painelLeitor(docId) },
    { k: 'flashcards', t: 'Flashcards', href: R.painelFlashcards },
    { k: 'grifos', t: 'Meus grifos', href: `${R.painelGrifos}?m=${docId}` },
  ]
  return (
    <div style={{ display: 'inline-flex', gap: 6, padding: 6, borderRadius: 14, background: 'rgba(255,255,255,.08)', width: 'fit-content' }}>
      {items.map((it) => {
        const on = it.k === active
        return <a key={it.k} href={it.href} style={{ height: 38, padding: '0 18px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', fontSize: 13.5, fontWeight: 800, background: on ? 'var(--gold)' : 'transparent', color: on ? 'var(--goldInk)' : '#FFFFFF' }}>{it.t}</a>
      })}
    </div>
  )
}

export default async function GrifosPage({ searchParams }: { searchParams: Promise<{ m?: string; cor?: string }> }) {
  const { m, cor } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()

  // documentId: ?m=<id> OU o documento mais recentemente anotado pelo aluno (query enxuta).
  let docId = (m || '').trim()
  if (!docId) {
    const { data: recente } = await svc
      .from(T_AN)
      .select('documento_id')
      .eq('tenant_id', sessao.tenantId)
      .eq('aluno_id', sessao.estudanteId)
      .order('atualizada_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    docId = recente?.documento_id ?? ''
  }

  // Aluno sem NENHUM grifo em nenhum documento → estado vazio elegante.
  if (!docId) {
    return (
      <>
        <Crumbs items={[['Meu painel', R.painel], ['Meus grifos', R.painelGrifos]]} />
        <Card>
          <Aviso icon="highlight" action={<Btn kind="secondary" icon="back" href={R.painel}>Voltar ao painel</Btn>}>
            Você ainda não marcou nenhum trecho. Abra um material no leitor e selecione o texto para criar seus grifos.
          </Aviso>
        </Card>
      </>
    )
  }

  // Grifos do documento (scope SEMPRE por tenant+aluno da SESSÃO — não depende do host) + título real.
  const [grifos, docRow] = await Promise.all([
    fetchAll<Anot>(() => svc
      .from(T_AN)
      .select('id, documento_id, tipo, texto_ancora, conteudo')
      .eq('tenant_id', sessao.tenantId)
      .eq('documento_id', docId)
      .eq('aluno_id', sessao.estudanteId)
      .order('id', { ascending: true })),
    svc.from(T_DOC).select('titulo').eq('tenant_id', sessao.tenantId).eq('id', docId).maybeSingle().then((r) => r.data),
  ])

  const titulo = docRow?.titulo || 'Meus grifos'
  // Deriva tag/label de cada grifo e aplica o filtro por cor (?cor=<label>) no servidor.
  const items = grifos.map((g) => ({ ...g, ...derivarTag(g) }))
  const filtroAtivo = cor && FILTROS.some((f) => f.t === cor && f.dot) ? cor : ''
  const visiveis = filtroAtivo ? items.filter((it) => it.label === filtroAtivo) : items
  const grifosHref = `${R.painelGrifos}?m=${docId}`

  return (
    <>
      <Crumbs items={[['Meu painel', R.painel], [`Leitor · ${titulo}`, R.painelLeitor(docId)], ['Meus grifos', grifosHref]]} />

      <Hero>
        <Col gap={12}>
          <Eyebrow color="var(--gold)">Revisão por meus grifos · Cronograma adaptativo</Eyebrow>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#FFFFFF' }}>{titulo}</h1>
          {/* TODO(dados): disciplina/aula do material (sem loader hoje) — mantido só o que é real. */}
          <span style={{ fontSize: 14, color: '#E6DEFF' }}>{items.length.toLocaleString('pt-BR')} {items.length === 1 ? 'trecho marcado' : 'trechos marcados'}</span>
          <HeaderToggle active="grifos" docId={docId} />
        </Col>
      </Hero>

      {/* filtros por cor — links server-side (?cor=); preserva ?m= */}
      <Row gap={8}>
        {FILTROS.map((f) => {
          const on = f.dot ? filtroAtivo === f.t : filtroAtivo === ''
          const href = f.dot ? `${grifosHref}&cor=${encodeURIComponent(f.t)}` : grifosHref
          return (
            <a key={f.t} href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', borderRadius: 99, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--brand)' : 'var(--surface)', color: on ? '#FFFFFF' : 'var(--ink)', fontSize: 13, fontWeight: on ? 800 : 700 }}>
              {f.dot ? <span style={{ width: 8, height: 8, borderRadius: 99, background: f.dot }} /> : null}
              {f.t}
            </a>
          )
        })}
      </Row>

      {/* modo lacunas + levar ao caderno — controles visuais (interação client fica p/ fase seguinte) */}
      {/* TODO(dados): "Modo lacunas" (esconder texto) e "Levar ao Caderno" exigem client/ação dedicada. */}
      <Row style={{ justifyContent: 'space-between' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>
          <input type="checkbox" style={{ accentColor: 'var(--brand)', width: 16, height: 16 }} />
          Modo lacunas: esconder o texto até eu tocar
        </label>
        <Btn kind="secondary" size="sm" icon="bookmark">Levar grifos ao Caderno de Anotações</Btn>
      </Row>

      {/* lista de grifos reais */}
      {visiveis.length === 0 ? (
        <Card>
          <Aviso icon="highlight">Nenhum grifo {filtroAtivo ? `na cor "${filtroAtivo}"` : ''} neste material.</Aviso>
        </Card>
      ) : (
        <Col gap={14}>
          {visiveis.map((g) => {
            const nota = typeof g?.conteudo?.nota === 'string' && g.conteudo.nota.trim() ? g.conteudo.nota.trim() : ''
            return (
              <Card key={g.id} pad={18}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 16 }}>
                  <Row gap={14} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <Tag kind={g.tag}>{g.label}</Tag>
                    <Col gap={6} style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)', fontFamily: 'var(--font-read)' }}>{g.texto_ancora}</span>
                      {nota ? <Muted size={12.5}>{nota}</Muted> : null}
                    </Col>
                  </Row>
                  {/* Sem número de página real (anotações são por offset): link abre o material no leitor. */}
                  <a href={R.painelLeitor(docId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Abrir<Icon n="chev" size={13} />
                  </a>
                </Row>
              </Card>
            )
          })}
        </Col>
      )}

      <Muted size={12}>Toque em um grifo para abrir o material no leitor.</Muted>
    </>
  )
}

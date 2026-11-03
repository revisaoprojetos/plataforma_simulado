// Meus Cadernos (novo) — CadernosRevisao. Tela de menu (sem caminho).
// DADOS REAIS do aluno, em 4 abas DENTRO desta tela (?aba=):
//   • Cadernos  — os que ELE criou (simulado_aluno_cadernos + nº de questões)
//   • Anotações — notas escritas nos grifos do leitor da Biblioteca
//   • Grifos    — todos os trechos marcados, agrupados por material (abre o leitor na página do grifo)
//   • Salvos    — questões favoritas, resolvíveis aqui mesmo
// Grifos/Anotações vêm do leitor ATUAL (simulado_conteudo_grifos_pdf) + o leitor de texto antigo — ver
// lib/aluno/caderno-marcacoes.ts. Antes as abas levavam para telas que liam só a tabela antiga (vazias).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, Row, Col, H3, Muted, Tag, Tabs, Btn, Aviso, Bar, GR } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { R } from '@/lib/nova/rotas'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { carregarFavoritosAluno } from '@/lib/aluno/favoritos'
import { carregarMarcacoesAluno, linkLeitor, type MaterialMarcado, type Marcacao } from '@/lib/aluno/caderno-marcacoes'
import { cadernoDeErros, progressoCadernos } from '@/lib/aluno/cadernos-aluno'
import { CriarCadernoCard } from './criar-caderno'

export const dynamic = 'force-dynamic'

const ABAS = ['cadernos', 'anotacoes', 'grifos', 'salvos'] as const
type Aba = (typeof ABAS)[number]
const ROTULOS = ['Cadernos', 'Anotações', 'Grifos', 'Salvos']
const hrefAba = (a: Aba) => (a === 'cadernos' ? R.cadernos : `${R.cadernos}?aba=${a}`)

// Grifos por material antes do "ver todos" (um aluno pode ter centenas num PDF só).
const LIMITE_POR_MATERIAL = 30

type CadernoAluno = { id: string; nome: string; criado_em: string | null; total: number; resolvidas: number }

const fmtData = (iso: string | null) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) } catch { return '' }
}
const cortar = (s: string, n = 420) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s)

export default async function CadernosPage({ searchParams }: { searchParams: Promise<{ aba?: string; doc?: string }> }) {
  const sp = await searchParams
  const aba: Aba = (ABAS as readonly string[]).includes(sp?.aba ?? '') ? (sp.aba as Aba) : 'cadernos'
  const docAberto = typeof sp?.doc === 'string' ? sp.doc : ''

  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()
  const { tenantId, estudanteId } = sessao

  // Marcações sempre (as contagens de Grifos/Anotações saem delas); Salvos completo só na aba Salvos.
  const [{ data: cads }, materiais, salvos] = await Promise.all([
    svc.from('simulado_aluno_cadernos').select('id, nome, criado_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).order('criado_em', { ascending: false }),
    carregarMarcacoesAluno(svc, tenantId, estudanteId),
    aba === 'salvos'
      ? carregarFavoritosAluno(svc, tenantId, estudanteId)
      : svc.from('simulado_favoritos').select('questao_id', { count: 'exact', head: true }).eq('estudante_id', estudanteId)
        .then((r) => (r.error ? null : r.count ?? 0), () => null),
  ])

  const ids = ((cads ?? []) as any[]).map((c) => c.id as string)
  // Aba Cadernos: itens de cada caderno → nº de questões + % resolvido (respostas do aluno no banco),
  // e o caderno AUTOMÁTICO de erros (última resposta errada). Só nesta aba (as outras não usam).
  const itensCad: { caderno_id: string; questao_id: string }[] = []
  let erros: { ids: string[]; atualizadoEm: string | null } = { ids: [], atualizadoEm: null }
  if (aba === 'cadernos') {
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await svc.from('simulado_aluno_caderno_questoes').select('caderno_id, questao_id').in('caderno_id', ids.slice(i, i + 100))
      for (const q of (data ?? []) as any[]) itensCad.push({ caderno_id: q.caderno_id, questao_id: q.questao_id })
    }
  }
  const [prog, errosRes] = aba === 'cadernos'
    ? await Promise.all([progressoCadernos(svc, tenantId, estudanteId, itensCad), cadernoDeErros(svc, tenantId, estudanteId).catch(() => erros)])
    : [{} as Record<string, { total: number; resolvidas: number }>, erros]
  erros = errosRes
  const cadernos: CadernoAluno[] = ((cads ?? []) as any[]).map((c) => ({ id: c.id, nome: c.nome, criado_em: c.criado_em ?? null, total: prog[c.id]?.total ?? 0, resolvidas: prog[c.id]?.resolvidas ?? 0 }))

  const totalGrifos = materiais.reduce((n, m) => n + m.marcacoes.length, 0)
  const comNota: MaterialMarcado[] = materiais
    .map((m) => ({ ...m, marcacoes: m.marcacoes.filter((x) => x.nota) }))
    .filter((m) => m.marcacoes.length)
  const totalNotas = comNota.reduce((n, m) => n + m.marcacoes.length, 0)
  const totalSalvos = Array.isArray(salvos) ? salvos.length : salvos

  return (
    <>
      <PageHeader
        title="Meus Cadernos"
        sub="Tudo o que você montou, anotou, grifou e salvou na plataforma, num lugar só."
      />

      <Tabs
        items={ROTULOS}
        active={ABAS.indexOf(aba)}
        counts={[cadernos.length, totalNotas, totalGrifos, totalSalvos]}
        links={ABAS.map(hrefAba)}
      />

      {aba === 'cadernos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 16, alignItems: 'stretch' }}>
            <CriarCadernoCard />

            {/* AUTOMÁTICO: questões que o aluno errou na última tentativa (sai ao acertar). */}
            <Link href={`${R.cadernos}/erros`} style={{ display: 'flex' }}>
              <Card pad={0} style={{ overflow: 'hidden', gap: 0, width: '100%' }}>
                <div style={{ position: 'relative', background: GR.EXT, color: '#fff', padding: '16px 18px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
                  <span style={{ position: 'relative', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E6DEFF' }}>Automático</span>
                  <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 28, color: 'var(--gold)' }}>{erros.ids.length}</span>
                </div>
                <Col gap={12} style={{ padding: 18 }}>
                  <H3>Caderno de erros</H3>
                  <Row gap={6}><Tag kind="green">Questões</Tag></Row>
                  <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                    <Muted size={12}>{erros.ids.length ? (erros.ids.length === 1 ? '1 questão para refazer' : `${erros.ids.length} questões para refazer`) : 'Nenhum erro pendente'}</Muted>
                    {erros.atualizadoEm && <Muted size={12}>atualizado em {fmtData(erros.atualizadoEm)}</Muted>}
                  </Row>
                </Col>
              </Card>
            </Link>

            {cadernos.map((c) => (
              <Link key={c.id} href={`/aluno/cadernos/${c.id}`} style={{ display: 'flex' }}>
                <Card pad={0} style={{ overflow: 'hidden', gap: 0, width: '100%' }}>
                  {/* capa/cabeçalho */}
                  <div style={{ position: 'relative', background: GR.EXT, color: '#fff', padding: '16px 18px', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
                    <span style={{ position: 'relative', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E6DEFF' }}>Criado por você</span>
                    <span style={{ position: 'relative', fontFamily: 'Montserrat, sans-serif', fontStyle: 'italic', fontWeight: 800, fontSize: 28, color: 'var(--gold)' }}>{c.total}</span>
                  </div>
                  {/* corpo */}
                  <Col gap={12} style={{ padding: 18 }}>
                    <H3>{c.nome}</H3>
                    <Row gap={6}>
                      <Tag kind="green">{c.total === 1 ? '1 questão' : `${c.total} questões`}</Tag>
                    </Row>
                    {c.total > 0 && <Bar pct={Math.round((c.resolvidas / c.total) * 100)} color="var(--gold)" />}
                    <Row style={{ justifyContent: 'space-between', gap: 8 }}>
                      <Muted size={12}>{c.total ? `${Math.round((c.resolvidas / c.total) * 100)}% resolvido` : 'Caderno vazio'}</Muted>
                      {c.criado_em && <Muted size={12}>criado em {fmtData(c.criado_em)}</Muted>}
                    </Row>
                  </Col>
                </Card>
              </Link>
            ))}
          </div>

          {cadernos.length === 0 && (
            <Muted size={13}>Você ainda não criou nenhum caderno. Os cadernos que você criar aparecem aqui.</Muted>
          )}
        </>
      )}

      {aba === 'anotacoes' && (
        comNota.length === 0 ? (
          <Card>
            <Aviso icon="pen" action={<Btn kind="secondary" icon="book" href="/aluno/biblioteca">Abrir a Biblioteca</Btn>}>
              Você ainda não escreveu nenhuma anotação. No leitor da Biblioteca, grife um trecho e escreva uma nota nele — ela aparece aqui.
            </Aviso>
          </Card>
        ) : (
          <Col gap={16}>
            {comNota.map((m) => <BlocoMaterial key={m.documentoId} m={m} voltar={hrefAba('anotacoes')} destaque="nota" />)}
          </Col>
        )
      )}

      {aba === 'grifos' && (
        materiais.length === 0 ? (
          <Card>
            <Aviso icon="highlight" action={<Btn kind="secondary" icon="book" href="/aluno/biblioteca">Abrir a Biblioteca</Btn>}>
              Você ainda não marcou nenhum trecho. Abra um material no leitor da Biblioteca e selecione o texto para criar seus grifos.
            </Aviso>
          </Card>
        ) : (
          <Col gap={16}>
            {materiais.map((m) => (
              <BlocoMaterial key={m.documentoId} m={m} voltar={hrefAba('grifos')} destaque="texto"
                limite={docAberto === m.documentoId ? undefined : LIMITE_POR_MATERIAL}
                verTodos={`${hrefAba('grifos')}&doc=${m.documentoId}#m-${m.documentoId}`} />
            ))}
          </Col>
        )
      )}

      {aba === 'salvos' && (
        !Array.isArray(salvos) || salvos.length === 0 ? (
          <Card>
            <Aviso icon="star" action={<Btn kind="secondary" icon="qbook" href={R.banco}>Ir ao banco de questões</Btn>}>
              Você ainda não salvou nenhuma questão. Marque a ⭐ numa questão para ela aparecer aqui.
            </Aviso>
          </Card>
        ) : (
          <div className="space-y-4">
            {salvos.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={i + 1} />)}
          </div>
        )
      )}
    </>
  )
}

// Um material com suas marcações. `destaque` = o que é o conteúdo principal do item (o trecho grifado,
// na aba Grifos; a nota escrita, na aba Anotações).
function BlocoMaterial({ m, voltar, destaque, limite, verTodos }: { m: MaterialMarcado; voltar: string; destaque: 'texto' | 'nota'; limite?: number; verTodos?: string }) {
  const visiveis = limite ? m.marcacoes.slice(0, limite) : m.marcacoes
  const n = m.marcacoes.length
  return (
    <Card pad={18} style={{ scrollMarginTop: 80 }}>
      <span id={`m-${m.documentoId}`} />
      <Row style={{ justifyContent: 'space-between', gap: 10 }}>
        <Col gap={4} style={{ minWidth: 0 }}>
          <H3>{m.titulo}</H3>
          <Muted size={12.5}>
            {destaque === 'nota' ? (n === 1 ? '1 anotação' : `${n} anotações`) : (n === 1 ? '1 trecho marcado' : `${n} trechos marcados`)}
          </Muted>
        </Col>
        <Btn kind="secondary" size="sm" icon="file" href={linkLeitor(m.documentoId, null, voltar)}>Abrir material</Btn>
      </Row>
      <Col gap={10}>
        {visiveis.map((g) => <ItemMarcacao key={g.id} g={g} voltar={voltar} destaque={destaque} />)}
      </Col>
      {limite && n > limite && verTodos ? (
        <Btn kind="link" href={verTodos}>Ver todos os {n} trechos deste material</Btn>
      ) : null}
    </Card>
  )
}

function ItemMarcacao({ g, voltar, destaque }: { g: Marcacao; voltar: string; destaque: 'texto' | 'nota' }) {
  const trecho = g.texto || (g.pagina ? `Marcação na página ${g.pagina}` : 'Trecho marcado')
  return (
    <a href={linkLeitor(g.documentoId, g.pagina, voltar)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--surface2)', color: 'inherit', textDecoration: 'none' }}>
      <Tag kind={g.tag}>{g.label}</Tag>
      <Col gap={6} style={{ minWidth: 0, flex: 1 }}>
        {destaque === 'nota' ? (
          <>
            <span style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{cortar(g.nota, 1200)}</span>
            <Muted size={12.5}>“{cortar(trecho, 220)}”</Muted>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14.5, lineHeight: 1.6, color: g.texto ? 'var(--ink)' : 'var(--muted)', fontFamily: g.texto ? 'var(--font-read)' : undefined, overflowWrap: 'anywhere' }}>{cortar(trecho)}</span>
            {g.nota ? <Muted size={12.5}><Icon n="pen" size={12} /> {cortar(g.nota, 300)}</Muted> : null}
          </>
        )}
      </Col>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {g.pagina ? `pág. ${g.pagina}` : 'Abrir'}<Icon n="chev" size={13} />
      </span>
    </a>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, Check, Eye, Pencil, FileText, Copy, History, Info, Scale, Target, TriangleAlert, Users } from 'lucide-react'
import { RevisaoAbas, RevisaoCard, RevisaoHead } from '@/components/admin/revisao/ui'
import { AvisoSemAcesso } from '@/components/admin/aviso-sem-acesso'
import { JcSelo, JcStatusPill, JcTicket } from '@/components/admin/revisao/jurisclub-cards'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { JC_LIBERACOES, jcData, jcDataCurta, jcPasta, jcVer, type EdicaoRow } from '@/lib/revisao/jurisclub-tipos'
import {
  PER_PAGE_JC, alunosComJurisclub, alunosDosGrupos, disciplinasDaEdicao, disciplinasTenant, metricasEdicao, gruposDaEdicao, gruposDoTenant, listarErratas, listarJulgados, listarQuestoes, nomesDocumentos, obterEdicao, titulosJulgados,
} from '@/lib/revisao/jurisclub-dados'
import { AdicionarJulgadoBtn, OrdemBtns, ConferidoSwitch, ConfigForm, DocumentoBtn, ErrataForm, EstudantesForm, JulgadoLinhaAcoes, LiberacaoBtn, PublicarBtn, QuestoesAcoes } from './ilhas'

// Página da edição (protótipo #jced): 8 abas via ?aba=. Server component: só LÊ (listas paginadas .range()+count).
export const dynamic = 'force-dynamic'

const BASE = '/admin/revisao/jurisclub'
type SP = { aba?: string; q?: string; disc?: string; sort?: string; dir?: string; page?: string; pp?: string; g?: string }
const ABAS = ['geral', 'jul', 'q', 'est', 'mat', 'pv', 'err', 'cfg']

const Kpi = ({ n, l }: { n: string | number; l: string }) => (
  <div className="rounded-2xl border bg-card p-4 shadow-sm"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{l}</span><b className="mt-1 block text-3xl font-bold tabular-nums">{n}</b></div>
)
const Nota = ({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) => (
  <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', aviso ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/40')}>
    {aviso ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span>{children}</span>
  </div>
)
const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'

export default async function EdicaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  if (!(await checkPermission('biblioteca:view'))) return <AvisoSemAcesso />
  const access = await getCurrentAccess()
  const tenantId = access.tenantId
  if (!tenantId) return <AvisoSemAcesso />
  const { id } = await params
  const sp = await searchParams
  const e = await obterEdicao(tenantId, id)
  if (!e) notFound()
  const p = jcPasta(e.pasta)
  const aba = ABAS.includes(sp.aba ?? '') ? (sp.aba as string) : 'geral'
  const item = p.id === '1a7d' ? 'tema' : 'julgado'
  const itens = p.item
  const podeEditar = await checkPermission('biblioteca:update')
  const podePublicar = await checkPermission('biblioteca:publicar')

  const abas = [
    { id: 'geral', titulo: 'Visão geral' },
    { id: 'jul', titulo: `${p.id === '1a7d' ? 'Temas' : 'Julgados'} (${e.n_julgados})` },
    { id: 'q', titulo: `Questões (${e.n_questoes})` },
    { id: 'est', titulo: 'Estudantes' },
    { id: 'mat', titulo: 'Material' },
    { id: 'pv', titulo: 'Prévia' },
    { id: 'err', titulo: 'Erratas' },
    { id: 'cfg', titulo: 'Configurações' },
  ]

  return (
    <div className="space-y-4">
      <Link href={`${BASE}?pasta=${p.id}`} className="text-sm font-bold text-primary underline-offset-4 hover:underline">← Voltar para a pasta {p.n}</Link>
      <RevisaoHead
        secao={`JurisClub · ${p.n}`}
        titulo={e.titulo}
        acoes={
          <>
            <JcStatusPill status={e.status} />
            <Link href="/aluno/nova/cursos/central/jurisclub" target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Eye className="size-4" />Ver como aluno</Link>
            {podeEditar && <Link href={`${BASE}/nova?pasta=${e.pasta}&base=${e.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Copy className="size-4" />Duplicar</Link>}
            {podePublicar && <PublicarBtn id={e.id} status={e.status} />}
          </>
        }
      />
      <RevisaoAbas abas={abas} atual={aba} base={`${BASE}/${e.id}`} />

      {aba === 'geral' && <Geral e={e} tenantId={tenantId} itens={itens} un={p.un.toLowerCase()} podePublicar={podePublicar} />}
      {aba === 'jul' && <Julgados e={e} tenantId={tenantId} sp={sp} item={item} itens={itens} podeEditar={podeEditar} />}
      {aba === 'q' && <Questoes e={e} tenantId={tenantId} sp={sp} podeEditar={podeEditar} />}
      {aba === 'est' && <Estudantes e={e} tenantId={tenantId} podeEditar={podeEditar} />}
      {aba === 'mat' && <Material e={e} tenantId={tenantId} un={p.un.toLowerCase()} item={item} podeEditar={podeEditar} />}
      {aba === 'pv' && <Previa e={e} item={item} un={p.un.toLowerCase()} />}
      {aba === 'err' && <Erratas e={e} tenantId={tenantId} item={item} un={p.un.toLowerCase()} podePublicar={podePublicar} />}
      {aba === 'cfg' && podeEditar && <ConfigForm e={e} />}
      {aba === 'cfg' && !podeEditar && <AvisoSemAcesso />}
    </div>
  )
}

async function Geral({ e, tenantId, itens, un, podePublicar }: { e: EdicaoRow; tenantId: string; itens: string; un: string; podePublicar: boolean }) {
  const pub = e.status === 'publicado'
  const [m, grupos] = await Promise.all([pub ? metricasEdicao(tenantId, e).catch(() => null) : Promise.resolve(null), e.todos ? Promise.resolve([] as string[]) : gruposDaEdicao(tenantId, e.id)])
  const fmt = (n: number | null | undefined, suf = '') => (n == null ? '—' : `${n.toLocaleString('pt-BR')}${suf}`)
  const kpis = pub
    ? [[fmt(m?.pctAbriram, '%'), 'dos alunos abriram'], ['—', 'concluíram a leitura'], [fmt(m?.respondidas), 'questões respondidas'], [fmt(m?.pctAcerto, '%'), 'de acerto médio']]
    : [['—', 'dos alunos abriram'], ['—', 'concluíram a leitura'], [e.n_julgados, `${itens} prontos`], [e.n_questoes, 'questões prontas']]
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(([n, l]) => <Kpi key={l} n={n} l={String(l)} />)}</div>
      {pub && (
        <Nota>
          {m?.abriram != null ? `${m.abriram.toLocaleString('pt-BR')} de ${m.audiencia.toLocaleString('pt-BR')} alunos abriram o documento ligado (Biblioteca). ` : 'Ligue um documento da Biblioteca (aba Material) para medir quem abriu. '}
          {m?.respondidas == null ? 'As questões respondidas e o acerto aparecem depois de “Mandar ao banco do simulado” (aba Questões). ' : 'Respostas contadas na prática do Banco de Questões. '}
          “Concluíram a leitura” ainda não tem registro no leitor da Biblioteca.
        </Nota>
      )}
      {e.falta && <Nota aviso>Em rascunho: {e.falta}. Os alunos ainda não veem esta {un}.</Nota>}
      {e.status === 'agendado' && <Nota>Agendada para {formatBrt(e.publicar_em) ?? '—'} (horário de Brasília).</Nota>}
      <RevisaoCard titulo="Publicação e acesso">
        <div className="mb-3 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">Quando e para quem esta {un} aparece</p>
          <Link href={`${BASE}/${e.id}?aba=est`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><Users className="size-4" />Mudar quem vê</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['Situação', pub ? 'No ar' : e.status === 'agendado' ? 'Agendado' : 'Rascunho'], [e.status === 'agendado' ? 'No ar em' : 'No ar desde', e.status === 'agendado' ? (formatBrt(e.publicar_em) ?? '—') : jcData(e.publicado_em)], ['Versão', jcVer(e.versao)], ['Quem vê', e.todos ? 'Todos com JurisClub' : `${grupos.length} ${grupos.length === 1 ? 'grupo' : 'grupos'}`]].map(([k, v]) => (
            <div key={k} className="rounded-xl border p-3"><small className="block text-xs text-muted-foreground">{k}</small><b className="text-sm">{v}</b></div>
          ))}
        </div>
      </RevisaoCard>
      <RevisaoCard titulo="Liberações para o aluno">
        <p className="mb-2 text-sm text-muted-foreground">Libere ou bloqueie cada parte a qualquer momento. A mudança só vale depois de confirmar.</p>
        <div className="divide-y">
          {JC_LIBERACOES.map((x) => {
            const lib = !!e.liberacoes?.[x.k]
            return (
              <div key={x.k} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted">
                  {x.k === 'leitura' ? <BookOpen className="size-4" /> : x.k === 'vf' ? <Check className="size-4" /> : x.k === 'pdf' ? <FileText className="size-4" /> : x.k === 'cad' ? <Target className="size-4" /> : <Scale className="size-4" />}
                </span>
                <span className="min-w-0 flex-1"><b className="block text-sm">{x.n}</b><small className="text-xs text-muted-foreground">{x.d(un === 'dia' ? 'tema' : 'julgado')}</small></span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', lib ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{lib ? 'Liberado' : 'Bloqueado'}</span>
                {podePublicar && <LiberacaoBtn id={e.id} parte={x.k} nome={x.n} liberado={lib} />}
              </div>
            )
          })}
        </div>
      </RevisaoCard>
    </div>
  )
}

function qs(sp: SP, aba: string, mud: Record<string, string | undefined>) {
  const q = new URLSearchParams({ aba })
  for (const [k, v] of Object.entries({ q: sp.q, disc: sp.disc, sort: sp.sort, dir: sp.dir, g: sp.g, pp: sp.pp, ...mud })) if (v) q.set(k, v)
  return `?${q.toString()}`
}

function Pager({ base, sp, aba, page, pp, total }: { base: string; sp: SP; aba: string; page: number; pp: number; total: number }) {
  const paginas = Math.max(1, Math.ceil(total / pp))
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 p-3 text-sm">
      <span className="text-muted-foreground">{total} no total · página {Math.min(page, paginas)} de {paginas}</span>
      {page > 1 && <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={`${base}${qs(sp, aba, { page: String(page - 1) })}`}>Anterior</Link>}
      {page < paginas && <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={`${base}${qs(sp, aba, { page: String(page + 1) })}`}>Próxima</Link>}
    </div>
  )
}

async function Julgados({ e, tenantId, sp, item, itens, podeEditar }: { e: EdicaoRow; tenantId: string; sp: SP; item: string; itens: string; podeEditar: boolean }) {
  const sort = ['ordem', 'titulo', 'tribunal', 'disciplina', 'conferido'].includes(sp.sort ?? '') ? (sp.sort as string) : 'ordem'
  const dir = sp.dir === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(sp.page) || 1)
  const [lista, discs, discsTenant] = await Promise.all([
    listarJulgados(tenantId, e.id, { q: sp.q, disc: sp.disc, sort, dir, page, pp: Number(sp.pp) || undefined }),
    disciplinasDaEdicao(tenantId, e.id),
    disciplinasTenant(tenantId).catch(() => [] as string[]),
  ])
  const ordenavel = podeEditar && sort === 'ordem' && dir === 'asc' && !sp.q && !sp.disc
  const base = `${BASE}/${e.id}`
  const Th = ({ k, children }: { k: string; children: React.ReactNode }) => (
    <th className={th}><Link href={`${base}${qs(sp, 'jul', { sort: k, dir: sort === k && dir === 'asc' ? 'desc' : 'asc', page: undefined })}`} className="hover:text-foreground">{children}{sort === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</Link></th>
  )
  return (
    <div className="space-y-3">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="jul" />
        <input name="q" defaultValue={sp.q ?? ''} placeholder={`Buscar ${itens}`} autoComplete="off" className="h-9 min-w-56 flex-1 rounded-lg border bg-background px-3 text-sm" />
        <select name="disc" defaultValue={sp.disc ?? ''} className="h-9 rounded-lg border bg-background px-2 text-sm">
          <option value="">Todas as disciplinas</option>
          {discs.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="pp" defaultValue={String(lista.pp)} className="h-9 rounded-lg border bg-background px-2 text-sm" aria-label="Por página">{PER_PAGE_JC.map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
        <button type="submit" className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted">Filtrar</button>
        {podeEditar && <DocumentoBtn edicaoId={e.id} tenantId={tenantId} modo="trocar" rotulo="Trocar o .docx" />}
        {podeEditar && <AdicionarJulgadoBtn edicaoId={e.id} item={item} disciplinas={discsTenant} />}
      </form>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b"><tr><Th k="ordem">Ordem</Th><Th k="titulo">{p_titulo(item)}</Th><Th k="tribunal">Tribunal</Th><Th k="disciplina">Disciplina</Th><th className={th}>Selos</th><Th k="conferido">Conferido</Th><th className={th} /></tr></thead>
          <tbody>
            {lista.rows.map((j, i) => (
              <tr key={j.id} className="border-b last:border-0">
                <td className="px-3 py-2"><div className="flex items-center gap-1">{podeEditar && <OrdemBtns edicaoId={e.id} id={j.id} ativo={ordenavel} primeiro={lista.page === 1 && i === 0} ultimo={lista.page * lista.pp >= lista.total && i === lista.rows.length - 1} />}<span className="tabular-nums">{j.ordem + 1}</span></div></td>
                <td className="min-w-64 px-3 py-2 font-medium">{j.titulo}</td>
                <td className="px-3 py-2">{j.tribunal}{j.orgao && <span className="block text-xs text-muted-foreground">{j.orgao}</span>}</td>
                <td className="px-3 py-2">{j.disciplina || '—'}</td>
                <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{j.selos.map((k) => <JcSelo key={k} k={k} />)}</div></td>
                <td className="px-3 py-2">{podeEditar ? <ConferidoSwitch edicaoId={e.id} id={j.id} conferido={j.conferido} /> : (j.conferido ? 'Sim' : 'Não')}</td>
                <td className="px-3 py-2">{podeEditar && <JulgadoLinhaAcoes edicaoId={e.id} j={j} item={item} disciplinas={discsTenant} />}</td>
              </tr>
            ))}
            {!lista.rows.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{e.n_julgados ? 'Nada encontrado.' : `Esta edição ainda não tem ${itens}. Suba o documento ou adicione manualmente.`}</td></tr>}
          </tbody>
        </table>
        <Pager base={base} sp={sp} aba="jul" page={lista.page} pp={lista.pp} total={lista.total} />
      </section>
    </div>
  )
}
const p_titulo = (item: string) => (item === 'tema' ? 'Tema' : 'Julgado')

async function Questoes({ e, tenantId, sp, podeEditar }: { e: EdicaoRow; tenantId: string; sp: SP; podeEditar: boolean }) {
  const page = Math.max(1, Number(sp.page) || 1)
  const lista = await listarQuestoes(tenantId, e.id, { q: sp.q, g: sp.g, page, pp: Number(sp.pp) || undefined })
  const base = `${BASE}/${e.id}`
  if (!e.n_questoes) {
    return (
      <RevisaoCard>
        <p className="py-6 text-center text-sm text-muted-foreground">Sem questões ainda. O aluno vê “Caderno de questões em breve”.</p>
        {podeEditar && <div className="flex justify-center"><QuestoesAcoes edicaoId={e.id} temQuestoes={false} /></div>}
      </RevisaoCard>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="aba" value="q" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar questão" autoComplete="off" className="h-9 min-w-56 rounded-lg border bg-background px-3 text-sm" />
          <select name="g" defaultValue={sp.g ?? ''} className="h-9 rounded-lg border bg-background px-2 text-sm"><option value="">Todos os gabaritos</option><option value="C">Certo</option><option value="E">Errado</option></select>
          <button type="submit" className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-muted">Filtrar</button>
        </form>
        {podeEditar && <QuestoesAcoes edicaoId={e.id} temQuestoes />}
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b"><tr><th className={th}>#</th><th className={th}>Enunciado</th><th className={th}>Tipo</th><th className={th}>Gabarito</th><th className={th}>Disciplina</th><th className={th}>Assunto</th><th className={th}>Ligada a</th></tr></thead>
          <tbody>
            {lista.rows.map((q) => (
              <tr key={q.id} className="border-b last:border-0">
                <td className="px-3 py-2 tabular-nums">{q.ordem + 1}</td>
                <td className="min-w-72 px-3 py-2">{q.enunciado}</td>
                <td className="px-3 py-2">C/E</td>
                <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', q.gabarito === 'C' ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-600/15 text-red-700 dark:text-red-300')}>{q.gabarito === 'C' ? 'Certo' : 'Errado'}</span></td>
                <td className="px-3 py-2">{q.disciplina || '—'}</td>
                <td className="px-3 py-2">{q.assunto || '—'}</td>
                <td className="px-3 py-2 text-xs">{q.ligada ?? '—'}</td>
              </tr>
            ))}
            {!lista.rows.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nada encontrado.</td></tr>}
          </tbody>
        </table>
        <Pager base={base} sp={sp} aba="q" page={lista.page} pp={lista.pp} total={lista.total} />
      </section>
    </div>
  )
}

async function Estudantes({ e, tenantId, podeEditar }: { e: EdicaoRow; tenantId: string; podeEditar: boolean }) {
  const [grupos, sel, totalTodos] = await Promise.all([gruposDoTenant(tenantId), gruposDaEdicao(tenantId, e.id), alunosComJurisclub(tenantId).catch(() => 0)])
  const inicial = e.todos ? totalTodos : await alunosDosGrupos(tenantId, sel).catch(() => 0)
  if (!podeEditar) return <AvisoSemAcesso />
  return <EstudantesForm id={e.id} todos={e.todos} grupoIds={sel} grupos={grupos} pasta={e.pasta} totalTodos={totalTodos} alunosInicial={inicial} />
}

async function Material({ e, tenantId, un, item, podeEditar }: { e: EdicaoRow; tenantId: string; un: string; item: string; podeEditar: boolean }) {
  const nomes = await nomesDocumentos(tenantId, [e.documento_id, e.pdf_doc_id, e.questoes_doc_id])
  const card = 'flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 shadow-sm'
  const ico = 'grid size-9 place-items-center rounded-lg bg-muted'
  const btn = 'inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-muted'
  return (
    <div className="space-y-3">
      <Nota>O que o aluno recebe nesta {un}. Clique em cada card para editar ou trocar.</Nota>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={card}><span className={ico}><BookOpen className="size-4" /></span><b>Leitura digital</b><p className="text-sm text-muted-foreground">O caderno com filtros, selos e busca. Gerado do .docx.</p>
          <p className="text-xs text-muted-foreground">{e.documento_id ? <>Documento: <b className="text-foreground">{nomes[e.documento_id] ?? '—'}</b></> : 'Nenhum documento ligado.'}</p>
          {podeEditar && <DocumentoBtn edicaoId={e.id} tenantId={tenantId} modo="leitura" rotulo="Editar" icone="editar" />}</div>
        <div className={card}><span className={ico}><FileText className="size-4" /></span><b>PDF original</b><p className="text-sm text-muted-foreground">O documento como foi diagramado, para baixar.</p>
          <p className="text-xs text-muted-foreground">{e.pdf_doc_id ? <>Arquivo: <b className="text-foreground">{nomes[e.pdf_doc_id] ?? '—'}</b></> : 'Nenhum PDF ligado.'}</p>
          {podeEditar && <DocumentoBtn edicaoId={e.id} tenantId={tenantId} modo="pdf" rotulo="Trocar PDF" />}</div>
        <div className={card}><span className={ico}><Check className="size-4" /></span><b>Revisão V/F</b><p className="text-sm text-muted-foreground">Perguntas rápidas ao fim de cada {item}.</p>
          <Link href={`${BASE}/${e.id}?aba=q`} className={btn}><Pencil className="size-3.5" />Editar</Link></div>
        <div className={card}><span className={ico}><Scale className="size-4" /></span><b>Índice do vade mecum</b><p className="text-sm text-muted-foreground">Dispositivos citados, em ordem de lei.</p>
          <span className={cn(btn, 'cursor-not-allowed opacity-50')} title="Gerado a partir dos dispositivos citados — ainda sem fonte de dados"><Pencil className="size-3.5" />Em breve</span></div>
        <div className={card}><span className={ico}><Target className="size-4" /></span><b>Caderno de questões</b><p className="text-sm text-muted-foreground">Questões com gabarito, comentários e alternativas comentadas.</p>
          <Link href={`${BASE}/${e.id}?aba=q`} className={btn}><Pencil className="size-3.5" />Editar</Link></div>
        <div className={card}><span className={ico}><History className="size-4" /></span><b>Mapa de atualizações</b><p className="text-sm text-muted-foreground">O que mudou em relação à edição anterior.</p>
          <Link href={`${BASE}/${e.id}?aba=err`} className={btn}><Pencil className="size-3.5" />Editar</Link></div>
      </div>
    </div>
  )
}

function Previa({ e, item, un }: { e: EdicaoRow; item: string; un: string }) {
  const p = jcPasta(e.pasta)
  const Quadro = ({ n, children }: { n: string; children: React.ReactNode }) => (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs font-semibold">{n}<Link href="/aluno/nova/cursos/central/jurisclub" target="_blank" className="font-semibold text-primary underline underline-offset-2">Expandir</Link></div>
      <div className="space-y-2 p-3">{children}</div>
    </div>
  )
  // cor da edição e acento da pasta são DADO (vão em style); o resto usa tokens.
  const Barra = ({ w, h = 10, forte, ouro, cls }: { w?: string; h?: number; forte?: boolean; ouro?: boolean; cls?: string }) => (
    <i className={cn('block rounded', !forte && !ouro && !cls && 'bg-muted', cls)} style={{ width: w ?? '100%', height: h, ...(forte ? { background: e.cor } : ouro ? { background: p.c2 } : {}) }} />
  )
  return (
    <div className="space-y-3">
      <Nota>Prévia de todas as telas que o aluno vê, com a cor desta {un}.</Nota>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Quadro n="Início do JurisClub"><Barra h={46} forte /><div className="flex gap-2"><Barra w="30%" h={10} ouro /><Barra w="20%" h={10} /></div><div className="flex gap-2"><Barra h={38} /><Barra h={38} /><Barra h={38} /></div><Barra w="70%" /><Barra w="55%" /></Quadro>
        <Quadro n="Lista com filtros"><div className="flex gap-2"><div className="w-[28%]"><Barra h={120} forte /></div><div className="flex flex-1 flex-col gap-1.5"><Barra h={24} /><Barra h={24} /><Barra h={24} /><Barra h={24} /></div></div></Quadro>
        <Quadro n={item === 'tema' ? 'Tema do dia' : 'Julgado'}><Barra w="60%" h={14} forte /><div className="flex gap-2"><Barra w="22%" h={9} ouro /><Barra w="18%" h={9} ouro /></div><Barra h={8} /><Barra h={8} /><Barra w="80%" h={8} /><Barra h={34} cls="bg-sky-500/15" /><Barra w="65%" h={8} /></Quadro>
        <Quadro n="Revisão e questões"><Barra w="50%" h={12} forte /><Barra h={30} /><div className="flex gap-2"><Barra h={22} cls="flex-1 bg-emerald-600/20" /><Barra h={22} cls="flex-1 bg-red-600/20" /></div><Barra h={30} /><Barra w="40%" h={16} ouro /></Quadro>
        <Quadro n="No celular"><div className="mx-auto w-28 space-y-1.5 rounded-2xl border-4 border-foreground/80 p-2 pb-8"><Barra h={18} forte /><Barra h={6} /><Barra w="70%" h={6} /><Barra w="40%" h={6} ouro /><Barra h={22} /><Barra h={6} /></div></Quadro>
      </div>
    </div>
  )
}

async function Erratas({ e, tenantId, item, un, podePublicar }: { e: EdicaoRow; tenantId: string; item: string; un: string; podePublicar: boolean }) {
  const [lista, js] = await Promise.all([listarErratas(tenantId, e.id), titulosJulgados(tenantId, e.id)])
  return (
    <div className="space-y-4">
      {podePublicar && <ErrataForm edicaoId={e.id} julgados={js.slice(0, 500)} item={item} />}
      <RevisaoCard titulo={`Erratas desta ${un}`}>
        <div className="mb-2 flex justify-end"><Link href="/admin/configuracoes/novidades" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><History className="size-4" />Central de Atualizações</Link></div>
        {lista.length ? (
          <div className="space-y-2">
            {lista.map((h) => (
              <div key={h.id} className="flex items-stretch gap-3 rounded-xl border p-3">
                <span className="w-1 rounded-full bg-primary" />
                <span className="min-w-0"><b className="block text-sm">{h.julgado_titulo ? `${h.julgado_titulo}: ` : ''}{h.texto}</b><small className="text-xs text-muted-foreground">Correção · {jcDataCurta(h.criado_em)}{h.avisou ? ' · alunos avisados' : ''}</small></span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nenhuma errata registrada.</p>}
      </RevisaoCard>
    </div>
  )
}

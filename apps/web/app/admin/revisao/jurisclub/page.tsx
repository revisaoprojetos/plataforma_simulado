import Link from 'next/link'
import { Folder, Copy, Plus, Pencil, Home, ExternalLink, Info } from 'lucide-react'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { AvisoSemAcesso } from '@/components/admin/aviso-sem-acesso'
import { JcCapa, JcStatusPill, rotuloCapa } from '@/components/admin/revisao/jurisclub-cards'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { JC_PASTAS, jcData, jcPasta } from '@/lib/revisao/jurisclub-tipos'
import { edicoesDaPasta, kpisJurisclub, listarEdicoes, questoesUltimasEdicoes, simuladosTrimestrais } from '@/lib/revisao/jurisclub-dados'
import { LinhasTabela } from './linhas-tabela'

// JurisClub · pastas e edições (protótipo #jurisclub). Server component: só LÊ (agregados já prontos nas colunas
// denormalizadas; listas paginadas com .range()+count). Estado na URL: ?vw=pastas|linhas, ?f=todos|ras|ag|pub, ?pasta=, ?novo=.
export const dynamic = 'force-dynamic'

const BASE = '/admin/revisao/jurisclub'
type SP = { vw?: string; f?: string; pasta?: string; novo?: string; page?: string; pp?: string; q?: string; sort?: string; dir?: string }

function href(sp: Record<string, string | undefined>, mud: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  const m = { ...sp, ...mud }
  for (const [k, v] of Object.entries(m)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

function Seg({ itens, atual, mk }: { itens: [string, string][]; atual: string; mk: (v: string) => string }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border bg-card p-1" role="group">
      {itens.map(([v, n]) => (
        <Link key={v} href={mk(v)} className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors', atual === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{n}</Link>
      ))}
    </div>
  )
}

export default async function JurisClubPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await checkPermission('biblioteca:view'))) return <AvisoSemAcesso />
  const access = await getCurrentAccess()
  const tenantId = access.tenantId
  if (!tenantId) return <AvisoSemAcesso />
  const sp = await searchParams
  const vw = sp.vw === 'linhas' ? 'linhas' : 'pastas'
  const f = (['ras', 'ag', 'pub'].includes(sp.f ?? '') ? sp.f : 'todos') as 'todos' | 'ras' | 'ag' | 'pub'
  const pa = sp.pasta ? jcPasta(sp.pasta) : null
  const novo = sp.novo ? jcPasta(sp.novo) : null
  const page = Math.max(1, Number(sp.page) || 1)
  const cur = { vw: sp.vw, f: sp.f, pasta: sp.pasta }

  const [kpis, lista, trim, ultimas, base] = await Promise.all([
    kpisJurisclub(tenantId, f),
    vw === 'linhas' || (pa && !pa.ext)
      ? listarEdicoes(tenantId, { pasta: pa?.id, f, q: sp.q, sort: sp.sort, dir: sp.dir === 'asc' ? 'asc' : 'desc', page, pp: pa && vw === 'pastas' ? 24 : Number(sp.pp) || undefined })
      : Promise.resolve(null),
    !pa || pa.ext ? simuladosTrimestrais(tenantId).catch(() => ({ rows: [], total: 0 })) : Promise.resolve(null),
    pa?.ext ? questoesUltimasEdicoes(tenantId) : Promise.resolve(null),
    novo && !novo.ext ? edicoesDaPasta(tenantId, novo.id) : Promise.resolve([]),
  ])

  const cards = [
    { n: kpis.noAr, l: 'edições e dias no ar', alerta: false },
    { n: kpis.rascunhos, l: 'em rascunho', alerta: kpis.rascunhos > 0 },
    { n: kpis.julgados, l: 'julgados e temas publicados', alerta: false },
    { n: kpis.questoes, l: 'questões V/F publicadas', alerta: false },
  ]
  const fmt = (n: number) => n.toLocaleString('pt-BR')

  return (
    <div className="space-y-5">
      <RevisaoHead
        secao="Pedagógico"
        titulo="JurisClub"
        subtitulo="Monte e publique as edições do JurisClub e os dias do 1 Ano em 7 Dias. Funciona como a Aplicação de Simulado: pastas, um passo a passo de 6 etapas e uma página com abas para cada edição."
        acoes={
          <Link href={href(cur, { novo: pa && !pa.ext ? pa.id : 'mensal' })} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Plus className="size-4" />Nova edição
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((k) => (
          <div key={k.l} className="rounded-2xl border bg-card p-4 shadow-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.l}</span>
            <b className={cn('mt-1 block text-3xl font-bold tabular-nums', k.alerta && 'text-amber-600 dark:text-amber-400')}>{fmt(k.n)}</b>
          </div>
        ))}
      </div>

      {novo && (
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Nova {novo.un.toLowerCase()} · {novo.n}</h2>
              <p className="text-sm text-muted-foreground">Como você quer começar?</p>
            </div>
            <Link href={href(cur, { novo: undefined })} className="rounded-md border px-2 py-1 text-xs hover:bg-muted" aria-label="Fechar">Fechar</Link>
          </div>
          {novo.ext ? (
            <p className="text-sm text-muted-foreground">O {novo.n} é montado no admin de simulados. <Link className="font-semibold text-primary underline" href={novo.ext}>Abrir o admin de simulados</Link></p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus className="size-4" />Criar do zero</h3>
                <p className="text-sm text-muted-foreground">Monte em etapas: personalização, {novo.item}, selos e filtros, questões, estudantes e publicação.</p>
                <Link href={`${BASE}/nova?pasta=${novo.id}`} className="inline-flex rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">Começar ›</Link>
              </div>
              <form action={`${BASE}/nova`} method="get" className="space-y-2 rounded-xl border p-4">
                <input type="hidden" name="pasta" value={novo.id} />
                <h3 className="text-sm font-semibold">A partir de uma já pronta</h3>
                <p className="text-sm text-muted-foreground">Reaproveita cor, grupos, versão e configurações. Os {novo.item} e as questões vêm do arquivo novo.</p>
                <label className="block text-sm font-medium">Usar como base
                  <select name="base" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={!base.length}>
                    {base.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={!base.length} className="rounded-lg border px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">Continuar ›</button>
              </form>
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Seg atual={vw} itens={[['pastas', 'Pastas'], ['linhas', 'Linhas']]} mk={(v) => href(cur, { vw: v, page: undefined })} />
        <Seg atual={f} itens={[['todos', 'Todos'], ['ras', 'Rascunho'], ['ag', 'Agendado'], ['pub', 'No ar']]} mk={(v) => href(cur, { f: v === 'todos' ? undefined : v, page: undefined })} />
      </div>

      {vw === 'linhas' && lista && <LinhasTabela rows={lista.rows} total={lista.total} />}

      {vw === 'pastas' && pa && (
        <nav className="flex items-center gap-2 text-sm" aria-label="Caminho da pasta">
          <Link href={href(cur, { pasta: undefined, page: undefined })} className="inline-flex items-center gap-1.5 font-semibold text-primary"><Home className="size-4" />Início</Link>
          <span className="text-muted-foreground">›</span>
          <b>{pa.n}</b>
          <span className="text-muted-foreground">— {pa.ext ? (trim?.total ?? 0) : (lista?.total ?? 0)} {pa.uns}</span>
        </nav>
      )}

      {vw === 'pastas' && !pa && (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {JC_PASTAS.map((p) => {
            const n = p.ext ? (trim?.total ?? 0) : (kpis.porPasta[p.id] ?? 0)
            return (
              <article key={p.id} className="grid grid-cols-[9rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card shadow-sm">
                <JcCapa cor={p.c1} acento={p.c2} rotulo={p.n} sub="Pasta" className="min-h-32" />
                <div className="flex flex-col gap-1.5 p-4">
                  <span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"><Folder className="size-3" />Pasta</span>
                  <h3 className="text-base font-bold">{p.n}</h3>
                  <span className="text-xs text-muted-foreground">{n} {n === 1 ? p.un.toLowerCase() : p.uns}{p.ext ? ' · no admin de simulados' : ''}</span>
                  <div className="mt-auto flex justify-end pt-2">
                    <Link href={href(cur, { pasta: p.id, page: undefined })} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"><Folder className="size-3.5" />Abrir pasta</Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {vw === 'pastas' && pa?.ext && (
        <>
          <div className="flex items-start gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>O Simulado Trimestral continua sendo aplicado no admin de simulados. As questões V/F de cada edição já vão para o banco de Questões de lá, então o simulado do trimestre sai pronto das 3 últimas edições: hoje há <b>{ultimas?.questoes ?? 0} questões</b> nas {ultimas?.edicoes ?? 0} últimas edições no ar.</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {(trim?.rows ?? []).map((s) => (
              <article key={s.id} className="grid grid-cols-[9rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card shadow-sm">
                <JcCapa cor={pa.c1} acento={pa.c2} rotulo={s.titulo.replace(/^Simulado Trimestral de Jurisprudência - /, '')} className="min-h-32" />
                <div className="flex flex-col gap-1.5 p-4">
                  <div className="flex gap-1.5"><JcStatusPill status={s.status === 'publicado' ? 'publicado' : 'rascunho'} /><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{pa.un}</span></div>
                  <h3 className="text-sm font-bold">{s.titulo}</h3>
                  <div className="mt-auto flex justify-end pt-2">
                    <Link href={`/admin/simulados/${s.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"><ExternalLink className="size-3.5" />Abrir</Link>
                  </div>
                </div>
              </article>
            ))}
            <Link href={pa.ext} className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold text-muted-foreground hover:bg-muted/40"><ExternalLink className="size-4" />Novo simulado no admin de simulados</Link>
          </div>
        </>
      )}

      {vw === 'pastas' && pa && !pa.ext && lista && (
        <>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {lista.rows.map((e) => (
              <article key={e.id} className={cn('grid grid-cols-[9rem_minmax(0,1fr)] overflow-hidden rounded-2xl border bg-card shadow-sm', e.status !== 'publicado' && 'opacity-90')}>
                <JcCapa cor={e.cor} acento={pa.c2} imagem={e.imagem_url} rotulo={rotuloCapa(e.titulo)} sub={pa.id === '1a7d' ? '1 Ano em 7 Dias' : 'REVISÃO · JurisClub'} className="min-h-32" />
                <div className="flex flex-col gap-1.5 p-4">
                  <div className="flex flex-wrap gap-1.5"><JcStatusPill status={e.status} /><span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{pa.un}</span></div>
                  <h3 className="text-sm font-bold">{e.titulo}</h3>
                  <span className="text-xs text-muted-foreground">
                    {e.n_julgados} {pa.item} · {e.n_questoes ? `${e.n_questoes} questões` : 'sem questões'}
                    {e.falta ? ` · ${e.falta}` : e.publicado_em ? ` · no ar desde ${jcData(e.publicado_em)}` : ''}
                  </span>
                  <div className="mt-auto flex justify-end gap-1.5 pt-2">
                    <Link href={`${BASE}/${e.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"><Pencil className="size-3.5" />Abrir</Link>
                    <Link href={`${BASE}/nova?pasta=${e.pasta}&base=${e.id}`} className="inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted" aria-label="Criar a partir desta" title="Criar a partir desta"><Copy className="size-3.5" /></Link>
                  </div>
                </div>
              </article>
            ))}
            <Link href={href(cur, { novo: pa.id })} className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold text-muted-foreground hover:bg-muted/40"><Plus className="size-4" />Nova {pa.un.toLowerCase()} nesta pasta</Link>
          </div>
          {lista.total > lista.pp && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Página {lista.page} de {Math.ceil(lista.total / lista.pp)} · {lista.total} {pa.uns}</span>
              {lista.page > 1 && <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={href(cur, { page: String(lista.page - 1) })}>Anterior</Link>}
              {lista.page * lista.pp < lista.total && <Link className="rounded-md border px-3 py-1 hover:bg-muted" href={href(cur, { page: String(lista.page + 1) })}>Próxima</Link>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

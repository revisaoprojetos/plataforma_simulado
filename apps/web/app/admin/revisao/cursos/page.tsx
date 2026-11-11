import Link from 'next/link'
import { Plus, Pencil, Search } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { listarCursos } from '@/lib/revisao/cursos'
import { nomeModelo } from '@/lib/revisao/cursos-defs'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { CursoCover } from './curso-cover'
import { CursoAtivoSwitch } from './curso-ativo-switch'
import { Pill } from './ui-cursos'

export const dynamic = 'force-dynamic'
const POR_PAGINA = 12
const fmt = (n: number) => n.toLocaleString('pt-BR')

// Montagem de curso › CURSOS (#cursos). Página só LÊ: o loader entrega cards prontos (alunos, aulas, etapas).
export default async function CursosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await getCurrentAccess()
  if (!(accessCan(access, 'produtos:view') || accessCan(access, 'produtos:manage'))) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const podeEditar = accessCan(access, 'produtos:manage') || accessCan(access, 'produtos:update')

  const sp = await searchParams
  const f = sp.f === 'ativos' || sp.f === 'inativos' ? sp.f : 'todos'
  const sort = sp.sort === 'nome' ? 'nome' : 'recentes'
  const q = (sp.q ?? '').trim()
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const lista = await listarCursos(access.tenantId, { q, f, sort, page, perPage: POR_PAGINA })

  const href = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams()
    const m: Record<string, string | number | undefined> = { f: f === 'todos' ? undefined : f, q: q || undefined, sort: sort === 'nome' ? 'nome' : undefined, ...o }
    for (const [k, v] of Object.entries(m)) if (v !== undefined && v !== '' && v !== 1) p.set(k, String(v))
    const s = p.toString()
    return `/admin/revisao/cursos${s ? `?${s}` : ''}`
  }

  const criar = (
    <Link href="/admin/revisao/cursos/novo" className={buttonVariants({ size: 'lg' })}>
      <Plus className="size-4" />Criar curso
    </Link>
  )

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Montagem de curso"
        titulo="Cursos"
        subtitulo="Monte cada curso: modelo, aulas, imagens, pop-ups, mensagens e e-mails. Ative ou desative com um botão. Curso desativado some da plataforma do aluno, mas o progresso de quem estudou fica guardado."
        acoes={podeEditar ? criar : undefined}
      />

      {!lista.ok ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-sm">
          {lista.motivo === 'migracao' ? (
            <>
              <b>Montagem de curso ainda não está ativa no banco.</b>
              <p className="mt-1 text-muted-foreground">Aplique a migração <code>supabase/migrations/20261112020000_revisao_cursos.sql</code> e recarregue o schema (<code>NOTIFY pgrst, &apos;reload schema&apos;</code>).</p>
            </>
          ) : (
            <b>Não foi possível carregar os cursos agora. Tente de novo.</b>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-xl border bg-card p-1" role="group" aria-label="Filtrar cursos">
              {([['todos', `Todos · ${lista.totais.todos}`], ['ativos', `Ativos · ${lista.totais.ativos}`], ['inativos', `Desativados · ${lista.totais.inativos}`]] as const).map(([v, l]) => (
                <Link
                  key={v}
                  href={href({ f: v === 'todos' ? undefined : v, page: 1 })}
                  className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors', f === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  {l}
                </Link>
              ))}
            </div>
            <form action="/admin/revisao/cursos" method="get" className="ml-auto flex flex-wrap items-center gap-2">
              {f !== 'todos' && <input type="hidden" name="f" value={f} />}
              <label className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input name="q" defaultValue={q} placeholder="Buscar curso" autoComplete="off" className="h-9 w-56 rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
              </label>
              <select name="sort" defaultValue={sort} aria-label="Ordenar" className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
                <option value="recentes">Mais recentes</option>
                <option value="nome">Nome (A–Z)</option>
              </select>
              <button type="submit" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Buscar</button>
            </form>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-4">
            {lista.rows.map((c) => (
              <article key={c.id} className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm', !c.ativo && 'opacity-75')}>
                <CursoCover nome={c.nome} c1={c.cor_principal} c2={c.cor_destaque} img={c.img_horizontal} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tom="vio">{c.tipo}</Pill>
                    {c.tipo !== 'Extensivo' && c.modelo && <Pill>{nomeModelo(c.modelo)}</Pill>}
                    {c.ativo ? <Pill tom="ok">Ativo</Pill> : <Pill>Desativado</Pill>}
                    {c.etFeitas < 6 && <Pill tom="warn">{c.etFeitas} de 6 etapas</Pill>}
                  </div>
                  <h3 className="text-base font-bold leading-snug">{c.nome}</h3>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{fmt(c.alunos)} alunos</span>
                    <span>{fmt(c.aulas)} aulas</span>
                    <span>editado {formatBrt(c.atualizado_em)?.slice(0, 5) ?? '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t p-3">
                  <CursoAtivoSwitch id={c.id} nome={c.nome} ativo={c.ativo} desabilitado={!podeEditar} />
                  <span className="flex-1" />
                  <Link href={`/admin/revisao/cursos/${c.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <Pencil className="size-3.5" />Editar
                  </Link>
                </div>
              </article>
            ))}
            {podeEditar && (
              <Link href="/admin/revisao/cursos/novo" className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Plus className="size-5" />Criar curso
              </Link>
            )}
          </div>

          {!lista.rows.length && <p className="mt-4 text-sm text-muted-foreground">{q || f !== 'todos' ? 'Nenhum curso encontrado com esses filtros.' : 'Nenhum curso ainda. Crie o primeiro.'}</p>}

          {lista.total > POR_PAGINA && (
            <nav className="mt-5 flex items-center justify-between text-sm" aria-label="Paginação">
              <span className="text-muted-foreground">Página {page} de {Math.max(1, Math.ceil(lista.total / POR_PAGINA))} · {lista.total} cursos</span>
              <span className="flex gap-2">
                {page > 1 && <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: 'outline' })}>Anterior</Link>}
                {page * POR_PAGINA < lista.total && <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: 'outline' })}>Próxima</Link>}
              </span>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

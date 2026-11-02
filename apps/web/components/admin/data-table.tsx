'use client'

/**
 * <DataTable> — tabela genérica, server-driven e reutilizável (Estúdio de Conteúdo).
 * ---------------------------------------------------------------------------------
 * PRIMITIVO da Fundação (Etapa 0). É ADITIVO: não substitui `QuestoesTabelaBase`
 * nem toca em telas de produção. Os builders das próximas telas montam suas listas
 * em cima deste componente (1 só padrão de paginação/ordenação/seleção/lote).
 *
 * Como funciona (server-driven, backend-first):
 *   - A PÁGINA (server component) é quem BUSCA os dados, já paginados/ordenados/filtrados
 *     no banco (`.range()` + `count:'exact'`), lendo page/pp/sort/dir/q dos searchParams.
 *   - Este componente (client) só RENDERIZA as linhas recebidas e, ao interagir
 *     (trocar página, ordenar, buscar), faz `router.push` mudando os searchParams —
 *     o que dispara um novo fetch na página. Nada de cálculo/paginação no front.
 *   - A seleção vive em estado React e SOBREVIVE à troca de página/ordenação (o
 *     componente permanece montado numa navegação soft do App Router).
 *
 * Exemplo de uso (a PÁGINA busca; o componente só exibe):
 *
 *   // app/admin/exemplo/page.tsx  (server component)
 *   const PER_PAGE = [5, 10, 25, 50]
 *   export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
 *     const sp = await searchParams
 *     const page = Math.max(1, Number(sp.page ?? 1))
 *     const perPage = PER_PAGE.includes(Number(sp.pp)) ? Number(sp.pp) : 10
 *     const q = (sp.q ?? '').trim()
 *     const sort = sp.sort ?? 'criado_em'
 *     const dir = sp.dir === 'asc' ? 'asc' : 'desc'
 *     const supabase = await createServiceClient()
 *     const tenantId = await getCurrentTenantId()
 *     let query = supabase.from('simulado_minha_tabela')
 *       .select('id, nome, criado_em', { count: 'exact' })
 *       .eq('tenant_id', tenantId ?? NADA)
 *       .order(sort, { ascending: dir === 'asc' })
 *       .range((page - 1) * perPage, page * perPage - 1)
 *     if (q) query = query.ilike('nome', `%${q}%`)
 *     const { data, count } = await query
 *     return (
 *       <DataTable
 *         rows={data ?? []}
 *         total={count ?? 0}
 *         getRowId={(r) => r.id}
 *         defaultSort={{ key: 'criado_em', dir: 'desc' }}
 *         searchable
 *         columns={[
 *           { key: 'nome', header: 'Nome', sortable: true, render: (r) => r.nome },
 *           { key: 'criado_em', header: 'Criado', sortable: true, width: '12rem',
 *             render: (r) => formatBrt(r.criado_em) ?? '—' },
 *         ]}
 *         rowActions={(r) => [{ label: 'Editar', icon: <Pencil />, onClick: () => editar(r.id) }]}
 *         bulkActions={(sel) => (
 *           <Button size="sm" onClick={() => excluir(sel)}>Excluir</Button>
 *         )}
 *       />
 *     )
 *   }
 *
 * Observação sobre "Selecionar todos (total)": neste modo o componente NÃO entrega a
 * lista de ids (que pode ter milhares) — entrega o sinal `allMatching: true`. O
 * consumidor aplica a ação sobre o FILTRO atual (os mesmos searchParams que a página
 * usou para buscar), não sobre uma lista de ids.
 */

import * as React from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Search, Check, Minus, MoreVertical, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, ChevronDown, Loader2, Inbox, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { navProgressStart } from '@/lib/nav-progress'
import { SortButton, type Sort } from '@/components/admin/th-ordenavel'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// ───────────────────────────── Contrato (props) ─────────────────────────────

export type DataTableColumn<T> = {
  /** Identificador da coluna. Se `sortable`, também é o valor de `?sort=`. */
  key: string
  header: React.ReactNode
  /** Clique no cabeçalho ordena no servidor (3º clique volta ao padrão). */
  sortable?: boolean
  /** Largura do `<col>` (ex.: '12rem', '20%'). Sem valor → distribui o espaço. */
  width?: string
  align?: 'left' | 'center' | 'right'
  render: (row: T) => React.ReactNode
  /** Tooltip (title) da célula quando truncada. */
  title?: (row: T) => string | undefined
  /** `true` (padrão) corta em 1 linha com reticências; `false` deixa quebrar. */
  truncate?: boolean
  /** Classes extras no `<td>`. */
  className?: string
}

/** Item do menu ⋮ por linha. */
export type DataTableRowAction = {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  href?: string
  destructive?: boolean
  disabled?: boolean
  /** Separador acima deste item. */
  separatorBefore?: boolean
}

/** Estado da seleção entregue a `bulkActions`. */
export type DataTableSelection = {
  /** Ids marcados explicitamente (persistem entre páginas). Vazio se `allMatching`. */
  ids: string[]
  /** `true` = "Selecionar todos (total)": aja sobre o FILTRO atual, não sobre `ids`. */
  allMatching: boolean
  /** Quantidade efetiva (ids.length, ou `total` quando `allMatching`). */
  count: number
  /** Total real de registros (do servidor). */
  total: number
  /** Limpa a seleção. */
  clear: () => void
}

export type DataTableProps<T> = {
  /** Linhas da página atual (já buscadas pela página servidor). */
  rows: T[]
  /** Total real de registros no servidor (count:'exact'). */
  total: number
  columns: DataTableColumn<T>[]
  /** Id estável por linha (chave de seleção e de React). */
  getRowId: (row: T) => string
  /** Ordenação padrão exibida quando não há `?sort=` na URL. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  /** Opções do seletor "por página". Padrão [5,10,25,50]. */
  perPageOptions?: number[]
  /** Valor de "por página" quando não há `?pp=`. Padrão 10. */
  defaultPerPage?: number
  /** Mostra a caixa de busca (wire em `?q=`). */
  searchable?: boolean
  searchPlaceholder?: string
  /** Slot de filtros extras (à direita da busca). Mude os searchParams você mesmo. */
  filters?: React.ReactNode
  /** Habilita seleção por linha + barra de lote (padrão: true). */
  selectable?: boolean
  /** Botões de ação em lote (recebe a seleção atual). */
  bulkActions?: (selection: DataTableSelection) => React.ReactNode
  /** Menu ⋮ por linha. */
  rowActions?: (row: T) => DataTableRowAction[]
  /** Navegador (4.2): clicar na linha seleciona e mostra o painel lateral. */
  onRowClick?: (row: T) => void
  /** Id da linha ativa — destaque com barra roxa à esquerda (navegador). */
  activeRowId?: string | null
  /** Altura fixa da linha (padrão h-11). Navegadores usam linhas mais altas (ex.: 'h-16'). */
  rowHeight?: string
  /** Estados. */
  loading?: boolean
  error?: string | null
  /** Conteúdo exibido quando não há linhas (padrão: frase neutra). */
  empty?: React.ReactNode
  /** Nome do registro para textos ("N no total"). Padrão: 'registro'. */
  nomeSingular?: string
  nomePlural?: string
  className?: string
}

// ───────────────────────────── Constantes ─────────────────────────────

const PER_PAGE_DEFAULT_OPTIONS = [5, 10, 25, 50]
const ROW_H = 'h-11' // altura fixa de linha (mantém a altura entre páginas)

// ───────────────────────────── Helpers ─────────────────────────────

/** Lista de páginas com reticências (ex.: 1 … 4 5 [6] 7 8 … 20). */
function listaPaginas(atual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const paginas: (number | '…')[] = [1]
  const ini = Math.max(2, atual - 1)
  const fim = Math.min(total - 1, atual + 1)
  if (ini > 2) paginas.push('…')
  for (let p = ini; p <= fim; p++) paginas.push(p)
  if (fim < total - 1) paginas.push('…')
  paginas.push(total)
  return paginas
}

// ───────────────────────────── Componente ─────────────────────────────

export function DataTable<T>({
  rows, total, columns, getRowId,
  defaultSort, perPageOptions = PER_PAGE_DEFAULT_OPTIONS, defaultPerPage = 10,
  searchable = false, searchPlaceholder = 'Buscar…', filters,
  selectable = true, bulkActions, rowActions,
  onRowClick, activeRowId = null, rowHeight,
  loading = false, error = null, empty,
  nomeSingular = 'registro', nomePlural,
  className,
}: DataTableProps<T>) {
  const ROW_CLASS = rowHeight ?? ROW_H
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const plural = nomePlural ?? `${nomeSingular}s`

  // ── Estado derivado dos searchParams (server-driven) ──
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1)
  const perPage = perPageOptions.includes(Number(searchParams.get('pp')))
    ? Number(searchParams.get('pp'))
    : defaultPerPage
  const explicitSort: Sort = searchParams.get('sort')
    ? { key: searchParams.get('sort')!, dir: searchParams.get('dir') === 'asc' ? 'asc' : 'desc' }
    : null
  const activeSort: Sort = explicitSort ?? (defaultSort ?? null)
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  function pushParams(mut: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(searchParams.toString())
    mut(p)
    navProgressStart()
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }

  // ── Busca (debounce leve; reseta para a página 1) ──
  const buscaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  function onBusca(valor: string) {
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(() => {
      pushParams((p) => { valor ? p.set('q', valor) : p.delete('q'); p.delete('page') })
    }, 300)
  }

  // ── Ordenação server-side (3º clique → volta ao padrão) ──
  function onSort(key: string) {
    pushParams((p) => {
      p.delete('page')
      if (!explicitSort || explicitSort.key !== key) { p.set('sort', key); p.set('dir', 'asc') }
      else if (explicitSort.dir === 'asc') { p.set('sort', key); p.set('dir', 'desc') }
      else { p.delete('sort'); p.delete('dir') }
    })
  }

  // ── Paginação server-side ──
  function irParaPagina(p: number) {
    pushParams((sp) => { sp.set('page', String(Math.min(Math.max(1, p), totalPages))) })
  }
  function mudarPorPagina(n: number) {
    pushParams((sp) => { sp.set('pp', String(n)); sp.set('page', '1') })
  }

  // ── Seleção (estado React; sobrevive a troca de página/ordenação) ──
  const [selIds, setSelIds] = React.useState<Set<string>>(new Set())
  const [allMatching, setAllMatching] = React.useState(false)
  const pageIds = React.useMemo(() => rows.map(getRowId), [rows, getRowId])

  const limpar = React.useCallback(() => { setSelIds(new Set()); setAllMatching(false) }, [])
  function toggleRow(id: string) {
    setAllMatching(false)
    setSelIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function togglePagina() {
    setAllMatching(false)
    setSelIds((p) => {
      const todasNaPagina = pageIds.length > 0 && pageIds.every((id) => p.has(id))
      const n = new Set(p)
      if (todasNaPagina) pageIds.forEach((id) => n.delete(id))
      else pageIds.forEach((id) => n.add(id))
      return n
    })
  }

  const selCount = allMatching ? total : selIds.size
  const temSelecao = selCount > 0
  const paginaTodaMarcada = pageIds.length > 0 && (allMatching || pageIds.every((id) => selIds.has(id)))
  const paginaParcial = !allMatching && !paginaTodaMarcada && pageIds.some((id) => selIds.has(id))

  const selection: DataTableSelection = { ids: [...selIds], allMatching, count: selCount, total, clear: limpar }

  // ── Layout de colunas ──
  const colAcoes = !!rowActions
  const totalCols = columns.length + (selectable ? 1 : 0) + (colAcoes ? 1 : 0)
  const alinhar = (a?: 'left' | 'center' | 'right') =>
    a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : 'text-left'

  // ── Faixa "mostrando a–b de N" ──
  const inicio = total === 0 ? 0 : (page - 1) * perPage + 1
  const fim = Math.min(page * perPage, total)
  // Linhas-fantasma mantêm a ALTURA FIXA do corpo = `perPage` linhas (AUDITORIA 4.3), inclusive VAZIO.
  const fillerCount = !loading && !error ? Math.max(0, perPage - rows.length) : 0

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* Toolbar: busca + filtros */}
      {(searchable || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                defaultValue={searchParams.get('q') ?? ''}
                onChange={(e) => onBusca(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Buscar"
                className="h-11 w-full rounded-xl border bg-card pl-10 pr-3.5 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          {filters}
        </div>
      )}

      {/* Barra de lote — 48px fixa, sempre 1 linha */}
      {selectable && (
        <div className="flex h-12 items-center gap-3 rounded-2xl border bg-card px-3.5 text-sm">
          {!temSelecao ? (
            <span className="text-muted-foreground">
              <span className="font-bold text-foreground">{total.toLocaleString('pt-BR')}</span>{' '}
              {total === 1 ? nomeSingular : plural}
              <span className="hidden sm:inline"> · marque uma ou mais linhas para agir em lote</span>
            </span>
          ) : (
            <>
              <span className="whitespace-nowrap font-medium text-foreground">
                {selCount.toLocaleString('pt-BR')} selecionado{selCount === 1 ? '' : 's'}
              </span>
              {!allMatching && selIds.size < total && (
                <button
                  type="button"
                  onClick={() => { setAllMatching(true); setSelIds(new Set()) }}
                  className="whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline"
                >
                  Selecionar todos ({total.toLocaleString('pt-BR')})
                </button>
              )}
              <button
                type="button"
                onClick={limpar}
                className="whitespace-nowrap text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Limpar
              </button>
              {bulkActions && (
                <div className="ml-auto flex items-center gap-2 overflow-x-auto">
                  {bulkActions(selection)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="relative w-full overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {selectable && <col style={{ width: '2.75rem' }} />}
            {columns.map((c, i) => <col key={i} style={c.width ? { width: c.width } : undefined} />)}
            {colAcoes && <col style={{ width: '3rem' }} />}
          </colgroup>

          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              {selectable && (
                <th className="px-3 py-2.5">
                  <CheckBox
                    checked={paginaTodaMarcada}
                    indeterminate={paginaParcial}
                    onClick={togglePagina}
                    label="Marcar todos desta página"
                    disabled={pageIds.length === 0}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={cn('px-3 py-2.5 font-medium', alinhar(c.align))}>
                  {c.sortable ? (
                    <SortButton
                      label={typeof c.header === 'string' ? c.header : ''}
                      k={c.key}
                      sort={activeSort}
                      onSort={onSort}
                      className={cn('uppercase tracking-wide', c.align === 'center' && 'mx-auto', c.align === 'right' && 'ml-auto')}
                    />
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {colAcoes && <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr className={ROW_H}>
                <td colSpan={totalCols} className="px-3 py-10 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</span>
                </td>
              </tr>
            ) : error ? (
              <tr className={ROW_H}>
                <td colSpan={totalCols} className="px-3 py-8">
                  <div className="mx-auto flex max-w-md items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = getRowId(row)
                const marcada = allMatching || selIds.has(id)
                const ativa = activeRowId != null && id === activeRowId
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      ROW_CLASS, 'border-b last:border-0 transition-colors',
                      onRowClick && 'cursor-pointer',
                      ativa ? 'bg-primary/10' : marcada ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40',
                    )}
                    style={ativa ? { boxShadow: 'inset 3px 0 0 var(--primary)' } : undefined}
                  >
                    {selectable && (
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <CheckBox checked={marcada} onClick={() => toggleRow(id)} label="Selecionar linha" />
                      </td>
                    )}
                    {columns.map((c) => {
                      const trunca = c.truncate !== false
                      return (
                        <td key={c.key} className={cn('px-3 align-middle', alinhar(c.align), c.className)}>
                          <div
                            className={cn(trunca ? 'truncate' : 'whitespace-normal break-words')}
                            title={c.title?.(row)}
                          >
                            {c.render(row)}
                          </div>
                        </td>
                      )
                    })}
                    {colAcoes && (
                      <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu actions={rowActions!(row)} />
                      </td>
                    )}
                  </tr>
                )
              })
            )}

            {/* Linhas-fantasma mantêm a altura fixa na última página */}
            {Array.from({ length: fillerCount }).map((_, i) => (
              <tr key={`filler-${i}`} aria-hidden className={cn(ROW_CLASS, 'border-b last:border-0')}>
                <td colSpan={totalCols} />
              </tr>
            ))}
          </tbody>
        </table>
        {/* Vazio: mensagem centralizada SOBRE o corpo de altura fixa (as linhas-fantasma seguram a altura). */}
        {!loading && !error && rows.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-12 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {empty ?? (
              <span className="inline-flex flex-col items-center gap-2">
                <Inbox className="h-6 w-6 opacity-50" />
                Nenhum {nomeSingular} encontrado.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Rodapé: "a–b de N · X páginas" + por página + navegação */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Mostrando <span className="tabular-nums text-foreground">{inicio.toLocaleString('pt-BR')}</span>–
            <span className="tabular-nums text-foreground">{fim.toLocaleString('pt-BR')}</span> de{' '}
            <span className="tabular-nums text-foreground">{total.toLocaleString('pt-BR')}</span>
            {' · '}{totalPages.toLocaleString('pt-BR')} {totalPages === 1 ? 'página' : 'páginas'}
          </span>
          <div className="flex items-center gap-1.5">
            <span>Por página:</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Itens por página"
                className="inline-flex h-8 items-center gap-1 rounded-lg border bg-card px-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted data-popup-open:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {perPage} <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[4.5rem]">
                {perPageOptions.map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onClick={() => mudarPorPagina(n)}
                    className={cn('justify-between', n === perPage && 'font-semibold text-primary')}
                  >
                    {n} {n === perPage && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <IconNav onClick={() => irParaPagina(1)} disabled={page <= 1} label="Primeira página"><ChevronsLeft className="h-4 w-4" /></IconNav>
            <IconNav onClick={() => irParaPagina(page - 1)} disabled={page <= 1} label="Página anterior"><ChevronLeft className="h-4 w-4" /></IconNav>
            {listaPaginas(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`e-${i}`} className="px-1.5 text-muted-foreground">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => irParaPagina(p)}
                  aria-label={`Página ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    p === page ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <IconNav onClick={() => irParaPagina(page + 1)} disabled={page >= totalPages} label="Próxima página"><ChevronRight className="h-4 w-4" /></IconNav>
            <IconNav onClick={() => irParaPagina(totalPages)} disabled={page >= totalPages} label="Última página"><ChevronsRight className="h-4 w-4" /></IconNav>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────── Subcomponentes ─────────────────────────────

/** Checkbox quadrada (marcada / indeterminada) no estilo da tabela de questões. */
function CheckBox({
  checked, indeterminate, onClick, label, disabled,
}: { checked: boolean; indeterminate?: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={cn(
        'flex h-4 w-4 items-center justify-center rounded border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
        checked || indeterminate ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-muted-foreground',
      )}
    >
      {indeterminate ? <Minus className="h-3 w-3" /> : checked ? <Check className="h-3 w-3" /> : null}
    </button>
  )
}

/** Botão de navegação só-ícone (« ‹ › »). */
function IconNav({
  onClick, disabled, label, children,
}: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-card text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** Menu ⋮ por linha (um aberto por vez — fecha no clique fora / Esc, via base-ui). */
function RowActionsMenu({ actions }: { actions: DataTableRowAction[] }) {
  if (!actions || actions.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ações da linha"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a, i) => (
          <React.Fragment key={i}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={a.destructive ? 'destructive' : 'default'}
              disabled={a.disabled}
              render={a.href ? <a href={a.href} /> : undefined}
              onClick={a.onClick}
            >
              {a.icon}
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

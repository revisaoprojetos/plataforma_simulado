'use client'

// Navegador de Produtos do Estúdio (telas Produtos / Pasta): <EstudioHeader> (abas abaixo do título)
// + navegador com caminho (AUDITORIA 4.2) + <DataTable> único (4.3) com clique-na-linha → painel
// lateral, filtros reais no servidor e export XLSX. Dados reais vêm da page (server-driven).

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Boxes, ClipboardList, Folder, Plus, Trash2, Pencil, FolderInput, Copy, ChevronRight, ChevronDown, Download, Home, Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { navProgressStart } from '@/lib/nav-progress'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { DataTable, type DataTableColumn, type DataTableRowAction, type DataTableSelection } from '@/components/admin/data-table'
import type { LinhaUnificada as LinhaConteudo, PastaProdutoFlat } from '@/lib/produtos/estudio'
import { excluirProdutoAction } from '@/app/admin/produtos/actions'
import { moverSimuladoParaPasta, deleteSimuladoAction } from '@/app/admin/simulados/actions'
import { criarPastaProdutoAction, renomearPastaProdutoAction, excluirPastaProdutoAction, moverPastaProdutoAction } from './actions'
import { criarPastaSimuladoAction, renomearPastaSimuladoAction, excluirPastaSimuladoAction, moverPastaSimuladoAction } from './simulados-actions'
import { NovoProdutoDialog, MoverDialog, RenomearDialog, DuplicarProdutoDialog } from './produto-modais'

const dataHora = (iso: string | null) => {
  const f = formatBrt(iso)
  if (!f) return { d: '—', h: '' }
  const [d, h] = f.split(' ')
  return { d, h }
}
const fmtData = (iso: string | null) => formatBrt(iso) ?? '—'
const rotuloTipo = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Produto')
const rotuloSub = (r: LinhaConteudo) => r.kind === 'pasta' ? 'Pasta' : r.kind === 'simulado' ? `Simulado · ${rotuloTipo(r.status)}` : rotuloTipo(r.tipo)
const areaDe = (r: LinhaConteudo) => (r.kind === 'pasta' ? r.folder_area : r.kind === 'simulado' ? 'simulado' : 'produto')
const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }

export function ProdutosEstudioClient({ podeEditar, podeEditarSim, rows, total, arvore, breadcrumb, pastaAtual, tipo }: {
  podeEditar: boolean; podeEditarSim: boolean; rows: LinhaConteudo[]; total: number
  arvore: PastaProdutoFlat[]; breadcrumb: PastaProdutoFlat[]; pastaAtual: string | null
  tipo: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, start] = useTransition()

  const [sel, setSel] = useState<LinhaConteudo | null>(null)
  const [novoProduto, setNovoProduto] = useState(false)
  const [mover, setMover] = useState<{ kind: 'pasta' | 'produto' | 'simulado'; id: string; nome: string; area: string } | null>(null)
  const [renomear, setRenomear] = useState<{ id: string; nome: string; area: string } | null>(null)
  const podeRow = (r: LinhaConteudo) => (areaDe(r) === 'simulado' ? podeEditarSim : podeEditar)
  const moverDe = (r: LinhaConteudo) => setMover({ kind: r.kind, id: r.id, nome: r.nome, area: areaDe(r) })
  const [duplicar, setDuplicar] = useState<{ id: string; nome: string } | null>(null)

  const refresh = () => { setSel(null); router.refresh() }

  function irParaPasta(id: string | null) {
    const p = new URLSearchParams(searchParams.toString())
    if (id) p.set('pasta', id); else p.delete('pasta')
    p.delete('page')
    navProgressStart()
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
    setSel(null)
  }
  function abrir(row: LinhaConteudo) {
    if (row.kind === 'pasta') irParaPasta(row.id)
    else if (row.kind === 'simulado') {
      // "Voltar" inteligente: guarda a ORIGEM (esta pasta/visão de Produtos) pra o detalhe do simulado voltar pra cá.
      const voltar = `${pathname}${searchParams.toString() ? `?${searchParams}` : ''}`
      navProgressStart(); router.push(`/admin/simulados/${row.id}?voltar=${encodeURIComponent(voltar)}`)
    }
    else { navProgressStart(); router.push(`/admin/conteudos/produtos/${row.id}`) }
  }
  function novoSimulado() { navProgressStart(); router.push('/admin/simulados/novo') }
  const excluirRow = async (row: LinhaConteudo): Promise<any> =>
    row.kind === 'pasta' ? (row.folder_area === 'simulado' ? excluirPastaSimuladoAction(row.id) : excluirPastaProdutoAction(row.id))
      : row.kind === 'simulado' ? deleteSimuladoAction(row.id) : excluirProdutoAction(row.id)

  async function criarPastaRaiz() {
    const nome = await pedirTexto({ titulo: 'Nova pasta', label: 'Nome da pasta', placeholder: 'Ex.: Sprint PGM 2026', confirmar: 'Criar pasta' })
    if (!nome?.trim()) return
    const r = await criarPastaProdutoAction(nome, pastaAtual)
    if ('error' in r && r.error) { toast.error(r.error); return }
    toast.success('Pasta criada.'); refresh()
  }

  async function excluir(row: LinhaConteudo) {
    const ok = await confirmar({
      titulo: row.kind === 'pasta' ? 'Excluir pasta' : row.kind === 'simulado' ? 'Excluir simulado' : 'Excluir produto',
      mensagem: row.kind === 'pasta'
        ? `Mover "${row.nome}" para a Lixeira? As subpastas, produtos e simulados dentro dela voltam para a raiz.`
        : row.kind === 'simulado' ? `Enviar "${row.nome}" para a Lixeira? Ele pode ser recuperado depois.`
        : `Excluir "${row.nome}"? As fontes, seções e liberações são apagadas; o acesso já concedido aos alunos não é removido automaticamente.`,
      confirmar: 'Excluir', destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await excluirRow(row)
      if (r?.error) { toast.error(r.error); return }
      toast.success('Excluído.'); refresh()
    })
  }

  function excluirLote(selDt: DataTableSelection) {
    const alvos = rows.filter((r) => selDt.ids.includes(r.id))
    if (!alvos.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    confirmar({ titulo: 'Enviar para a Lixeira', mensagem: `Enviar ${alvos.length} item(ns) para a Lixeira?`, confirmar: 'Enviar para a Lixeira', destrutivo: true }).then((ok) => {
      if (!ok) return
      start(async () => {
        for (const r of alvos) {
          const rr = await excluirRow(r)
          if (rr?.error) toast.error(`${r.nome}: ${rr.error}`)
        }
        toast.success('Concluído.'); selDt.clear(); refresh()
      })
    })
  }

  // Filtros reais (Tipo / Situação / Grupo de acesso) → querystring (filtrado no servidor).
  const setFiltro = (chave: 'tipo', v: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (v) p.set(chave, v); else p.delete(chave)
    p.delete('page')
    navProgressStart()
    router.push(`${pathname}${p.toString() ? `?${p}` : ''}`)
  }
  function exportar() {
    const p = new URLSearchParams(searchParams.toString())
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/produtos/export${p.toString() ? `?${p}` : ''}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }
  const linkDe = (row: LinhaConteudo) =>
    row.kind === 'simulado' ? `${window.location.origin}/admin/simulados/${row.id}`
      : `${window.location.origin}/admin/conteudos/produtos${row.kind === 'pasta' ? `?pasta=${row.id}` : `/${row.id}`}`
  function copiarLink(row: LinhaConteudo) {
    navigator.clipboard?.writeText(linkDe(row))
      .then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar o link.'))
  }
  function copiarLinksLote(s: DataTableSelection) {
    const alvos = rows.filter((r) => s.ids.includes(r.id))
    if (!alvos.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    navigator.clipboard?.writeText(alvos.map(linkDe).join('\n'))
      .then(() => toast.success(`${alvos.length} link(s) copiado(s).`)).catch(() => toast.error('Não foi possível copiar.'))
  }
  const tipoOpcoes = [{ value: 'pasta', label: 'Pasta' }, { value: 'produto', label: 'Produto' }, { value: 'simulado', label: 'Simulado' }]

  // ── Colunas do <DataTable> (visual do designer via render) ──
  const columns: DataTableColumn<LinhaConteudo>[] = [
    {
      key: 'titulo', header: 'Título', sortable: true, truncate: false,
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden', r.capa ? 'rounded-[8px]' : 'rounded-xl', r.kind === 'pasta' ? 'bg-primary/10 text-primary' : 'text-primary-foreground')}
            style={r.kind === 'produto' ? { background: r.cor || 'var(--primary)' } : r.kind === 'simulado' ? { background: 'var(--primary)' } : undefined}>
            {r.capa
              ? <img src={r.capa} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              : r.kind === 'pasta' ? <Folder className="h-[18px] w-[18px]" /> : r.kind === 'simulado' ? <ClipboardList className="h-[18px] w-[18px]" /> : <Boxes className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0">
            <b className="flex items-center gap-2 text-[13.5px] leading-[1.35] text-foreground">
              <span className="truncate">{r.nome}</span>
              {r.kind === 'produto' && !r.ativo && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">inativo</span>}
            </b>
            <span className="block truncate text-xs leading-normal text-muted-foreground">{rotuloSub(r)}</span>
          </div>
        </div>
      ),
    },
    { key: 'itens', header: 'Itens', width: '5rem', render: (r) => r.kind === 'simulado' ? <span className="text-[13px] text-muted-foreground">—</span> : <b className="text-[13px] tabular-nums text-foreground">{r.itens}</b> },
    {
      key: 'atualizacao', header: 'Atualização', sortable: true, width: '9.5rem', truncate: false,
      render: (r) => { const dh = dataHora(r.atualizado_em); return (<div className="min-w-0"><span className="block text-[12.5px] text-foreground">{dh.d}</span>{dh.h && <span className="text-[11.5px] text-muted-foreground">{dh.h}</span>}</div>) },
    },
    {
      key: 'abrir', header: '', width: '6rem', align: 'right', truncate: false,
      render: (r) => sel?.id === r.id ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); abrir(r) }}
          className="inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-[9px] border border-primary/30 bg-primary/10 px-2.5 text-xs font-extrabold text-primary">Abrir<ChevronRight className="h-[13px] w-[13px]" /></button>
      ) : null,
    },
  ]

  // Menus ⋮ fiéis ao designer (MAPA-DE-ACOES / AUDITORIA 4.3).
  const rowActions = (r: LinhaConteudo): DataTableRowAction[] => (
    r.kind === 'simulado'
      ? [
          { label: 'Abrir', icon: <ChevronRight className="h-4 w-4" />, onClick: () => abrir(r) },
          { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarLink(r) },
          ...(podeEditarSim ? [{ label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => moverDe(r) }] : []),
          ...(podeEditarSim ? [{ label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) }] : []),
        ]
    : r.kind === 'pasta'
      ? [
          { label: 'Abrir', icon: <ChevronRight className="h-4 w-4" />, onClick: () => abrir(r) },
          ...(podeRow(r) ? [{ label: 'Renomear', icon: <Pencil className="h-4 w-4" />, onClick: () => setRenomear({ id: r.id, nome: r.nome, area: areaDe(r) }) }] : []),
          ...(podeRow(r) ? [{ label: 'Mover para…', icon: <FolderInput className="h-4 w-4" />, onClick: () => moverDe(r) }] : []),
          { label: 'Exportar lista', icon: <Download className="h-4 w-4" />, onClick: exportar },
          ...(podeRow(r) ? [{ label: 'Mover para a Lixeira', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) }] : []),
        ]
      : [
          { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => abrir(r) },
          { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarLink(r) },
          ...(podeEditar ? [{ label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: () => setDuplicar({ id: r.id, nome: r.nome }) }] : []),
          ...(podeEditar ? [{ label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => moverDe(r) }] : []),
          { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: exportar },
          ...(podeEditar ? [{ label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) }] : []),
        ]
  )

  const acoesHeader = (
    <>
      <button type="button" aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)" onClick={exportar}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><Download className="h-4 w-4" /></button>
      <button type="button" onClick={() => router.push('/admin/lixeira')} className={BTN_TOP}><Trash2 className="h-[15px] w-[15px]" />Lixeira</button>
      {podeEditarSim && <button type="button" onClick={novoSimulado} className={BTN_TOP}><ClipboardList className="h-[15px] w-[15px]" />Novo simulado</button>}
      {podeEditar && <>
        <button type="button" onClick={criarPastaRaiz} className={BTN_TOP}><Folder className="h-[15px] w-[15px]" />Nova pasta</button>
        <button type="button" onClick={() => setNovoProduto(true)} style={GRAD_PRIMARY}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]"><Plus className="h-[15px] w-[15px]" />Novo produto</button>
      </>}
    </>
  )

  const filtrosSlot = (
    <FiltroPill label="Tipo" valorAtual={tipo} opcoes={tipoOpcoes} onPick={(v) => setFiltro('tipo', v)} />
  )

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Gerenciar produtos" acoes={acoesHeader} />

      {/* Breadcrumb (card) — navegador com caminho (4.2) */}
      <div className="flex items-center gap-3 rounded-[14px] border bg-card px-3 py-2.5">
        <button type="button" onClick={() => irParaPasta(null)} aria-label="Raiz de Produtos"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary"><Home className="h-4 w-4" /></button>
        <span className="h-[22px] w-px bg-border" />
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
          <button type="button" onClick={() => irParaPasta(null)} className={cn(pastaAtual === null ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground hover:text-foreground')}>Produtos</button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
              <button type="button" onClick={() => irParaPasta(b.id)} className={cn(pastaAtual === b.id ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground hover:text-foreground')}>{b.nome}</button>
            </span>
          ))}
        </nav>
      </div>

      {/* Corpo: lista (DataTable único) + painel de detalhe */}
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <DataTable<LinhaConteudo>
          rows={rows}
          total={total}
          columns={columns}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'atualizacao', dir: 'desc' }}
          searchable
          searchPlaceholder="Pesquise pelo título, categoria, tipo…"
          filters={filtrosSlot}
          rowActions={rowActions}
          onRowClick={(r) => setSel(r)}
          activeRowId={sel?.id ?? null}
          rowHeight="h-16"
          nomeSingular="item"
          nomePlural="itens"
          bulkActions={(s) => (
            <>
              <button type="button" onClick={() => copiarLinksLote(s)} className={BTN_LOTE}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
              <button type="button" onClick={exportar} className={BTN_LOTE}><Download className="h-3.5 w-3.5" />Exportar</button>
              {s.ids.length === 1 && !s.allMatching && (() => { const r = rows.find((x) => x.id === s.ids[0]); return r && podeRow(r) ? (
                <button type="button" onClick={() => moverDe(r)} className={BTN_LOTE}><Folder className="h-3.5 w-3.5" />Mover</button>
              ) : null })()}
              {(podeEditar || podeEditarSim) && (
                <button type="button" onClick={() => excluirLote(s)} disabled={pending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
              )}
            </>
          )}
        />

        {/* Painel de detalhe */}
        <aside className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 xl:sticky xl:top-4">
          {!sel ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Clique num item para ver os detalhes. Use “Abrir” para entrar na pasta ou no produto.</div>
          ) : (
            <Detalhe row={sel} breadcrumb={breadcrumb} podeEditar={podeRow(sel)} pending={pending}
              onIrRaiz={() => irParaPasta(null)}
              onAbrir={() => abrir(sel)} onRenomear={() => sel.kind === 'pasta' && setRenomear({ id: sel.id, nome: sel.nome, area: areaDe(sel) })}
              onMover={() => moverDe(sel)}
              onExcluir={() => excluir(sel)} onDuplicar={() => sel.kind === 'produto' && setDuplicar({ id: sel.id, nome: sel.nome })}
              onNovoProduto={() => setNovoProduto(true)} />
          )}
        </aside>
      </div>

      {/* Modais */}
      {novoProduto && <NovoProdutoDialog open onClose={() => setNovoProduto(false)} arvore={arvore} pastaAtual={pastaAtual} />}
      {mover && <MoverDialog open onClose={() => setMover(null)} arvore={arvore} alvo={mover} onMovido={refresh}
        moverCustom={mover.area === 'simulado'
          ? (dest) => (mover.kind === 'simulado' ? moverSimuladoParaPasta(mover.id, dest) : moverPastaSimuladoAction(mover.id, dest))
          : undefined}
        criarPastaCustom={mover.area === 'simulado' ? criarPastaSimuladoAction : undefined} />}
      {renomear && (
        <RenomearDialog open onClose={() => setRenomear(null)} titulo="Renomear pasta" valorInicial={renomear.nome}
          onSalvar={async (novo) => { const r = renomear.area === 'simulado' ? await renomearPastaSimuladoAction(renomear.id, novo) : await renomearPastaProdutoAction(renomear.id, novo); if ('error' in r && r.error) toast.error(r.error); else { toast.success('Renomeado.'); refresh() } }} />
      )}
      {duplicar && <DuplicarProdutoDialog open onClose={() => setDuplicar(null)} produto={duplicar} onDuplicado={(id) => router.push(`/admin/conteudos/produtos/${id}`)} />}
    </div>
  )
}

const BTN_TOP = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border bg-card px-3.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted'
const BTN_LOTE = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-card px-[11px] text-[12.5px] font-bold text-foreground hover:bg-muted'

export function FiltroPill({ label, valorAtual, opcoes, onPick }: {
  label: string; valorAtual: string | null; opcoes: { value: string; label: string }[]; onPick: (v: string | null) => void
}) {
  const ativo = valorAtual != null
  const texto = ativo ? (opcoes.find((o) => o.value === valorAtual)?.label ?? label) : label
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-bold outline-none transition-colors',
        ativo ? 'border-primary bg-primary/10 text-primary' : 'border-dashed bg-card text-foreground hover:bg-muted')}>
        {texto}<ChevronDown className="h-[13px] w-[13px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[320px] min-w-[200px] overflow-auto">
        <DropdownMenuItem onClick={() => onPick(null)} className={cn(!ativo && 'font-semibold text-primary')}>Todos</DropdownMenuItem>
        {opcoes.length > 0 && <DropdownMenuSeparator />}
        {opcoes.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onPick(o.value)} className={cn(o.value === valorAtual && 'font-semibold text-primary')}>{o.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Detalhe({ row, breadcrumb, podeEditar, pending, onIrRaiz, onAbrir, onRenomear, onMover, onExcluir, onDuplicar, onNovoProduto }: {
  row: LinhaConteudo; breadcrumb: PastaProdutoFlat[]; podeEditar: boolean; pending: boolean
  onIrRaiz: () => void; onAbrir: () => void; onRenomear: () => void; onMover: () => void; onExcluir: () => void; onDuplicar: () => void; onNovoProduto: () => void
}) {
  const pasta = row.kind === 'pasta'
  const sim = row.kind === 'simulado'
  const criada = dataHora(row.criado_em).d
  const acao = 'flex h-[38px] items-center gap-2 rounded-[11px] border px-3 text-left text-[12.5px] font-bold leading-tight text-foreground hover:bg-muted disabled:opacity-60'
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden', row.capa ? 'rounded-[8px]' : 'rounded-xl', pasta ? 'bg-primary/10 text-primary' : 'text-primary-foreground')}
          style={!pasta ? { background: (row.kind === 'produto' && row.cor) || 'var(--primary)' } : undefined}>
          {row.capa
            ? <img src={row.capa} alt="" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : pasta ? <Folder className="h-[18px] w-[18px]" /> : sim ? <ClipboardList className="h-[18px] w-[18px]" /> : <Boxes className="h-[18px] w-[18px]" />}
        </span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <b className="block text-[13.5px] leading-[1.35] text-foreground">{row.nome}</b>
          <span className="block text-xs leading-normal text-muted-foreground">{rotuloSub(row)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4">
          <b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-foreground">{sim ? rotuloTipo(row.status) : row.itens}</b>
          <span className="text-[12.5px] font-bold text-foreground">{pasta ? 'itens' : sim ? 'situação' : 'conteúdos'}</span>
        </div>
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4">
          <b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] text-foreground">{row.kind === 'produto' ? row.membros : criada}</b>
          <span className="text-[12.5px] font-bold text-foreground">{row.kind === 'produto' ? 'membros' : 'criação'}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <b className="text-[11px] font-extrabold tracking-[.16em] text-muted-foreground">CAMINHO</b>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/50 px-3 py-2.5">
          <button type="button" onClick={onIrRaiz} className="text-[12.5px] font-bold text-primary">Produtos</button>
          {breadcrumb.map((b) => (<span key={b.id} className="flex items-center gap-1.5"><ChevronRight className="h-3 w-3 text-muted-foreground/60" /><span className="text-[12.5px] font-semibold text-muted-foreground">{b.nome}</span></span>))}
          <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-[12.5px] font-extrabold text-foreground">{row.nome}</span>
        </div>
      </div>

      <div className="flex justify-between gap-3 border-t py-2 text-[13px]"><span className="text-muted-foreground">Criação</span><b className="text-right text-foreground">{fmtData(row.criado_em)}</b></div>
      <div className="flex justify-between gap-3 border-t py-2 text-[13px]"><span className="text-muted-foreground">Última modificação</span><b className="text-right text-foreground">{fmtData(row.atualizado_em)}</b></div>

      <button type="button" onClick={onAbrir} style={GRAD_PRIMARY}
        className="inline-flex h-9 items-center gap-2 rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground">
        {pasta ? <Folder className="h-[15px] w-[15px]" /> : sim ? <ClipboardList className="h-[15px] w-[15px]" /> : <Boxes className="h-[15px] w-[15px]" />}{pasta ? 'Abrir pasta' : sim ? 'Gerenciar simulado' : 'Abrir produto'}
      </button>

      {podeEditar && (
        <div className="grid grid-cols-2 gap-2">
          {pasta && <button type="button" className={acao} onClick={onRenomear}><Pencil className="h-[15px] w-[15px] shrink-0 text-primary" />Renomear</button>}
          <button type="button" className={acao} onClick={onMover}><Folder className="h-[15px] w-[15px] shrink-0 text-primary" />Mover</button>
          {pasta
            ? <button type="button" className={acao} onClick={onNovoProduto}><Plus className="h-[15px] w-[15px] shrink-0 text-primary" />Adicionar produto</button>
            : sim ? null
            : <button type="button" className={acao} onClick={onDuplicar}><Copy className="h-[15px] w-[15px] shrink-0 text-primary" />Duplicar</button>}
          <button type="button" className={acao} onClick={onExcluir} disabled={pending}><Trash2 className="h-[15px] w-[15px] shrink-0 text-primary" />Lixeira</button>
        </div>
      )}
    </>
  )
}

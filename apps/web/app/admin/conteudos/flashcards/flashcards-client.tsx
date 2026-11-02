'use client'

// FLASHCARDS › índice (Estúdio de Conteúdo). Master-detail fiel ao PNG: lista compacta de baralhos +
// prévia dos cartões do selecionado (esquerda) + painel de configuração/publicação (direita). Seleção
// server-driven por ?sel (o painel vem do servidor). Backend-first: a página busca; aqui só interage.

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Upload, Copy, MoreVertical, ChevronRight, Layers, Pencil, Trash2,
  Check, FileText, X, Download, Link2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { DataTable, type DataTableColumn, type DataTableRowAction } from '@/components/admin/data-table'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { BaralhoLista, BaralhoDetalhe, BaralhoAlcance, LinhaImportCartao } from '@/lib/flashcards/baralhos'
import {
  criarBaralhoAction, atualizarBaralhoAction, publicarBaralhoAction, despublicarBaralhoAction,
  excluirBaralhoAction, duplicarBaralhoAction, definirAlcanceGruposAction, listarGruposAction,
  removerCartaoAction, analisarImportCartoesAction, confirmarImportCartoesAction, getBaralhoAction,
} from './actions'

/** Baixa o CSV (frente,verso,fonte,disciplina) de um baralho — mesmo formato do import. */
export function baixarCsvBaralho(nome: string, cartoes: { frente: string; verso: string; fonte: string | null; disciplina: string | null }[]) {
  const esc = (s: string | null) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const linhas = ['frente,verso,fonte,disciplina', ...cartoes.map((c) => [esc(c.frente), esc(c.verso), esc(c.fonte), esc(c.disciplina)].join(','))]
  const url = URL.createObjectURL(new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = `${nome.replace(/[^\w-]+/g, '-')}.csv`; a.click(); URL.revokeObjectURL(url)
}

const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }
const BTN_LOTE = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-card px-[11px] text-[12.5px] font-bold text-foreground hover:bg-muted disabled:opacity-50'
const BTN_PAINEL = 'inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50'
const ACESSO_LABEL: Record<BaralhoAlcance, string> = { todos: 'Todos os alunos', grupos: 'Somente grupos' }

export function FlashcardsClient({
  tenantId: _tenantId, rows, total, selecionado, aviso, podeEditar,
}: {
  tenantId: string
  rows: BaralhoLista[]
  total: number
  selecionado: BaralhoDetalhe | null
  aviso: string | null
  podeEditar: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [novoAberto, setNovoAberto] = useState(false)
  const [publicarAberto, setPublicarAberto] = useState(false)
  const [importAberto, setImportAberto] = useState(false)

  const selId = selecionado?.id ?? null

  const selecionar = (id: string) => {
    const p = new URLSearchParams(searchParams.toString()); p.set('sel', id)
    router.push(`${pathname}?${p}`, { scroll: false })
  }
  const [, startRow] = useTransition()

  // Ações do ⋮ que precisam do detalhe (Publicar / Importar CSV): seleciona a linha e abre o modal quando o detalhe chega.
  const [pendente, setPendente] = useState<{ id: string; tipo: 'publicar' | 'importar' } | null>(null)
  useEffect(() => {
    if (pendente && selecionado?.id === pendente.id) {
      if (pendente.tipo === 'publicar') setPublicarAberto(true); else setImportAberto(true)
      setPendente(null)
    }
  }, [pendente, selecionado?.id])
  const abrirComDetalhe = (id: string, tipo: 'publicar' | 'importar') => {
    if (selecionado?.id === id) { if (tipo === 'publicar') setPublicarAberto(true); else setImportAberto(true); return }
    setPendente({ id, tipo }); selecionar(id)
  }
  const copiarLink = (id: string) =>
    navigator.clipboard?.writeText(`${window.location.origin}/admin/conteudos/flashcards/${id}`).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar o link.'))
  const exportarCsv = async (id: string) => {
    const r = await getBaralhoAction(id)
    if (!r.ok || !r.baralho) { toast.error(r.error || 'Não foi possível exportar.'); return }
    baixarCsvBaralho(r.baralho.nome, r.baralho.cartoes)
  }

  const columns: DataTableColumn<BaralhoLista>[] = [
    {
      key: 'nome', header: 'Baralho', sortable: true, truncate: false, title: (b) => b.nome,
      render: (b) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Layers className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0">
            <b className="block truncate text-[13.5px] leading-[1.35] text-foreground">{b.nome}</b>
            {b.descricao && <span className="block truncate text-xs leading-normal text-muted-foreground">{b.descricao}</span>}
          </div>
        </div>
      ),
    },
    { key: 'cartoes', header: 'Cartões', width: '6rem', render: (b) => <b className="text-[13px] tabular-nums text-foreground">{b.cartoes}</b> },
    { key: 'status', header: 'Situação', sortable: true, width: '8.5rem', truncate: false, render: (b) => <SituacaoBadge status={b.status} /> },
    { key: 'alcance', header: 'Acesso', width: '10rem', render: (b) => <span className="text-[12.5px] text-muted-foreground">{ACESSO_LABEL[b.alcance]}</span> },
  ]

  const rowActions = (b: BaralhoLista): DataTableRowAction[] => [
    { label: 'Abrir baralho', icon: <Layers className="h-4 w-4" />, href: `/admin/conteudos/flashcards/${b.id}` },
    { label: 'Editar baralho', icon: <Pencil className="h-4 w-4" />, href: `/admin/conteudos/flashcards/${b.id}` },
    { label: 'Adicionar cartão', icon: <Plus className="h-4 w-4" />, disabled: !podeEditar, href: `/admin/conteudos/flashcards/${b.id}?novo=1` },
    { label: 'Importar cartões (CSV)', icon: <Upload className="h-4 w-4" />, disabled: !podeEditar, onClick: () => abrirComDetalhe(b.id, 'importar') },
    b.status === 'publicado'
      ? { label: 'Despublicar', icon: <X className="h-4 w-4" />, disabled: !podeEditar, onClick: () => startRow(async () => { const r = await despublicarBaralhoAction(b.id); r.ok ? (toast.success('Baralho despublicado.'), router.refresh()) : toast.error(r.error) }) }
      : { label: 'Publicar', icon: <Check className="h-4 w-4" />, disabled: !podeEditar, onClick: () => abrirComDetalhe(b.id, 'publicar') },
    { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarLink(b.id) },
    { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, disabled: !podeEditar, onClick: () => startRow(async () => { const r = await duplicarBaralhoAction(b.id); r.ok ? (toast.success('Baralho duplicado.'), router.refresh()) : toast.error(r.error) }) },
    { label: 'Exportar CSV', icon: <Download className="h-4 w-4" />, onClick: () => { exportarCsv(b.id) } },
    {
      label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, disabled: !podeEditar,
      onClick: () => startRow(async () => {
        if (!(await confirmar({ titulo: 'Excluir baralho', mensagem: 'O baralho vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return
        const r = await excluirBaralhoAction(b.id); r.ok ? (toast.success('Baralho excluído.'), router.refresh()) : toast.error(r.error)
      }),
    },
  ]

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Flashcards" acoes={<>
        <button type="button" onClick={() => (selId ? setImportAberto(true) : toast.info('Selecione um baralho para importar os cartões.'))} disabled={!podeEditar}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl border bg-card px-3.5 text-[13px] font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-50"><Upload className="h-[15px] w-[15px]" />Importar CSV</button>
        <button type="button" onClick={() => setNovoAberto(true)} disabled={!podeEditar} style={GRAD_PRIMARY}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-50"><Plus className="h-[15px] w-[15px]" />Novo baralho</button>
      </>} />

      {aviso ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{aviso}</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Esquerda: tabela + prévia de cartões */}
          <div className="min-w-0 space-y-5">
            <p className="text-sm text-muted-foreground">Baralhos da plataforma. Publicados, aparecem para todos os alunos com acesso.</p>

            <DataTable<BaralhoLista>
              rows={rows}
              total={total}
              columns={columns}
              getRowId={(b) => b.id}
              defaultSort={{ key: 'criado_em', dir: 'desc' }}
              searchable
              searchPlaceholder="Buscar baralho…"
              rowActions={rowActions}
              onRowClick={(b) => selecionar(b.id)}
              activeRowId={selId}
              rowHeight="h-16"
              nomeSingular="baralho"
              nomePlural="baralhos"
              empty={<span className="inline-flex flex-col items-center gap-2"><Layers className="h-6 w-6 opacity-50" />Nenhum baralho ainda. Crie o primeiro em “Novo baralho”.</span>}
              bulkActions={(sel) => (
                <>
                <button type="button" disabled={sel.allMatching} className={BTN_LOTE}
                  onClick={() => { const alvos = rows.filter((r) => sel.ids.includes(r.id)); if (!alvos.length) return; navigator.clipboard?.writeText(alvos.map((r) => `${window.location.origin}/admin/conteudos/flashcards/${r.id}`).join('\n')).then(() => toast.success(`${alvos.length} link(s) copiado(s).`)).catch(() => toast.error('Não foi possível copiar.')) }}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
                {podeEditar && (
                  <button type="button" disabled={sel.allMatching} className={BTN_LOTE}
                    onClick={() => startRow(async () => {
                      let n = 0
                      for (const id of sel.ids) { const r = await duplicarBaralhoAction(id); if (r.ok) n++; else toast.error(r.error) }
                      if (n) toast.success(`${n} baralho(s) duplicado(s).`)
                      sel.clear(); router.refresh()
                    })}><Copy className="h-3.5 w-3.5" />Duplicar</button>
                )}
                <button type="button" disabled={sel.allMatching} className={BTN_LOTE}
                  onClick={() => { for (const id of sel.ids) exportarCsv(id) }}><Download className="h-3.5 w-3.5" />Exportar</button>
                {podeEditar && <button type="button" disabled={sel.allMatching}
                  title={sel.allMatching ? 'Desmarque "todos" para excluir em lote' : undefined}
                  onClick={() => startRow(async () => {
                    if (!(await confirmar({ titulo: 'Excluir baralhos', mensagem: `Mover ${sel.count} baralho(s) para a Lixeira?`, destrutivo: true, confirmar: 'Excluir' }))) return
                    let n = 0
                    for (const id of sel.ids) { const r = await excluirBaralhoAction(id); if (r.ok) n++; else toast.error(r.error) }
                    toast.success(`${n} baralho(s) excluído(s).`); sel.clear(); router.refresh()
                  })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Excluir</button>}
                </>
              )}
            />

            {/* Cartões do baralho selecionado (prévia) */}
            {selecionado && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Cartões do baralho</h2>
                  <button
                    onClick={() => router.push(`/admin/conteudos/flashcards/${selecionado.id}?novo=1`)}
                    disabled={!podeEditar}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" /> Adicionar cartão
                  </button>
                </div>
                {selecionado.cartoes.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                    Nenhum cartão. Adicione cartões ou importe um CSV (frente, verso, fonte, disciplina).
                  </div>
                ) : selecionado.cartoes.map((c, i) => (
                  <div key={c.id} className="rounded-xl border bg-card p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[2rem_1fr_1fr_2rem]">
                      <div className="text-sm font-semibold tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Frente</div>
                        <div className="text-sm font-medium text-foreground">{c.frente}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Verso</div>
                        <div className="text-sm text-foreground">{c.verso}</div>
                        {(c.fonte || c.disciplina) && <div className="mt-1.5 text-xs text-muted-foreground">{[c.fonte, c.disciplina].filter(Boolean).join(' · ')}</div>}
                      </div>
                      <div className="text-right" >
                        <CartaoMenu cartaoId={c.id} podeEditar={podeEditar} onEditar={() => router.push(`/admin/conteudos/flashcards/${selecionado.id}`)} onChanged={() => router.refresh()} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direita: painel de configuração/publicação */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            {selecionado ? (
              <PainelBaralho baralho={selecionado} podeEditar={podeEditar} onPublicar={() => setPublicarAberto(true)} onAbrir={() => router.push(`/admin/conteudos/flashcards/${selecionado.id}`)} onChanged={() => router.refresh()} onImportar={() => setImportAberto(true)} />
            ) : (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                Selecione um baralho à esquerda para ver os detalhes e publicar.
              </div>
            )}
          </div>
        </div>
      )}

      {novoAberto && <NovoBaralhoDialog onClose={() => setNovoAberto(false)} onCriado={(id) => { setNovoAberto(false); router.push(`/admin/conteudos/flashcards/${id}`) }} />}
      {publicarAberto && selecionado && <PublicarDialog baralho={selecionado} onClose={() => setPublicarAberto(false)} onPublicado={() => { setPublicarAberto(false); router.refresh() }} />}
      {importAberto && selecionado && <ImportarCartoesDialog baralho={selecionado} onClose={() => setImportAberto(false)} onImportado={() => { setImportAberto(false); router.refresh() }} />}
    </div>
  )
}

// ───────────────────────────── Badges / menus ─────────────────────────────
function SituacaoBadge({ status }: { status: 'rascunho' | 'publicado' }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      status === 'publicado' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
      {status === 'publicado' ? 'Publicado' : 'Rascunho'}
    </span>
  )
}

function BaralhoMenu({ id, podeEditar, onChanged, onAbrir }: { id: string; podeEditar: boolean; onChanged: () => void; onAbrir: () => void }) {
  const [pend, start] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Ações do baralho" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onAbrir}><Pencil className="h-4 w-4" /> Abrir baralho</DropdownMenuItem>
        <DropdownMenuItem disabled={!podeEditar || pend} onClick={() => start(async () => { const r = await duplicarBaralhoAction(id); r.ok ? (toast.success('Baralho duplicado.'), onChanged()) : toast.error(r.error) })}><Copy className="h-4 w-4" /> Duplicar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={!podeEditar || pend} onClick={() => start(async () => {
          if (!(await confirmar({ titulo: 'Excluir baralho', mensagem: 'O baralho vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return
          const r = await excluirBaralhoAction(id); r.ok ? (toast.success('Baralho excluído.'), onChanged()) : toast.error(r.error)
        })}><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CartaoMenu({ cartaoId, podeEditar, onEditar, onChanged }: { cartaoId: string; podeEditar: boolean; onEditar: () => void; onChanged: () => void }) {
  const [pend, start] = useTransition()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Ações do cartão" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground data-popup-open:bg-muted">
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEditar}><Pencil className="h-4 w-4" /> Editar no baralho</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={!podeEditar || pend} onClick={() => start(async () => {
          if (!(await confirmar({ titulo: 'Remover cartão', mensagem: 'Remover este cartão do baralho?', destrutivo: true, confirmar: 'Remover' }))) return
          const r = await removerCartaoAction(cartaoId); r.ok ? (toast.success('Cartão removido.'), onChanged()) : toast.error(r.error)
        })}><Trash2 className="h-4 w-4" /> Remover</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ───────────────────────────── Painel de detalhe ─────────────────────────────
function PainelBaralho({ baralho, podeEditar, onPublicar, onAbrir, onChanged, onImportar }: {
  baralho: BaralhoDetalhe; podeEditar: boolean; onPublicar: () => void; onAbrir: () => void; onChanged: () => void; onImportar: () => void
}) {
  const router = useRouter()
  const [nome, setNome] = useState(baralho.nome)
  const [descricao, setDescricao] = useState(baralho.descricao ?? '')
  const [alcance, setAlcance] = useState<BaralhoAlcance>(baralho.alcance)
  const [pend, start] = useTransition()

  useEffect(() => { setNome(baralho.nome); setDescricao(baralho.descricao ?? ''); setAlcance(baralho.alcance) }, [baralho.id, baralho.nome, baralho.descricao, baralho.alcance])

  const salvar = (patch: { nome?: string; descricao?: string | null; alcance?: BaralhoAlcance }) =>
    start(async () => { const r = await atualizarBaralhoAction(baralho.id, patch); if (!r.ok) toast.error(r.error); else onChanged() })

  return (
    <div className="space-y-4 rounded-[20px] border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Layers className="h-5 w-5" /></span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{baralho.nome}</div>
          <div className="text-xs text-muted-foreground">Baralho · {baralho.status === 'publicado' ? 'publicado' : 'rascunho'}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/30 p-3"><div className="text-2xl font-bold text-foreground">{baralho.totalCartoes}</div><div className="text-xs text-muted-foreground">cartões</div></div>
        <div className="rounded-xl border bg-muted/30 p-3"><div className="text-2xl font-bold text-foreground">{baralho.alunosUsando}</div><div className="text-xs text-muted-foreground">alunos usando</div></div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Configuração</div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome do baralho</span>
          <input value={nome} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} onBlur={() => nome.trim() && nome !== baralho.nome && salvar({ nome })}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
        </label>
        <label className="block">
          <span className="sr-only">Descrição</span>
          <textarea value={descricao} disabled={!podeEditar} onChange={(e) => setDescricao(e.target.value)} onBlur={() => descricao !== (baralho.descricao ?? '') && salvar({ descricao })} rows={2}
            placeholder="Descrição (opcional): o que o aluno encontra aqui dentro."
            className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
        </label>

        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Quem alcança</div>
          <div className="space-y-2">
            <RadioAlcance checked={alcance === 'todos'} disabled={!podeEditar} titulo="Todos os alunos" sub="Qualquer aluno pode adicionar o baralho à conta dele." onClick={() => { setAlcance('todos'); salvar({ alcance: 'todos' }) }} />
            <RadioAlcance checked={alcance === 'grupos'} disabled={!podeEditar} titulo="Somente grupos de acesso" sub="Só quem estiver nos grupos marcados." onClick={() => { setAlcance('grupos'); salvar({ alcance: 'grupos' }) }} />
          </div>
          {alcance === 'grupos' && <GruposSelector baralhoId={baralho.id} selecionados={baralho.grupoIds} podeEditar={podeEditar} onChanged={onChanged} />}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">O baralho nasce como rascunho. Publicar é um passo à parte: ele só chega aos alunos quando você publicar.</p>

      <div className="flex items-center gap-2">
        <button onClick={onAbrir} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
          <Pencil className="h-4 w-4" /> Abrir baralho
        </button>
        {baralho.status === 'publicado' ? (
          <button disabled={!podeEditar || pend} onClick={() => start(async () => { const r = await despublicarBaralhoAction(baralho.id); r.ok ? (toast.success('Baralho despublicado.'), onChanged()) : toast.error(r.error) })}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50">
            <X className="h-4 w-4" /> Despublicar
          </button>
        ) : (
          <button disabled={!podeEditar} onClick={onPublicar}
            className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50">
            <Check className="h-4 w-4" /> Publicar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <button disabled={!podeEditar} onClick={() => router.push(`/admin/conteudos/flashcards/${baralho.id}?novo=1`)} className={BTN_PAINEL}><Plus className="h-4 w-4" /> Adicionar cartão</button>
        <button disabled={!podeEditar} onClick={onImportar} className={BTN_PAINEL}><Upload className="h-4 w-4" /> Importar cartões (CSV)</button>
        <button disabled={!podeEditar || pend} onClick={() => start(async () => { const r = await duplicarBaralhoAction(baralho.id); if (r.ok && r.id) { toast.success('Baralho duplicado.'); router.push(`/admin/conteudos/flashcards/${r.id}`) } else toast.error(r.error) })} className={BTN_PAINEL}><Copy className="h-4 w-4" /> Duplicar</button>
        <button onClick={() => { baixarCsvBaralho(baralho.nome, baralho.cartoes) }} className={BTN_PAINEL}><Download className="h-4 w-4" /> Exportar CSV</button>
        <button disabled={!podeEditar || pend} onClick={() => start(async () => {
          if (!(await confirmar({ titulo: 'Excluir baralho', mensagem: 'O baralho vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return
          const r = await excluirBaralhoAction(baralho.id); r.ok ? (toast.success('Baralho excluído.'), router.push('/admin/conteudos/flashcards'), router.refresh()) : toast.error(r.error)
        })} className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-2.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir</button>
      </div>
    </div>
  )
}

function RadioAlcance({ checked, titulo, sub, onClick, disabled }: { checked: boolean; titulo: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn('flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:opacity-60', checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2', checked ? 'border-primary' : 'border-muted-foreground/40')}>{checked && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
      <span>
        <span className="block text-sm font-medium text-foreground">{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}

function GruposSelector({ baralhoId, selecionados, podeEditar, onChanged }: { baralhoId: string; selecionados: string[]; podeEditar: boolean; onChanged: () => void }) {
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set(selecionados))
  const [pend, start] = useTransition()
  useEffect(() => { listarGruposAction().then((r) => setGrupos(r.grupos)) }, [])
  useEffect(() => { setSel(new Set(selecionados)) }, [baralhoId, selecionados.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n)
    start(async () => { const r = await definirAlcanceGruposAction(baralhoId, [...n]); if (!r.ok) toast.error(r.error); else onChanged() })
  }
  if (grupos === null) return <div className="mt-2 text-xs text-muted-foreground">Carregando grupos…</div>
  if (!grupos.length) return <div className="mt-2 rounded-lg border border-dashed bg-muted/30 p-2 text-xs text-muted-foreground">Nenhum grupo de acesso cadastrado.</div>
  return (
    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
      {grupos.map((g) => (
        <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
          <input type="checkbox" checked={sel.has(g.id)} disabled={!podeEditar || pend} onChange={() => toggle(g.id)} className="h-4 w-4 accent-[var(--brand-primary,var(--primary))]" />
          <span className="truncate text-foreground">{g.nome}</span>
        </label>
      ))}
    </div>
  )
}

// ───────────────────────────── Modal: Novo baralho ─────────────────────────────
function NovoBaralhoDialog({ onClose, onCriado }: { onClose: () => void; onCriado: (id: string) => void }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [alcance, setAlcance] = useState<BaralhoAlcance>('todos')
  const [pend, start] = useTransition()
  const criar = () => start(async () => {
    if (!nome.trim()) { toast.error('Informe o nome do baralho.'); return }
    const r = await criarBaralhoAction({ nome, descricao, alcance })
    r.ok && r.id ? onCriado(r.id) : toast.error(r.error)
  })
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <div className="text-xs text-muted-foreground">Flashcards › Novo baralho</div>
        <DialogTitle>Novo baralho</DialogTitle>
        <div className="space-y-4 pt-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Nome do baralho</span>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: JurisClub · Setembro 2026"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Descrição (opcional)</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="O que o aluno encontra aqui dentro."
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div>
            <div className="mb-1.5 text-sm font-medium text-foreground">Quem alcança</div>
            <div className="space-y-2">
              <RadioAlcance checked={alcance === 'todos'} titulo="Todos os alunos" sub="Qualquer aluno da área pode adicionar este baralho à conta dele." onClick={() => setAlcance('todos')} />
              <RadioAlcance checked={alcance === 'grupos'} titulo="Somente grupos de acesso" sub="Só quem estiver nos grupos marcados encontra este baralho." onClick={() => setAlcance('grupos')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">O baralho nasce como rascunho. Publicar é um passo à parte: assim ele só chega aos alunos quando você disser.</p>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={criar} disabled={pend} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><ChevronRight className="h-4 w-4" /> Criar e adicionar cartões</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Modal: Publicar baralho ─────────────────────────────
export function PublicarDialog({ baralho, onClose, onPublicado }: { baralho: BaralhoDetalhe; onClose: () => void; onPublicado: () => void }) {
  const [avisar, setAvisar] = useState(false)
  const [pend, start] = useTransition()
  const publicar = () => start(async () => { const r = await publicarBaralhoAction(baralho.id, avisar); r.ok ? (toast.success('Baralho publicado.'), onPublicado()) : toast.error(r.error) })
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <div className="text-xs text-muted-foreground">Flashcards</div>
        <DialogTitle>Publicar baralho?</DialogTitle>
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Layers className="h-5 w-5" /></span>
            <div className="min-w-0"><div className="truncate font-semibold text-foreground">{baralho.nome}</div><div className="text-xs text-muted-foreground">{baralho.totalCartoes} cartões · {ACESSO_LABEL[baralho.alcance]}</div></div>
          </div>
          <LinhaInfo label="Quem passa a ver" valor={baralho.alcance === 'todos' ? 'Todos os alunos da área' : 'Somente grupos de acesso'} />
          <LinhaInfo label="Onde aparece" valor="Flashcards do aluno › Baralhos oficiais" />
          <LinhaInfo label="Depois de publicado" valor="Dá para editar; cartões novos chegam na hora" />
          <label className="flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-sm font-medium text-foreground">Avisar os alunos com uma notificação</span>
            <input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="h-4 w-4 accent-[var(--brand-primary,var(--primary))]" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={publicar} disabled={pend} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Check className="h-4 w-4" /> Publicar agora</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function LinhaInfo({ label, valor }: { label: string; valor: string }) {
  return <div className="flex items-center justify-between gap-3 border-t pt-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium text-foreground">{valor}</span></div>
}

// ───────────────────────────── Modal: Importar cartões (CSV) ─────────────────────────────
export function ImportarCartoesDialog({ baralho, onClose, onImportado }: { baralho: BaralhoDetalhe; onClose: () => void; onImportado: () => void }) {
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<LinhaImportCartao[] | null>(null)
  const [resumo, setResumo] = useState<{ total: number; validas: number; invalidas: number } | null>(null)
  const [pend, start] = useTransition()

  async function arquivoEscolhido(file: File) {
    const texto = await file.text()
    setNomeArquivo(file.name)
    const r = await analisarImportCartoesAction(texto)
    if (!r.ok) { toast.error(r.error); setLinhas([]); setResumo(null); return }
    setLinhas(r.linhas); setResumo(r.resumo)
  }
  const importar = () => start(async () => {
    if (!linhas?.length) return
    const r = await confirmarImportCartoesAction(baralho.id, linhas)
    r.ok ? (toast.success(`${r.inseridos} cartões importados.`), onImportado()) : toast.error(r.error)
  })
  const baixarModelo = () => {
    const csv = 'frente,verso,fonte,disciplina\n"Pergunta exemplo","Resposta exemplo","STF · Tema 1.412","Direito Constitucional"\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-flashcards.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="w-[min(860px,calc(100vw-2rem))] max-w-[min(860px,calc(100vw-2rem))] sm:max-w-[min(860px,calc(100vw-2rem))]">
        <div className="text-xs text-muted-foreground">Flashcards › {baralho.nome}</div>
        <DialogTitle>Importar cartões</DialogTitle>
        <p className="pt-1 text-sm text-muted-foreground">CSV com as colunas: frente, verso, fonte (opcional), disciplina (opcional). Uma linha por cartão.</p>

        {/* Arquivo */}
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
            <div className="min-w-0"><div className="truncate text-sm font-medium text-foreground">{nomeArquivo ?? 'Nenhum arquivo enviado'}</div><div className="text-xs text-muted-foreground">{nomeArquivo ? 'Arquivo carregado' : 'Escolha um .csv'}</div></div>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" /> {nomeArquivo ? 'Trocar' : 'Escolher CSV'}
            <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) arquivoEscolhido(f) }} />
          </label>
        </div>

        {/* Prévia */}
        {linhas && (
          <div className="mt-3">
            <div className="mb-2 text-sm"><span className="font-semibold text-foreground">{resumo?.total ?? 0} itens</span>{resumo?.invalidas ? <span className="text-muted-foreground"> · {resumo.invalidas} com erro (ignorados)</span> : null}</div>
            <div className="max-h-[42vh] overflow-auto rounded-xl border">
              <table className="w-full table-fixed text-sm">
                <colgroup><col style={{ width: '3.5rem' }} /><col /><col /><col style={{ width: '6rem' }} /></colgroup>
                <thead><tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2 text-left font-medium">Linha</th><th className="px-3 py-2 text-left font-medium">Frente</th><th className="px-3 py-2 text-left font-medium">Verso</th><th className="px-3 py-2 text-left font-medium">Situação</th></tr></thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.linha} className={cn('border-b last:border-0', !l.ok && 'bg-destructive/5')}>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{l.linha}</td>
                      <td className="px-3 py-2"><div className="truncate font-medium text-foreground" title={l.frente}>{l.frente || '—'}</div></td>
                      <td className="px-3 py-2"><div className="truncate text-foreground" title={l.verso}>{l.verso || '—'}</div></td>
                      <td className="px-3 py-2">{l.ok ? <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">Ok</span> : <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive" title={l.motivo}>Erro</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={baixarModelo} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Baixar modelo do CSV <ChevronRight className="h-3.5 w-3.5" /></button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
            <button onClick={importar} disabled={pend || !resumo?.validas} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Upload className="h-4 w-4" /> Importar {resumo?.validas ?? 0} cartões</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

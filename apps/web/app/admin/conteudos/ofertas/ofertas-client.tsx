'use client'

// OFERTAS › índice (Oferta.png). <EstudioHeader> (sem subtabs) + <DataTable> único, server-driven
// (busca/filtros/ordenação/paginação vêm da page) com clique-na-linha → painel de detalhe lateral.
// Sem coluna VALOR (a oferta fina só agrupa produtos para liberação; preço fica no gateway).

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Download, Search, ShoppingCart, Check, Boxes, Pencil, Trash2, ChevronRight, Link2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { DataTable, type DataTableColumn, type DataTableRowAction, type DataTableSelection } from '@/components/admin/data-table'
import type { OfertaAdmin } from '@/lib/integracoes/liberacao/ofertas'
import type { ProdutoSeletor } from '@/lib/integracoes/liberacao/dados'
import { salvarOfertaAction, excluirOfertaAction, duplicarOfertaAction } from './actions'
import { codigoOferta, acessoLabel, rotuloSituacao } from './oferta-util'
import { FiltroPillUrl, GRAD_PRIMARY, BTN_ICON, BTN_TOP, baixarCsv, copiarTexto } from '../grupos/ui-estudio'

function statusInfo(o: OfertaAdmin): { label: string; cls: string } {
  if (o.status === 'active') return { label: 'Publicada', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
  if (o.status === 'canceled') return { label: 'Cancelada', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-400' }
  return { label: 'Rascunho', cls: 'bg-muted text-muted-foreground' }
}

export function OfertasClient({ rows, total, totalGeral, produtos, podeEditar }: {
  rows: OfertaAdmin[]; total: number; totalGeral: number; produtos: ProdutoSeletor[]; podeEditar: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [pend, start] = React.useTransition()
  const [sel, setSel] = React.useState<OfertaAdmin | null>(null)
  const [novoAberto, setNovoAberto] = React.useState(false)

  // A linha ativa acompanha os dados atuais da página (após refresh/troca de página).
  const selecionada = sel ? (rows.find((o) => o.id === sel.id) ?? sel) : null
  const refresh = () => { setSel(null); router.refresh() }

  function exportar() {
    const p = new URLSearchParams()
    for (const k of ['q', 'situacao', 'acesso', 'sort', 'dir']) { const v = sp.get(k); if (v) p.set(k, v) }
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/ofertas/export${p.toString() ? `?${p}` : ''}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }

  async function excluir(o: OfertaAdmin) {
    if (!(await confirmar({ titulo: 'Excluir oferta', mensagem: `Excluir a oferta "${o.nome}"? Os acessos concedidos por ela são revogados com segurança.`, destrutivo: true, confirmar: 'Excluir' }))) return
    const r = await excluirOfertaAction(o.id)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Oferta excluída.'); refresh()
  }

  function excluirLote(s: DataTableSelection) {
    const alvos = rows.filter((r) => s.ids.includes(r.id))
    if (!alvos.length) { toast.message('Selecione uma ou mais ofertas desta página.'); return }
    confirmar({ titulo: 'Excluir ofertas', mensagem: `Excluir ${alvos.length} oferta(s)? Os acessos concedidos por elas são revogados com segurança.`, destrutivo: true, confirmar: 'Excluir' }).then((ok) => {
      if (!ok) return
      start(async () => {
        for (const o of alvos) {
          const r = await excluirOfertaAction(o.id)
          if ('error' in r) toast.error(`${o.nome}: ${r.error}`)
        }
        toast.success('Concluído.'); s.clear(); refresh()
      })
    })
  }

  const linkDe = (o: OfertaAdmin) => `${window.location.origin}/admin/conteudos/ofertas/${o.id}`

  function duplicarLote(alvos: OfertaAdmin[], limpar?: () => void) {
    if (!alvos.length) { toast.message('Selecione uma ou mais ofertas desta página.'); return }
    start(async () => {
      let ok = 0
      for (const o of alvos) {
        const r = await duplicarOfertaAction(o.id)
        if ('error' in r) toast.error(`${o.nome}: ${r.error}`); else ok++
      }
      if (ok) toast.success(ok === 1 ? 'Oferta duplicada (rascunho).' : `${ok} ofertas duplicadas (rascunho).`)
      limpar?.(); refresh()
    })
  }

  function exportarSelecionadas(alvos: OfertaAdmin[]) {
    if (!alvos.length) { toast.message('Selecione uma ou mais ofertas desta página.'); return }
    baixarCsv('ofertas_selecionadas.csv', ['Cód.', 'Nome', 'Situação', 'Acesso', 'Produtos', 'Acessos ativos'],
      alvos.map((o) => [codigoOferta(o.id), o.nome, rotuloSituacao(o.status), acessoLabel(o), o.produtoNomes.join(' | '), o.grantsAtivos]))
    toast.success(`${alvos.length} oferta(s) exportada(s).`)
  }

  const abrir = (o: OfertaAdmin) => router.push(`/admin/conteudos/ofertas/${o.id}`)

  const columns: DataTableColumn<OfertaAdmin>[] = [
    { key: 'codigo', header: 'Cód.', sortable: true, width: '5.5rem', render: (o) => <span className="tabular-nums text-muted-foreground">{codigoOferta(o.id)}</span> },
    {
      key: 'nome', header: 'Nome', sortable: true, truncate: false,
      render: (o) => (
        <div className="min-w-0">
          <b className="block truncate text-[13.5px] leading-[1.35] text-foreground">{o.nome}</b>
          {o.descricao && <span className="block truncate text-xs leading-normal text-muted-foreground">{o.descricao}</span>}
        </div>
      ),
    },
    { key: 'conteudos', header: 'Conteúdos', sortable: true, width: '7.5rem', render: (o) => <b className="text-[13px] tabular-nums text-foreground">{o.produtoIds.length}</b> },
    {
      key: 'situacao', header: 'Situação', width: '8rem', truncate: false,
      render: (o) => { const s = statusInfo(o); return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>{s.label}</span> },
    },
    { key: 'acessos', header: 'Acessos', sortable: true, width: '6.5rem', render: (o) => <b className="text-[13px] tabular-nums text-foreground">{o.grantsAtivos.toLocaleString('pt-BR')}</b> },
  ]

  const rowActions = (o: OfertaAdmin): DataTableRowAction[] => [
    { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => abrir(o) },
    { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarTexto(linkDe(o), 'Link copiado.') },
    ...(podeEditar ? [{ label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: () => duplicarLote([o]) }] : []),
    { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: () => exportarSelecionadas([o]) },
    ...(podeEditar ? [{ label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(o) }] : []),
  ]

  const acoes = (
    <>
      <button type="button" aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)" onClick={exportar} className={BTN_ICON}><Download className="h-4 w-4" /></button>
      {podeEditar && (
        <button type="button" onClick={() => setNovoAberto(true)} style={GRAD_PRIMARY}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]">
          <Plus className="h-[15px] w-[15px]" />Criar oferta
        </button>
      )}
    </>
  )

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Ofertas" acoes={acoes} />

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <DataTable<OfertaAdmin>
          rows={rows}
          total={total}
          columns={columns}
          getRowId={(o) => o.id}
          defaultSort={{ key: 'codigo', dir: 'desc' }}
          searchable
          searchPlaceholder="Pesquise pelo nome da oferta"
          filters={
            <>
              <FiltroPillUrl label="Situação" param="situacao" opcoes={[{ value: 'active', label: 'Publicada' }, { value: 'paused', label: 'Rascunho' }, { value: 'canceled', label: 'Cancelada' }]} />
              <FiltroPillUrl label="Acesso" param="acesso" opcoes={[{ value: 'vitalicio', label: 'Vitalício' }, { value: 'data', label: 'Até uma data' }]} />
            </>
          }
          rowActions={rowActions}
          onRowClick={(o) => setSel(o)}
          activeRowId={selecionada?.id ?? null}
          rowHeight="h-16"
          nomeSingular="oferta"
          nomePlural="ofertas"
          empty={
            <span className="inline-flex flex-col items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShoppingCart className="h-5 w-5" /></span>
              <b className="text-foreground">{totalGeral === 0 ? 'Nenhuma oferta ainda' : 'Nenhuma oferta encontrada'}</b>
              <span className="max-w-sm text-sm">Uma oferta junta vários produtos num combo para liberação (ex.: sprint + simulados).</span>
            </span>
          }
          bulkActions={(s) => {
            const alvos = rows.filter((r) => s.ids.includes(r.id))
            return (
              <>
                <button type="button" className={BTN_TOP} onClick={() => { if (!alvos.length) { toast.message('Selecione uma ou mais ofertas desta página.'); return } copiarTexto(alvos.map(linkDe).join('\n'), `${alvos.length} link(s) copiado(s).`) }}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
                {podeEditar && <button type="button" className={BTN_TOP} disabled={pend} onClick={() => duplicarLote(alvos, s.clear)}><Copy className="h-3.5 w-3.5" />Duplicar</button>}
                <button type="button" className={BTN_TOP} onClick={() => exportarSelecionadas(alvos)}><Download className="h-3.5 w-3.5" />Exportar</button>
                {podeEditar && (
                  <button type="button" onClick={() => excluirLote(s)} disabled={pend}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-destructive/35 bg-card px-3 text-[13px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                )}
              </>
            )
          }}
        />

        <aside className="xl:sticky xl:top-4">
          {selecionada ? (
            <PainelOferta oferta={selecionada} podeEditar={podeEditar} onAbrir={() => abrir(selecionada)} onExcluir={() => excluir(selecionada)}
              onCopiar={() => copiarTexto(linkDe(selecionada), 'Link copiado.')} onDuplicar={() => duplicarLote([selecionada])} onExportar={() => exportarSelecionadas([selecionada])} />
          ) : (
            <div className="rounded-[20px] border bg-card p-6 text-center text-sm text-muted-foreground">Clique numa oferta para ver os detalhes. Use “Abrir oferta” para editar.</div>
          )}
        </aside>
      </div>

      {novoAberto && <NovaOfertaDialog produtos={produtos} onClose={() => setNovoAberto(false)} onCriada={(id) => { setNovoAberto(false); router.push(`/admin/conteudos/ofertas/${id}`) }} />}
    </div>
  )
}

// ───────────────────────────── Painel de detalhe ─────────────────────────────
function PainelOferta({ oferta, podeEditar, onAbrir, onExcluir, onCopiar, onDuplicar, onExportar }: { oferta: OfertaAdmin; podeEditar: boolean; onAbrir: () => void; onExcluir: () => void; onCopiar: () => void; onDuplicar: () => void; onExportar: () => void }) {
  const s = statusInfo(oferta)
  return (
    <div className="space-y-4 rounded-[20px] border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ShoppingCart className="h-5 w-5" /></span>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className="font-semibold text-foreground">{oferta.nome}</div>
          <div className="text-xs text-muted-foreground">Oferta · cód. {codigoOferta(oferta.id)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4"><b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] tabular-nums text-foreground">{oferta.produtoIds.length}</b><span className="text-[12.5px] font-bold text-foreground">produtos</span></div>
        <div className="flex flex-col gap-[3px] rounded-[18px] border bg-card px-[18px] py-4"><b className="text-[26px] font-extrabold leading-tight tracking-[-0.04em] tabular-nums text-foreground">{oferta.grantsAtivos.toLocaleString('pt-BR')}</b><span className="text-[12.5px] font-bold text-foreground">acessos ativos</span></div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Informações</div>
        <LinhaInfo label="Situação" valor={<span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>{s.label}</span>} />
        <LinhaInfo label="Acesso" valor={acessoLabel(oferta)} />
        <LinhaInfo label="Descrição" valor={oferta.descricao || '—'} />
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Conteúdos · {oferta.produtoIds.length}</div>
        {oferta.produtoNomes.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhum produto nesta oferta.</div>
        ) : (
          <ul className="space-y-1">
            {oferta.produtoNomes.map((nome, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground">{nome}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <button type="button" onClick={onAbrir} style={GRAD_PRIMARY} className="col-span-2 inline-flex h-9 items-center justify-center gap-2 rounded-[11px] px-3.5 text-[13px] font-extrabold text-primary-foreground"><Pencil className="h-[15px] w-[15px]" /> Abrir oferta</button>
        <button type="button" onClick={onCopiar} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border bg-card px-2.5 text-[13px] font-bold hover:bg-muted"><Link2 className="h-4 w-4 text-primary" /> Copiar link</button>
        {podeEditar ? <button type="button" onClick={onDuplicar} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border bg-card px-2.5 text-[13px] font-bold hover:bg-muted"><Copy className="h-4 w-4 text-primary" /> Duplicar</button> : <span />}
        <button type="button" onClick={onExportar} className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border bg-card px-2.5 text-[13px] font-bold hover:bg-muted"><Download className="h-4 w-4 text-primary" /> Exportar</button>
        {podeEditar && (
          <button type="button" onClick={onExcluir} className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-[11px] border border-destructive/30 bg-card px-2.5 text-[13px] font-bold text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" /> Excluir</button>
        )}
      </div>
    </div>
  )
}

function LinhaInfo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-t py-1.5 text-sm first:border-0"><span className="shrink-0 text-muted-foreground">{label}</span><span className="truncate text-right font-medium text-foreground">{valor}</span></div>
}

// ───────────────────────────── Modal: Nova oferta ─────────────────────────────
function NovaOfertaDialog({ produtos, onClose, onCriada }: { produtos: ProdutoSeletor[]; onClose: () => void; onCriada: (id: string) => void }) {
  const [titulo, setTitulo] = React.useState('')
  const [buscaProd, setBuscaProd] = React.useState('')
  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [tempo, setTempo] = React.useState<'lifetime' | 'fixed_date'>('lifetime')
  const [dataFim, setDataFim] = React.useState('')
  const [pend, start] = React.useTransition()

  const visiveis = produtos.filter((p) => !buscaProd.trim() || p.nome.toLowerCase().includes(buscaProd.trim().toLowerCase()))
  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const criar = () => start(async () => {
    if (!titulo.trim()) { toast.error('Informe o título da oferta.'); return }
    if (!sel.size) { toast.error('Selecione ao menos um produto.'); return }
    if (tempo === 'fixed_date' && !dataFim) { toast.error('Informe a data final.'); return }
    const r = await salvarOfertaAction({
      nome: titulo, produtoIds: [...sel], publicar: false,
      fim: tempo === 'fixed_date' ? { tipo: 'fixed_date', data: dataFim } : { tipo: 'lifetime' },
    })
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Oferta criada (rascunho).')
    if (r.id) onCriada(r.id)
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <div className="text-xs text-muted-foreground">Ofertas › Nova oferta</div>
        <DialogTitle>Nova oferta</DialogTitle>
        <div className="space-y-4 pt-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Título</span>
            <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Sprint Santos + simulados com correção"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>

          <div>
            <div className="mb-1 text-sm font-medium text-foreground">Produtos da oferta</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto"
                className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1">
              {produtos.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum produto no catálogo. Cadastre produtos primeiro.</p>
              ) : visiveis.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhum produto encontrado.</p>
              ) : visiveis.map((p) => {
                const marcado = sel.has(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50">
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{marcado && <Check className="h-3 w-3" />}</span>
                    <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                    {!p.ativo && <span className="ml-auto shrink-0 text-[10px] uppercase text-muted-foreground">inativo</span>}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{sel.size} selecionado(s)</p>
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium text-foreground">Tempo de acesso</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTempo('lifetime')} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', tempo === 'lifetime' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>Vitalício</button>
              <button type="button" onClick={() => setTempo('fixed_date')} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors', tempo === 'fixed_date' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>Até uma data</button>
            </div>
            {tempo === 'fixed_date' && (
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button type="button" onClick={criar} disabled={pend} style={GRAD_PRIMARY} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-extrabold text-primary-foreground disabled:opacity-50"><ChevronRight className="h-4 w-4" /> Criar e configurar</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

// TRILHAS › índice (Trilhas.png). Lista server-driven com <DataTable> (busca, ordenação, paginação,
// seleção+lote) + painel de detalhe do selecionado (?sel). Backend-first: a página busca; aqui só interage.

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Download, Pencil, Copy, Trash2, Link2, ListOrdered, Route } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { TrilhaLista, TrilhaDetalhe, Visibilidade } from '@/lib/trilhas/trilhas'
import { criarTrilhaAction, excluirTrilhaAction, excluirTrilhasLoteAction, duplicarTrilhaAction, atualizarTrilhaAction } from './actions'

const GRAD_PRIMARY = { background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }
const BTN_LOTE = 'inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50'
const VIS_LABEL: Record<Visibilidade, string> = { publica: 'Pública', privada: 'Privada', nao_listada: 'Não listada' }

export function TrilhasClient({ rows, total, selecionado, aviso, podeEditar }: {
  rows: TrilhaLista[]; total: number; selecionado: TrilhaDetalhe | null; aviso: string | null; podeEditar: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [novoAberto, setNovoAberto] = useState(false)
  const [, start] = useTransition()
  const selId = selecionado?.id ?? null

  function exportar() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('sel'); p.delete('page'); p.delete('pp')
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/trilhas/export${p.toString() ? `?${p}` : ''}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }
  const selecionar = (id: string) => { const p = new URLSearchParams(searchParams.toString()); p.set('sel', id); router.push(`${pathname}?${p}`, { scroll: false }) }

  const columns: DataTableColumn<TrilhaLista>[] = [
    { key: 'codigo', header: 'Cód.', sortable: true, width: '5rem', render: (t) => <span className="tabular-nums text-muted-foreground">{t.codigo ?? '—'}</span> },
    {
      key: 'nome', header: 'Trilha', sortable: true, truncate: false, title: (t) => t.nome,
      render: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <BannerThumb nome={t.nome} url={t.banner_url} />
          <b className="truncate text-[13.5px] text-foreground">{t.nome}</b>
        </div>
      ),
    },
    { key: 'visibilidade', header: 'Visível', sortable: true, width: '8rem', render: (t) => <VisBadge v={t.visibilidade} /> },
    { key: 'itens', header: 'Cursos ativos', width: '8rem', render: (t) => <span className="tabular-nums text-foreground">{t.itens}</span> },
  ]

  const linkDe = (t: { id: string; slug: string | null }) => `${window.location.origin}/trilhas/${t.slug ?? t.id}`
  const copiarLink = (t: { id: string; slug: string | null }) =>
    navigator.clipboard?.writeText(linkDe(t)).then(() => toast.success('Link copiado.')).catch(() => toast.error('Não foi possível copiar o link.'))
  const copiarLinksLote = (ids: string[]) => {
    const alvos = rows.filter((r) => ids.includes(r.id))
    if (!alvos.length) { toast.message('Selecione uma ou mais trilhas desta página.'); return }
    navigator.clipboard?.writeText(alvos.map(linkDe).join('\n')).then(() => toast.success(`${alvos.length} link(s) copiado(s).`)).catch(() => toast.error('Não foi possível copiar.'))
  }
  const duplicarLote = (ids: string[], limpar: () => void) => start(async () => {
    let n = 0
    for (const id of ids) { const r = await duplicarTrilhaAction(id); if (r.ok) n++; else toast.error(r.error) }
    if (n) toast.success(`${n} trilha(s) duplicada(s).`)
    limpar(); router.refresh()
  })

  const rowActions = (t: TrilhaLista) => [
    { label: 'Editar trilha', icon: <Pencil className="h-4 w-4" />, href: `/admin/conteudos/trilhas/${t.id}` },
    { label: 'Conteúdos da trilha', icon: <ListOrdered className="h-4 w-4" />, href: `/admin/conteudos/trilhas/${t.id}?tab=conteudos` },
    { label: 'Copiar link da trilha', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarLink(t) },
    { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, disabled: !podeEditar, onClick: () => start(async () => { const r = await duplicarTrilhaAction(t.id); r.ok ? (toast.success('Trilha duplicada.'), router.refresh()) : toast.error(r.error) }) },
    { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: exportar },
    {
      label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, disabled: !podeEditar,
      onClick: () => start(async () => { if (!(await confirmar({ titulo: 'Excluir trilha', mensagem: 'A trilha vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return; const r = await excluirTrilhaAction(t.id); r.ok ? (toast.success('Trilha excluída.'), router.refresh()) : toast.error(r.error) }),
    },
  ]

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Trilhas" acoes={<>
        <button type="button" onClick={exportar} aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><Download className="h-4 w-4" /></button>
        <button type="button" onClick={() => setNovoAberto(true)} disabled={!podeEditar} style={GRAD_PRIMARY}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-50"><Plus className="h-[15px] w-[15px]" />Nova trilha</button>
      </>} />

      {aviso ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{aviso}</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <DataTable
              rows={rows}
              total={total}
              columns={columns}
              getRowId={(t) => t.id}
              defaultSort={{ key: 'codigo', dir: 'desc' }}
              defaultPerPage={5}
              searchable
              searchPlaceholder="Pesquise pelo nome da trilha…"
              nomeSingular="trilha"
              nomePlural="trilhas"
              rowHeight="h-16"
              onRowClick={(t) => selecionar(t.id)}
              activeRowId={selId}
              rowActions={rowActions}
              bulkActions={(sel) => (
                <>
                  <button type="button" onClick={() => copiarLinksLote(sel.ids)} disabled={sel.allMatching} className={BTN_LOTE}><Link2 className="h-4 w-4" /> Copiar links</button>
                  <button type="button" onClick={() => duplicarLote(sel.ids, sel.clear)} disabled={!podeEditar || sel.allMatching} className={BTN_LOTE}><Copy className="h-4 w-4" /> Duplicar</button>
                  <button type="button" onClick={exportar} className={BTN_LOTE}><Download className="h-4 w-4" /> Exportar</button>
                  <button
                    disabled={!podeEditar || sel.allMatching}
                    title={sel.allMatching ? 'Desmarque "todos" para excluir em lote' : undefined}
                    onClick={() => start(async () => {
                      if (!(await confirmar({ titulo: 'Excluir trilhas', mensagem: `Mover ${sel.count} trilha(s) para a Lixeira?`, destrutivo: true, confirmar: 'Excluir' }))) return
                      const r = await excluirTrilhasLoteAction(sel.ids); r.ok ? (toast.success(`${r.excluidos} trilha(s) excluída(s).`), sel.clear(), router.refresh()) : toast.error(r.error)
                    })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-3 py-1.5 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                  ><Trash2 className="h-4 w-4" /> Excluir</button>
                </>
              )}
              empty={<span className="inline-flex flex-col items-center gap-2"><Route className="h-6 w-6 opacity-50" /> Nenhuma trilha ainda. Crie a primeira em “Nova trilha”.</span>}
            />
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start">
            {selecionado ? <PainelTrilha trilha={selecionado} podeEditar={podeEditar} onChanged={() => router.refresh()} /> : (
              <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Selecione uma trilha à esquerda para ver os detalhes.</div>
            )}
          </div>
        </div>
      )}

      {novoAberto && <NovaTrilhaDialog onClose={() => setNovoAberto(false)} onCriada={(id) => { setNovoAberto(false); router.push(`/admin/conteudos/trilhas/${id}`) }} />}
    </div>
  )
}

function BannerThumb({ nome, url }: { nome: string; url: string | null }) {
  if (url) return <span className="h-[41px] w-[72px] shrink-0 overflow-hidden rounded-[10px] border bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="h-full w-full object-cover" /></span>
  return <span className="grid h-[41px] w-[72px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-primary/60 text-sm font-extrabold text-primary-foreground">{nome.slice(0, 1).toUpperCase()}</span>
}
function VisBadge({ v }: { v: Visibilidade }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', v === 'publica' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : v === 'privada' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400')}>{VIS_LABEL[v]}</span>
}

// ───────────────────────────── Painel de detalhe ─────────────────────────────
function PainelTrilha({ trilha, podeEditar, onChanged }: { trilha: TrilhaDetalhe; podeEditar: boolean; onChanged: () => void }) {
  const router = useRouter()
  const [, start] = useTransition()
  const salvar = (patch: Parameters<typeof atualizarTrilhaAction>[1]) => start(async () => { const r = await atualizarTrilhaAction(trilha.id, patch); if (!r.ok) toast.error(r.error); else onChanged() })

  return (
    <div className="space-y-4 rounded-[20px] border bg-card p-5">
      <div className="overflow-hidden rounded-xl border bg-muted">
        {trilha.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={trilha.banner_url} alt="" className="aspect-[16/7] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/7] w-full items-center justify-center bg-gradient-to-br from-primary to-primary/50 text-2xl font-bold text-primary-foreground">{trilha.nome}</div>
        )}
      </div>
      <div>
        <div className="font-semibold text-foreground">{trilha.nome}</div>
        <div className="text-xs text-muted-foreground">Trilha · cód. {trilha.codigo ?? '—'}</div>
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</div>
        <LinhaInfo label="Descrição" valor={trilha.descricao || '—'} />
        <LinhaInfo label="Visibilidade" valor={VIS_LABEL[trilha.visibilidade]} />
        <LinhaInfo label="Trilha anterior" valor={trilha.anteriorNome || 'Nenhuma'} />
      </div>

      <div className="space-y-2.5 border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regras</div>
        <ToggleLinha label="Bloquear ordem de conclusão" on={trilha.bloquear_ordem} disabled={!podeEditar} onToggle={(v) => salvar({ bloquear_ordem: v })} />
        <ToggleLinha label="Bloquear acesso antes de terminar a trilha" on={trilha.bloquear_acesso_anterior} disabled={!podeEditar} onToggle={(v) => salvar({ bloquear_acesso_anterior: v })} />
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conteúdos · ordenação {trilha.ordem_modo === 'data' ? 'por data' : 'manual'}</div>
          <Link href={`/admin/conteudos/trilhas/${trilha.id}?tab=conteudos`} className="text-xs font-medium text-primary hover:underline">Editar ›</Link>
        </div>
        {trilha.itensLista.length === 0 ? (
          <div className="text-xs text-muted-foreground">Nenhum conteúdo nesta trilha.</div>
        ) : (
          <ol className="space-y-1">
            {trilha.itensLista.map((it, i) => (
              <li key={it.id} className="flex items-center gap-2 text-sm">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">{i + 1}</span>
                <span className="truncate text-foreground">{it.produto_nome}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/trilhas/${trilha.slug ?? trilha.id}`); toast.success('Link copiado.') }} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted"><Link2 className="h-4 w-4" /> Copiar link da trilha</button>
        <Link href={`/admin/conteudos/trilhas/${trilha.id}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted"><Pencil className="h-4 w-4" /> Editar trilha</Link>
        <Link href={`/admin/conteudos/trilhas/${trilha.id}?tab=conteudos`} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted"><ListOrdered className="h-4 w-4" /> Conteúdos da trilha</Link>
        <button disabled={!podeEditar} onClick={() => start(async () => { const r = await duplicarTrilhaAction(trilha.id); if (r.ok && r.id) { toast.success('Trilha duplicada.'); router.push(`/admin/conteudos/trilhas/${r.id}`) } else toast.error(r.error) })} className="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-card px-2.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4" /> Duplicar</button>
        <button disabled={!podeEditar} onClick={() => start(async () => { if (!(await confirmar({ titulo: 'Excluir trilha', mensagem: 'A trilha vai para a Lixeira. Continuar?', destrutivo: true, confirmar: 'Excluir' }))) return; const r = await excluirTrilhaAction(trilha.id); r.ok ? (toast.success('Trilha excluída.'), onChanged()) : toast.error(r.error) })} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-card px-2.5 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Excluir</button>
      </div>
    </div>
  )
}

function LinhaInfo({ label, valor }: { label: string; valor: string }) {
  return <div className="flex items-start justify-between gap-3 border-t py-1.5 text-sm first:border-0"><span className="shrink-0 text-muted-foreground">{label}</span><span className="truncate text-right font-medium text-foreground">{valor}</span></div>
}
function ToggleLinha({ label, on, onToggle, disabled }: { label: string; on: boolean; onToggle: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onToggle(!on)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all', on ? 'left-[1.375rem]' : 'left-0.5')} />
      </button>
    </div>
  )
}

// ───────────────────────────── Modal: Nova trilha ─────────────────────────────
function NovaTrilhaDialog({ onClose, onCriada }: { onClose: () => void; onCriada: (id: string) => void }) {
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [visibilidade, setVisibilidade] = useState<Visibilidade>('publica')
  const [pend, start] = useTransition()
  const criar = () => start(async () => {
    if (!nome.trim()) { toast.error('Informe o nome da trilha.'); return }
    const r = await criarTrilhaAction({ nome, descricao, visibilidade })
    r.ok && r.id ? onCriada(r.id) : toast.error(r.error)
  })
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <div className="text-xs text-muted-foreground">Trilhas › Nova trilha</div>
        <DialogTitle>Nova trilha</DialogTitle>
        <div className="space-y-4 pt-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Nome da trilha</span>
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Sprint Discursiva PGM/Santos" className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Descrição (opcional)</span>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Texto da página da trilha." className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div>
            <div className="mb-1.5 text-sm font-medium text-foreground">Visibilidade</div>
            <div className="flex flex-wrap gap-2">
              {(['publica', 'privada', 'nao_listada'] as Visibilidade[]).map((v) => (
                <button key={v} type="button" onClick={() => setVisibilidade(v)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition', visibilidade === v ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted')}>{VIS_LABEL[v]}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button onClick={criar} disabled={pend} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"><Plus className="h-4 w-4" /> Criar trilha</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

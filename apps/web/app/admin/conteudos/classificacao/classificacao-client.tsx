'use client'

// CLASSIFICAÇÃO › índice (Estúdio de Conteúdo). Porte do PADRÃO do designer (Classificacao.png +
// Categoria.png) adaptado à TAXONOMIA REAL da plataforma: sub-abas Disciplinas / Assuntos / Bancas /
// Órgãos, cada uma com uma tabela MASTER (nome + usos) + um PAINEL DE DETALHE lateral rico (stats,
// "onde aparece", edição rápida) e um modal "Editar" fiel. O data layer é REUSADO (classificacao/
// actions.ts + taxonomia-actions + disciplinas-actions); aqui só a UI. Backend-first: a página busca
// (filtra/ordena/pagina no servidor) e entrega a fatia atual; o painel é client-side a partir da linha.

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  Plus, Download, Pencil, Trash2, Merge, Loader2, Layers, ListTree, Landmark, Building2,
  Check, ChevronRight, Info, MapPin, Palette, Link2, Copy, FolderInput, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { DataTable, type DataTableColumn, type DataTableSelection } from '@/components/admin/data-table'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import {
  criarItemTaxonomia, renomearItemTaxonomia, excluirItemTaxonomia, reparentarAssunto, type TipoEntidade,
} from './actions'
import { unificarTaxonomia, previewUnificacaoTax } from '@/app/admin/questoes/taxonomia-actions'
import { atualizarDisciplinaClassificacao } from '@/app/admin/questoes/disciplinas-actions'

export type AbaTax = 'disciplinas' | 'assuntos' | 'bancas' | 'orgaos'
export type ItemCadastro = { id: string; nome: string; questoes?: number; extra?: number }

type IconType = React.ComponentType<{ className?: string }>

// Metadados de cada aba: tipo-entidade (p/ as actions), rótulos, ícone e capacidades.
const ABA_INFO: Record<AbaTax, {
  tipo: TipoEntidade; singular: string; plural: string; icon: IconType
  temCor?: boolean; ehAssunto?: boolean
  statExtra?: string         // rótulo da 2ª métrica por item (só disciplina)
  ondeAparece: string        // texto "onde aparece" adaptado ao uso real
}> = {
  disciplinas: {
    tipo: 'disciplina', singular: 'disciplina', plural: 'Disciplinas', icon: Layers, temCor: true, statExtra: 'assuntos',
    ondeAparece: 'Filtro de Disciplina no Banco de Questões e nos Simulados; agrupa relatórios de desempenho e o Cronograma Adaptativo.',
  },
  assuntos: {
    tipo: 'assunto', singular: 'assunto', plural: 'Assuntos', icon: ListTree, ehAssunto: true,
    ondeAparece: 'Filtro de Assunto (dentro da disciplina) no Banco de Questões e nos relatórios de acerto por assunto.',
  },
  bancas: {
    tipo: 'banca', singular: 'banca', plural: 'Bancas', icon: Landmark,
    ondeAparece: 'Filtro de Banca no Banco de Questões e no cabeçalho do card da questão.',
  },
  orgaos: {
    tipo: 'orgao', singular: 'órgão', plural: 'Órgãos', icon: Building2,
    ondeAparece: 'Filtro de Órgão no Banco de Questões e no cabeçalho do card da questão.',
  },
}

const TABS: { aba: AbaTax; label: string; icon: IconType }[] = [
  { aba: 'disciplinas', label: 'Disciplinas', icon: Layers },
  { aba: 'assuntos', label: 'Assuntos', icon: ListTree },
  { aba: 'bancas', label: 'Bancas', icon: Landmark },
  { aba: 'orgaos', label: 'Órgãos', icon: Building2 },
]

const COR_PADRAO = '#6d28d9'

type FormState = { modo: 'criar' | 'editar'; id?: string; nome: string; disciplinaId: string; cor: string; questoes: number }

export function ClassificacaoClient({
  aba, rows, total, erro, disciplinas, corPorId, paiPorId,
}: {
  aba: AbaTax
  rows: ItemCadastro[]
  total: number
  erro: string | null
  disciplinas: { id: string; nome: string }[]
  corPorId: Record<string, string | null>
  paiPorId: Record<string, string>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const info = ABA_INFO[aba]
  const [pending, startTransition] = React.useTransition()

  // Seleção do painel (client-side): a 1ª linha da página vem aberta por padrão.
  const [selId, setSelId] = React.useState<string | null>(searchParams.get('sel'))
  const sel = React.useMemo(() => rows.find((r) => r.id === selId) ?? rows[0] ?? null, [rows, selId])

  // Modais
  const [form, setForm] = React.useState<FormState | null>(null)
  const [merge, setMerge] = React.useState<null | { ids: string[]; canonica: string; preview: number | null; limpar: () => void }>(null)
  const [mover, setMover] = React.useState<null | { ids: string[]; limpar: () => void }>(null)

  const nomeById = React.useMemo(() => new Map(rows.map((r) => [r.id, r.nome])), [rows])

  function exportar() {
    const p = new URLSearchParams({ aba })
    for (const k of ['q', 'sort', 'dir']) { const v = searchParams.get(k); if (v) p.set(k, v) }
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/classificacao/export?${p}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }
  function abrirCriar() {
    setForm({ modo: 'criar', nome: '', disciplinaId: disciplinas[0]?.id ?? '', cor: COR_PADRAO, questoes: 0 })
  }
  function abrirEditar(item: ItemCadastro) {
    setForm({
      modo: 'editar', id: item.id, nome: item.nome,
      disciplinaId: (info.ehAssunto ? paiPorId[item.id] : '') || disciplinas[0]?.id || '',
      cor: corPorId[item.id] || COR_PADRAO, questoes: item.questoes ?? 0,
    })
  }

  function salvarForm() {
    if (!form) return
    const nome = form.nome.trim()
    if (!nome) { toast.error('Informe um nome.'); return }
    if (info.ehAssunto && !form.disciplinaId) { toast.error('Escolha a disciplina do assunto.'); return }
    startTransition(async () => {
      if (form.modo === 'criar') {
        const r = await criarItemTaxonomia(info.tipo, nome, info.ehAssunto ? { disciplinaId: form.disciplinaId } : undefined)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao criar.'); return }
        toast.success(`${capitalizar(info.singular)} criada(o).`)
        if (r.id) setSelId(r.id)
      } else if (form.id) {
        const r = await renomearItemTaxonomia(info.tipo, form.id, nome)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
        if (info.temCor) await atualizarDisciplinaClassificacao(form.id, { cor: form.cor || null })
        if (info.ehAssunto && form.disciplinaId && paiPorId[form.id] !== form.disciplinaId) {
          const rp = await reparentarAssunto(form.id, form.disciplinaId)
          if (!rp.ok) { toast.error(rp.error ?? 'Erro ao mover de disciplina.'); return }
        }
        toast.success('Alterações salvas.')
      }
      setForm(null)
      router.refresh()
    })
  }

  function excluir(item: ItemCadastro) {
    startTransition(async () => {
      const ok = await confirmar({ titulo: `Excluir ${info.singular}`, mensagem: `Excluir "${item.nome}"? Esta ação não pode ser desfeita.`, destrutivo: true, confirmar: 'Excluir' })
      if (!ok) return
      const r = await excluirItemTaxonomia(info.tipo, item.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      toast.success('Excluído.')
      setForm(null)
      router.refresh()
    })
  }

  const BTN_LOTE = 'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-card px-[11px] text-[12.5px] font-bold text-foreground hover:bg-muted disabled:opacity-50'
  const linkDe = (id: string) => `${window.location.origin}/admin/conteudos/classificacao?aba=${aba}&sel=${id}`
  function copiarLinks(ids: string[]) {
    if (!ids.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    navigator.clipboard?.writeText(ids.map(linkDe).join('\n'))
      .then(() => toast.success(ids.length === 1 ? 'Link copiado.' : `${ids.length} links copiados.`)).catch(() => toast.error('Não foi possível copiar.'))
  }
  function duplicar(ids: string[], limpar?: () => void) {
    if (!ids.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    startTransition(async () => {
      let feitos = 0
      for (const id of ids) {
        const nome = nomeById.get(id)
        if (!nome) continue
        const r = await criarItemTaxonomia(info.tipo, `${nome} (cópia)`, info.ehAssunto ? { disciplinaId: paiPorId[id] } : undefined)
        if (!r.ok) { toast.error(r.error ?? 'Erro ao duplicar.'); break }
        feitos++
      }
      if (feitos) { toast.success(feitos === 1 ? 'Item duplicado.' : `${feitos} itens duplicados.`); limpar?.(); router.refresh() }
    })
  }
  function excluirLote(ids: string[], limpar: () => void) {
    if (!ids.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    startTransition(async () => {
      const ok = await confirmar({ titulo: 'Excluir', mensagem: `Excluir ${ids.length} item(ns)? Itens em uso por questões não são removidos.`, destrutivo: true, confirmar: 'Excluir' })
      if (!ok) return
      let feitos = 0
      for (const id of ids) {
        const r = await excluirItemTaxonomia(info.tipo, id)
        if (!r.ok) toast.error(`${nomeById.get(id) ?? 'Item'}: ${r.error ?? 'erro ao excluir.'}`); else feitos++
      }
      if (feitos) { toast.success(`${feitos} item(ns) excluído(s).`); limpar(); router.refresh() }
    })
  }
  /** "Ver questões deste item": reaproveita as listas filtráveis que já existem. */
  function hrefQuestoes(item: ItemCadastro): string {
    if (aba === 'disciplinas') return `/admin/questoes?disciplina=${item.id}`
    if (aba === 'bancas') return `/admin/conteudos/materiais/questoes?banca=${encodeURIComponent(item.nome)}`
    return `/admin/questoes?q=${encodeURIComponent(item.nome)}`
  }
  /** Mover: assunto → outra disciplina; demais tipos → mesclar em outro item (move as questões e remove este). */
  function abrirMover(ids: string[], limpar: () => void) {
    if (!ids.length) { toast.message('Selecione um ou mais itens desta página.'); return }
    setMover({ ids, limpar })
  }
  function confirmarMover(destinoId: string) {
    if (!mover) return
    const { ids, limpar } = mover
    if (info.ehAssunto) {
      startTransition(async () => {
        for (const id of ids) {
          const r = await reparentarAssunto(id, destinoId)
          if (!r.ok) { toast.error(r.error ?? 'Erro ao mover.'); return }
        }
        toast.success('Movido.'); limpar(); setMover(null); router.refresh()
      })
    } else {
      setMover(null)
      abrirMerge([destinoId, ...ids.filter((x) => x !== destinoId)], limpar)
    }
  }

  function abrirMerge(ids: string[], limpar: () => void) {
    if (ids.length < 2) { toast.error('Selecione ao menos 2 itens para mesclar.'); return }
    const canonica = ids[0]
    setMerge({ ids, canonica, preview: null, limpar })
    const dups = ids.filter((x) => x !== canonica)
    previewUnificacaoTax(info.tipo, dups).then((r) => setMerge((m) => (m ? { ...m, preview: r.ok ? r.questoes ?? 0 : null } : m))).catch(() => {})
  }
  function trocarCanonica(id: string) {
    setMerge((m) => {
      if (!m) return m
      const dups = m.ids.filter((x) => x !== id)
      previewUnificacaoTax(info.tipo, dups).then((r) => setMerge((mm) => (mm ? { ...mm, preview: r.ok ? r.questoes ?? 0 : null } : mm))).catch(() => {})
      return { ...m, canonica: id, preview: null }
    })
  }
  function confirmarMerge() {
    if (!merge) return
    const dups = merge.ids.filter((x) => x !== merge.canonica)
    startTransition(async () => {
      const r = await unificarTaxonomia(info.tipo, merge.canonica, dups)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao mesclar.'); return }
      toast.success(`${r.removidas ?? dups.length} item(ns) mesclado(s) · ${r.questoes ?? 0} questão(ões) atualizadas.`)
      merge.limpar()
      setMerge(null)
      router.refresh()
    })
  }

  // ── Colunas da tabela MASTER (estilo mockup: nome + usos; disciplina ganha coluna "Assuntos") ──
  const columns: DataTableColumn<ItemCadastro>[] = [
    {
      key: 'nome', header: 'Nome', sortable: true, title: (r) => r.nome,
      render: (r) => (
        <button
          type="button"
          onClick={() => setSelId(r.id)}
          className="inline-flex w-full items-center gap-2 text-left outline-none"
        >
          {info.temCor && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: corPorId[r.id] || COR_PADRAO }} />
          )}
          <span className={cn('truncate font-medium', r.id === sel?.id ? 'text-primary' : 'text-foreground')}>{r.nome}</span>
        </button>
      ),
    },
    ...(info.temCor ? ([{
      key: 'extra', header: 'Assuntos', sortable: true, align: 'right', width: '8rem',
      render: (r: ItemCadastro) => <span className="tabular-nums text-muted-foreground">{(r.extra ?? 0).toLocaleString('pt-BR')}</span>,
    }] as DataTableColumn<ItemCadastro>[]) : []),
    {
      key: 'questoes', header: 'Questões', sortable: true, align: 'right', width: '9rem',
      render: (r) => <span className="tabular-nums text-muted-foreground">{(r.questoes ?? 0).toLocaleString('pt-BR')}</span>,
    },
  ]

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader
        titulo="Classificação"
        acoes={(
          <>
            <button type="button" onClick={exportar} aria-label="Exportar planilha (XLSX)" title="Exportar planilha (XLSX)"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-card text-foreground hover:bg-muted"><Download className="h-4 w-4" /></button>
            <button type="button" onClick={abrirCriar} style={{ background: 'linear-gradient(180deg,color-mix(in oklab,var(--primary) 85%,white),var(--primary))' }}
              className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)]"><Plus className="h-[15px] w-[15px]" />Nova {info.singular}</button>
          </>
        )}
      />

      {/* Sub-abas (tab de linha / sublinhado — padrão do admin) */}
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const ativo = t.aba === aba
          const TabIcon = t.icon
          return (
            <Link
              key={t.aba}
              href={`/admin/conteudos/classificacao?aba=${t.aba}`}
              className={cn(
                '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                ativo ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )}
            >
              <TabIcon className="h-4 w-4 shrink-0" /> {t.label}
            </Link>
          )
        })}
      </div>

      {/* Master-detail: tabela à esquerda, painel de detalhe à direita */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <DataTable
            rows={rows}
            total={total}
            columns={columns}
            getRowId={(r) => r.id}
            defaultSort={{ key: 'nome', dir: 'asc' }}
            searchable
            searchPlaceholder={`Pesquise pelo nome d${info.ehAssunto ? 'o assunto' : 'a ' + info.singular}…`}
            nomeSingular={info.singular}
            nomePlural={info.plural.toLowerCase()}
            error={erro}
            rowActions={(r) => [
              { label: 'Editar', icon: <Pencil className="h-4 w-4" />, onClick: () => abrirEditar(r) },
              { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarLinks([r.id]) },
              { label: 'Ver questões deste item', icon: <Eye className="h-4 w-4" />, href: hrefQuestoes(r) },
              { label: 'Duplicar', icon: <Copy className="h-4 w-4" />, disabled: pending, onClick: () => duplicar([r.id]) },
              { label: info.ehAssunto ? 'Mover' : 'Mover (mesclar em…)', icon: <FolderInput className="h-4 w-4" />, onClick: () => abrirMover([r.id], () => {}) },
              { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: exportar },
              { label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => excluir(r) },
            ]}
            bulkActions={(s: DataTableSelection) => {
              const bloq = s.allMatching || s.ids.length === 0
              const aviso = () => toast.message('Desmarque “selecionar todos” e escolha os itens da página.')
              return (
                <>
                  <button type="button" onClick={() => (bloq ? aviso() : copiarLinks(s.ids))} className={BTN_LOTE}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
                  <button type="button" onClick={() => (bloq ? aviso() : duplicar(s.ids, s.clear))} disabled={pending} className={BTN_LOTE}><Copy className="h-3.5 w-3.5" />Duplicar</button>
                  {info.ehAssunto && <button type="button" onClick={() => (bloq ? aviso() : abrirMover(s.ids, s.clear))} className={BTN_LOTE}><FolderInput className="h-3.5 w-3.5" />Mover</button>}
                  <button
                    disabled={s.allMatching || s.ids.length < 2}
                    title={s.allMatching ? 'Desmarque "todos" para mesclar' : undefined}
                    onClick={() => abrirMerge(s.ids, s.clear)}
                    className={BTN_LOTE}
                  >
                    <Merge className="h-3.5 w-3.5" /> Mesclar {s.ids.length >= 2 ? s.ids.length : ''}
                  </button>
                  <button type="button" onClick={exportar} className={BTN_LOTE}><Download className="h-3.5 w-3.5" />Exportar</button>
                  <button type="button" onClick={() => (bloq ? aviso() : excluirLote(s.ids, s.clear))} disabled={pending}
                    className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-destructive/35 bg-card px-[11px] text-[12.5px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>
                </>
              )
            }}
          />
        </div>

        {/* Painel de detalhe */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          {sel ? (
            <PainelItem
              key={sel.id}
              aba={aba}
              item={sel}
              total={total}
              cor={corPorId[sel.id] || COR_PADRAO}
              paiId={paiPorId[sel.id] ?? null}
              disciplinas={disciplinas}
              onEditar={() => abrirEditar(sel)}
              onExcluir={() => excluir(sel)}
              onCopiarLink={() => copiarLinks([sel.id])}
              onDuplicar={() => duplicar([sel.id])}
              onMover={() => abrirMover([sel.id], () => {})}
              onExportar={exportar}
              hrefQuestoes={hrefQuestoes(sel)}
              pending={pending}
              onChanged={() => router.refresh()}
            />
          ) : (
            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              Selecione um item na tabela para ver os detalhes e editar.
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar — fiel a Categoria.png, adaptado à taxonomia real */}
      {form && (
        <EditarModal
          aba={aba}
          form={form}
          setForm={setForm}
          disciplinas={disciplinas}
          pending={pending}
          onClose={() => setForm(null)}
          onSalvar={salvarForm}
          onExcluir={form.id ? () => { const item = rows.find((r) => r.id === form.id); if (item) excluir(item) } : undefined}
        />
      )}

      {/* Mover: assunto → outra disciplina · demais → mesclar em outro item */}
      {mover && (
        <MoverDialog
          titulo={info.ehAssunto ? 'Mover para outra disciplina' : `Mover (mesclar em outra ${info.singular})`}
          rotulo={info.ehAssunto ? 'Disciplina de destino' : `Manter esta ${info.singular}`}
          ajuda={info.ehAssunto ? undefined : 'As questões dos itens movidos passam para o item escolhido e os demais são removidos (você confirma o impacto na próxima etapa).'}
          opcoes={info.ehAssunto
            ? disciplinas.filter((d) => !mover.ids.every((id) => paiPorId[id] === d.id))
            : rows.filter((r) => !(mover.ids.length === 1 && r.id === mover.ids[0])).map((r) => ({ id: r.id, nome: r.nome }))}
          pending={pending}
          onClose={() => setMover(null)}
          onConfirmar={confirmarMover}
        />
      )}

      {/* Modal mesclar (reusa a unificação já existente) */}
      <Dialog open={!!merge} onOpenChange={(o) => { if (!o) setMerge(null) }}>
        <DialogContent showCloseButton className="sm:max-w-md">
          <div className="text-xs text-muted-foreground">Classificação › {info.plural}</div>
          <DialogTitle>Mesclar {info.plural.toLowerCase()}</DialogTitle>
          <p className="pt-1 text-sm text-muted-foreground">Escolha o item a MANTER. Os demais são apagados e suas questões repontadas para ele.</p>
          {merge && (
            <div className="space-y-2 pt-3">
              {merge.ids.map((id) => (
                <label key={id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors', merge.canonica === id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
                  <input type="radio" name="canonica" checked={merge.canonica === id} onChange={() => trocarCanonica(id)} className="accent-[var(--brand-primary,var(--primary))]" />
                  <span className="flex-1 truncate text-foreground">{nomeById.get(id) ?? '(item selecionado)'}</span>
                  {merge.canonica === id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">manter</span>}
                </label>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                {merge.preview === null ? 'Calculando impacto…' : `${merge.preview.toLocaleString('pt-BR')} questão(ões) serão repontadas. Não há como desfazer (exceto disciplinas).`}
              </p>
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => setMerge(null)} className="rounded-lg border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={confirmarMerge} disabled={pending || !merge || merge.ids.length < 2} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} <Merge className="h-4 w-4" /> Mesclar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ───────────────────────────── Painel de detalhe ─────────────────────────────
function PainelItem({
  aba, item, total, cor, paiId, disciplinas, onEditar, onExcluir, onCopiarLink, onDuplicar, onMover, onExportar, hrefQuestoes, pending, onChanged,
}: {
  aba: AbaTax
  item: ItemCadastro
  total: number
  cor: string
  paiId: string | null
  disciplinas: { id: string; nome: string }[]
  onEditar: () => void
  onExcluir: () => void
  onCopiarLink: () => void
  onDuplicar: () => void
  onMover: () => void
  onExportar: () => void
  hrefQuestoes: string
  pending: boolean
  onChanged: () => void
}) {
  const info = ABA_INFO[aba]
  const Icone = info.icon
  const [nome, setNome] = React.useState(item.nome)
  const [corLocal, setCorLocal] = React.useState(cor)
  const [, start] = React.useTransition()

  React.useEffect(() => { setNome(item.nome) }, [item.id, item.nome])
  React.useEffect(() => { setCorLocal(cor) }, [item.id, cor])

  const paiNome = paiId ? (disciplinas.find((d) => d.id === paiId)?.nome ?? '—') : '—'
  const subtitulo = info.ehAssunto
    ? `Assunto · ${paiNome}`
    : `${capitalizar(info.singular)} · ${(item.questoes ?? 0).toLocaleString('pt-BR')} ${item.questoes === 1 ? 'questão' : 'questões'}`

  function salvarNome() {
    const n = nome.trim()
    if (!n || n === item.nome) { setNome(item.nome); return }
    start(async () => {
      const r = await renomearItemTaxonomia(info.tipo, item.id, n)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao renomear.'); setNome(item.nome); return }
      toast.success('Nome atualizado.')
      onChanged()
    })
  }
  function salvarCor(valor: string) {
    setCorLocal(valor)
    start(async () => {
      const r = await atualizarDisciplinaClassificacao(item.id, { cor: valor || null })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar a cor.'); return }
      onChanged()
    })
  }
  function salvarPai(disciplinaId: string) {
    if (!disciplinaId || disciplinaId === paiId) return
    start(async () => {
      const r = await reparentarAssunto(item.id, disciplinaId)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao mover de disciplina.'); return }
      toast.success('Disciplina atualizada.')
      onChanged()
    })
  }

  // 2ª métrica: disciplina → nº de assuntos; demais → total do cadastro na aba.
  const stat2Valor = info.statExtra ? (item.extra ?? 0) : total
  const stat2Label = info.statExtra ?? `${info.plural.toLowerCase()} no total`

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {info.temCor
            ? <span className="h-5 w-5 rounded-full" style={{ background: corLocal || COR_PADRAO }} />
            : <Icone className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">{item.nome}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitulo}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="text-2xl font-bold tabular-nums text-foreground">{(item.questoes ?? 0).toLocaleString('pt-BR')}</div>
          <div className="text-xs text-muted-foreground">questões</div>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <div className="text-2xl font-bold tabular-nums text-foreground">{stat2Valor.toLocaleString('pt-BR')}</div>
          <div className="text-xs text-muted-foreground">{stat2Label}</div>
        </div>
      </div>

      {/* Editar rápido */}
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Editar</div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nome d{info.ehAssunto ? 'o assunto' : 'a ' + info.singular}</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={salvarNome}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {info.temCor && (
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cor</span>
            <div className="flex items-center gap-2">
              <input type="color" value={corLocal || COR_PADRAO} onChange={(e) => salvarCor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border bg-card p-1" aria-label="Cor da disciplina" />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Palette className="h-3.5 w-3.5" /> Usada no cronograma e nos relatórios.</span>
            </div>
          </div>
        )}

        {info.ehAssunto && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Disciplina</span>
            <Select value={paiId ?? ''} onValueChange={(v) => salvarPai(v ?? '')} items={Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        )}
      </div>

      {/* Onde aparece */}
      <div className="space-y-1.5 border-t pt-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Onde aparece
        </div>
        <p className="text-sm text-muted-foreground">{info.ondeAparece}</p>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-2 gap-2 border-t pt-3">
        <Link href={hrefQuestoes} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Eye className="h-4 w-4 text-primary" /> Ver questões</Link>
        <button onClick={onCopiarLink} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Link2 className="h-4 w-4 text-primary" /> Copiar link</button>
        <button onClick={onDuplicar} disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"><Copy className="h-4 w-4 text-primary" /> Duplicar</button>
        <button onClick={onMover} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><FolderInput className="h-4 w-4 text-primary" /> Mover</button>
        <button onClick={onExportar} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"><Download className="h-4 w-4 text-primary" /> Exportar lista</button>
      </div>
      <div className="flex items-center gap-2 border-t pt-3">
        <button onClick={onEditar} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
          <Pencil className="h-4 w-4" /> Editar
        </button>
        <button onClick={onExcluir} className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-card px-3.5 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" /> Excluir
        </button>
      </div>
    </div>
  )
}

// ───────────────────────────── Modal: Editar / Nova ─────────────────────────────
// Fiel a Categoria.png (breadcrumb, título, Nome, campo contextual, caixa-aviso, rodapé com Excluir ·
// Cancelar · Salvar). Ícone/Slug do mockup são OMITIDOS — não têm par na taxonomia real.
function EditarModal({
  aba, form, setForm, disciplinas, pending, onClose, onSalvar, onExcluir,
}: {
  aba: AbaTax
  form: FormState
  setForm: (f: FormState) => void
  disciplinas: { id: string; nome: string }[]
  pending: boolean
  onClose: () => void
  onSalvar: () => void
  onExcluir?: () => void
}) {
  const info = ABA_INFO[aba]
  const editando = form.modo === 'editar'
  const outroExemplo = info.ehAssunto ? 'um assunto novo' : `uma ${info.singular} nova`

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <div className="text-xs text-muted-foreground">Classificação › {info.plural}</div>
        <DialogTitle>{editando ? `Editar ${info.singular}` : `Nova ${info.singular}`}</DialogTitle>

        <div className="space-y-4 pt-3">
          {/* Nome */}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Nome d{info.ehAssunto ? 'o assunto' : 'a ' + info.singular}</span>
            <input
              autoFocus
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') onSalvar() }}
              placeholder={`Nome d${info.ehAssunto ? 'o assunto' : 'a ' + info.singular}`}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {/* Campo contextual: Cor (disciplina) · Disciplina-pai (assunto) */}
          {info.temCor && (
            <div>
              <span className="mb-1 block text-sm font-medium text-foreground">Cor</span>
              <div className="flex items-center gap-2">
                <input type="color" value={form.cor || COR_PADRAO} onChange={(e) => setForm({ ...form, cor: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border bg-card p-1" aria-label="Cor da disciplina" />
                <span className="text-xs text-muted-foreground">Usada no cronograma e nos relatórios.</span>
              </div>
            </div>
          )}
          {info.ehAssunto && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Disciplina</span>
              <Select value={form.disciplinaId} onValueChange={(v) => setForm({ ...form, disciplinaId: v ?? '' })} items={Object.fromEntries(disciplinas.map((d) => [d.id, d.nome]))}>
                <SelectTrigger><SelectValue placeholder="Escolha a disciplina" /></SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {disciplinas.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Cadastre uma disciplina primeiro.</p>}
            </label>
          )}

          {/* Stat read-only + caixa-aviso (só na edição, como no mockup) */}
          {editando && (
            <>
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Questões classificadas</span>
                <span className="font-semibold tabular-nums text-foreground">{form.questoes.toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Renomear muda o nome em todas as <strong>{form.questoes.toLocaleString('pt-BR')}</strong> questão(ões) que usam este item.
                  Para separar, crie {outroExemplo} e reclassifique as questões no Banco. Para juntar duplicados, use <strong>Mesclar</strong>.
                </p>
              </div>
            </>
          )}
          {!editando && (
            <p className="text-xs text-muted-foreground">
              O item passa a aparecer nos filtros do Banco de Questões assim que for criado.
            </p>
          )}
        </div>

        {/* Rodapé */}
        <div className="mt-4 flex items-center justify-between gap-2">
          {editando && onExcluir ? (
            <button onClick={onExcluir} className="inline-flex items-center gap-1 text-sm font-medium text-destructive hover:underline">
              Excluir {info.singular} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
            <button onClick={onSalvar} disabled={pending || (info.ehAssunto && disciplinas.length === 0)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar {info.singular}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ───────────────────────────── Modal: Mover ─────────────────────────────
function MoverDialog({ titulo, rotulo, ajuda, opcoes, pending, onClose, onConfirmar }: {
  titulo: string; rotulo: string; ajuda?: string; opcoes: { id: string; nome: string }[]; pending: boolean
  onClose: () => void; onConfirmar: (destinoId: string) => void
}) {
  const [destino, setDestino] = React.useState('')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{titulo}</DialogTitle>
        <div className="space-y-1.5 pt-3">
          <span className="block text-sm font-medium text-foreground">{rotulo}</span>
          <Select value={destino} onValueChange={(v) => setDestino(v ?? '')} items={Object.fromEntries(opcoes.map((o) => [o.id, o.nome]))}>
            <SelectTrigger><SelectValue placeholder="Escolha o destino" /></SelectTrigger>
            <SelectContent>
              {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {opcoes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum destino disponível nesta página.</p>}
          {ajuda && <p className="pt-1 text-xs text-muted-foreground">{ajuda}</p>}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted">Cancelar</button>
          <button onClick={() => destino && onConfirmar(destino)} disabled={!destino || pending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Continuar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function capitalizar(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

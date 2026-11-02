'use client'

// GRUPOS DE ACESSO (aba principal do Estúdio): <EstudioHeader> (sem subtabs) + <DataTable> único,
// server-driven (busca/ordenação/paginação/filtro de origem vêm da page via querystring).

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Pencil, Users, Trash2, FolderKanban, KeyRound, Link2, Copy, FolderInput, Download } from 'lucide-react'
import { DataTable, type DataTableSelection } from '@/components/admin/data-table'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { criarGrupo, excluirGrupo, moverGrupo } from '@/app/admin/grupos/actions'
import { duplicarGrupo, exportarMembrosCsv, listarPastasGrupo } from './actions'
import { FiltroPillUrl, GRAD_PRIMARY, BTN_TOP, copiarTexto } from './ui-estudio'

export type GrupoLinha = {
  id: string
  nome: string
  cor: string | null
  isMestre: boolean
  membros: number
  origem: 'guru' | 'curseduca' | null
}

function OrigemBadge({ origem }: { origem: GrupoLinha['origem'] }) {
  if (!origem) return <span className="text-muted-foreground">Manual</span>
  const label = origem === 'guru' ? 'Guru' : 'Curseduca'
  return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{label}</span>
}

export function GruposListaClient({ rows, total, podeEditar }: { rows: GrupoLinha[]; total: number; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, startTransition] = React.useTransition()
  const [mover, setMover] = React.useState<GrupoLinha[] | null>(null)

  async function novoGrupo() {
    const nome = await pedirTexto({ titulo: 'Novo grupo de acesso', label: 'Nome do grupo', placeholder: 'Ex.: Passaporte Vitalício 2026' })
    if (!nome) return
    const r = await criarGrupo(nome)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao criar grupo.'); return }
    toast.success('Grupo criado.')
    if (r.id) router.push(`/admin/conteudos/grupos/${r.id}`)
    else startTransition(() => router.refresh())
  }

  async function removerGrupo(g: GrupoLinha) {
    if (!(await confirmar({ mensagem: `Excluir o grupo "${g.nome}"? Os alunos não são apagados; apenas o grupo e seus vínculos saem.`, destrutivo: true }))) return
    const r = await excluirGrupo(g.id)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao excluir.'); return }
    toast.success('Grupo excluído.')
    startTransition(() => router.refresh())
  }

  const linkDe = (g: GrupoLinha) => `${window.location.origin}/admin/conteudos/grupos/${g.id}`
  const alvosDe = (s: DataTableSelection) => rows.filter((r) => s.ids.includes(r.id))

  async function duplicar(alvos: GrupoLinha[], limpar?: () => void) {
    if (!alvos.length) { toast.message('Selecione um ou mais grupos desta página.'); return }
    let ok = 0
    for (const g of alvos) {
      const r = await duplicarGrupo(g.id)
      if (!r.ok) toast.error(`${g.nome}: ${r.error ?? 'falha ao duplicar.'}`); else ok++
    }
    if (ok) toast.success(ok === 1 ? 'Grupo duplicado (com os membros).' : `${ok} grupos duplicados.`)
    limpar?.()
    startTransition(() => router.refresh())
  }

  async function exportar(alvos: GrupoLinha[]) {
    if (!alvos.length) { toast.message('Selecione um ou mais grupos desta página.'); return }
    for (const g of alvos) {
      const r = await exportarMembrosCsv(g.id)
      if (!r.ok || !r.csv) { toast.error(`${g.nome}: ${r.error ?? 'falha ao exportar.'}`); continue }
      const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a'); a.href = url; a.download = r.filename ?? 'membros.csv'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
    toast.success('Exportação dos membros gerada.')
  }

  async function excluirLote(s: DataTableSelection) {
    const alvos = alvosDe(s)
    if (!alvos.length) { toast.message('Selecione um ou mais grupos desta página.'); return }
    if (!(await confirmar({ titulo: 'Excluir grupos', mensagem: `Excluir ${alvos.length} grupo(s)? Os alunos não são apagados; apenas os grupos e seus vínculos saem.`, destrutivo: true, confirmar: 'Excluir' }))) return
    for (const g of alvos) { const r = await excluirGrupo(g.id); if (!r.ok) toast.error(`${g.nome}: ${r.error ?? 'falha.'}`) }
    toast.success('Concluído.'); s.clear()
    startTransition(() => router.refresh())
  }

  const acoes = podeEditar ? (
    <button type="button" onClick={novoGrupo} disabled={pend} style={GRAD_PRIMARY}
      className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-60">
      <Plus className="h-[15px] w-[15px]" />Novo grupo
    </button>
  ) : null

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <EstudioHeader titulo="Grupos de acesso" acoes={acoes} />

      <DataTable<GrupoLinha>
        rows={rows}
        total={total}
        getRowId={(r) => r.id}
        defaultSort={{ key: 'nome', dir: 'asc' }}
        searchable
        searchPlaceholder="Buscar grupo…"
        filters={
          <FiltroPillUrl label="Origem" param="origem" opcoes={[
            { value: 'manual', label: 'Manual' }, { value: 'guru', label: 'Guru' }, { value: 'curseduca', label: 'Curseduca' },
          ]} />
        }
        onRowClick={(r) => router.push(`/admin/conteudos/grupos/${r.id}`)}
        rowHeight="h-14"
        nomeSingular="grupo"
        nomePlural="grupos"
        columns={[
          {
            key: 'nome', header: 'Grupo', sortable: true,
            render: (r) => (
              <Link href={`/admin/conteudos/grupos/${r.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2.5 font-bold text-foreground hover:text-primary hover:underline">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: r.cor ? `color-mix(in oklch, ${r.cor} 18%, transparent)` : 'color-mix(in oklab, var(--primary) 10%, transparent)' }}>
                  {r.isMestre ? <FolderKanban className="h-4 w-4 text-muted-foreground" /> : <KeyRound className="h-4 w-4 text-primary" />}
                </span>
                <span className="truncate">{r.nome}</span>
                {r.isMestre && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Pasta</span>}
              </Link>
            ),
            title: (r) => r.nome,
          },
          { key: 'membros', header: 'Membros', sortable: true, width: '8rem', align: 'right', render: (r) => <span className="tabular-nums text-muted-foreground">{r.membros.toLocaleString('pt-BR')}</span> },
          { key: 'origem', header: 'Origem', width: '10rem', render: (r) => <OrigemBadge origem={r.origem} /> },
        ]}
        rowActions={(r) => [
          { label: 'Editar', icon: <Pencil className="h-4 w-4" />, href: `/admin/conteudos/grupos/${r.id}` },
          { label: 'Membros', icon: <Users className="h-4 w-4" />, href: `/admin/conteudos/grupos/${r.id}?tab=membros` },
          { label: 'Copiar link', icon: <Link2 className="h-4 w-4" />, onClick: () => copiarTexto(linkDe(r), 'Link copiado.') },
          ...(podeEditar ? [{ label: 'Duplicar', icon: <Copy className="h-4 w-4" />, onClick: () => duplicar([r]) }] : []),
          ...(podeEditar ? [{ label: 'Mover', icon: <FolderInput className="h-4 w-4" />, onClick: () => setMover([r]) }] : []),
          { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: () => exportar([r]) },
          ...(podeEditar ? [{ label: 'Excluir', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => removerGrupo(r) }] : []),
        ]}
        bulkActions={(s) => (
          <>
            <button type="button" className={BTN_TOP} onClick={() => { const a = alvosDe(s); if (!a.length) { toast.message('Selecione um ou mais grupos desta página.'); return } copiarTexto(a.map(linkDe).join('\n'), `${a.length} link(s) copiado(s).`) }}><Link2 className="h-3.5 w-3.5" />Copiar links</button>
            {podeEditar && <button type="button" className={BTN_TOP} onClick={() => duplicar(alvosDe(s), s.clear)}><Copy className="h-3.5 w-3.5" />Duplicar</button>}
            {podeEditar && <button type="button" className={BTN_TOP} onClick={() => { const a = alvosDe(s); if (a.length) setMover(a); else toast.message('Selecione um ou mais grupos desta página.') }}><FolderInput className="h-3.5 w-3.5" />Mover</button>}
            <button type="button" className={BTN_TOP} onClick={() => exportar(alvosDe(s))}><Download className="h-3.5 w-3.5" />Exportar</button>
            {podeEditar && <button type="button" onClick={() => excluirLote(s)} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-destructive/35 bg-card px-3 text-[13px] font-bold text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</button>}
          </>
        )}
      />

      {mover && <MoverGrupoDialog alvos={mover} onClose={() => setMover(null)} onMovido={() => { setMover(null); startTransition(() => router.refresh()) }} />}
    </div>
  )
}

/** Mover grupo(s) para uma pasta (grupo mestre) ou soltar na raiz. Reusa `moverGrupo`. */
function MoverGrupoDialog({ alvos, onClose, onMovido }: { alvos: GrupoLinha[]; onClose: () => void; onMovido: () => void }) {
  const [pastas, setPastas] = React.useState<{ id: string; nome: string }[] | null>(null)
  const [destino, setDestino] = React.useState<string>('')
  const [pend, setPend] = React.useState(false)
  React.useEffect(() => {
    let vivo = true
    listarPastasGrupo().then((r) => { if (!vivo) return; if (!r.ok) toast.error(r.error ?? 'Falha ao listar pastas.'); setPastas((r.itens ?? []).filter((p) => !alvos.some((a) => a.id === p.id))) })
    return () => { vivo = false }
  }, [alvos])
  async function confirmarMover() {
    setPend(true)
    let erros = 0
    for (const g of alvos) { const r = await moverGrupo(g.id, destino || null); if (!r.ok) { erros++; toast.error(`${g.nome}: ${r.error ?? 'falha ao mover.'}`) } }
    setPend(false)
    if (erros < alvos.length) { toast.success('Movido.'); onMovido() }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-sm">
        <DialogTitle>Mover para outra pasta</DialogTitle>
        <p className="text-sm text-muted-foreground">{alvos.length === 1 ? `“${alvos[0].nome}”` : `${alvos.length} grupos`}: escolha a pasta de destino.</p>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-1">
          <button type="button" onClick={() => setDestino('')} className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted ${destino === '' ? 'bg-primary/10 font-semibold text-primary' : ''}`}>Raiz (sem pasta)</button>
          {pastas === null ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">Carregando…</p> : pastas.length === 0 ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma pasta de grupos criada.</p> : pastas.map((p) => (
            <button key={p.id} type="button" onClick={() => setDestino(p.id)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted ${destino === p.id ? 'bg-primary/10 font-semibold text-primary' : ''}`}><FolderKanban className="h-4 w-4 shrink-0" /><span className="truncate">{p.nome}</span></button>
          ))}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button type="button" onClick={confirmarMover} disabled={pend} style={GRAD_PRIMARY} className="rounded-lg px-3.5 py-2 text-sm font-extrabold text-primary-foreground disabled:opacity-50">Mover</button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

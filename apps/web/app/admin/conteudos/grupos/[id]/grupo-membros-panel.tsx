'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Download, CalendarClock, Trash2, X, ChevronRight, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableSelection } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { formatBrt } from '@/lib/brt'
import { adicionarMembros, importarMembros, removerMembro, buscarNaoMembros } from '@/app/admin/grupos/actions'
import { definirValidadeMembros } from '@/app/admin/conteudos/grupos/actions'
import { FiltroPillUrl, GRAD_PRIMARY, baixarCsv } from '../ui-estudio'
import type { MembroLinha } from './grupo-editar-client'

function situacao(expiraEm: string | null): { label: string; cls: string } {
  if (!expiraEm) return { label: 'Vitalício', cls: 'bg-muted text-muted-foreground' }
  const t = +new Date(expiraEm)
  if (isNaN(t)) return { label: 'Vitalício', cls: 'bg-muted text-muted-foreground' }
  if (t > Date.now()) return { label: `Até ${formatBrt(expiraEm)}`, cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' }
  return { label: 'Expirado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' }
}

const SITUACAO_OPCOES = [
  { value: 'vitalicio', label: 'Vitalício' },
  { value: 'ativo', label: 'Ativo (com validade)' },
  { value: 'expirado', label: 'Expirado' },
]
const ENTROU_OPCOES = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
]

export function GrupoMembrosPanel({
  grupoId, podeEditar, membros, totalFiltrado, totalGrupo,
}: { grupoId: string; podeEditar: boolean; membros: MembroLinha[]; totalFiltrado: number; totalGrupo: number }) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()
  const [email, setEmail] = React.useState('')
  const [addPend, setAddPend] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [validadeAlvo, setValidadeAlvo] = React.useState<{ ids: string[] } | null>(null)

  const refresh = () => startTransition(() => router.refresh())

  async function adicionarPorEmail() {
    const e = email.trim().toLowerCase()
    if (!e) return
    if (!e.includes('@')) { toast.error('Informe um e-mail válido.'); return }
    setAddPend(true)
    const busca = await buscarNaoMembros(grupoId, e, 5)
    if (!busca.ok || !busca.itens) { setAddPend(false); toast.error(busca.error ?? 'Falha na busca.'); return }
    const match = busca.itens.find((i) => (i.email ?? '').toLowerCase() === e)
    if (!match) { setAddPend(false); toast.error('Nenhum aluno não-membro com esse e-mail. Cadastre o aluno antes.'); return }
    const r = await adicionarMembros(grupoId, [match.id])
    setAddPend(false)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao adicionar.'); return }
    setEmail('')
    toast.success(`${match.nome} adicionado(a).`)
    refresh()
  }

  async function importar(file: File) {
    const fd = new FormData()
    fd.set('grupoId', grupoId)
    fd.set('arquivo', file)
    const r = await importarMembros(fd)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao importar.'); return }
    const naoEnc = r.naoEncontrados?.length ?? 0
    toast.success(`${r.adicionados ?? 0} adicionado(s)${r.jaEram ? ` · ${r.jaEram} já eram membro(s)` : ''}${naoEnc ? ` · ${naoEnc} não encontrado(s)` : ''}.`)
    refresh()
  }

  const sp = useSearchParams()
  function exportar() {
    const p = new URLSearchParams()
    for (const k of ['q', 'situacao', 'entrou', 'sort', 'dir']) { const v = sp.get(k); if (v) p.set(k, v) }
    p.set('grupo', grupoId)
    const a = document.createElement('a')
    a.href = `/api/admin/conteudos/grupos/export?${p}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message('Gerando a planilha…')
  }

  async function removerLote(sel: DataTableSelection) {
    if (sel.allMatching) { toast.error('Para remover em lote, marque as linhas individualmente (evita remoção acidental de todos).'); return }
    if (!sel.ids.length) return
    if (!(await confirmar({ mensagem: `Remover ${sel.ids.length} membro(s) do grupo? Os alunos não são apagados.`, destrutivo: true }))) return
    let erros = 0
    for (const id of sel.ids) { const r = await removerMembro(grupoId, id); if (!r.ok) erros++ }
    sel.clear()
    if (erros) toast.error(`${erros} falha(s) ao remover.`)
    else toast.success('Membros removidos.')
    refresh()
  }

  /** Exporta (CSV) só os membros informados (linha ⋮ ou seleção em lote). */
  function exportarSelecionados(lista: MembroLinha[]) {
    if (!lista.length) { toast.message('Selecione um ou mais membros desta página.'); return }
    baixarCsv('membros_selecionados.csv', ['Nome', 'E-mail', 'Classificação', 'Situação', 'Validade', 'Entrou em'],
      lista.map((m) => [m.nome, m.email, m.classificacao, situacao(m.expiraEm).label.startsWith('Até') ? 'Ativo' : situacao(m.expiraEm).label, m.expiraEm ? formatBrt(m.expiraEm) : '', formatBrt(m.entrouEm)]))
    toast.success(`${lista.length} membro(s) exportado(s).`)
  }

  /** Enviar e-mail: abre o cliente de e-mail com os destinatários em cópia oculta. */
  function enviarEmail(lista: MembroLinha[]) {
    const emails = [...new Set(lista.map((m) => (m.email ?? '').trim()).filter((e) => e.includes('@')))]
    if (!emails.length) { toast.error('Nenhum dos membros selecionados tem e-mail cadastrado.'); return }
    const a = document.createElement('a')
    a.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}`
    document.body.appendChild(a); a.click(); a.remove()
    toast.message(`E-mail aberto para ${emails.length} destinatário(s).`)
  }

  const selecionados = (sel: DataTableSelection) => membros.filter((m) => sel.ids.includes(m.id))

  async function removerUm(m: MembroLinha) {
    if (!(await confirmar({ mensagem: `Remover ${m.nome} do grupo?`, destrutivo: true }))) return
    const r = await removerMembro(grupoId, m.id)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao remover.'); return }
    toast.success('Membro removido.')
    refresh()
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Tabela de membros */}
      <div className="space-y-2">
        <DataTable<MembroLinha>
          rows={membros}
          total={totalFiltrado}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'nome', dir: 'asc' }}
          searchable
          searchPlaceholder="Buscar por nome ou e-mail"
          filters={<><FiltroPillUrl label="Situação" param="situacao" opcoes={SITUACAO_OPCOES} /><FiltroPillUrl label="Entrou em" param="entrou" opcoes={ENTROU_OPCOES} /></>}
          rowHeight="h-[72px]"
          selectable={podeEditar}
          nomeSingular="membro"
          nomePlural="membros"
          empty={<span>Nenhum membro{totalGrupo > 0 ? ' com esse filtro' : ' ainda'}.</span>}
          columns={[
            {
              key: 'nome', header: 'Membro', sortable: true,
              render: (r) => (
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.nome}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.email ?? '—'}</div>
                </div>
              ),
              title: (r) => `${r.nome} · ${r.email ?? ''}`,
            },
            { key: 'entrou', header: 'Entrou em', sortable: true, width: '11rem', render: (r) => <span className="text-muted-foreground">{formatBrt(r.entrouEm) ?? '—'}</span> },
            {
              key: 'situacao', header: 'Situação', sortable: true, width: '11rem',
              render: (r) => { const s = situacao(r.expiraEm); return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span> },
            },
          ]}
          rowActions={podeEditar ? (r) => [
            { label: 'Mudar validade', icon: <CalendarClock className="h-4 w-4" />, onClick: () => setValidadeAlvo({ ids: [r.id] }) },
            { label: 'Enviar e-mail', icon: <Mail className="h-4 w-4" />, onClick: () => enviarEmail([r]) },
            { label: 'Exportar', icon: <Download className="h-4 w-4" />, onClick: () => exportarSelecionados([r]) },
            { label: 'Remover do grupo', icon: <Trash2 className="h-4 w-4" />, destructive: true, separatorBefore: true, onClick: () => removerUm(r) },
          ] : undefined}
          bulkActions={podeEditar ? (sel) => (
            <>
              <Button size="sm" variant="outline" onClick={() => { if (sel.allMatching) { toast.error('Marque linhas individualmente para mudar validade.'); return } setValidadeAlvo({ ids: sel.ids }) }}>
                <CalendarClock className="h-4 w-4" /> Mudar validade
              </Button>
              <Button size="sm" variant="outline" onClick={() => { if (sel.allMatching) { toast.error('Marque linhas individualmente para enviar e-mail.'); return } enviarEmail(selecionados(sel)) }}>
                <Mail className="h-4 w-4" /> Enviar e-mail
              </Button>
              <Button size="sm" variant="outline" onClick={() => { if (sel.allMatching) { exportar(); return } exportarSelecionados(selecionados(sel)) }}>
                <Download className="h-4 w-4" /> Exportar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => removerLote(sel)}>
                <Trash2 className="h-4 w-4" /> Remover do grupo
              </Button>
            </>
          ) : undefined}
        />
        <p className="text-xs text-muted-foreground">Lista de membros do grupo. O grupo tem {totalGrupo.toLocaleString('pt-BR')} membro(s).</p>
      </div>

      {/* Painel lateral (único card): Adicionar + Ações em lote */}
      <aside className="h-fit space-y-5 rounded-2xl border bg-card p-5">
        {podeEditar && (
          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Adicionar membros</p>
            <div className="flex h-11 items-center rounded-xl border bg-background px-3.5 transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarPorEmail() } }}
                placeholder="E-mail do aluno"
                className="w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button type="button" onClick={adicionarPorEmail} disabled={addPend} style={GRAD_PRIMARY}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13px] font-extrabold text-primary-foreground shadow-[0_8px_18px_-8px_var(--primary)] disabled:opacity-60">
              <Plus className="h-[15px] w-[15px]" />Adicionar
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Importar lista (CSV) <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }} />
          </div>
        )}

        <div className="space-y-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-muted-foreground">Exportar</p>
          <GradeBtn icon={<Download className="h-4 w-4" />} label="Exportar planilha (XLSX)" onClick={exportar} />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Exporta os membros com a busca e os filtros atuais. Para remover ou mudar a validade em lote, marque as linhas na tabela — as ações aparecem na barra de seleção.
          </p>
        </div>
      </aside>

      {validadeAlvo && (
        <ValidadeModal
          qtd={validadeAlvo.ids.length}
          onClose={() => setValidadeAlvo(null)}
          onConfirm={async (iso) => {
            const r = await definirValidadeMembros(grupoId, validadeAlvo.ids, iso)
            if (!r.ok) { toast.error(r.error ?? 'Falha ao atualizar validade.'); return }
            toast.success(`Validade atualizada para ${r.atualizados ?? 0} membro(s).`)
            setValidadeAlvo(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

/** Botão da grade "Ações em lote" (porte fiel do mockup: 2×2, ícone em primary). */
function GradeBtn({ icon, label, onClick, disabled, title }: {
  icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn('inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50')}
    >
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </button>
  )
}

/** Modal "Mudar validade": data (BRT) ou remover validade. */
function ValidadeModal({ qtd, onClose, onConfirm }: { qtd: number; onClose: () => void; onConfirm: (iso: string | null) => Promise<void> }) {
  const [data, setData] = React.useState('')
  const [salvando, setSalvando] = React.useState(false)

  async function confirmar(iso: string | null) {
    setSalvando(true); await onConfirm(iso); setSalvando(false)
  }
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-page" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="animate-pop relative w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="h-4 w-4" /></span>
            <h3 className="text-sm font-semibold">Mudar validade</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">Define até quando {qtd} membro(s) ficam no grupo. Deixe em branco para remover a validade (vitalício).</p>
          <label className="block text-xs font-medium text-muted-foreground">Acesso até (data)</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="flex items-center justify-between gap-2 pt-2">
            <button type="button" onClick={() => confirmar(null)} disabled={salvando}
              className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
              Remover validade
            </button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
              <Button size="sm" disabled={salvando || !data} onClick={() => confirmar(data ? new Date(`${data}T23:59:59-03:00`).toISOString() : null)}>Salvar</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

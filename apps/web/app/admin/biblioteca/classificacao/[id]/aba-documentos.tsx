'use client'

// ABA "DOCUMENTOS": documentos cuja classificação EFETIVA é esta (própria no documento ou herdada da pasta). Lista paginada no
// servidor (SQL + count(*) OVER()); aqui só exibe e dispara o lote ("remover" tira a classificação própria; "trocar" define outra).

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Replace, XCircle } from 'lucide-react'
import { DataTable, type DataTableColumn, type DataTableSelection } from '@/components/admin/data-table'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { navProgressStart } from '@/lib/nav-progress'
import { cn } from '@/lib/utils'
import { ORIGENS_DOC, ROTULO_ORIGEM_DOC, origemDocValida } from '@/lib/conteudo/classificacao/detalhe'
import type { LinhaDocClasse, ListaDocsClasse } from '@/lib/conteudo/classificacao/detalhe-server'
import { SELECT_CLS, Selo, api, apiDetalhe } from '../classificacao-comuns'

export function AbaDocumentos({ dados, classId, nome, outras, podeEditar, pp }: {
  dados: ListaDocsClasse; classId: string; nome: string; outras: { id: string; nome: string; ativo: boolean }[]; podeEditar: boolean; pp: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const origem = origemDocValida(sp.get('origem'))
  const [trocar, setTrocar] = useState<DataTableSelection | null>(null)

  const ir = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString()); mut(p); p.delete('page')
    navProgressStart(); router.push(`${pathname}?${p}`)
  }
  const alvo = (sel: DataTableSelection) => (sel.allMatching ? { filtro: { origem, q: sp.get('q') || undefined, pastaId: sp.get('pasta') || undefined } } : { ids: sel.ids })

  async function remover(sel: DataTableSelection) {
    if (!(await confirmar({ titulo: 'Remover classificação', mensagem: `Tirar "${nome}" de ${sel.count} documento(s)? Os que estiverem em pasta com classificação passam a herdá-la; os demais ficam sem classificação. Só atinge os que a têm definida diretamente.`, confirmar: 'Remover', destrutivo: true }))) return
    const r = await api('POST', apiDetalhe(classId), { acao: 'remover-docs', ...alvo(sel) })
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível remover.')
    toast.success(`${r.data.alterados} documento(s) sem a classificação própria${r.data.ignorados ? ` (${r.data.ignorados} herdavam da pasta e foram ignorados)` : ''}.`)
    sel.clear(); router.refresh()
  }

  const colunas: DataTableColumn<LinhaDocClasse>[] = [
    { key: 'titulo', header: 'Documento', sortable: true, width: '26rem',
      render: (l) => <Link href={`/admin/biblioteca/conteudo/${l.id}/gerenciar`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{l.titulo}</Link>, title: (l) => l.titulo },
    { key: 'pasta', header: 'Pasta', sortable: true, width: '16rem', render: (l) => <span className="text-muted-foreground">{l.pastaNome ?? '—'}</span> },
    { key: 'origem', header: 'Origem', width: '14rem',
      render: (l) => l.origem === 'definida'
        ? <Selo cls="bg-primary/15 text-primary" title="Definida diretamente no documento">Definida</Selo>
        : <span className="inline-flex items-center gap-1.5"><Selo cls="bg-muted text-muted-foreground">Herdada</Selo><span className="truncate text-[11.5px] text-muted-foreground">de {l.herdadaDe ?? 'pasta'}</span></span> },
    { key: 'paginas', header: 'Páginas', sortable: true, width: '7rem', align: 'right', render: (l) => <span className="tabular-nums">{l.paginas ?? '—'}</span> },
    { key: 'partes', header: 'Partes', width: '6rem', align: 'right', render: (l) => <span className="tabular-nums text-muted-foreground">{l.nPartes ?? '—'}</span> },
    { key: 'status', header: 'Status', width: '8rem', render: (l) => <span className="text-muted-foreground">{l.status ?? '—'}</span> },
  ]

  return (
    <div className="w-full space-y-4">
      {dados.migracaoPendente && <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Aplique as migrations 16 e 17 (classificação) para listar documentos.</div>}
      {dados.erro && <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{dados.erro}</div>}
      {dados.semSql && !dados.erro && <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Sem acesso SQL direto: páginas e documentos herdados ficam indisponíveis.</div>}
      <DataTable
        rows={dados.linhas}
        total={dados.total}
        columns={colunas}
        getRowId={(l) => l.id}
        defaultSort={{ key: 'titulo', dir: 'asc' }}
        perPageOptions={[10, 25, 50, 100]}
        defaultPerPage={pp}
        searchable
        searchPlaceholder="Buscar documento pelo título…"
        nomeSingular="documento"
        nomePlural="documentos"
        selectable={podeEditar}
        redimensionavel
        filters={(
          <>
          {sp.get('pasta') && <button type="button" onClick={() => ir((p) => p.delete('pasta'))} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-primary/10 px-3 text-sm font-medium text-primary hover:bg-primary/15" title="Remover o filtro de pasta">Pasta selecionada · limpar</button>}
          <select aria-label="Filtrar origem" className={SELECT_CLS} value={origem} onChange={(e) => ir((p) => { e.target.value === 'todas' ? p.delete('origem') : p.set('origem', e.target.value) })}>
            {ORIGENS_DOC.map((o) => <option key={o} value={o}>{ROTULO_ORIGEM_DOC[o]}</option>)}
          </select>
          </>
        )}
        bulkActions={(sel) => (
          <>
            <Button size="sm" variant="outline" onClick={() => setTrocar(sel)}><Replace /> Trocar classificação</Button>
            <Button size="sm" variant="outline" className={cn('text-destructive')} onClick={() => void remover(sel)}><XCircle /> Remover classificação</Button>
          </>
        )}
        empty={<span>Nenhum documento com esta classificação{origem !== 'todas' ? ' nesta origem' : ''}.</span>}
      />
      {trocar && <TrocarDialog sel={trocar} classId={classId} outras={outras.filter((o) => o.ativo)} alvo={alvo(trocar)} onClose={() => setTrocar(null)} />}
    </div>
  )
}

function TrocarDialog({ sel, classId, outras, alvo, onClose }: {
  sel: DataTableSelection; classId: string; outras: { id: string; nome: string }[]; alvo: Record<string, unknown>; onClose: () => void
}) {
  const router = useRouter()
  const [para, setPara] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function aplicar() {
    setSalvando(true)
    const r = await api('POST', apiDetalhe(classId), { acao: 'trocar-docs', para, ...alvo })
    setSalvando(false)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível trocar.')
    toast.success(`${r.data.alterados} documento(s) reclassificado(s).`)
    sel.clear(); onClose(); router.refresh()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Trocar classificação</DialogTitle>
          <DialogDescription>Define a classificação escolhida em {sel.count} documento(s) (vale no documento, acima da herdada da pasta).</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm font-medium">Nova classificação
          <select className={cn(SELECT_CLS, 'w-full')} value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">Escolha…</option>
            {outras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={aplicar} disabled={!para || salvando}>{salvando && <Loader2 className="animate-spin" />} Trocar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

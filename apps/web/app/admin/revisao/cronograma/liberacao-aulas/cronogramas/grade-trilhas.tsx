'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Download, Eraser, FileSpreadsheet, Loader2, Percent, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { baixarCsv, baixarExcel, sufixoData, type ColunaExport } from '@/lib/exportar'
import { Pilula } from '../../../_comp/lista'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'
import { dataBr } from '../tipos'
import { PPS_GRADE, type AcaoGrade, type CelulaTrilha, type FiltrosGrade, type LinhaGrade, type Trilha } from '../tipos-trilhas'
import { chamarTrilhas } from './api'

// Grade editável: linhas = aulas da planilha do produto (paginada no servidor), colunas = trilhas ATIVAS. Cada célula mostra a data
// efetiva de liberação (liberaEmTrilha, calculada no servidor) em destaque, a data do cronograma e a marca “manual”.
// Verde = a MENOR liberação da aula (a que vale para quem está em várias trilhas).

const CAMPO = 'h-8 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function GradeTrilhas({ produtoId, trilhas, linhas, total, page, pp, filtros, podeEditar, headFixas }: {
  produtoId: string; trilhas: Trilha[]; linhas: LinhaGrade[]; total: number; page: number; pp: number; filtros: FiltrosGrade; podeEditar: boolean; headFixas: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [exportando, setExportando] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [trilhaMassa, setTrilhaMassa] = useState(trilhas[0]?.id ?? '')
  const [dias, setDias] = useState('7')
  const [incluirManual, setIncluirManual] = useState(false)
  const [edit, setEdit] = useState<{ linha: LinhaGrade; trilha: Trilha } | null>(null)
  const todos = linhas.length > 0 && linhas.every((l) => sel.has(l.id))

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const l of linhas) { if (v) n.add(l.id); else n.delete(l.id) } return n })

  function massa(acao: AcaoGrade, rotulo: string) {
    executar(async () => {
      const r = await chamarTrilhas<{ afetadas: number }>('acaoGrade', produtoId, { aulaIds: [...sel], acao })
      if (!r.ok) return void toast.error(r.error)
      toast.success(`${rotulo}: ${r.afetadas} data(s)`)
      router.refresh()
    })
  }

  async function exportar(fmt: 'csv' | 'xlsx') {
    setExportando(true)
    try {
      const r = await chamarTrilhas<{ linhas: LinhaGrade[]; trilhas: Array<{ id: string; nome: string }> }>('exportarGrade', produtoId, { filtros })
      if (!r.ok) return void toast.error(r.error)
      const cols: ColunaExport<LinhaGrade>[] = [
        { titulo: 'Nº', valor: (l) => l.ordem, largura: 6 },
        { titulo: 'Matéria', valor: (l) => l.disciplina, largura: 28 },
        { titulo: 'Nº da aula', valor: (l) => l.numeroAula, largura: 10 },
        { titulo: 'Título da aula', valor: (l) => l.titulo, largura: 50 },
        { titulo: 'Data-base atual', valor: (l) => dataBr(l.dataBase), largura: 16 },
        { titulo: 'Menor liberação', valor: (l) => dataBr(l.menor), largura: 16 },
        ...r.trilhas.flatMap((t): ColunaExport<LinhaGrade>[] => [
          { titulo: `${t.nome} — cronograma`, valor: (l) => dataBr(l.celulas[t.id]?.dataCronograma), largura: 18 },
          { titulo: `${t.nome} — liberação`, valor: (l) => dataBr(l.celulas[t.id]?.efetiva), largura: 18 },
          { titulo: `${t.nome} — manual`, valor: (l) => dataBr(l.celulas[t.id]?.dataManual), largura: 18 },
        ]),
      ]
      const nome = `cronogramas-liberacao-${sufixoData()}`
      if (fmt === 'csv') baixarCsv(r.linhas, cols, nome)
      else await baixarExcel(r.linhas, cols, nome, { titulo: 'Cronogramas de liberação', subtitulo: `${r.linhas.length} aula(s) × ${r.trilhas.length} trilha(s)` })
    } finally { setExportando(false) }
  }

  const ativas = useMemo(() => trilhas.filter((t) => t.ativo), [trilhas])
  const nomeTrilhaMassa = ativas.find((t) => t.id === trilhaMassa)?.nome ?? ''

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{total.toLocaleString('pt-BR')} aula(s){Object.entries(filtros).some(([k, v]) => v && k !== 'ord' && k !== 'dir') ? ' com esses filtros' : ' no produto'}. Verde = menor liberação da aula.</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={exportando || total === 0} onClick={() => exportar('csv')}>{exportando ? <Loader2 className="animate-spin" /> : <Download />}CSV</Button>
          <Button size="sm" variant="outline" disabled={exportando || total === 0} onClick={() => exportar('xlsx')}><FileSpreadsheet />Excel</Button>
        </div>
      </div>

      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', (navegando || executando) && 'opacity-70')} aria-busy={navegando}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {podeEditar && <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Selecionar todas desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></th>}
                {headFixas}
                {ativas.map((t) => (
                  <th key={t.id} className="whitespace-nowrap px-3 py-2.5 text-left font-medium">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: t.cor ?? 'var(--primary)' }} />{t.nome}</span>
                    <small className="block font-normal normal-case tracking-normal text-muted-foreground">− {t.offsetDias} dias</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={5 + ativas.length} className="px-3 py-10 text-center text-muted-foreground">{total === 0 ? 'Nenhuma aula encontrada. Importe antes a 1ª aba na aba “Aulas (data-base)”.' : 'Nada nesta página.'}</td></tr>}
              {linhas.map((l) => (
                <tr key={l.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(l.id) && 'bg-primary/5')}>
                  {podeEditar && <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar aula" checked={sel.has(l.id)} onChange={(e) => marcar(l.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>}
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{l.ordem}</td>
                  <td className="px-3 py-1.5"><span className="block max-w-[11rem] truncate" title={l.disciplina}>{l.disciplina}</span></td>
                  <td className="px-3 py-1.5"><span className="block max-w-[20rem] truncate font-medium" title={l.titulo}>{l.numeroAula != null ? `${l.numeroAula}. ` : ''}{l.titulo}</span></td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    {dataBr(l.dataBase)}
                    {l.menor && l.menor !== l.dataBase && <Pilula tipo="warn" className="ml-1.5">→ {dataBr(l.menor)}</Pilula>}
                  </td>
                  {ativas.map((t) => <CelulaGrade key={t.id} c={l.celulas[t.id]} menor={l.menor} podeEditar={podeEditar} onEditar={() => setEdit({ linha: l, trilha: t })} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PPS_GRADE} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {edit && <CelulaDialogo produtoId={produtoId} {...edit} onFechar={() => setEdit(null)} />}

      {podeEditar && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'aula' : 'aulas'}</b>
          <select value={trilhaMassa} onChange={(e) => setTrilhaMassa(e.target.value)} aria-label="Trilha" className={cn(CAMPO, 'max-w-[12rem]')}>
            {ativas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <span className="inline-flex items-center gap-1">
            <input type="number" value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Dias a deslocar (negativo = antecipar)" className={cn(CAMPO, 'w-16')} />
            <Button size="sm" variant="outline" disabled={executando || !trilhaMassa || !Number(dias)} onClick={() => massa({ tipo: 'deslocar', trilhaId: trilhaMassa, dias: Number(dias), incluirManual }, `Deslocadas em “${nomeTrilhaMassa}”`)}><CalendarClock />Deslocar</Button>
            <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={incluirManual} onChange={(e) => setIncluirManual(e.target.checked)} className="accent-[var(--primary)]" />+ manuais</label>
          </span>
          <Button size="sm" variant="outline" disabled={executando || !trilhaMassa} title="Remove a data manual: volta a valer cronograma − offset" onClick={() => massa({ tipo: 'limpar_manual', trilhaId: trilhaMassa }, `Offset aplicado em “${nomeTrilhaMassa}”`)}><Percent />Aplicar offset</Button>
          <Button size="sm" variant="outline" disabled={executando} title="Limpa as datas manuais das aulas selecionadas em TODAS as trilhas" onClick={() => massa({ tipo: 'limpar_manual', trilhaId: null }, 'Manuais limpas')}><Eraser />Limpar manuais</Button>
          <Button size="sm" variant="outline" disabled={executando || !trilhaMassa} onClick={async () => { if (await confirmar({ titulo: 'Tirar da trilha', mensagem: `Remover a data de ${sel.size} aula(s) em “${nomeTrilhaMassa}”? A aula deixa de existir nessa trilha.`, confirmar: 'Remover', destrutivo: true })) massa({ tipo: 'limpar_data', trilhaId: trilhaMassa }, 'Tiradas da trilha') }}><Trash2 />Tirar da trilha</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Limpar seleção</Button>
        </div>,
        document.body,
      )}
    </>
  )
}

function CelulaGrade({ c, menor, podeEditar, onEditar }: { c: CelulaTrilha | undefined; menor: string | null; podeEditar: boolean; onEditar: () => void }) {
  const vazia = !c || !c.efetiva
  const verde = !vazia && menor === c!.efetiva
  const corpo = vazia
    ? <span className="text-muted-foreground">—</span>
    : (
      <>
        <b className={cn('tabular-nums', verde && 'text-emerald-700 dark:text-emerald-400')}>{dataBr(c!.efetiva)}</b>
        <small className="block text-[11px] text-muted-foreground">{c!.dataManual ? <Pilula tipo="vio" className="px-1.5 py-0 text-[10px]">manual</Pilula> : `cron. ${dataBr(c!.dataCronograma).slice(0, 5)}`}</small>
      </>
    )
  return (
    <td className={cn('whitespace-nowrap px-3 py-1', verde && 'bg-emerald-500/10')}>
      {podeEditar
        ? <button type="button" onClick={onEditar} className="w-full rounded-md px-1 py-0.5 text-left hover:bg-muted" aria-label="Editar datas desta aula na trilha">{corpo}</button>
        : corpo}
    </td>
  )
}

function CelulaDialogo({ produtoId, linha, trilha, onFechar }: { produtoId: string; linha: LinhaGrade; trilha: Trilha; onFechar: () => void }) {
  const router = useRouter()
  const c = linha.celulas[trilha.id]
  const [cron, setCron] = useState(c?.dataCronograma ?? '')
  const [manual, setManual] = useState(c?.dataManual ?? '')
  const [pendente, iniciar] = useTransition()
  function salvar() {
    iniciar(async () => {
      const r = await chamarTrilhas('salvarCelula', produtoId, { entrada: { liberacaoAulaId: linha.id, trilhaId: trilha.id, dataCronograma: cron || null, dataManual: manual || null } })
      if (!r.ok) return void toast.error(r.error)
      toast.success('Data salva.'); onFechar(); router.refresh()
    })
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{trilha.nome}</DialogTitle>
          <DialogDescription>{linha.disciplina} — {linha.titulo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Data da aula no cronograma</Label>
            <input type="date" value={cron} onChange={(e) => setCron(e.target.value)} className={cn(CAMPO, 'h-9 w-full')} />
            <p className="text-xs text-muted-foreground">Libera em: cronograma − {trilha.offsetDias} dias{cron ? ` = ${dataBr(somar(cron, -trilha.offsetDias))}` : ''}. Vazio = a aula não existe nesta trilha.</p>
          </div>
          <div className="space-y-1.5"><Label>Data manual de liberação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <input type="date" value={manual} onChange={(e) => setManual(e.target.value)} className={cn(CAMPO, 'h-9 w-full')} />
            <p className="text-xs text-muted-foreground">Se preenchida, libera EXATAMENTE nesta data, ignorando a antecedência.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={pendente} onClick={onFechar}>Cancelar</Button>
          <Button disabled={pendente} onClick={salvar}>{pendente && <Loader2 className="animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function somar(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}

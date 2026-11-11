'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, CalendarPlus, Download, FileSpreadsheet, Link2, Loader2, Pencil, Plus, Power, Trash2, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { baixarCsv, baixarExcel, sufixoData, type ColunaExport } from '@/lib/exportar'
import { Pilula } from '../../_comp/lista'
import { PaginacaoBib } from '../../biblioteca/paginacao-bib'
import { acaoMassaLiberacao, linhasParaExportar, recasarSemVinculo, salvarLinhaLiberacao } from './actions'
import { dataBr, PPS_LIBERACAO, type AcaoMassa, type AulaOpcao, type EntradaLinha, type FiltrosLiberacao, type LinhaLiberacao } from './tipos'
import { ImportarPlanilha } from './importar-dialogo'

// Tabela da sub-aba "Liberação de aulas": seleção + ações em massa, edição individual (modal), adicionar linha,
// exportação e importação. A LISTA é lida/paginada no servidor; aqui só há estado de seleção e diálogos.

const CAMPO = 'h-9 rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

const COLUNAS_EXPORT: ColunaExport<LinhaLiberacao>[] = [
  { titulo: 'Nº', valor: (l) => l.ordem, largura: 6 },
  { titulo: 'Data de liberação', valor: (l) => dataBr(l.dataLiberacao), largura: 16 },
  { titulo: 'Dia da semana', valor: (l) => l.diaSemana, largura: 16 },
  { titulo: 'Matéria', valor: (l) => l.disciplina, largura: 28 },
  { titulo: 'Nº da aula', valor: (l) => l.numeroAula, largura: 10 },
  { titulo: 'Título da aula', valor: (l) => l.titulo, largura: 50 },
  { titulo: 'Cronograma onde aparece primeiro', valor: (l) => l.cronogramas, largura: 40 },
  { titulo: 'Semana no cronograma', valor: (l) => l.semana, largura: 12 },
  { titulo: 'Aula vinculada', valor: (l) => l.aulaTitulo ?? 'sem vínculo', largura: 50 },
  { titulo: 'Ativo', valor: (l) => (l.ativo ? 'sim' : 'não'), largura: 8 },
  { titulo: 'Observação', valor: (l) => l.observacao, largura: 30 },
]

export function TabelaLiberacao({ produtoId, linhas, total, page, pp, head, podeEditar, aulas, materias, filtros }: {
  produtoId: string; linhas: LinhaLiberacao[]; total: number; page: number; pp: number; head: ReactNode
  podeEditar: boolean; aulas: AulaOpcao[]; materias: string[]; filtros: FiltrosLiberacao
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [executando, executar] = useTransition()
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [dataMassa, setDataMassa] = useState('')
  const [dias, setDias] = useState('7')
  const [aulaMassa, setAulaMassa] = useState('')
  const [exportando, setExportando] = useState(false)
  const todos = linhas.length > 0 && linhas.every((l) => sel.has(l.id))

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const l of linhas) { if (v) n.add(l.id); else n.delete(l.id) } return n })
  const limpar = () => setSel(new Set())

  function massa(acao: AcaoMassa, rotulo: string, ids: string[] = [...sel], limparDepois = true) {
    executar(async () => {
      const r = await acaoMassaLiberacao(produtoId, ids, acao)
      if (!r.ok) return void toast.error(r.error)
      toast.success(`${rotulo}: ${r.afetadas} linha(s)`)
      if (limparDepois) limpar()
      router.refresh()
    })
  }

  // Aulas oferecidas no vínculo em massa: as da matéria da 1ª linha selecionada (ou todas, se vazio).
  const primeira = linhas.find((l) => sel.has(l.id))
  const aulasMassa = useMemo(() => (primeira ? aulas.filter((a) => a.disciplina === primeira.disciplina) : aulas), [aulas, primeira])

  async function exportar(fmt: 'csv' | 'xlsx') {
    setExportando(true)
    try {
      const r = await linhasParaExportar(produtoId, filtros)
      if (!r.ok) return void toast.error(r.error)
      const nome = `liberacao-de-aulas-${sufixoData()}`
      if (fmt === 'csv') baixarCsv(r.linhas, COLUNAS_EXPORT, nome)
      else await baixarExcel(r.linhas, COLUNAS_EXPORT, nome, { titulo: 'Liberação de aulas', subtitulo: `${r.linhas.length} linha(s)` })
    } finally { setExportando(false) }
  }

  function recasar() {
    executar(async () => {
      const r = await recasarSemVinculo(produtoId)
      if (!r.ok) return void toast.error(r.error)
      toast[r.casadas ? 'success' : 'info'](r.casadas ? `${r.casadas} linha(s) vinculada(s); ${r.restantes} ainda sem vínculo.` : 'Nenhuma linha nova pôde ser vinculada automaticamente.')
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{total.toLocaleString('pt-BR')} linha(s) {Object.values({ ...filtros, ord: undefined, dir: undefined }).some(Boolean) ? 'com esses filtros' : 'no produto'}.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={exportando || total === 0} onClick={() => exportar('csv')}>{exportando ? <Loader2 className="animate-spin" /> : <Download />}CSV</Button>
          <Button size="sm" variant="outline" disabled={exportando || total === 0} onClick={() => exportar('xlsx')}><FileSpreadsheet />Excel</Button>
          {podeEditar && (
            <>
              <Button size="sm" variant="outline" disabled={executando} onClick={recasar} title="Tenta vincular, às aulas ainda livres do produto, as linhas que estão sem vínculo"><Wand2 />Vincular sem vínculo</Button>
              <ImportarPlanilha produtoId={produtoId} />
              <LinhaDialogo produtoId={produtoId} aulas={aulas} materias={materias} />
            </>
          )}
        </div>
      </div>

      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', (navegando || executando) && 'opacity-70')} aria-busy={navegando}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {podeEditar && <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Selecionar todos desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></th>}
                {head}
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && <tr><td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">{total === 0 ? 'Nenhuma linha encontrada. Importe a planilha ou adicione uma linha.' : 'Nada nesta página.'}</td></tr>}
              {linhas.map((l) => (
                <tr key={l.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(l.id) && 'bg-primary/5', !l.ativo && 'opacity-60')}>
                  {podeEditar && <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar linha" checked={sel.has(l.id)} onChange={(e) => marcar(l.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>}
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{l.ordem}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium tabular-nums">{dataBr(l.dataLiberacao)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{l.diaSemana}</td>
                  <td className="px-3 py-1.5"><span className="block max-w-[11rem] truncate" title={l.disciplina}>{l.disciplina}</span></td>
                  <td className="px-3 py-1.5 tabular-nums">{l.numeroAula ?? '—'}</td>
                  <td className="px-3 py-1.5"><span className="block max-w-[18rem] truncate font-medium" title={l.titulo}>{l.titulo}</span>{l.observacao && <small className="block max-w-[18rem] truncate text-muted-foreground" title={l.observacao}>{l.observacao}</small>}</td>
                  <td className="px-3 py-1.5"><span className="block max-w-[14rem] truncate text-muted-foreground" title={l.cronogramas ?? ''}>{l.cronogramas ?? '—'}</span></td>
                  <td className="px-3 py-1.5 tabular-nums">{l.semana ?? '—'}</td>
                  <td className="px-3 py-1.5">
                    {l.aulaId
                      ? <span className="flex max-w-[16rem] items-center gap-1.5" title={l.aulaTitulo ?? ''}><Pilula tipo="ok">✓</Pilula><span className="truncate text-xs">{l.aulaTitulo}</span></span>
                      : <Pilula tipo="warn">⚠ sem vínculo</Pilula>}
                  </td>
                  <td className="px-3 py-1.5">
                    {podeEditar
                      ? <button type="button" disabled={executando} onClick={() => massa({ tipo: 'ativo', ativo: !l.ativo }, l.ativo ? 'Desativada' : 'Ativada', [l.id], false)} aria-label={l.ativo ? 'Desativar linha' : 'Ativar linha'}><Pilula tipo={l.ativo ? 'ok' : 'mut'}>{l.ativo ? 'ativa' : 'inativa'}</Pilula></button>
                      : <Pilula tipo={l.ativo ? 'ok' : 'mut'}>{l.ativo ? 'ativa' : 'inativa'}</Pilula>}
                  </td>
                  {podeEditar && <td className="px-3 py-1.5"><LinhaDialogo produtoId={produtoId} aulas={aulas} materias={materias} linha={l} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PPS_LIBERACAO} selecionados={sel.size} carregando={navegando}
        onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

      {podeEditar && sel.size > 0 && createPortal(
        <div className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em massa">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</b>
          <span className="inline-flex items-center gap-1">
            <input type="date" value={dataMassa} onChange={(e) => setDataMassa(e.target.value)} aria-label="Nova data de liberação" className={cn(CAMPO, 'h-8 text-xs')} />
            <Button size="sm" variant="outline" disabled={executando || !dataMassa} onClick={() => massa({ tipo: 'data', data: dataMassa }, 'Data definida')}><CalendarPlus />Definir data</Button>
          </span>
          <span className="inline-flex items-center gap-1">
            <input type="number" value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Dias a deslocar (negativo = antecipar)" className={cn(CAMPO, 'h-8 w-20 text-xs')} />
            <Button size="sm" variant="outline" disabled={executando || !Number(dias)} onClick={() => massa({ tipo: 'deslocar', dias: Number(dias) }, 'Datas deslocadas')}><CalendarClock />Deslocar dias</Button>
          </span>
          <Button size="sm" variant="outline" disabled={executando} onClick={() => massa({ tipo: 'ativo', ativo: true }, 'Ativadas')}><Power />Ativar</Button>
          <Button size="sm" variant="outline" disabled={executando} onClick={() => massa({ tipo: 'ativo', ativo: false }, 'Desativadas')}><Power />Desativar</Button>
          <span className="inline-flex items-center gap-1">
            <select value={aulaMassa} onChange={(e) => setAulaMassa(e.target.value)} aria-label="Aula para vincular" className={cn(CAMPO, 'h-8 max-w-[14rem] text-xs')}>
              <option value="">Escolher aula…</option>
              {aulasMassa.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={executando || !aulaMassa} onClick={() => massa({ tipo: 'vincular', aulaId: aulaMassa }, 'Vinculadas')}><Link2 />Vincular</Button>
            <Button size="sm" variant="outline" disabled={executando} onClick={async () => { if (await confirmar({ titulo: 'Remover vínculo', mensagem: `Tirar o vínculo à aula de ${sel.size} linha(s)? A data continua, mas a aula deixa de ser liberada por ela.`, confirmar: 'Remover vínculo' })) massa({ tipo: 'vincular', aulaId: null }, 'Vínculo removido') }}>Desvincular</Button>
          </span>
          <Button size="sm" variant="destructive" disabled={executando} onClick={async () => { if (await confirmar({ titulo: 'Excluir linhas', mensagem: `Excluir ${sel.size} linha(s) de liberação? As aulas ligadas a elas deixam de ter data de liberação.`, confirmar: 'Excluir', destrutivo: true })) massa({ tipo: 'excluir' }, 'Excluídas') }}><Trash2 />Excluir</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={limpar}><X />Limpar seleção</Button>
          {executando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>, document.body,
      )}
    </>
  )
}

// ───────────────────────────── edição individual / nova linha ─────────────────────────────

function LinhaDialogo({ produtoId, aulas, materias, linha }: { produtoId: string; aulas: AulaOpcao[]; materias: string[]; linha?: LinhaLiberacao }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [pend, iniciar] = useTransition()
  const vazio = (): EntradaLinha => ({ disciplina: '', numeroAula: null, titulo: '', dataLiberacao: '', cronogramas: '', semana: null, observacao: '', aulaId: null, ativo: true })
  const [f, setF] = useState<EntradaLinha>(vazio())
  const opcoes = useMemo(() => {
    const doDisc = aulas.filter((a) => a.disciplina === f.disciplina)
    const base = doDisc.length ? doDisc : aulas
    return f.aulaId && !base.some((a) => a.id === f.aulaId) ? [...base, ...aulas.filter((a) => a.id === f.aulaId)] : base
  }, [aulas, f.disciplina, f.aulaId])
  const nomesMateria = useMemo(() => [...new Set([...materias, ...aulas.map((a) => a.disciplina)])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [materias, aulas])

  function abrir() {
    setF(linha
      ? { id: linha.id, disciplina: linha.disciplina, numeroAula: linha.numeroAula, titulo: linha.titulo, dataLiberacao: linha.dataLiberacao, cronogramas: linha.cronogramas ?? '', semana: linha.semana, observacao: linha.observacao ?? '', aulaId: linha.aulaId, ativo: linha.ativo }
      : vazio())
    setAberto(true)
  }
  function salvar() {
    iniciar(async () => {
      const r = await salvarLinhaLiberacao(produtoId, f)
      if (!r.ok) return void toast.error(r.error)
      toast.success(linha ? 'Linha atualizada' : 'Linha adicionada'); setAberto(false); router.refresh()
    })
  }
  const set = <K extends keyof EntradaLinha>(k: K, v: EntradaLinha[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <>
      {linha
        ? <Button size="icon-sm" variant="ghost" onClick={abrir} aria-label={`Editar linha ${linha.ordem}`} title="Editar"><Pencil /></Button>
        : <Button size="sm" onClick={abrir}><Plus />Adicionar linha</Button>}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{linha ? `Editar linha ${linha.ordem}` : 'Nova linha de liberação'}</DialogTitle>
            <DialogDescription>A data é quando a aula abre para o aluno sem cronograma fixado. O vínculo diz qual aula do produto ela libera.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Data de liberação</Label><Input type="date" value={f.dataLiberacao} onChange={(e) => set('dataLiberacao', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Matéria</Label>
              <Input list="lib-materias" value={f.disciplina} onChange={(e) => set('disciplina', e.target.value)} placeholder="Direito Constitucional" />
              <datalist id="lib-materias">{nomesMateria.map((m) => <option key={m} value={m} />)}</datalist></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Título da aula</Label><Input value={f.titulo} onChange={(e) => set('titulo', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Nº da aula <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label><Input type="number" min={0} value={f.numeroAula ?? ''} onChange={(e) => set('numeroAula', e.target.value === '' ? null : Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Semana no cronograma <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label><Input type="number" min={0} value={f.semana ?? ''} onChange={(e) => set('semana', e.target.value === '' ? null : Number(e.target.value))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Aula do produto vinculada</Label>
              <select value={f.aulaId ?? ''} onChange={(e) => set('aulaId', e.target.value || null)} className={cn(CAMPO, 'w-full')}>
                <option value="">⚠ Sem vínculo</option>
                {opcoes.map((a) => <option key={a.id} value={a.id}>{a.titulo}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">{f.disciplina && aulas.some((a) => a.disciplina === f.disciplina) ? `Mostrando só as aulas de ${f.disciplina}.` : 'Escolha a matéria para filtrar as aulas.'}</p></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Observação <span className="text-xs font-normal text-muted-foreground">(opcional)</span></Label><Textarea rows={2} value={f.observacao ?? ''} onChange={(e) => set('observacao', e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.ativo !== false} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />Linha ativa (vale para a liberação)</label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pend}>Cancelar</Button>
            <Button onClick={salvar} disabled={pend}>{pend && <Loader2 className="animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

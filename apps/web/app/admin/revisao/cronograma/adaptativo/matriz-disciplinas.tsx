'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, FolderTree, Loader2, Plus, Search, Trash2, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { buscarJson } from '@/lib/admin/metas-pasta-fetch'
import { CLASSES_DISC, type ClasseDisc, type LinhaMatrizDisciplina, type MatrizDisciplinas, type TipoFlagDisc } from '@/lib/admin/metas-pasta-tipos'
import { FLAG_PARA_TIPO } from '@/lib/admin/metas-pasta-matriz'
import {
  adicionarDisciplinaCronograma, alterarDisciplinaCronograma, alterarDisciplinasLoteCronograma, removerDisciplinaCronograma, removerDisciplinasLoteCronograma,
} from '../actions'
import { salvarConfigPasta } from '../metas-pasta-actions'
import { BlocoErro } from './metas-pasta'

const ROTA_API = '/api/admin/revisao/cronograma/metas-pasta'
const PP = 25
const ROTULO_FLAG: Record<TipoFlagDisc, string> = { pdfull: 'PDFull', pdfight: 'PDFight', pdflash: 'PDFlash', legproc: 'LegProc', juris: 'Juris' }
const ROTULO_CLASSE: Record<ClasseDisc, string> = { essencial: 'Essencial', complementar: 'Complementar', especifica: 'Específica' }

type Campo = TipoFlagDisc | 'ativa'
type Ord = 'nome' | 'classe' | 'docs' | 'planos' | 'aulas'

/** Aba "Matriz": TODAS as disciplinas do cronograma × flags de tipo × pasta vinculada × documentos por tipo. Dados prontos do servidor (rota GET). */
export default function MatrizDisciplinasView({ podeEditar, buscaInicial, onVerPasta }: { podeEditar: boolean; buscaInicial?: string; onVerPasta: (pastaId: string) => void }) {
  const [dados, setDados] = useState<MatrizDisciplinas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState(buscaInicial ?? '')
  const [fClasse, setFClasse] = useState('')
  const [fAtiva, setFAtiva] = useState('')
  const [fDiv, setFDiv] = useState('')
  const [fPasta, setFPasta] = useState('')
  const [ord, setOrd] = useState<Ord>('nome')
  const [asc, setAsc] = useState(true)
  const [pag, setPag] = useState(1)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pend, start] = useTransition()

  const carregar = useCallback(async (signal?: AbortSignal) => {
    const r = await buscarJson<{ matriz: MatrizDisciplinas }>(`${ROTA_API}/matriz`, { signal })
    if (!r.ok) { if (!r.abortado) setErro(r.error); return }
    setErro(null); setDados(r.data.matriz)
  }, [])
  useEffect(() => {
    const ctl = new AbortController()
    void carregar(ctl.signal)
    return () => ctl.abort()
  }, [carregar])
  useEffect(() => { if (buscaInicial !== undefined) { setQ(buscaInicial); setPag(1) } }, [buscaInicial])

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase()
    const f = asc ? 1 : -1
    const lista = (dados?.linhas ?? []).filter((l) =>
      (!t || l.nome.toLowerCase().includes(t)) &&
      (!fClasse || (fClasse === 'sem' ? !l.classe : l.classe === fClasse)) &&
      (!fAtiva || (fAtiva === 'sim' ? l.ativa : !l.ativa)) &&
      (!fDiv || (fDiv === 'sim' ? l.divergencias.length > 0 : l.divergencias.length === 0)) &&
      (!fPasta || (fPasta === 'sim' ? l.pastas.length > 0 : l.pastas.length === 0)))
    const chave = (l: LinhaMatrizDisciplina): string | number =>
      ord === 'nome' ? l.nome.toLowerCase() : ord === 'classe' ? l.classe ?? '~' : ord === 'docs' ? l.docsTotal : ord === 'planos' ? l.planosAtivos : l.aulas
    return [...lista].sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * f || a.nome.localeCompare(b.nome, 'pt-BR') })
  }, [dados, q, fClasse, fAtiva, fDiv, fPasta, ord, asc])

  const paginas = Math.max(1, Math.ceil(filtradas.length / PP))
  const pagina = Math.min(pag, paginas)
  const visiveis = useMemo(() => filtradas.slice((pagina - 1) * PP, pagina * PP), [filtradas, pagina])
  const todos = visiveis.length > 0 && visiveis.every((l) => sel.has(l.nome))

  const aplicarLocal = (nomes: string[], campo: Campo, valor: boolean) =>
    setDados((d) => d && { ...d, linhas: d.linhas.map((l) => (nomes.includes(l.nome) ? { ...l, [campo]: valor } : l)) })

  function alternar(l: LinhaMatrizDisciplina, campo: Campo, valor: boolean) {
    aplicarLocal([l.nome], campo, valor)
    start(async () => {
      const r = await alterarDisciplinaCronograma(l.nome, campo, valor).catch(() => ({ ok: false, error: 'Falha de conexão.' }))
      if (!r.ok) { aplicarLocal([l.nome], campo, !valor); toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success('Disciplina atualizada'); void carregar()
    })
  }
  function lote(campo: Campo, valor: boolean, rotulo: string) {
    const nomes = [...sel]
    start(async () => {
      const r = await alterarDisciplinasLoteCronograma(nomes, campo, valor).catch(() => ({ ok: false, error: 'Falha de conexão.', n: 0 }))
      if (!r.ok) { toast.error(r.error || 'Falha ao aplicar.'); return }
      toast.success(`${rotulo} em ${r.n ?? nomes.length} disciplina(s)`); setSel(new Set()); await carregar()
    })
  }
  function remover(nomes: string[]) {
    start(async () => {
      const r = nomes.length === 1 ? await removerDisciplinaCronograma(nomes[0]) : await removerDisciplinasLoteCronograma(nomes)
      if (!r.ok) { toast.error(r.error || 'Falha ao remover.'); return }
      toast.success('Disciplina(s) removida(s)'); setSel(new Set()); await carregar()
    })
  }
  async function adicionar() {
    const nome = await pedirTexto({ titulo: 'Adicionar disciplina', label: 'Nome da disciplina', placeholder: 'Ex.: Direito Tributário', confirmar: 'Adicionar' })
    if (!nome?.trim()) return
    start(async () => {
      const r = await adicionarDisciplinaCronograma(nome)
      if (!r.ok) { toast.error(r.error || 'Falha ao adicionar.'); return }
      toast.success('Disciplina adicionada'); await carregar()
    })
  }
  function mudarClasse(l: LinhaMatrizDisciplina, classe: ClasseDisc) {
    const pastaId = l.pastas[0]?.id; if (!pastaId) return
    start(async () => {
      let r = await salvarConfigPasta({ pastaId, disciplina: { classe } })
      if (r.ok && r.precisaConfirmar) {
        const ok = await confirmar({ titulo: 'Esta mudança afeta planos ativos', mensagem: `${(r.planosAtivos ?? 0).toLocaleString('pt-BR')} plano(s) de alunos ativos usam documentos desta disciplina. Deseja continuar?`, confirmar: 'Aplicar mudança', destrutivo: true })
        if (!ok) return
        r = await salvarConfigPasta({ pastaId, disciplina: { classe }, confirmarImpacto: true })
      }
      if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success('Classe atualizada'); await carregar()
    })
  }

  const cab = (k: Ord, r: string) => (
    <th className="px-3 py-2.5 text-left font-semibold">
      <button type="button" onClick={() => { if (ord === k) setAsc(!asc); else { setOrd(k); setAsc(true) } setPag(1) }} className="inline-flex items-center gap-1 uppercase tracking-wide">
        {r}{ord === k && (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const l of visiveis) { if (v) n.add(l.nome); else n.delete(l.nome) } return n })

  if (erro && !dados) return <BlocoErro erro={erro} onTentar={() => { setErro(null); void carregar() }} />
  if (!dados) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando a matriz…</div>

  const nDiv = dados.linhas.filter((l) => l.divergencias.length > 0).length
  const selManuais = [...sel].filter((n) => dados.linhas.find((l) => l.nome === n)?.manual)
  const sw = (l: LinhaMatrizDisciplina, campo: Campo, tipoOff?: boolean) => (
    <Switch checked={l[campo]} disabled={!podeEditar || pend || tipoOff} aria-label={`${campo} · ${l.nome}`} onCheckedChange={(c) => alternar(l, campo, !!c)} />
  )
  const sel2 = 'h-9 rounded-lg border bg-background px-2 text-sm'

  return (
    <div className="space-y-3">
      {!dados.migrado && <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">Para salvar alterações nas disciplinas, aplique a migração 20261112050000_revisao_cronograma_duvidas.sql.</p>}
      {dados.migrado && !dados.tiposMigrado && <p className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">PDFull, Juris e LegProc por disciplina dependem da migração 20261113030000_cron_disciplinas_tipos_material.sql, ainda não aplicada. Até lá esses botões ficam desabilitados.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPag(1) }} placeholder="Buscar disciplina" aria-label="Buscar disciplina" className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm" />
        </div>
        <select aria-label="Filtrar por classe" value={fClasse} onChange={(e) => { setFClasse(e.target.value); setPag(1) }} className={sel2}>
          <option value="">Todas as classes</option>
          {CLASSES_DISC.map((c) => <option key={c.v} value={c.v}>{c.r}</option>)}
          <option value="sem">Sem classe</option>
        </select>
        <select aria-label="Filtrar por situação no cronograma" value={fAtiva} onChange={(e) => { setFAtiva(e.target.value); setPag(1) }} className={sel2}>
          <option value="">No cronograma: todas</option><option value="sim">No cronograma</option><option value="nao">Fora do cronograma</option>
        </select>
        <select aria-label="Filtrar por pasta vinculada" value={fPasta} onChange={(e) => { setFPasta(e.target.value); setPag(1) }} className={sel2}>
          <option value="">Pasta: todas</option><option value="sim">Com pasta vinculada</option><option value="nao">Sem pasta</option>
        </select>
        <select aria-label="Filtrar por divergência" value={fDiv} onChange={(e) => { setFDiv(e.target.value); setPag(1) }} className={sel2}>
          <option value="">Divergência: todas</option><option value="sim">Só com divergência{nDiv ? ` (${nDiv})` : ''}</option><option value="nao">Sem divergência</option>
        </select>
        <span className="text-xs text-muted-foreground">{filtradas.length.toLocaleString('pt-BR')} de {dados.linhas.length.toLocaleString('pt-BR')} disciplina(s)</span>
        {podeEditar && <Button variant="outline" size="sm" className="ml-auto" disabled={pend} onClick={adicionar}><Plus className="h-4 w-4" />Adicionar disciplina</Button>}
      </div>

      {podeEditar && sel.size > 0 && (
        <div role="toolbar" aria-label="Ações em lote" className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2">
          <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionada' : 'selecionadas'}</b>
          <Button size="sm" variant="outline" disabled={pend} onClick={() => lote('ativa', true, 'Incluídas no cronograma')}>No cronograma: ligar</Button>
          <Button size="sm" variant="outline" disabled={pend} onClick={() => lote('ativa', false, 'Retiradas do cronograma')}>No cronograma: desligar</Button>
          {FLAG_PARA_TIPO.map(({ flag }) => (
            <span key={flag} className="inline-flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={pend || (!dados.tiposMigrado && ['pdfull', 'juris', 'legproc'].includes(flag))} onClick={() => lote(flag, true, `${ROTULO_FLAG[flag]} ligado`)}>{ROTULO_FLAG[flag]}: ligar</Button>
              <Button size="sm" variant="outline" disabled={pend || (!dados.tiposMigrado && ['pdfull', 'juris', 'legproc'].includes(flag))} onClick={() => lote(flag, false, `${ROTULO_FLAG[flag]} desligado`)}>desligar</Button>
            </span>
          ))}
          <Button size="sm" variant="destructive" disabled={pend || selManuais.length === 0} title={selManuais.length === 0 ? 'Só disciplinas criadas aqui podem ser removidas' : undefined} onClick={async () => {
            if (await confirmar({ titulo: 'Remover disciplinas', mensagem: `Remover as disciplinas criadas aqui entre as ${sel.size} selecionadas? As do catálogo não são removidas.`, confirmar: 'Remover', destrutivo: true })) remover(selManuais)
          }}><Trash2 />Remover</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}>Limpar seleção</Button>
        </div>
      )}

      <section className={cn('rounded-2xl border bg-card p-2 shadow-sm transition-opacity', pend && 'opacity-70')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Selecionar todas desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></th>
                {cab('nome', 'Disciplina')}{cab('classe', 'Classe')}
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">No cronograma</th>
                {FLAG_PARA_TIPO.map(({ flag }) => <th key={flag} className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">{ROTULO_FLAG[flag]}</th>)}
                {cab('docs', 'Docs')}{cab('planos', 'Planos')}{cab('aulas', 'Aulas')}
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && <tr><td colSpan={13} className="px-3 py-10 text-center text-muted-foreground">Nenhuma disciplina encontrada.</td></tr>}
              {visiveis.map((l) => {
                const tiposMig = dados.tiposMigrado
                const outros = l.docsTotal - FLAG_PARA_TIPO.reduce((s, { tipo }) => s + (l.docsPorTipo[tipo] ?? 0), 0)
                return (
                  <tr key={l.nome} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(l.nome) && 'bg-primary/5', !l.ativa && 'opacity-60')}>
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Selecionar ${l.nome}`} checked={sel.has(l.nome)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(l.nome); else n.delete(l.nome); return n })} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{l.nome}</span>
                        {l.manual && <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">criada aqui</span>}
                        {l.pastas.length > 0
                          ? <button type="button" onClick={() => onVerPasta(l.pastas[0].id)} title={l.pastas.map((p) => p.nome).join(', ')} className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 hover:underline dark:text-sky-400"><FolderTree className="h-3 w-3" />{l.pastas.length > 1 ? `${l.pastas.length} pastas` : 'pasta'} · ver pastas</button>
                          : <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">sem pasta</span>}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      {l.pastas.length > 0 && podeEditar
                        ? <select aria-label={`Classe de ${l.nome}`} value={l.classe ?? ''} disabled={pend} onChange={(e) => e.target.value && mudarClasse(l, e.target.value as ClasseDisc)} className="h-8 rounded-lg border bg-background px-2 text-xs">
                            {!l.classe && <option value="">Sem classe</option>}
                            {CLASSES_DISC.map((c) => <option key={c.v} value={c.v}>{c.r}</option>)}
                          </select>
                        : <span className="text-xs text-muted-foreground">{l.classe ? ROTULO_CLASSE[l.classe] : '—'}</span>}
                    </td>
                    <td className="px-3 py-1.5">{sw(l, 'ativa')}</td>
                    {FLAG_PARA_TIPO.map(({ flag, tipo }) => {
                      const n = l.docsPorTipo[tipo] ?? 0
                      const diverge = l.divergencias.includes(flag)
                      return (
                        <td key={flag} className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            {sw(l, flag, !tiposMig && ['pdfull', 'juris', 'legproc'].includes(flag))}
                            <span className={cn('inline-flex items-center gap-0.5 text-xs tabular-nums', diverge ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}
                              title={diverge ? (l[flag] ? 'Ligado, mas sem documentos deste tipo nas pastas' : 'Desligado, mas há documentos deste tipo nas pastas') : undefined}>
                              {diverge && <TriangleAlert className="h-3 w-3" />}{n.toLocaleString('pt-BR')}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-1.5 tabular-nums" title={outros > 0 ? `${outros} em outros tipos do catálogo` : undefined}>{l.docsTotal.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-1.5 tabular-nums">{l.planosAtivos.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-1.5 tabular-nums">{l.aulas.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <a href={`/admin/revisao/cronograma?aba=adaptativo&sub=conteudo&v=cobertura&disc=${encodeURIComponent(l.nome)}`} className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-accent" aria-label={`Abrir as aulas de ${l.nome}`}>Abrir aulas</a>
                        {podeEditar && l.manual && (
                          <Button variant="ghost" size="sm" disabled={pend} aria-label="Remover disciplina" onClick={async () => {
                            if (await confirmar({ titulo: 'Remover disciplina', mensagem: `Remover “${l.nome}” do cronograma?`, destrutivo: true })) remover([l.nome])
                          }}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
          <span>Página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            <button type="button" disabled={pagina <= 1} onClick={() => setPag(pagina - 1)} className="h-8 rounded-lg border px-3 disabled:opacity-50">Anterior</button>
            <button type="button" disabled={pagina >= paginas} onClick={() => setPag(pagina + 1)} className="h-8 rounded-lg border px-3 disabled:opacity-50">Próxima</button>
          </div>
        </div>
      </section>
      <p className="text-xs text-muted-foreground" title="Disciplina sem PDFlash ou sem PDFight não recebe essa revisão e não aparece como pendente. PDFull, Juris e LegProc desligados fazem o gerador deixar de entregar esse tipo naquela disciplina (um tipo bloqueado em Regras do cronograma vale para todas). Disciplina desligada sai do cronograma, com as aulas guardadas.">
        O número ao lado de cada botão é a quantidade de documentos daquele tipo nas pastas vinculadas; o alerta aparece quando o botão e as pastas divergem. Passe o mouse aqui para ver as regras.
      </p>
    </div>
  )
}

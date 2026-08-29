'use client'

import { Fragment, useEffect, useState, useTransition, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Check, Loader2, Upload, ListChecks, ChevronRight, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { copiarTexto } from '@/lib/clipboard'
import { MarkdownContent } from '@/components/markdown-content'
import { codigoQuestao } from '@/lib/codigo-questao'
import { useRouter } from 'next/navigation'
import { adicionarQuestoes, buscarQuestoesForaBanco, detalheQuestaoBanco, type QuestaoBancoBuscaItem, type QuestaoDetalheBanco } from '@/app/admin/banco-questoes/actions'
import type { QuestaoImport } from '@/app/admin/banco-questoes/import-types'
import { ImportarQuestoesTab } from '@/components/admin/importar-questoes-tab'

const difCfg: Record<string, { label: string; cls: string }> = {
  facil: { label: 'Fácil', cls: 'text-green-600' },
  medio: { label: 'Médio', cls: 'text-amber-600' },
  dificil: { label: 'Difícil', cls: 'text-red-600' },
}

// Fundos OPACOS da coluna fixa (precisa mascarar o scroll) que acompanham hover/seleção da linha
// (group-hover). São escritos como literais para o Tailwind gerar os utilitários arbitrários.
const STRIP_SEL = 'bg-[color-mix(in_oklab,var(--primary)_5%,var(--popover))] group-hover:bg-[color-mix(in_oklab,var(--primary)_10%,var(--popover))]'
const STRIP_BASE = 'bg-popover group-hover:bg-[color-mix(in_oklab,var(--muted)_45%,var(--popover))]'
const STRIP_SEL_STATIC = 'bg-[color-mix(in_oklab,var(--primary)_5%,var(--popover))]'

export function AdicionarQuestoesDialog({
  bancoId,
  disciplinas,
  onSelecionar,
  onImportar,
  jaIds,
}: {
  bancoId?: string | null
  /** Disciplinas do tenant para o filtro (id + nome). */
  disciplinas: { id: string; nome: string }[]
  /** Modo REUTILIZÁVEL (ex.: criação de simulado): em vez de gravar num banco, devolve as
   *  questões escolhidas do sistema. Quando presente, o botão "Adicionar" chama isto. */
  onSelecionar?: (items: QuestaoBancoBuscaItem[]) => void
  /** Modo reutilizável: import só PARSEIA e devolve as linhas (não grava). */
  onImportar?: (questoes: QuestaoImport[]) => void
  /** Ids já escolhidos (para não repetir na lista) — usado no modo reutilizável. */
  jaIds?: Set<string>
}) {
  const [open, setOpen] = useState(false)
  const [modo, setModo] = useState<'existentes' | 'importar'>('existentes')
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [dif, setDif] = useState('all')
  const [tipoF, setTipoF] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pending, start] = useTransition()
  const router = useRouter()
  // Candidatas buscadas SOB DEMANDA no servidor (já exclui as que estão no banco).
  const [itens, setItens] = useState<QuestaoBancoBuscaItem[]>([])
  const [buscando, setBuscando] = useState(false)

  const difItems = { all: 'Todas', facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' }
  const tipoItems = { all: 'Todos tipos', objetiva: 'Objetiva', discursiva: 'Discursiva' }

  // Cache EM MEMÓRIA (por página): a mesma combinação de busca/filtros só busca no servidor UMA vez.
  // Re-abrir o pop-up ou voltar a um filtro já visto usa o cache — sem recarregar. (Some ao sair da página.)
  const cacheRef = useRef<Map<string, QuestaoBancoBuscaItem[]>>(new Map())
  useEffect(() => {
    if (!open || modo !== 'existentes') return
    const chave = `${bancoId ?? ''}|${busca.trim().toLowerCase()}|${disc}|${dif}|${tipoF}`
    const cached = cacheRef.current.get(chave)
    // jaIds é aplicado na leitura (não entra na chave) → questões já escolhidas somem mesmo vindo do cache.
    if (cached) { setItens(cached.filter((q) => !jaIds?.has(q.id))); setBuscando(false); return }
    let vivo = true
    setBuscando(true)
    const t = setTimeout(async () => {
      const r = await buscarQuestoesForaBanco(bancoId ?? null, { busca, disciplinaId: disc, dificuldade: dif, tipo: tipoF })
      if (!vivo) return
      const itens = r.ok ? (r.itens ?? []) : []
      if (r.ok) cacheRef.current.set(chave, itens) // guarda o resultado BRUTO (antes do filtro jaIds)
      setItens(itens.filter((q) => !jaIds?.has(q.id)))
      setBuscando(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modo, busca, disc, dif, tipoF, bancoId])

  function toggle(id: string) {
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // Expandir a linha → alternativas + comentários, carregados SOB DEMANDA (e memoizados por id).
  const [expandido, setExpandido] = useState<Set<string>>(new Set())
  const [detalhes, setDetalhes] = useState<Record<string, QuestaoDetalheBanco | 'load'>>({})
  function toggleExpand(id: string) {
    setExpandido((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
    if (!detalhes[id]) {
      setDetalhes((p) => ({ ...p, [id]: 'load' }))
      detalheQuestaoBanco(id)
        .then((r) => setDetalhes((p) => ({ ...p, [id]: r.ok && r.detalhe ? r.detalhe : { alternativas: [], comentario: null } })))
        .catch(() => setDetalhes((p) => ({ ...p, [id]: { alternativas: [], comentario: null } })))
    }
  }
  const LETRAS = ['A', 'B', 'C', 'D', 'E']
  async function copiarCodigo(codigo: string) {
    if (await copiarTexto(codigo)) toast.success(`Código ${codigo} copiado`)
    else toast.error('Não foi possível copiar.')
  }

  function adicionar() {
    if (sel.size === 0) return
    // Modo reutilizável (criação de simulado): devolve as escolhidas, sem tocar em banco.
    if (onSelecionar) {
      onSelecionar(itens.filter((q) => sel.has(q.id)))
      setOpen(false)
      setSel(new Set())
      return
    }
    start(async () => {
      const ids = [...sel]
      const r = await adicionarQuestoes(bancoId as string, ids)
      if (r.ok) {
        toast.success(`${r.adicionadas ?? 0} questão(ões) adicionada(s)`)
        setOpen(false)
        setSel(new Set())
        setItens((p) => p.filter((q) => !ids.includes(q.id)))
        // Navegação suave (a action faz revalidatePath): sem window.location.assign / reload total.
        router.push(`/admin/banco-questoes/${bancoId}?tab=questoes`)
        router.refresh()
      } else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button />}>
        <Plus className="mr-2 h-4 w-4" /> Adicionar questões
      </DialogTrigger>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Adicionar questões ao banco</DialogTitle>
          <DialogDescription>Importe questões de um arquivo ou selecione questões já existentes no sistema.</DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex gap-1 px-6 pt-4">
          {([
            { k: 'importar', label: 'Importar questões', icon: Upload },
            { k: 'existentes', label: 'Questões do sistema', icon: ListChecks },
          ] as const).map((t) => (
            <button key={t.k} type="button" onClick={() => setModo(t.k)}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                modo === t.k ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {modo === 'importar' ? (
          <ImportarQuestoesTab bancoId={bancoId ?? null} onDone={() => setOpen(false)} onParsed={onImportar} />
        ) : (
        <>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 px-6 pt-4">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por enunciado, código, disciplina…" className="pl-8" />
          </div>
          <Select value={disc} onValueChange={(v) => setDisc(v ?? '')} items={{ all: 'Todas disciplinas', ...Object.fromEntries(disciplinas.map((d) => [d.id, d.nome])) }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas disciplinas</SelectItem>
              {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dif} onValueChange={(v) => setDif(v ?? '')} items={difItems}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="facil">Fácil</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="dificil">Difícil</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipoF} onValueChange={(v) => setTipoF(v ?? '')} items={tipoItems}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="objetiva">Objetiva</SelectItem>
              <SelectItem value="discursiva">Discursiva</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="px-6 pb-0.5 pt-3 text-xs text-muted-foreground">{buscando ? 'Buscando…' : `${itens.length} questão(ões) disponível(is)${itens.length >= 40 ? '+' : ''}`}</p>
        <p className="px-6 pb-1 text-[11px] text-muted-foreground">← arraste para o lado para ver todas as colunas → · clique numa questão para ver as alternativas e comentários</p>

        {/* Lista (tabela com rolagem lateral + linhas expansíveis) */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-max min-w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-20 bg-popover">
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-30 w-12 bg-popover py-2 pl-5"></th>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Questão</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Formato</th>
                <th className="px-3 py-2 font-medium">Disciplina</th>
                <th className="px-3 py-2 font-medium">Assunto</th>
                <th className="px-3 py-2 font-medium">Assunto detalhe</th>
                <th className="px-3 py-2 font-medium">Banca</th>
                <th className="px-3 py-2 font-medium">Órgão</th>
                <th className="px-3 py-2 font-medium">Ano</th>
                <th className="px-3 py-2 font-medium">Nível</th>
                <th className="px-3 py-2 font-medium">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {buscando ? (
                <tr><td colSpan={13} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan={13} className="py-10 text-center text-muted-foreground">Nenhuma questão encontrada.</td></tr>
              ) : (
                itens.map((q) => {
                  const on = sel.has(q.id)
                  const open = expandido.has(q.id)
                  const enun = q.enunciado.length > 130 ? q.enunciado.slice(0, 130) + '…' : q.enunciado
                  const ce = q.tipo !== 'discursiva' && q.formato === 'certo_errado'
                  const tipoLabel = q.tipo === 'discursiva' ? 'Discursiva' : ce ? 'Certo/Errado' : 'Múltipla'
                  const tipoCls = q.tipo === 'discursiva' ? 'border-indigo-400 text-indigo-600 dark:text-indigo-300' : ce ? 'border-violet-400 text-violet-600 dark:text-violet-300' : 'border-sky-400 text-sky-600 dark:text-sky-300'
                  const d = difCfg[q.nivel_dificuldade ?? '']
                  const det = detalhes[q.id]
                  const traco = <span className="text-muted-foreground">—</span>
                  return (
                    <Fragment key={q.id}>
                      <tr onClick={() => toggleExpand(q.id)} className={cn('group cursor-pointer align-top', !open && 'border-b', on ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40')}>
                        <td className={cn('sticky left-0 z-20 py-2 pl-5', on ? STRIP_SEL : STRIP_BASE)} onClick={(e) => { e.stopPropagation(); toggle(q.id) }}>
                          <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">
                          <button type="button" onClick={(e) => { e.stopPropagation(); copiarCodigo(codigoQuestao(q.id)) }} title="Copiar código"
                            className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 font-mono text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary">
                            <Copy className="h-3 w-3" /> {codigoQuestao(q.id)}
                          </button>
                        </td>
                        <td className="min-w-[260px] max-w-[420px] px-3 py-2 leading-relaxed">
                          <div className="flex items-start gap-1.5">
                            <ChevronRight className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
                            <span><MarkdownContent inline>{enun}</MarkdownContent></span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2"><span className={cn('rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase', tipoCls)}>{tipoLabel}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{q.tipo === 'discursiva' ? traco : ce ? 'Certo/Errado' : 'Múltipla'}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.disciplina ? <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">{q.disciplina}</span> : traco}</td>
                        <td className="px-3 py-2 text-xs"><div className="max-w-[180px] truncate" title={q.assunto ?? undefined}>{q.assunto || traco}</div></td>
                        <td className="px-3 py-2 text-xs"><div className="max-w-[180px] truncate" title={q.assunto_detalhe ?? undefined}>{q.assunto_detalhe || traco}</div></td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.banca || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.orgao || traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{q.ano ?? traco}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs">{d ? <span className={cn('font-medium', d.cls)}>{d.label}</span> : traco}</td>
                        <td className="px-3 py-2 text-xs">{q.etiquetas.length ? <div className="flex flex-wrap gap-1">{q.etiquetas.map((e, k) => <span key={k} className="whitespace-nowrap rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{e.nome}</span>)}</div> : traco}</td>
                      </tr>
                      {open && (
                        <tr className={cn('border-b', on ? 'bg-primary/5' : 'bg-muted/20')}>
                          {/* Faixa fixa continua descendo (mesma coluna do checkbox) → alternativas não vazam por trás. */}
                          <td className={cn('sticky left-0 z-20 w-12', on ? STRIP_SEL_STATIC : 'bg-popover')} aria-hidden />
                          <td colSpan={12} className="p-0">
                            <div className="space-y-2 px-4 py-3 text-xs">
                              {det === undefined || det === 'load' ? (
                                <p className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>
                              ) : det.alternativas.length === 0 && !det.comentario ? (
                                <p className="text-muted-foreground">Sem alternativas ou comentários.</p>
                              ) : (
                                <>
                                  {det.alternativas.map((a) => (
                                    <div key={a.ordem} className="rounded-md border bg-background p-2">
                                      <p className={cn('font-semibold', a.correta && 'text-emerald-600 dark:text-emerald-400')}>
                                        {LETRAS[a.ordem] ?? '?'}){a.correta ? ' ✓ correta' : ''} <MarkdownContent inline className="font-normal text-foreground">{a.texto}</MarkdownContent>
                                      </p>
                                      {a.comentario && <div className="mt-0.5 text-muted-foreground"><span className="font-semibold text-foreground">Comentário:</span> <MarkdownContent inline>{a.comentario}</MarkdownContent></div>}
                                    </div>
                                  ))}
                                  {det.comentario && (
                                    <div className="rounded-md border bg-background p-2">
                                      <span className="font-semibold">Comentário do professor:</span> <MarkdownContent inline className="text-muted-foreground">{det.comentario}</MarkdownContent>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">{sel.size === 0 ? 'Nenhuma questão selecionada' : `${sel.size} questão(ões) selecionada(s)`}</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={adicionar} disabled={pending || sel.size === 0}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Adicionar
            </Button>
          </div>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}

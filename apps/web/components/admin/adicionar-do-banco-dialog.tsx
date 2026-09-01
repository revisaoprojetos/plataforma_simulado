'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Loader2, PackagePlus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buscarConjuntosParaCompor, type ConjuntoParaCompor } from '@/app/admin/cronogramas/conteudos/actions'
import { listarDisciplinasFiltro } from '@/app/admin/banco-questoes/actions'

/**
 * "Adicionar do banco de conteúdos" — espelha o pop-up de questões: busca + filtro por
 * disciplina + multi-seleção de CONJUNTOS + colocação. Ao confirmar, o pai chama a ação de
 * cópia (comporDoBanco) — um conjunto vira várias metas de uma vez.
 */
export function AdicionarDoBancoDialog({
  diasNome,
  totalSemanas,
  onConfirmar,
}: {
  diasNome: string[]
  totalSemanas: number
  onConfirmar: (opts: { conjuntoIds: string[]; semanaInicial: number; diaInicial: number; estrategia: 'sequencial' | 'mesmo_dia' }) => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('all')
  const [disciplinas, setDisciplinas] = useState<{ id: string; nome: string }[]>([])
  const [itens, setItens] = useState<ConjuntoParaCompor[]>([])
  const [buscando, setBuscando] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [semana, setSemana] = useState(1)
  const [dia, setDia] = useState(0)
  const [estrategia, setEstrategia] = useState<'sequencial' | 'mesmo_dia'>('sequencial')
  const [salvando, setSalvando] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open && !disciplinas.length) listarDisciplinasFiltro().then(setDisciplinas)
  }, [open, disciplinas.length])

  useEffect(() => {
    if (!open) return
    setBuscando(true)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const r = await buscarConjuntosParaCompor({ busca, disciplinaId: disc })
      setBuscando(false)
      setItens(r.ok ? (r.itens ?? []) : [])
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [open, busca, disc])

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const totalAulas = itens.filter((i) => sel.has(i.id)).reduce((n, i) => n + i.aulas, 0)

  async function confirmar() {
    if (!sel.size) return toast.error('Selecione ao menos um conjunto.')
    // Mantém a ordem em que aparecem na lista (que já vem por nome).
    const conjuntoIds = itens.filter((i) => sel.has(i.id)).map((i) => i.id)
    setSalvando(true)
    try {
      await onConfirmar({ conjuntoIds, semanaInicial: semana, diaInicial: dia, estrategia })
      setOpen(false)
      setSel(new Set())
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSel(new Set()) }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PackagePlus className="mr-1 h-4 w-4" /> Adicionar do banco
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Adicionar do banco de conteúdos</DialogTitle>
          <DialogDescription>Escolha conjuntos de aulas — cada um vira várias metas de uma vez. Depois é só refinar na grade.</DialogDescription>
        </DialogHeader>

        {/* Busca + filtro */}
        <div className="flex flex-wrap items-center gap-2 px-6 pb-2 pt-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conjunto…" className="pl-8" />
          </div>
          <Select value={disc} onValueChange={(v) => setDisc(v ?? 'all')}>
            <SelectTrigger className="h-9 w-48"><SelectValue>{disc === 'all' ? 'Todas as disciplinas' : (disciplinas.find((d) => d.id === disc)?.nome ?? '—')}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as disciplinas</SelectItem>
              {disciplinas.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Lista de conjuntos */}
        <div className="min-h-0 flex-1 space-y-1 overflow-auto px-3 pb-2">
          {buscando && !itens.length ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Buscando…</p>
          ) : !itens.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum conjunto no banco com esse filtro.</p>
          ) : (
            itens.map((c) => {
              const on = sel.has(c.id)
              return (
                <button key={c.id} type="button" onClick={() => toggle(c.id)} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.disciplina}</span>
                  </span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{c.aulas} aula(s)</Badge>
                  {c.questoes > 0 && <Badge variant="outline" className="shrink-0 text-[10px]">{c.questoes} q</Badge>}
                </button>
              )
            })
          )}
        </div>

        {/* Colocação */}
        <div className="space-y-2 border-t px-6 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Semana inicial</Label>
              <Input type="number" min={1} max={totalSemanas} value={semana} onChange={(e) => setSemana(Number(e.target.value))} className="h-8" />
            </div>
            <div className="w-32">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Dia inicial</Label>
              <Select value={String(dia)} onValueChange={(v) => setDia(Number(v ?? 0))}>
                <SelectTrigger className="h-8"><SelectValue>{diasNome[dia] ?? `dia ${dia}`}</SelectValue></SelectTrigger>
                <SelectContent>{diasNome.map((nome, i) => <SelectItem key={i} value={String(i)}>{nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="min-w-52 flex-1">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Distribuição</Label>
              <div className="flex gap-1.5">
                <button onClick={() => setEstrategia('sequencial')} className={cn('h-8 flex-1 rounded-lg border text-xs transition', estrategia === 'sequencial' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>uma aula por dia</button>
                <button onClick={() => setEstrategia('mesmo_dia')} className={cn('h-8 flex-1 rounded-lg border text-xs transition', estrategia === 'mesmo_dia' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>todas no mesmo dia</button>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-3 border-t px-6 py-3">
          <span className="text-sm text-muted-foreground">
            {sel.size === 0 ? 'Nenhum conjunto selecionado' : `${sel.size} conjunto(s) · ${totalAulas} aula(s)`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando || sel.size === 0}>
              {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Adicionar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

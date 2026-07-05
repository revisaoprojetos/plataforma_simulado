'use client'

import { useState, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { FileText, Check, Loader2, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { associarCaderno } from '@/app/admin/banco-questoes/estudantes-actions'

interface Caderno { id: string; nome: string; descricao?: string | null }
const SEM = '__sem__'

export function BancoCadernoClient({
  bancoId,
  cadernoAtualId,
  cadernos,
  cor = '#6d28d9',
}: {
  bancoId: string
  cadernoAtualId: string | null
  cadernos: Caderno[]
  cor?: string
}) {
  const [open, setOpen] = useState(false)
  const [atual, setAtual] = useState(cadernoAtualId)
  const [escolha, setEscolha] = useState<string>(cadernoAtualId ?? SEM)
  const [busca, setBusca] = useState('')
  const [pending, start] = useTransition()

  const nomeAtual = useMemo(() => cadernos.find((c) => c.id === atual)?.nome ?? null, [atual, cadernos])
  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return q ? cadernos.filter((c) => c.nome.toLowerCase().includes(q) || (c.descricao ?? '').toLowerCase().includes(q)) : cadernos
  }, [busca, cadernos])

  function salvar() {
    const id = escolha === SEM ? null : escolha
    start(async () => {
      const r = await associarCaderno(bancoId, id)
      if (r.ok) { setAtual(id); setOpen(false); toast.success(id ? 'Caderno associado' : 'Associação removida') }
      else toast.error(r.error ?? 'Erro')
    })
  }

  return (
    <Card className="max-w-xl overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><FileText className="h-5 w-5" /></span>
        <div>
          <h3 className="text-sm font-semibold leading-tight">Moldura do caderno</h3>
          <p className="text-xs text-muted-foreground">Capa, contracapa e fundo dos documentos</p>
        </div>
      </div>
      <CardContent className="space-y-3 px-4 pb-4 pt-4">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setEscolha(atual ?? SEM) }}>
        {/* Barra de seleção */}
        <DialogTrigger
          className="flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--input-bg,transparent)] px-4 py-3 text-left text-sm outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            {nomeAtual ? <span className="font-medium">{nomeAtual}</span> : <span className="text-muted-foreground">Selecionar caderno…</span>}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </DialogTrigger>

        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar caderno</DialogTitle>
          </DialogHeader>

          {/* Busca no topo */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar caderno…" className="pl-8" autoFocus />
          </div>

          {/* Lista */}
          <div className="max-h-72 space-y-1 overflow-y-auto py-1">
            <button type="button" onClick={() => setEscolha(SEM)}
              className={cn('flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm', escolha === SEM ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', escolha === SEM && 'border-primary bg-primary text-primary-foreground')}>
                {escolha === SEM && <Check className="h-3 w-3" />}
              </span>
              <span className="text-muted-foreground">Sem moldura</span>
            </button>
            {filtrados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {cadernos.length === 0 ? <>Nenhum caderno criado ainda. Crie em <strong>Cadernos de Prova</strong>.</> : 'Nenhum caderno encontrado.'}
              </p>
            ) : (
              filtrados.map((c) => {
                const on = escolha === c.id
                return (
                  <button key={c.id} type="button" onClick={() => setEscolha(c.id)}
                    className={cn('flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm', on ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                    <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on && 'border-primary bg-primary text-primary-foreground')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{c.nome}</span>
                      {c.descricao && <span className="block truncate text-xs text-muted-foreground">{c.descricao}</span>}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Salvar embaixo */}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="button" onClick={salvar} disabled={pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-sm text-muted-foreground">
        Caderno usado como <strong>moldura dos documentos</strong> deste banco (capa, contracapa e fundo).
      </p>
      </CardContent>
    </Card>
  )
}

'use client'
import { confirmar } from '@/components/ui/confirm-dialog'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RotateCcw, Trash2, Loader2, Search, Trash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { restaurarItem, excluirDefinitivo, type LixeiraItem } from '@/app/admin/lixeira/actions'

export function LixeiraClient({ itens }: { itens: LixeiraItem[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState('todos')
  const [acting, setActing] = useState<string | null>(null)

  const tipos = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of itens) m.set(i.tipo, (m.get(i.tipo) ?? 0) + 1)
    return [...m.entries()]
  }, [itens])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return itens.filter((i) => (aba === 'todos' || i.tipo === aba) && (!q || i.rotulo.toLowerCase().includes(q) || i.tipo.toLowerCase().includes(q)))
  }, [itens, aba, busca])

  function restaurar(i: LixeiraItem) {
    setActing(i.id)
    start(async () => {
      const r = await restaurarItem(i.tabela, i.id)
      setActing(null)
      if (r.ok) { toast.success(`${i.tipo} restaurado(a)`); router.refresh() }
      else toast.error(r.error ?? 'Erro ao restaurar')
    })
  }

  async function excluir(i: LixeiraItem) {
    if (!(await confirmar({ titulo: 'Excluir definitivamente', mensagem: `Excluir DEFINITIVAMENTE "${i.rotulo}"?\n\nEsta ação é permanente e cascateia os vínculos. Não pode ser desfeita.`, confirmar: 'Excluir', destrutivo: true }))) return
    setActing(i.id)
    start(async () => {
      const r = await excluirDefinitivo(i.tabela, i.id)
      setActing(null)
      if (r.ok) { toast.success('Excluído definitivamente'); router.refresh() }
      else toast.error(r.error ?? 'Erro ao excluir')
    })
  }

  const abas = [{ k: 'todos', label: 'Todos', n: itens.length }, ...tipos.map(([t, n]) => ({ k: t, label: t, n }))]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-48 flex-1 lg:max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…" className="pl-8" />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {abas.map((a) => (
            <button key={a.k} onClick={() => setAba(a.k)}
              className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', aba === a.k ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {a.label} <span className="text-muted-foreground">({a.n})</span>
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Trash className="h-10 w-10 opacity-40" />
          <p className="text-sm">{itens.length === 0 ? 'A Lixeira está vazia.' : 'Nenhum item neste filtro.'}</p>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {filtrados.map((i) => (
            <div key={`${i.tabela}:${i.id}`} className="flex items-center gap-3 px-4 py-3">
              <Badge variant="secondary" className="shrink-0">{i.tipo}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.rotulo}</p>
                <p className="text-xs text-muted-foreground">
                  Excluído {i.deletado_em ? format(new Date(i.deletado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—'}
                  {i.deletado_por_nome ? ` · por ${i.deletado_por_nome}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => restaurar(i)} disabled={pending && acting === i.id}>
                  {pending && acting === i.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
                  Restaurar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => excluir(i)} disabled={pending && acting === i.id}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="mr-1.5 h-4 w-4" /> Excluir de vez
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

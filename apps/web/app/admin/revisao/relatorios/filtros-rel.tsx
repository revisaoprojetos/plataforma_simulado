'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

// Filtros dos relatórios: grupo de alunos + período (estado na URL → a página renderiza no servidor) e o
// botão "Copiar tabela para planilha" (copia as barras visíveis em TSV; só formata dados já calculados).

type Linha = { nome: string; valor: string }

export function FiltrosRel({
  base, aba, grupoId, periodo, grupos, periodos, tabela,
}: {
  base: string
  aba: string
  grupoId: string
  periodo: string
  grupos: { id: string; nome: string }[]
  periodos: { id: string; rotulo: string }[]
  tabela: { titulo: string; linhas: Linha[] }[]
}) {
  const router = useRouter()
  const ir = (g: string, p: string) => {
    const q = new URLSearchParams({ aba, periodo: p })
    if (g) q.set('grupo', g)
    router.push(`${base}?${q.toString()}`, { scroll: false })
  }

  async function copiar() {
    const txt = tabela.flatMap((t) => [t.titulo, ...t.linhas.map((l) => `${l.nome}\t${l.valor}`)]).join('\n')
    if (!txt.trim()) { toast.error('Não há tabela para copiar nesta aba.'); return }
    try { await navigator.clipboard.writeText(txt); toast.success('Tabela copiada. Cole na planilha') } catch { toast.error('Não foi possível copiar.') }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <select
        aria-label="Grupo de alunos"
        value={grupoId}
        onChange={(e) => ir(e.target.value, periodo)}
        className="h-9 max-w-full rounded-[10px] border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">Todos os grupos</option>
        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
      </select>
      <div className="inline-flex gap-1 rounded-[14px] border bg-muted/40 p-1" role="group" aria-label="Período">
        {periodos.map((p) => (
          <button key={p.id} type="button" onClick={() => ir(grupoId, p.id)}
            className={cn('rounded-[10px] px-3 py-1 text-sm font-semibold transition', periodo === p.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {p.rotulo}
          </button>
        ))}
      </div>
      <button type="button" onClick={copiar} className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border bg-background px-3 text-[13px] font-medium transition hover:bg-muted">
        <Copy className="h-3.5 w-3.5" />Copiar tabela para planilha
      </button>
    </div>
  )
}

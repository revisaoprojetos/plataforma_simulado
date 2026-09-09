'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Loader2, Package, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCriar } from './criar-context'
import { Secao } from './secao'
import { dadosAcessos } from './dados'
import { criarPacote } from '../pacotes/actions'

export function SecaoAcessos() {
  const { draft, patch } = useCriar()
  const [pacotes, setPacotes] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    dadosAcessos().then((r) => {
      if (r.ok) setPacotes(r.pacotes ?? [])
      setCarregando(false)
    })
  }, [])

  function toggle(id: string) {
    patch({ pacoteIds: draft.pacoteIds.includes(id) ? draft.pacoteIds.filter((x) => x !== id) : [...draft.pacoteIds, id] })
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? pacotes.filter((p) => p.nome.toLowerCase().includes(t)) : pacotes
  }, [pacotes, busca])

  async function criarGrupo() {
    const nome = novoNome.trim()
    if (!nome || criando) return
    setCriando(true)
    try {
      const r = await criarPacote(nome, null)
      if (!r.ok || !r.id) {
        toast.error(r.error ?? 'Não foi possível criar o grupo.')
        return
      }
      const novo = { id: r.id, nome }
      setPacotes((xs) => (xs.some((p) => p.id === novo.id) ? xs : [...xs, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
      patch({ pacoteIds: [...draft.pacoteIds, r.id] }) // já seleciona o recém-criado
      setNovoNome('')
      setBusca('')
      toast.success(`Grupo "${nome}" criado e selecionado.`)
    } finally {
      setCriando(false)
    }
  }

  const nenhumSelecionado = draft.pacoteIds.length === 0

  return (
    <Secao
      numero={5}
      titulo="Acessos"
      descricao="Grupos de acesso que recebem o cronograma — é por eles que o aluno recebe. Opcional; dá para vincular depois."
      colapsavel
      defaultAberto
      acessorio={draft.pacoteIds.length > 0 ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{draft.pacoteIds.length} grupo(s)</span> : undefined}
    >
      {carregando ? (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos de acesso…
        </p>
      ) : (
        <div className="space-y-3">
          {/* Aviso: sem grupo, o cronograma nasce órfão (mesmo alerta do editor). */}
          {nenhumSelecionado && (
            <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Sem grupo selecionado, o cronograma não chega a nenhum aluno. Vincule agora ou depois, no editor.
            </p>
          )}

          {/* Busca — só quando há muitos grupos, para não poluir. */}
          {pacotes.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar grupo…" className="h-8 pl-8 pr-8" />
              {busca && (
                <button onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {pacotes.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Nenhum grupo de acesso ainda. Crie um abaixo — ou vincule depois de criar o cronograma.</p>
          ) : filtrados.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum grupo encontrado para “{busca}”.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtrados.map((p) => {
                const on = draft.pacoteIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={cn('flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition hover:scale-[1.01] active:scale-[0.99]', on ? 'border-primary bg-primary/5' : 'hover:bg-muted')}
                  >
                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nome}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Criar grupo inline — cria e já seleciona. */}
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="min-w-0 flex-1">
              <Label className="mb-1 block text-[11px] uppercase tracking-wide text-muted-foreground">Novo grupo de acesso</Label>
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Turma 2026"
                className="h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    criarGrupo()
                  }
                }}
              />
            </div>
            <Button size="sm" onClick={criarGrupo} disabled={!novoNome.trim() || criando} className="h-8">
              {criando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Criar
            </Button>
          </div>
        </div>
      )}
    </Secao>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Package, Plus, Search, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCriar } from './criar-context'
import { Secao } from './secao'
import { dadosAcessos } from './dados'
import { criarPacote } from '../pacotes/actions'

type Pacote = { id: string; nome: string }

export function SecaoAcessos() {
  const { draft, patch } = useCriar()
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [carregando, setCarregando] = useState(true)
  const [gerenciar, setGerenciar] = useState(false)
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

  async function criarGrupo(nome: string): Promise<boolean> {
    const n = nome.trim()
    if (!n || criando) return false
    setCriando(true)
    try {
      const r = await criarPacote(n, null)
      if (!r.ok || !r.id) {
        toast.error(r.error ?? 'Não foi possível criar o grupo.')
        return false
      }
      const novo = { id: r.id, nome: n }
      setPacotes((xs) => (xs.some((p) => p.id === novo.id) ? xs : [...xs, novo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
      patch({ pacoteIds: [...draft.pacoteIds, r.id] }) // cria e já adiciona
      toast.success(`Grupo "${n}" criado e adicionado.`)
      return true
    } finally {
      setCriando(false)
    }
  }

  const selecionados = useMemo(() => pacotes.filter((p) => draft.pacoteIds.includes(p.id)), [pacotes, draft.pacoteIds])
  const nenhum = draft.pacoteIds.length === 0

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
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Package className="h-4 w-4 text-primary" /> Grupos que recebem</p>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setGerenciar(true)}><Settings2 className="mr-1 h-3.5 w-3.5" /> Gerenciar</Button>
          </div>

          {nenhum ? (
            <button
              type="button"
              onClick={() => setGerenciar(true)}
              className="flex w-full items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-xs text-amber-600 transition hover:bg-amber-500/10 dark:text-amber-400"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Sem grupo selecionado, o cronograma não chega a nenhum aluno. Clique para gerenciar.
            </button>
          ) : (
            <button type="button" onClick={() => setGerenciar(true)} className="w-full rounded-xl border bg-muted/10 px-3 py-2.5 text-left transition hover:bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{selecionados.length} grupo(s) recebendo</span>
                <span className="flex items-center gap-1 text-xs font-medium text-primary"><Settings2 className="h-3.5 w-3.5" /> Gerenciar</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {selecionados.slice(0, 12).map((p) => (
                  <span key={p.id} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                    <Package className="h-3 w-3" /> {p.nome}
                  </span>
                ))}
                {selecionados.length > 12 && <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground">+{selecionados.length - 12}</span>}
              </div>
            </button>
          )}
        </div>
      )}

      <GerenciarAcessos
        aberto={gerenciar}
        aoFechar={() => setGerenciar(false)}
        pacotes={pacotes}
        selecionadosIds={draft.pacoteIds}
        onToggle={toggle}
        onCriar={criarGrupo}
        criando={criando}
      />
    </Secao>
  )
}

/**
 * Pop-up "Gerenciar acessos" — duas colunas (estilo transfer list): à ESQUERDA todos os grupos da
 * plataforma (com busca) + criar grupo; à DIREITA os que recebem este cronograma (com busca + remover).
 */
function GerenciarAcessos({
  aberto,
  aoFechar,
  pacotes,
  selecionadosIds,
  onToggle,
  onCriar,
  criando,
}: {
  aberto: boolean
  aoFechar: () => void
  pacotes: Pacote[]
  selecionadosIds: string[]
  onToggle: (id: string) => void
  onCriar: (nome: string) => Promise<boolean>
  criando: boolean
}) {
  const [buscaEsq, setBuscaEsq] = useState('')
  const [buscaDir, setBuscaDir] = useState('')
  const [novoNome, setNovoNome] = useState('')

  const sel = useMemo(() => new Set(selecionadosIds), [selecionadosIds])
  const filtra = (arr: Pacote[], termo: string) => {
    const t = termo.trim().toLowerCase()
    return t ? arr.filter((p) => p.nome.toLowerCase().includes(t)) : arr
  }
  const disponiveis = useMemo(() => pacotes.filter((p) => !sel.has(p.id)), [pacotes, sel])
  const adicionados = useMemo(() => pacotes.filter((p) => sel.has(p.id)), [pacotes, sel])
  const fEsq = filtra(disponiveis, buscaEsq)
  const fDir = filtra(adicionados, buscaDir)

  async function criar() {
    const ok = await onCriar(novoNome)
    if (ok) setNovoNome('')
  }

  const campoBusca = (valor: string, set: (v: string) => void, placeholder: string) => (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={valor} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="h-8 pl-8 pr-8" />
      {valor && (
        <button onClick={() => set('')} aria-label="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Gerenciar acessos</DialogTitle>
          <DialogDescription>
            À esquerda, todos os grupos da plataforma; à direita, os que recebem este cronograma. É por eles que o aluno recebe.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
          {/* ESQUERDA — disponíveis + criar */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="space-y-2 border-b p-2.5">
              <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Disponíveis ({disponiveis.length})</p>
              {campoBusca(buscaEsq, setBuscaEsq, 'Buscar grupo…')}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {disponiveis.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Todos os grupos já foram adicionados.</p>
              ) : fEsq.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Nenhum grupo encontrado.</p>
              ) : (
                fEsq.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onToggle(p.id)}
                    title="Adicionar"
                    className="group/it flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition group-hover/it:bg-primary group-hover/it:text-primary-foreground">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))
              )}
            </div>
            {/* Criar grupo inline */}
            <div className="flex items-center gap-2 border-t p-2.5">
              <Input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Novo grupo (ex.: Turma 2026)"
                className="h-8"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    criar()
                  }
                }}
              />
              <Button size="sm" onClick={criar} disabled={!novoNome.trim() || criando} className="h-8 shrink-0">
                {criando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                Criar
              </Button>
            </div>
          </div>

          {/* DIREITA — adicionados + remover */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="space-y-2 border-b p-2.5">
              <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Adicionados ({adicionados.length})</p>
              {campoBusca(buscaDir, setBuscaDir, 'Buscar adicionados…')}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {adicionados.length === 0 ? (
                <p className="flex flex-col items-center gap-1.5 px-3 py-8 text-center text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  Nenhum grupo adicionado. Sem grupo, o cronograma não chega a nenhum aluno.
                </p>
              ) : fDir.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Nenhum grupo encontrado.</p>
              ) : (
                fDir.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-sm">
                    <Package className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                    <button onClick={() => onToggle(p.id)} title="Remover" className="shrink-0 text-muted-foreground transition hover:scale-110 hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-3 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">{adicionados.length} grupo(s) recebendo este cronograma</span>
          <Button onClick={aoFechar}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

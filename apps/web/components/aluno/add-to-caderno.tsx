'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { NotebookPen, Plus, Check, Loader2 } from 'lucide-react'
import { carregarCadernos, destinosEmCache, registrarSalvo, type CadernoLista, type Destino } from '@/lib/aluno/cadernos-cliente'

type Caderno = CadernoLista

// Destino padrão de 'questoes' (configurado no leitor / Meus Cadernos):
//   • padrão + "salvar sem perguntar" → o clique no ícone grava direto e mostra "Salvo em X";
//   • padrão sem "sem perguntar" → abre o popover com o caderno padrão já em destaque (primeiro da lista);
//   • sem padrão → comportamento de sempre.
export function AddToCaderno({ questaoId }: { questaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [cadernos, setCadernos] = useState<Caderno[] | null>(null)
  const [novo, setNovo] = useState('')
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [padrao, setPadrao] = useState<Destino | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    destinosEmCache().then((r) => { if (vivo && !r.indisponivel) setPadrao(r.destinos.questoes) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!aberto) return
    if (cadernos === null) {
      carregarCadernos().then(setCadernos)
    }
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [aberto, cadernos])

  async function adicionar(cadernoId: string, nome?: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch('/api/aluno/cadernos/questao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ caderno_id: cadernoId, questao_id: questaoId }),
      })
      if (res.ok) {
        setAddedTo((s) => new Set(s).add(cadernoId))
        const n = nome ?? cadernos?.find((c) => c.id === cadernoId)?.nome
        if (n) registrarSalvo(cadernoId, n, 'questao')
        return true
      }
      return false
    } finally { setBusy(false) }
  }

  async function aoClicarIcone() {
    if (padrao?.caderno_id && padrao.salvar_sem_perguntar && !busy) {
      // grava direto no caderno padrão de Questões
      const lista = cadernos ?? (await carregarCadernos())
      if (cadernos === null) setCadernos(lista)
      const c = lista.find((x) => x.id === padrao.caderno_id)
      if (c) {
        if (addedTo.has(c.id)) { toast(`Já está em ${c.nome}`); return }
        const ok = await adicionar(c.id, c.nome)
        if (ok) toast.success(`Salvo em ${c.nome}`); else toast.error('Não consegui salvar no caderno agora.')
        return
      }
    }
    setAberto((v) => !v)
  }

  async function criarEAdicionar(e: React.FormEvent) {
    e.preventDefault()
    if (!novo.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/aluno/cadernos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novo }),
      })
      if (res.ok) {
        const { caderno } = await res.json()
        setCadernos((c) => [caderno, ...(c ?? [])])
        setNovo('')
        await adicionar(caderno.id, caderno.nome)
      }
    } finally { setBusy(false) }
  }

  // Caderno padrão primeiro (pré-selecionado visualmente).
  const lista = cadernos && padrao?.caderno_id
    ? [...cadernos].sort((a, b) => Number(b.id === padrao.caderno_id) - Number(a.id === padrao.caderno_id))
    : cadernos

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={aoClicarIcone}
        aria-label="Adicionar a caderno"
        className="text-muted-foreground hover:text-primary"
        title="Adicionar a caderno"
      >
        {busy && !aberto ? <Loader2 className="h-5 w-5 animate-spin" /> : <NotebookPen className="h-5 w-5" />}
      </button>

      {aberto && (
        <div className="absolute right-0 top-8 z-50 w-60 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold">Adicionar a caderno</div>
          <div className="max-h-56 overflow-auto">
            {lista === null ? (
              <div className="p-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : lista.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum caderno ainda.</p>
            ) : (
              lista.map((c) => {
                const added = addedTo.has(c.id)
                const ehPadrao = padrao?.caderno_id === c.id
                return (
                  <button key={c.id} disabled={busy || added} onClick={() => adicionar(c.id, c.nome)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-70 ${ehPadrao ? 'bg-muted/60' : ''}`}>
                    <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                    {ehPadrao && !added && <span className="shrink-0 rounded border px-1 text-[10px] font-semibold uppercase text-muted-foreground">padrão</span>}
                    {added ? <Check className="h-4 w-4 text-green-600" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )
              })
            )}
          </div>
          <form onSubmit={criarEAdicionar} className="flex gap-1 border-t p-2">
            <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo caderno…" maxLength={120}
              className="min-w-0 flex-1 rounded-md border bg-[var(--input-bg,transparent)] px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
            <button type="submit" disabled={busy || !novo.trim()} className="shrink-0 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

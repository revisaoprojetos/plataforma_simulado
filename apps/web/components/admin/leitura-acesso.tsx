'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Search, X, Users, UserPlus, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  carregarAtribuicao, definirGruposDocumento,
  carregarEstudantesDocumento, definirEstudantesDocumento, buscarEstudantesLeitura,
  type EstudanteRef,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null; atribuido: boolean }

// Aba "Acesso": define QUEM lê esta leitura — por grupo (turma) e/ou por aluno.
// Sem nenhuma atribuição = liberado a todos os alunos do tenant.
export function LeituraAcesso({ documentoId }: { documentoId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [alunos, setAlunos] = useState<EstudanteRef[]>([])
  // Busca de alunos
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<EstudanteRef[]>([])
  const [buscando, setBuscando] = useState(false)
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ;(async () => {
      const [a, e] = await Promise.all([carregarAtribuicao(documentoId), carregarEstudantesDocumento(documentoId)])
      if (a.ok && a.grupos) { setGrupos(a.grupos); setMarcados(new Set(a.grupos.filter((g) => g.atribuido).map((g) => g.id))) }
      if (e.ok && e.itens) setAlunos(e.itens)
      setCarregando(false)
    })()
  }, [documentoId])

  // Busca debounced de alunos.
  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    if (!busca.trim()) { setResultados([]); return }
    setBuscando(true)
    buscaTimer.current = setTimeout(async () => {
      const r = await buscarEstudantesLeitura(busca)
      setResultados(r.ok ? (r.itens ?? []) : [])
      setBuscando(false)
    }, 300)
    return () => { if (buscaTimer.current) clearTimeout(buscaTimer.current) }
  }, [busca])

  function toggleGrupo(id: string) {
    setMarcados((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function adicionarAluno(a: EstudanteRef) {
    setAlunos((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]))
    setBusca(''); setResultados([])
  }
  function removerAluno(id: string) { setAlunos((prev) => prev.filter((a) => a.id !== id)) }

  async function salvar() {
    setSalvando(true)
    const [rg, re] = await Promise.all([
      definirGruposDocumento(documentoId, [...marcados]),
      definirEstudantesDocumento(documentoId, alunos.map((a) => a.id)),
    ])
    setSalvando(false)
    if (rg.ok && re.ok) toast.success('Acesso salvo')
    else toast.error(rg.error ?? re.error ?? 'Erro ao salvar acesso.')
  }

  const semRestricao = marcados.size === 0 && alunos.length === 0

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className={cn('flex items-start gap-2 rounded-xl border px-4 py-3 text-sm', semRestricao ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {semRestricao
          ? <span>Sem nenhuma atribuição, esta leitura fica <strong>liberada para todos</strong> os alunos do tenant.</span>
          : <span>Acesso restrito a <strong>{marcados.size}</strong> {marcados.size === 1 ? 'grupo' : 'grupos'} e <strong>{alunos.length}</strong> {alunos.length === 1 ? 'aluno' : 'alunos'} avulsos (a união dos dois).</span>}
      </div>

      {/* Grupos */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Grupos com acesso</p>
        {grupos.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum grupo cadastrado neste tenant.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {grupos.map((g) => (
              <label key={g.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors', marcados.has(g.id) ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/40')}>
                <input type="checkbox" checked={marcados.has(g.id)} onChange={() => toggleGrupo(g.id)} className="h-4 w-4 rounded border" />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.cor ?? '#94a3b8' }} />
                <span className="truncate">{g.nome}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Alunos individuais */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><UserPlus className="h-4 w-4 text-primary" /> Alunos avulsos</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno por nome, e-mail ou CPF…"
            className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          {(buscando || resultados.length > 0) && busca.trim() && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
              {buscando ? (
                <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</p>
              ) : resultados.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum aluno encontrado.</p>
              ) : resultados.map((a) => {
                const ja = alunos.some((x) => x.id === a.id)
                return (
                  <button key={a.id} type="button" disabled={ja} onClick={() => adicionarAluno(a)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-50">
                    <span className="min-w-0"><span className="block truncate">{a.nome}</span>{a.email && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}</span>
                    {ja ? <span className="shrink-0 text-xs text-muted-foreground">já incluído</span> : <UserPlus className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {alunos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum aluno avulso. Use a busca acima para adicionar.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {alunos.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-xs">
                <span className="max-w-40 truncate" title={a.email ?? a.nome}>{a.nome}</span>
                <button type="button" onClick={() => removerAluno(a.id)} className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remover ${a.nome}`}><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar acesso
        </button>
      </div>
    </div>
  )
}

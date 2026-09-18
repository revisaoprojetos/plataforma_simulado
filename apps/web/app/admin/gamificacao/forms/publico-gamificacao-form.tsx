'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, Users, Info, Check, Trash2, Link2, Globe, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import { type EstudanteAcessoLinha } from '@/app/admin/leitura/actions'
import { carregarPublicoGam, salvarModoPublico, definirGruposGam, definirEstudantesGam, estudantesDosGruposGam } from '../actions'

type Grupo = { id: string; nome: string; cor: string | null; is_mestre?: boolean; pai_id?: string | null; membros?: number; origem?: 'guru' | 'curseduca' | null }
type Linha = EstudanteAcessoLinha & { origem: 'avulso' | 'grupo'; grupoId?: string; grupoNome?: string | null }
const POR_PAGINA = 50

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

/**
 * Público da GAMIFICAÇÃO — quem participa, em UM card só (estilo banco de simulado): "Liberar para todos"
 * × restrito, com "Adicionar estudante" + "Adicionar grupo" no mesmo card. Ao vincular um grupo ele fica
 * marcado como "já vinculado" no picker e os alunos dele JÁ aparecem na lista (conexão viva: novos
 * membros — manual ou por sync — entram automaticamente). Alunos avulsos são removíveis; a etiqueta do
 * grupo desvincula o grupo inteiro.
 */
export function PublicoGamificacaoForm({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [todos, setTodos] = useState(false) // modo 'todos' (liberar p/ todos) × 'selecionados'
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [vinc, setVinc] = useState<Set<string>>(new Set())
  const vincRef = useRef<Set<string>>(new Set()); vincRef.current = vinc
  const [membros, setMembros] = useState<(EstudanteAcessoLinha & { grupoId: string; grupoNome: string | null })[]>([])
  const [avulsos, setAvulsos] = useState<EstudanteAcessoLinha[]>([])
  const avulsosRef = useRef<EstudanteAcessoLinha[]>([]); avulsosRef.current = avulsos
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    ;(async () => {
      const r = await carregarPublicoGam()
      if (r.ok) {
        setTodos((r.modo ?? 'todos') === 'todos')
        const gs: Grupo[] = (r.grupos ?? []).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, is_mestre: g.is_mestre, pai_id: g.pai_id, membros: g.membros, origem: g.origem }))
        setGrupos(gs)
        const linked = (r.grupos ?? []).filter((g) => g.atribuido).map((g) => g.id)
        setVinc(new Set(linked))
        setAvulsos(r.estudantes ?? [])
        if (linked.length) {
          const mr = await estudantesDosGruposGam(linked)
          const nomeParaId = new Map<string, string>(gs.map((g) => [g.nome, g.id]))
          setMembros((mr.itens ?? []).map((m: any) => ({ ...m, grupoId: m.grupoNome ? (nomeParaId.get(m.grupoNome) ?? '') : '', grupoNome: m.grupoNome ?? null })))
        }
        if (r.aviso) toast.info(r.aviso)
      } else if (r.error) toast.error(r.error)
      setCarregando(false)
    })()
  }, [])

  // Lista única: membros de grupos (conexão viva) + avulsos, deduplicados por id (grupo tem precedência).
  const linhas: Linha[] = useMemo(() => {
    const map = new Map<string, Linha>()
    for (const m of membros) map.set(m.id, { ...m, origem: 'grupo', grupoId: m.grupoId, grupoNome: m.grupoNome })
    for (const a of avulsos) if (!map.has(a.id)) map.set(a.id, { ...a, origem: 'avulso' })
    return [...map.values()].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
  }, [membros, avulsos])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? linhas.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || (a.cpf ?? '').includes(q)) : linhas
  }, [linhas, busca])
  const totalPag = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtradas.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtradas, pagina])
  useEffect(() => { setPagina(0) }, [busca])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  async function trocarTodos(v: boolean) {
    if (!podeGerenciar) return
    setTodos(v); setSalvando(true)
    const r = await salvarModoPublico(v ? 'todos' : 'selecionados')
    setSalvando(false)
    if (r?.error) { toast.error(r.error); return }
    if (r?.aviso) toast.info(r.aviso)
  }

  // ── GRUPOS (conexão viva) ──
  async function salvarGrupos(ids: string[]) {
    setSalvando(true)
    const r = await definirGruposGam(ids)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar grupos.'); setSalvando(false); return }
    setVinc(new Set(ids))
    const mr = ids.length ? await estudantesDosGruposGam(ids) : { ok: true, itens: [] as any[] }
    const nomeParaId = new Map<string, string>(grupos.map((g) => [g.nome, g.id]))
    setMembros((mr.itens ?? []).map((m: any) => ({ ...m, grupoId: m.grupoNome ? (nomeParaId.get(m.grupoNome) ?? '') : '', grupoNome: m.grupoNome ?? null })))
    setSalvando(false)
    if (ids.length && todos) void trocarTodos(false)
  }
  function adicionarGrupos(novos: string[]) { void salvarGrupos([...new Set([...vincRef.current, ...novos])]) }
  async function removerGrupo(id: string, nome?: string | null) {
    const ok = await confirmar({ titulo: 'Desvincular grupo', mensagem: `Remover o grupo ${nome ?? ''} do público da gamificação? Os alunos dele deixam de participar (a menos que também estejam avulsos ou em outro grupo).`, confirmar: 'Desvincular', destrutivo: true })
    if (!ok) return
    void salvarGrupos([...vincRef.current].filter((g) => g !== id))
  }

  // ── AVULSOS ──
  async function salvarAvulsos(ids: string[]) {
    setSalvando(true)
    const r = await definirEstudantesGam(ids)
    setSalvando(false)
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar alunos.')
    if (ids.length && todos) void trocarTodos(false)
  }
  function comitarAvulsos(next: EstudanteAcessoLinha[]) { setAvulsos(next); void salvarAvulsos(next.map((a) => a.id)) }
  function adicionarAvulsos(novos: AlunoSel[]) {
    const map = new Map(avulsosRef.current.map((a) => [a.id, a]))
    for (const n of novos) if (!map.has(n.id)) map.set(n.id, { id: n.id, nome: n.nome, email: n.email, cpf: n.cpf, classificacao: n.classificacao, avatar: n.avatar, perfil_avatar_cor: n.perfil_avatar_cor })
    comitarAvulsos([...map.values()])
  }
  function removerSelecionados() {
    const rem = new Set([...sel])
    comitarAvulsos(avulsosRef.current.filter((a) => !rem.has(a.id)))
    setSel(new Set())
  }

  // Só avulsos são selecionáveis (linhas de grupo saem via "desvincular grupo").
  const avulsoIds = useMemo(() => new Set(avulsos.map((a) => a.id)), [avulsos])
  function toggleSel(id: string) { if (!avulsoIds.has(id)) return; setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const jaIds = useMemo(() => new Set(linhas.map((l) => l.id)), [linhas])
  const totalParticipantes = linhas.length

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando público…</div>

  return (
    <div className="space-y-4">
      {/* Liberar para todos × restrito (mesmo formato do banco de simulado). */}
      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm', todos ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {todos
            ? <>A gamificação vale para <strong>todos</strong> os alunos da plataforma.</>
            : <>Restrita a <strong>{totalParticipantes.toLocaleString('pt-BR')}</strong> aluno(s) — dos grupos vinculados + avulsos.</>}
        </span>
        {salvando && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>}
        <button type="button" onClick={() => trocarTodos(!todos)} disabled={!podeGerenciar || salvando}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60', todos ? 'border-current/30 hover:bg-foreground/5' : 'border-primary bg-primary text-primary-foreground hover:opacity-90')}>
          {todos ? <><Lock className="h-4 w-4" /> Restringir</> : <><Globe className="h-4 w-4" /> Liberar para todos</>}
        </button>
      </div>

      {/* UM card só: adicionar estudante + grupo + lista única (membros de grupo com etiqueta). */}
      <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm transition-opacity', todos && 'pointer-events-none select-none opacity-50')} aria-disabled={todos}>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> Quem participa <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{totalParticipantes}</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {sel.size > 0 && (
            <button type="button" onClick={removerSelecionados} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-4 w-4" /> Remover {sel.size}</button>
          )}
          {podeGerenciar && <AdicionarEstudantesDialog jaIds={jaIds} onSelecionar={adicionarAvulsos} />}
          {podeGerenciar && <AdicionarGrupoModuloDialog grupos={grupos} jaMarcados={vinc} onSelecionar={adicionarGrupos} />}
        </div>

        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
                <th className="px-3 py-2 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Ninguém ainda. Use “Adicionar estudantes” ou “Adicionar grupo”.</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
              ) : paginaItens.map((a) => {
                const avulso = a.origem === 'avulso'
                const on = sel.has(a.id)
                return (
                  <tr key={a.id} onClick={() => toggleSel(a.id)} className={cn('border-b transition-colors', avulso ? 'cursor-pointer hover:bg-muted/40' : '', on && 'bg-primary/5')}>
                    <td className="px-3 py-2">
                      {avulso ? (
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                      ) : <span className="block h-4 w-4" />}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-primary" style={{ backgroundColor: a.perfil_avatar_cor ?? 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          {a.avatar ? <img src={a.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" /> : iniciais(a.nome)}
                        </span>
                        <div className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium">{a.nome}</span><ClassificacaoBadge classificacao={a.classificacao} /></div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell"><span className="block truncate">{a.email ?? '—'}</span></td>
                    <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground md:table-cell">{a.cpf ?? '—'}</td>
                    <td className="px-3 py-2">
                      {avulso ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Avulso</span>
                      ) : (
                        <button type="button" onClick={(e) => { e.stopPropagation(); if (a.grupoId) void removerGrupo(a.grupoId, a.grupoNome) }} title={a.grupoId ? `Desvincular grupo ${a.grupoNome ?? ''}` : 'Grupo vinculado'}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20">
                          <Link2 className="h-3 w-3" /> {a.grupoNome ?? 'Grupo'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{filtradas.length.toLocaleString('pt-BR')} de {totalParticipantes.toLocaleString('pt-BR')} participante(s)</span>
          {totalPag > 1 && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Anterior</button>
              <span className="px-1 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} className="rounded-md border px-2 py-1 font-medium transition-colors hover:bg-muted disabled:opacity-40">Próxima</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

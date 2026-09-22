'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, UserCheck, Info, Check, Trash2, Globe, Lock, Link2, Users2, X, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyLink } from '@/components/admin/copy-link'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import {
  carregarAtribuicaoPasta, definirGruposPasta, contarMembrosGrupos,
  carregarEstudantesPasta, definirEstudantesPasta,
  carregarRankingOcultos, salvarRankingOcultos,
  type EstudanteAcessoLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null }
type GrupoVinc = Grupo & { count: number }
const POR_PAGINA = 50

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

// Aba "Acessos" do MÓDULO. GRUPOS ficam VINCULADOS (conexão viva): novos alunos no grupo — manual ou
// via sync (Curseduca/Guru) — passam a ter acesso automaticamente (o gate une pasta_grupos+membros ao
// vivo). "Adicionar estudantes" adiciona indivíduos avulsos. "Liberar para todos" = sem restrição.
export function ModuloAcesso({ pastaId }: { pastaId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [todosGrupos, setTodosGrupos] = useState<Grupo[]>([])
  const [vinc, setVinc] = useState<GrupoVinc[]>([])
  const vincRef = useRef<GrupoVinc[]>([]); vincRef.current = vinc
  const [alunos, setAlunos] = useState<EstudanteAcessoLinha[]>([])
  const alunosRef = useRef<EstudanteAcessoLinha[]>([]); alunosRef.current = alunos
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [liberarTodos, setLiberarTodos] = useState(false)
  const [origem, setOrigem] = useState('')
  useEffect(() => { setOrigem(process.env.NEXT_PUBLIC_APP_URL || window.location.origin) }, [])
  const linkTrilha = origem ? `${origem}/aluno/leitura?modulo=${pastaId}` : ''

  // Ocultos do ranking (contas de teste): não contam pontos e não aparecem para o aluno.
  const [ocEst, setOcEst] = useState<EstudanteAcessoLinha[]>([])
  const [ocGrp, setOcGrp] = useState<{ id: string; nome: string; cor: string | null }[]>([])
  const [ocTotal, setOcTotal] = useState(false)
  const ocEstRef = useRef<EstudanteAcessoLinha[]>([]); ocEstRef.current = ocEst
  const ocGrpRef = useRef<{ id: string; nome: string; cor: string | null }[]>([]); ocGrpRef.current = ocGrp
  async function salvarOcultos(est: EstudanteAcessoLinha[], grp: { id: string; nome: string; cor: string | null }[], total: boolean) {
    const r = await salvarRankingOcultos(pastaId, { estudantes: est.map((e) => e.id), grupos: grp.map((g) => g.id), total })
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar.')
  }

  useEffect(() => {
    ;(async () => {
      const [a, e] = await Promise.all([carregarAtribuicaoPasta(pastaId), carregarEstudantesPasta(pastaId)])
      const grupos = a.ok && a.grupos ? a.grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor })) : []
      setTodosGrupos(grupos)
      const vincList = a.ok && a.grupos ? a.grupos.filter((g) => g.atribuido).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor })) : []
      const cont = vincList.length ? await contarMembrosGrupos(vincList.map((g) => g.id)) : { ok: true, contagem: {} as Record<string, number> }
      setVinc(vincList.map((g) => ({ ...g, count: cont.contagem?.[g.id] ?? 0 })))
      if (e.ok && e.itens) setAlunos(e.itens)
      setLiberarTodos(!(vincList.length || (e.ok && (e.itens?.length ?? 0) > 0)))
      const oc = await carregarRankingOcultos(pastaId)
      if (oc.ok) { setOcEst(oc.estudantes ?? []); setOcGrp(oc.grupos ?? []); setOcTotal(oc.total ?? false) }
      setCarregando(false)
    })()
  }, [pastaId])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? alunos.filter((a) => a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || (a.cpf ?? '').includes(q)) : alunos
  }, [alunos, busca])
  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtrados, pagina])
  useEffect(() => { setPagina(0) }, [busca])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  // ── GRUPOS (vínculo vivo) ──
  async function salvarGrupos(ids: string[]) {
    setSalvando(true)
    const r = await definirGruposPasta(pastaId, ids)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar grupos.'); setSalvando(false); return }
    const cont = ids.length ? await contarMembrosGrupos(ids) : { ok: true, contagem: {} as Record<string, number> }
    setVinc(ids.map((id) => { const g = todosGrupos.find((x) => x.id === id); return { id, nome: g?.nome ?? 'Grupo', cor: g?.cor ?? null, count: cont.contagem?.[id] ?? 0 } }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setSalvando(false)
    if (ids.length || alunosRef.current.length) setLiberarTodos(false)
  }
  function adicionarGrupos(novos: string[]) {
    const ids = [...new Set([...vincRef.current.map((g) => g.id), ...novos])]
    void salvarGrupos(ids)
  }
  function removerGrupo(id: string) { void salvarGrupos(vincRef.current.filter((g) => g.id !== id).map((g) => g.id)) }

  // ── ALUNOS individuais ──
  async function salvarAlunos(ids: string[]) {
    setSalvando(true)
    const r = await definirEstudantesPasta(pastaId, ids)
    setSalvando(false)
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar alunos.')
    if (ids.length || vincRef.current.length) setLiberarTodos(false)
  }
  function comitarAlunos(next: EstudanteAcessoLinha[]) { setAlunos(next); void salvarAlunos(next.map((a) => a.id)) }
  function adicionarAlunos(novos: AlunoSel[]) {
    const map = new Map(alunosRef.current.map((a) => [a.id, a]))
    for (const n of novos) if (!map.has(n.id)) map.set(n.id, { id: n.id, nome: n.nome, email: n.email, cpf: n.cpf, classificacao: n.classificacao, avatar: n.avatar, perfil_avatar_cor: n.perfil_avatar_cor })
    comitarAlunos([...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
  }
  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleTodosFiltrados() { setSel((p) => { const n = new Set(p); const todos = filtrados.length > 0 && filtrados.every((a) => n.has(a.id)); filtrados.forEach((a) => (todos ? n.delete(a.id) : n.add(a.id))); return n }) }
  function removerSelecionados() { comitarAlunos(alunosRef.current.filter((a) => !sel.has(a.id))); setSel(new Set()) }

  async function liberarParaTodos() {
    setLiberarTodos(true); setSalvando(true)
    await Promise.all([definirGruposPasta(pastaId, []), definirEstudantesPasta(pastaId, [])])
    setVinc([]); setAlunos([]); setSalvando(false)
  }

  const acessoIds = useMemo(() => new Set(alunos.map((a) => a.id)), [alunos])
  const vincIds = useMemo(() => new Set(vinc.map((g) => g.id)), [vinc])
  const filtradosTodosSel = filtrados.length > 0 && filtrados.every((a) => sel.has(a.id))
  const totalGrupoMembros = vinc.reduce((s, g) => s + g.count, 0)

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="space-y-4">
      {/* Link direto para a trilha interna do módulo */}
      <div className="space-y-1.5 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" /> Link direto para a trilha</p>
        <p className="text-xs text-muted-foreground">Envie este link aos alunos com acesso — abre direto a trilha deste módulo (pede login se o aluno ainda não estiver logado).</p>
        {linkTrilha ? <CopyLink url={linkTrilha} /> : <div className="h-9 animate-pulse rounded bg-muted" />}
      </div>

      {/* Aviso + "Liberar para todos" */}
      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm', liberarTodos ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {liberarTodos
            ? <>Sem nenhuma atribuição, este módulo fica <strong>liberado para todos</strong> os alunos.</>
            : <>Restrito a <strong>{vinc.length}</strong> grupo(s) {totalGrupoMembros > 0 && <>(~{totalGrupoMembros.toLocaleString('pt-BR')} alunos)</>} + <strong>{alunos.length}</strong> aluno(s) avulso(s).</>}
        </span>
        {salvando && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>}
        <button type="button" onClick={() => (liberarTodos ? setLiberarTodos(false) : liberarParaTodos())}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors', liberarTodos ? 'border-primary bg-primary text-primary-foreground hover:opacity-90' : 'border-current/30 hover:bg-foreground/5')}>
          {liberarTodos ? <><Lock className="h-4 w-4" /> Restringir acesso</> : <><Globe className="h-4 w-4" /> Liberar para todos</>}
        </button>
      </div>

      <div className={cn('space-y-4 transition-opacity', liberarTodos && 'pointer-events-none select-none opacity-50')} aria-disabled={liberarTodos}>
        {/* GRUPOS VINCULADOS (conexão viva) */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><Users2 className="h-4 w-4 text-primary" /> Grupos vinculados <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{vinc.length}</span></p>
            <div className="ml-auto"><AdicionarGrupoModuloDialog grupos={todosGrupos} jaMarcados={vincIds} onSelecionar={(ids) => adicionarGrupos(ids)} /></div>
          </div>
          <div className="p-3">
            {vinc.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">Nenhum grupo vinculado. Vincule um grupo — novos alunos nele (inclusive por sync Curseduca/Guru) entram automaticamente.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vinc.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.cor ?? 'var(--primary)' }} />
                    <span className="font-medium">{g.nome}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{g.count.toLocaleString('pt-BR')}</span>
                    <button type="button" onClick={() => removerGrupo(g.id)} title="Desvincular grupo" className="ml-0.5 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ALUNOS AVULSOS (individuais) */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos avulsos <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{alunos.length}</span></p>
            <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nos avulsos…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            {sel.size > 0 && (
              <button type="button" onClick={removerSelecionados} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-4 w-4" /> Remover {sel.size}</button>
            )}
            <AdicionarEstudantesDialog jaIds={acessoIds} onSelecionar={adicionarAlunos} />
          </div>

          <div className="max-h-[46vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-10 px-3 py-2">
                    <button type="button" onClick={toggleTodosFiltrados} title="Marcar/desmarcar os filtrados" className={cn('flex h-4 w-4 items-center justify-center rounded border', filtradosTodosSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{filtradosTodosSel && <Check className="h-3 w-3" />}</button>
                  </th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
                </tr>
              </thead>
              <tbody>
                {alunos.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum aluno avulso. Use “Adicionar estudantes” (ou vincule um grupo acima).</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
                ) : paginaItens.map((a) => {
                  const on = sel.has(a.id)
                  return (
                    <tr key={a.id} onClick={() => toggleSel(a.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                      <td className="px-3 py-2"><span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span></td>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{filtrados.length.toLocaleString('pt-BR')} de {alunos.length.toLocaleString('pt-BR')} avulso(s)</span>
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

      {/* OCULTAR DO RANKING (contas de teste) — sempre ativo (independe de "liberar para todos"). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><EyeOff className="h-4 w-4 text-amber-500" /> Ocultar do ranking (contas de teste)</p>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">Alunos/grupos marcados aqui <strong>não contam pontos nem posição</strong> no ranking e <strong>não aparecem para os alunos</strong>. No admin aparecem com a etiqueta “não contabilizado”. Use para as contas de teste dos simulados/desafios.</p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={ocTotal} onChange={(e) => { setOcTotal(e.target.checked); void salvarOcultos(ocEstRef.current, ocGrpRef.current, e.target.checked) }} className="h-4 w-4 accent-[var(--primary)]" />
            Ocultar <strong>totalmente</strong> da tabela (nem o admin vê)
          </label>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Grupos</span>
              <AdicionarGrupoModuloDialog grupos={todosGrupos} jaMarcados={new Set(ocGrp.map((g) => g.id))} onSelecionar={(ids) => { const novos = [...new Map([...ocGrp, ...ids.map((id) => { const g = todosGrupos.find((x) => x.id === id); return { id, nome: g?.nome ?? 'Grupo', cor: g?.cor ?? null } })].map((g) => [g.id, g])).values()]; setOcGrp(novos); void salvarOcultos(ocEstRef.current, novos, ocTotal) }} />
            </div>
            {ocGrp.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum grupo oculto.</p> : (
              <div className="flex flex-wrap gap-2">
                {ocGrp.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.cor ?? 'var(--primary)' }} />
                    <span className="font-medium">{g.nome}</span>
                    <button type="button" onClick={() => { const novos = ocGrp.filter((x) => x.id !== g.id); setOcGrp(novos); void salvarOcultos(ocEstRef.current, novos, ocTotal) }} className="ml-0.5 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Alunos</span>
              <AdicionarEstudantesDialog jaIds={new Set(ocEst.map((e) => e.id))} onSelecionar={(novos) => { const map = new Map(ocEst.map((e) => [e.id, e])); for (const n of novos) if (!map.has(n.id)) map.set(n.id, { id: n.id, nome: n.nome, email: n.email, cpf: n.cpf, classificacao: n.classificacao, avatar: n.avatar, perfil_avatar_cor: n.perfil_avatar_cor }); const arr = [...map.values()]; setOcEst(arr); void salvarOcultos(arr, ocGrpRef.current, ocTotal) }} />
            </div>
            {ocEst.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum aluno oculto.</p> : (
              <div className="flex flex-wrap gap-2">
                {ocEst.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
                    <span className="font-medium">{a.nome}</span>
                    <button type="button" onClick={() => { const arr = ocEst.filter((x) => x.id !== a.id); setOcEst(arr); void salvarOcultos(arr, ocGrpRef.current, ocTotal) }} className="ml-0.5 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

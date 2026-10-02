'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, Search, UserCheck, Info, Check, Trash2, Globe, Lock, Link2, Users2, X, EyeOff, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyLink } from '@/components/admin/copy-link'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import {
  carregarAtribuicaoPasta, definirGruposPasta, contarMembrosGrupos,
  carregarControleAcesso, definirEstudantesPasta,
  carregarRankingOcultos, salvarRankingOcultos,
  type EstudanteAcessoLinha, type ControleAcessoLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null; is_mestre?: boolean; pai_id?: string | null; membros?: number }
type GrupoVinc = Grupo & { count: number }
const POR_PAGINA = 10

// Aba "Acessos" do MÓDULO. GRUPOS ficam VINCULADOS (conexão viva): novos alunos no grupo — manual ou
// via sync (Curseduca/Guru) — passam a ter acesso automaticamente. A tabela de CONTROLE mostra TODOS os
// alunos com acesso (membros dos grupos + adicionados individualmente) e de qual grupo cada um veio.
export function ModuloAcesso({ pastaId }: { pastaId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [todosGrupos, setTodosGrupos] = useState<Grupo[]>([])
  const [vinc, setVinc] = useState<GrupoVinc[]>([])
  const vincRef = useRef<GrupoVinc[]>([]); vincRef.current = vinc
  const [controle, setControle] = useState<ControleAcessoLinha[]>([])
  const controleRef = useRef<ControleAcessoLinha[]>([]); controleRef.current = controle
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState<string>('todos') // 'todos' | grupoId | 'individuais'
  const [pagina, setPagina] = useState(0)
  const [liberarTodos, setLiberarTodos] = useState(false)
  const [origem, setOrigem] = useState('')
  useEffect(() => { setOrigem(process.env.NEXT_PUBLIC_APP_URL || window.location.origin) }, [])
  const linkTrilha = origem ? `${origem}/aluno/leitura?modulo=${pastaId}` : ''

  // Ocultos do ranking (contas de teste).
  const [ocEst, setOcEst] = useState<EstudanteAcessoLinha[]>([])
  const [ocGrp, setOcGrp] = useState<{ id: string; nome: string; cor: string | null }[]>([])
  const [ocTotal, setOcTotal] = useState(false)
  async function salvarOcultos(est: EstudanteAcessoLinha[], grp: { id: string; nome: string; cor: string | null }[], total: boolean) {
    const r = await salvarRankingOcultos(pastaId, { estudantes: est.map((e) => e.id), grupos: grp.map((g) => g.id), total })
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar.')
  }

  // Carrega (mount + após mutações) — grupos vinculados + controle completo.
  async function carregar() {
    const [a, c] = await Promise.all([carregarAtribuicaoPasta(pastaId), carregarControleAcesso(pastaId)])
    const grupos = a.ok && a.grupos ? a.grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, is_mestre: g.is_mestre, pai_id: g.pai_id, membros: g.membros })) : []
    setTodosGrupos(grupos)
    const vincList = a.ok && a.grupos ? a.grupos.filter((g) => g.atribuido).map((g) => ({ id: g.id, nome: g.nome, cor: g.cor })) : []
    const cont = vincList.length ? await contarMembrosGrupos(vincList.map((g) => g.id)) : { ok: true, contagem: {} as Record<string, number> }
    setVinc(vincList.map((g) => ({ ...g, count: cont.contagem?.[g.id] ?? 0 })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')))
    const linhas = c.ok && c.estudantes ? c.estudantes : []
    setControle(linhas)
    setLiberarTodos(!(vincList.length || linhas.some((x) => x.individual)))
  }

  useEffect(() => {
    ;(async () => {
      try {
        await carregar()
        const oc = await carregarRankingOcultos(pastaId)
        if (oc.ok) { setOcEst(oc.estudantes ?? []); setOcGrp(oc.grupos ?? []); setOcTotal(oc.total ?? false) }
      } catch (e) {
        console.error('[acessos] falha ao carregar:', e)
        toast.error('Não foi possível carregar os acessos. Tente recarregar.')
      } finally {
        setCarregando(false) // nunca ficar preso em "Carregando acesso…"
      }
    })()
  }, [pastaId])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return controle.filter((a) => {
      if (filtroGrupo === 'individuais' && !(a.individual && a.grupos.length === 0)) return false
      if (filtroGrupo !== 'todos' && filtroGrupo !== 'individuais' && !a.grupos.some((g) => g.id === filtroGrupo)) return false
      if (q && !(a.nome.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q) || (a.cpf ?? '').includes(q))) return false
      return true
    })
  }, [controle, busca, filtroGrupo])
  const totalPag = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaItens = useMemo(() => filtrados.slice(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA), [filtrados, pagina])
  useEffect(() => { setPagina(0) }, [busca, filtroGrupo])
  useEffect(() => { if (pagina > totalPag - 1) setPagina(0) }, [totalPag, pagina])

  const individuaisIds = useMemo(() => controle.filter((c) => c.individual).map((c) => c.id), [controle]) // todos os registros individuais (p/ persistir)
  const acessoIds = useMemo(() => new Set(controle.map((c) => c.id)), [controle])
  const vincIds = useMemo(() => new Set(vinc.map((g) => g.id)), [vinc])
  const totalGrupoMembros = vinc.reduce((s, g) => s + g.count, 0)
  // "À parte": adicionado individualmente E fora de qualquer grupo vinculado (quem está em grupo não é "individual").
  const ehAParte = (a: ControleAcessoLinha) => a.individual && a.grupos.length === 0
  const nIndividuais = useMemo(() => controle.filter(ehAParte).length, [controle])
  // Seleção/remoção só faz sentido para quem foi adicionado À PARTE (os de grupo saem desvinculando o grupo).
  const indFiltrados = useMemo(() => filtrados.filter(ehAParte), [filtrados])
  const indTodosSel = indFiltrados.length > 0 && indFiltrados.every((a) => sel.has(a.id))

  // ── GRUPOS (vínculo vivo) ──
  async function salvarGrupos(ids: string[]) {
    setSalvando(true)
    const r = await definirGruposPasta(pastaId, ids)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar grupos.'); setSalvando(false); return }
    await carregar()
    setSalvando(false)
  }
  function adicionarGrupos(novos: string[]) { void salvarGrupos([...new Set([...vincRef.current.map((g) => g.id), ...novos])]) }
  function removerGrupo(id: string) { void salvarGrupos(vincRef.current.filter((g) => g.id !== id).map((g) => g.id)) }

  // ── ALUNOS individuais ──
  async function persistirIndividuais(ids: string[]) {
    setSalvando(true)
    const r = await definirEstudantesPasta(pastaId, ids)
    if (!r.ok) toast.error(r.error ?? 'Erro ao salvar alunos.')
    await carregar()
    setSalvando(false)
  }
  function adicionarAlunos(novos: AlunoSel[]) {
    const ids = [...new Set([...individuaisIds, ...novos.map((n) => n.id)])]
    void persistirIndividuais(ids)
  }
  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleTodosIndividuais() { setSel((p) => { const n = new Set(p); const todos = indFiltrados.length > 0 && indFiltrados.every((a) => n.has(a.id)); indFiltrados.forEach((a) => (todos ? n.delete(a.id) : n.add(a.id))); return n }) }
  function removerSelecionados() { void persistirIndividuais(individuaisIds.filter((id) => !sel.has(id))); setSel(new Set()) }

  async function liberarParaTodos() {
    setLiberarTodos(true); setSalvando(true)
    await Promise.all([definirGruposPasta(pastaId, []), definirEstudantesPasta(pastaId, [])])
    setVinc([]); setControle([]); setSalvando(false)
  }

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
            : <>Restrito a <strong>{vinc.length}</strong> grupo(s){totalGrupoMembros > 0 && <> (~{totalGrupoMembros.toLocaleString('pt-BR')} alunos)</>}{nIndividuais > 0 && <> + <strong>{nIndividuais}</strong> adicionado(s) à parte</>}.</>}
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

        {/* CONTROLE DE ACESSO — todos os alunos (grupos + individuais) com a coluna do grupo. */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{controle.length.toLocaleString('pt-BR')}</span></p>
            {/* Filtro por grupo */}
            <div className="relative">
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)}
                className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring">
                <option value="todos">Todos os grupos</option>
                {vinc.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                <option value="individuais">Adicionados à parte</option>
              </select>
            </div>
            {/* Ocultar do ranking (pop-up, estilo filtro) */}
            <OcultarRankingDialog todosGrupos={todosGrupos} ocEst={ocEst} setOcEst={setOcEst} ocGrp={ocGrp} setOcGrp={setOcGrp} ocTotal={ocTotal} setOcTotal={setOcTotal} salvar={salvarOcultos} />
            <div className="relative ml-auto min-w-44 flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou CPF…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            {sel.size > 0 && (
              <button type="button" onClick={removerSelecionados} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-4 w-4" /> Remover {sel.size}</button>
            )}
            <AdicionarEstudantesDialog jaIds={acessoIds} onSelecionar={adicionarAlunos} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-10 px-3 py-2">
                    <button type="button" onClick={toggleTodosIndividuais} title="Marcar/desmarcar individuais filtrados" className={cn('flex h-4 w-4 items-center justify-center rounded border', indTodosSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{indTodosSel && <Check className="h-3 w-3" />}</button>
                  </th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
                  <th className="px-3 py-2 font-medium">Grupo</th>
                </tr>
              </thead>
              <tbody>
                {controle.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum aluno com acesso. Vincule um grupo acima ou use “Adicionar estudantes”.</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
                ) : paginaItens.map((a) => {
                  const on = sel.has(a.id)
                  const aParte = ehAParte(a)
                  return (
                    <tr key={a.id} onClick={() => aParte && toggleSel(a.id)} className={cn('border-b transition-colors hover:bg-muted/40', aParte && 'cursor-pointer', on && 'bg-primary/5')}>
                      <td className="px-3 py-2">
                        {aParte
                          ? <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                          : <Users2 className="h-4 w-4 text-muted-foreground/40" aria-label="Acesso por grupo" />}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <AvatarEstudante nome={a.nome} avatar={a.avatar} cor={a.perfil_avatar_cor} className="h-8 w-8 shrink-0 text-[11px] text-white" />
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Link href={`/admin/estudantes/${a.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:text-primary hover:underline">{a.nome}</Link>
                            <ClassificacaoBadge classificacao={a.classificacao} />
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell"><span className="block truncate">{a.email ?? '—'}</span></td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground md:table-cell">{a.cpf ?? '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {a.grupos.map((g) => (
                            <span key={g.id} className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium"
                              style={{ borderColor: g.cor ? `${g.cor}55` : undefined, backgroundColor: g.cor ? `${g.cor}18` : undefined, color: g.cor ?? undefined }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.cor ?? 'var(--primary)' }} />{g.nome}
                            </span>
                          ))}
                          {aParte && <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Adicionado à parte</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{filtrados.length.toLocaleString('pt-BR')} de {controle.length.toLocaleString('pt-BR')} aluno(s){nIndividuais > 0 && <> · {nIndividuais.toLocaleString('pt-BR')} à parte</>}</span>
            {totalPag > 1 && (
              <div className="flex items-center gap-1">
                <PagBtn onClick={() => setPagina(0)} disabled={pagina === 0} title="Início"><ChevronsLeft className="h-4 w-4" /></PagBtn>
                <PagBtn onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} title="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
                <span className="px-2 tabular-nums">Pág. {pagina + 1}/{totalPag}</span>
                <PagBtn onClick={() => setPagina((p) => Math.min(totalPag - 1, p + 1))} disabled={pagina >= totalPag - 1} title="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
                <PagBtn onClick={() => setPagina(totalPag - 1)} disabled={pagina >= totalPag - 1} title="Final"><ChevronsRight className="h-4 w-4" /></PagBtn>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

function PagBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40">{children}</button>
}

/** Pop-up "Ocultar do ranking" (contas de teste) — estilo filtro, ao lado do filtro de grupo. */
function OcultarRankingDialog({ todosGrupos, ocEst, setOcEst, ocGrp, setOcGrp, ocTotal, setOcTotal, salvar }: {
  todosGrupos: Grupo[]
  ocEst: EstudanteAcessoLinha[]; setOcEst: (v: EstudanteAcessoLinha[]) => void
  ocGrp: { id: string; nome: string; cor: string | null }[]; setOcGrp: (v: { id: string; nome: string; cor: string | null }[]) => void
  ocTotal: boolean; setOcTotal: (v: boolean) => void
  salvar: (est: EstudanteAcessoLinha[], grp: { id: string; nome: string; cor: string | null }[], total: boolean) => void
}) {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [aberto])
  const n = ocEst.length + ocGrp.length
  const ativo = n > 0 || ocTotal
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted', ativo && 'border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400')}>
        <EyeOff className="h-4 w-4" /> Ocultar do ranking
        {n > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{n}</span>}
      </button>
      {aberto && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm duration-200 animate-in fade-in sm:items-center sm:p-4" onClick={() => setAberto(false)}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-card shadow-2xl duration-200 animate-in slide-in-from-bottom-4 sm:rounded-3xl sm:zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="relative shrink-0 border-b px-5 py-4">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-amber-500/60 to-transparent" />
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500"><EyeOff className="h-5 w-5" /></span>
                <div className="flex-1"><h3 className="text-base font-bold leading-tight">Ocultar do ranking</h3><p className="text-xs text-muted-foreground">Contas de teste — não contam pontos nem aparecem para os alunos</p></div>
                <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <p className="text-xs text-muted-foreground">Marcados aqui <strong>não contam pontos nem posição</strong> no ranking e <strong>não aparecem para os alunos</strong>. No admin aparecem com a etiqueta “não contabilizado”.</p>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm">
                <input type="checkbox" checked={ocTotal} onChange={(e) => { setOcTotal(e.target.checked); salvar(ocEst, ocGrp, e.target.checked) }} className="h-4 w-4 accent-[var(--primary)]" />
                Ocultar <strong>totalmente</strong> da tabela (nem o admin vê)
              </label>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Grupos ocultos</span>
                  <AdicionarGrupoModuloDialog grupos={todosGrupos} jaMarcados={new Set(ocGrp.map((g) => g.id))} onSelecionar={(ids) => { const novos = [...new Map([...ocGrp, ...ids.map((id) => { const g = todosGrupos.find((x) => x.id === id); return { id, nome: g?.nome ?? 'Grupo', cor: g?.cor ?? null } })].map((g) => [g.id, g])).values()]; setOcGrp(novos); salvar(ocEst, novos, ocTotal) }} />
                </div>
                {ocGrp.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum grupo oculto.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {ocGrp.map((g) => (
                      <span key={g.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
                        <span className="h-2 w-2 rounded-full" style={{ background: g.cor ?? 'var(--primary)' }} />
                        <span className="font-medium">{g.nome}</span>
                        <button type="button" onClick={() => { const novos = ocGrp.filter((x) => x.id !== g.id); setOcGrp(novos); salvar(ocEst, novos, ocTotal) }} className="ml-0.5 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Alunos ocultos</span>
                  <AdicionarEstudantesDialog jaIds={new Set(ocEst.map((e) => e.id))} onSelecionar={(novos) => { const map = new Map(ocEst.map((e) => [e.id, e])); for (const nv of novos) if (!map.has(nv.id)) map.set(nv.id, { id: nv.id, nome: nv.nome, email: nv.email, cpf: nv.cpf, classificacao: nv.classificacao, avatar: nv.avatar, perfil_avatar_cor: nv.perfil_avatar_cor }); const arr = [...map.values()]; setOcEst(arr); salvar(arr, ocGrp, ocTotal) }} />
                </div>
                {ocEst.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhum aluno oculto.</p> : (
                  <div className="flex flex-wrap gap-2">
                    {ocEst.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1 text-sm">
                        <span className="font-medium">{a.nome}</span>
                        <button type="button" onClick={() => { const arr = ocEst.filter((x) => x.id !== a.id); setOcEst(arr); salvar(arr, ocGrp, ocTotal) }} className="ml-0.5 rounded-full p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end border-t bg-muted/20 px-5 py-3.5">
              <button type="button" onClick={() => setAberto(false)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-95"><Check className="h-4 w-4" /> Concluir</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

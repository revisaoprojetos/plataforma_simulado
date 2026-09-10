'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, UserCheck, Info, Check, Trash2, Globe, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ClassificacaoBadge } from '@/components/admin/classificacao-badge'
import { AdicionarEstudantesDialog, type AlunoSel } from '@/components/admin/adicionar-estudantes-dialog'
import { AdicionarGrupoModuloDialog } from '@/components/admin/adicionar-grupo-modulo-dialog'
import {
  carregarAtribuicaoPasta, definirGruposPasta,
  carregarEstudantesPasta, definirEstudantesPasta, estudantesDosGrupos,
  type EstudanteAcessoLinha,
} from '@/app/admin/leitura/actions'

type Grupo = { id: string; nome: string; cor: string | null }
type Linha = EstudanteAcessoLinha & { grupoNome?: string | null }
const POR_PAGINA = 50

function iniciais(n: string) {
  return n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('')
}

// Aba "Acessos" do MÓDULO — modelo da aba Estudantes do banco: UMA tabela com quem tem acesso.
// "Adicionar grupo" LINKA os alunos do grupo na tabela; "Adicionar estudantes" adiciona individuais.
// "Liberar para todos" = sem restrição (some/acinzenta a adição, todos acessam). Carrega só os vinculados.
export function ModuloAcesso({ pastaId }: { pastaId: string }) {
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [addingGrupo, setAddingGrupo] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [alunos, setAlunos] = useState<Linha[]>([])
  const alunosRef = useRef<Linha[]>([])
  alunosRef.current = alunos
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [liberarTodos, setLiberarTodos] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [a, e] = await Promise.all([carregarAtribuicaoPasta(pastaId), carregarEstudantesPasta(pastaId)])
      if (a.ok && a.grupos) setGrupos(a.grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor })))
      const temGrupo = a.ok && !!a.grupos?.some((g) => g.atribuido)
      if (e.ok && e.itens) setAlunos(e.itens)
      // Sem nenhuma atribuição (grupos + alunos) = liberado a todos.
      setLiberarTodos(!(temGrupo || (e.ok && (e.itens?.length ?? 0) > 0)))
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

  // AUTO-SAVE: cada mudança persiste na hora (sem botão "Salvar"). definir* substitui o conjunto todo
  // (idempotente); grupos ficam sempre [] pois os alunos do grupo são materializados na tabela.
  async function persistir(ids: string[]) {
    setSalvando(true)
    const [rg, re] = await Promise.all([definirGruposPasta(pastaId, []), definirEstudantesPasta(pastaId, ids)])
    setSalvando(false)
    if (!rg.ok || !re.ok) toast.error(rg.error ?? re.error ?? 'Erro ao salvar acesso.')
  }
  // Aplica a nova lista E persiste — SEM efeito colateral dentro do updater do setState (regra do React).
  function comitar(next: Linha[]) {
    setAlunos(next)
    void persistir(next.map((a) => a.id))
  }
  function mesclar(base: Linha[], novos: Linha[]): Linha[] {
    const map = new Map(base.map((a) => [a.id, a]))
    for (const n of novos) if (!map.has(n.id)) map.set(n.id, n)
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
  function adicionarAlunos(novos: AlunoSel[]) {
    comitar(mesclar(alunosRef.current, novos.map((n) => ({ id: n.id, nome: n.nome, email: n.email, cpf: n.cpf, classificacao: n.classificacao, avatar: n.avatar, perfil_avatar_cor: n.perfil_avatar_cor, grupoNome: null }))))
  }
  async function adicionarGrupos(ids: string[]) {
    if (!ids.length) return
    setAddingGrupo(true)
    const r = await estudantesDosGrupos(ids)
    setAddingGrupo(false)
    if (!r.ok) { toast.error(r.error ?? 'Erro ao carregar alunos do grupo'); return }
    const novos = r.itens ?? []
    comitar(mesclar(alunosRef.current, novos))
    if (novos.length) toast.success(`${novos.length.toLocaleString('pt-BR')} aluno(s) do(s) grupo(s) vinculados`)
  }
  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleTodosFiltrados() {
    setSel((p) => { const n = new Set(p); const todos = filtrados.length > 0 && filtrados.every((a) => n.has(a.id)); filtrados.forEach((a) => (todos ? n.delete(a.id) : n.add(a.id))); return n })
  }
  function removerSelecionados() { comitar(alunosRef.current.filter((a) => !sel.has(a.id))); setSel(new Set()) }
  function liberarParaTodos() { setLiberarTodos(true); comitar([]) }

  const acessoIds = useMemo(() => new Set(alunos.map((a) => a.id)), [alunos])
  const filtradosTodosSel = filtrados.length > 0 && filtrados.every((a) => sel.has(a.id))

  if (carregando) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando acesso…</div>

  return (
    <div className="space-y-4">
      {/* Aviso + botão "Liberar para todos" à direita */}
      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm', liberarTodos ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400')}>
        <Info className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          {liberarTodos
            ? <>Sem nenhuma atribuição, este módulo fica <strong>liberado para todos</strong> os alunos.</>
            : <>Restrito a <strong>{alunos.length}</strong> {alunos.length === 1 ? 'aluno' : 'alunos'} com acesso.</>}
        </span>
        {salvando && <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> salvando…</span>}
        <button type="button" onClick={() => (liberarTodos ? setLiberarTodos(false) : liberarParaTodos())}
          className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
            liberarTodos ? 'border-primary bg-primary text-primary-foreground hover:opacity-90' : 'border-current/30 hover:bg-foreground/5')}>
          {liberarTodos ? <><Lock className="h-4 w-4" /> Restringir acesso</> : <><Globe className="h-4 w-4" /> Liberar para todos</>}
        </button>
      </div>

      {/* Alunos com acesso — tabela estilo aba Estudantes do banco (acinzenta quando "liberar todos") */}
      <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-sm transition-opacity', liberarTodos && 'pointer-events-none select-none opacity-50')} aria-disabled={liberarTodos}>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><UserCheck className="h-4 w-4 text-primary" /> Alunos com acesso <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{alunos.length}</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nos vinculados…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {sel.size > 0 && (
            <button type="button" onClick={removerSelecionados} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/50 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"><Trash2 className="h-4 w-4" /> Remover {sel.size}</button>
          )}
          <AdicionarGrupoModuloDialog grupos={grupos} jaMarcados={new Set()} onSelecionar={(ids) => { void adicionarGrupos(ids) }} />
          <AdicionarEstudantesDialog jaIds={acessoIds} onSelecionar={adicionarAlunos} />
        </div>

        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <button type="button" onClick={toggleTodosFiltrados} title="Marcar/desmarcar os filtrados"
                    className={cn('flex h-4 w-4 items-center justify-center rounded border', filtradosTodosSel ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {filtradosTodosSel && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">E-mail</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Documento</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">Grupo</th>
              </tr>
            </thead>
            <tbody>
              {addingGrupo ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /> Vinculando alunos do grupo…</td></tr>
              ) : alunos.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum aluno individual. Use “Adicionar grupo” ou “Adicionar estudantes” (ou libere para todos).</td></tr>
              ) : filtrados.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Nenhum aluno encontrado.</td></tr>
              ) : paginaItens.map((a) => {
                const on = sel.has(a.id)
                return (
                  <tr key={a.id} onClick={() => toggleSel(a.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                    <td className="px-3 py-2">
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-primary" style={{ backgroundColor: a.perfil_avatar_cor ?? 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                          {a.avatar ? <img src={a.avatar} alt="" className="h-full w-full object-contain object-[center_82%]" /> : iniciais(a.nome)}
                        </span>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-medium">{a.nome}</span>
                          <ClassificacaoBadge classificacao={a.classificacao} />
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell"><span className="block truncate">{a.email ?? '—'}</span></td>
                    <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground md:table-cell">{a.cpf ?? '—'}</td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {a.grupoNome
                        ? <span className="inline-flex max-w-[160px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground" title={a.grupoNome}>{a.grupoNome}</span>
                        : <span className="text-xs text-muted-foreground" title="Adicionado individualmente">Direto</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
          <span>{filtrados.length.toLocaleString('pt-BR')} de {alunos.length.toLocaleString('pt-BR')} aluno(s)</span>
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

'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import { Tag, Plus, Pencil, Trash2, Check, X, Loader2, ChevronRight, BookOpen, ExternalLink, Search, ClipboardList } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { criarEtiqueta, atualizarEtiqueta, excluirEtiqueta, questoesDaEtiqueta, type Etiqueta, type FuncaoEtiqueta, type QuestaoDaEtiqueta } from './actions'

const CORES = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const ordenar = (a: Etiqueta, b: Etiqueta) => a.nome.localeCompare(b.nome, 'pt-BR')

// Funções (comportamento da etiqueta no simulado).
const FUNCOES: { id: FuncaoEtiqueta; nome: string; desc: string; badge: string }[] = [
  { id: 'anular', nome: 'Anular questão', desc: 'No simulado: bloqueia a questão, mostra o aviso no topo e dá o ponto a todos (acerte, erre ou nem responda).', badge: 'Anula + ponto' },
  { id: 'avisar', nome: 'Só avisar', desc: 'Mostra um alerta no topo da questão; ela continua respondível e pontua normalmente.', badge: 'Aviso' },
  { id: 'desconsiderar', nome: 'Desconsiderar', desc: 'Tira a questão do total da prova (não pontua ninguém) e bloqueia a resposta.', badge: 'Fora do total' },
]
const funcInfo = (f?: FuncaoEtiqueta | null) => FUNCOES.find((x) => x.id === f) ?? null

export function EtiquetasClient({ inicial }: { inicial: Etiqueta[] }) {
  const [itens, setItens] = useState<Etiqueta[]>(inicial)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState(CORES[5])
  const [funcao, setFuncao] = useState<FuncaoEtiqueta | ''>('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState(CORES[5])
  const [editFuncao, setEditFuncao] = useState<FuncaoEtiqueta | ''>('')
  const [modalEt, setModalEt] = useState<Etiqueta | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [qCache, setQCache] = useState<Record<string, QuestaoDaEtiqueta[]>>({})
  const [carregandoQ, setCarregandoQ] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Abre o pop-up com as questões da etiqueta (carrega sob demanda, cacheado).
  function abrirQuestoes(e: Etiqueta) {
    setModalEt(e)
    if (qCache[e.id]) return // já carregado
    setCarregandoQ(e.id)
    ;(async () => {
      const r = await questoesDaEtiqueta(e.id)
      if (r.ok) setQCache((c) => ({ ...c, [e.id]: r.itens ?? [] }))
      else toast.error(r.error ?? 'Erro ao carregar questões.')
      setCarregandoQ(null)
    })()
  }

  function criar() {
    const n = nome.trim()
    if (!n) { toast.error('Informe um nome.'); return }
    start(async () => {
      const r = await criarEtiqueta(n, cor, funcao || null)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao criar.'); return }
      setItens((p) => [...p, { id: r.id!, nome: n, cor, funcao: funcao || null, total: 0 }].sort(ordenar))
      setNome(''); setFuncao('')
      toast.success('Etiqueta criada')
    })
  }

  function salvarEdicao() {
    const n = editNome.trim()
    if (!n || !editId) return
    start(async () => {
      const r = await atualizarEtiqueta(editId, n, editCor, editFuncao || null)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      setItens((p) => p.map((e) => (e.id === editId ? { ...e, nome: n, cor: editCor, funcao: editFuncao || null } : e)).sort(ordenar))
      setEditId(null)
      toast.success('Etiqueta atualizada')
    })
  }

  async function excluir(e: Etiqueta) {
    const ok = await confirmar({
      mensagem: `Excluir a etiqueta "${e.nome}"?${e.total ? ` Ela está em ${e.total} questão(ões) — o vínculo será removido.` : ''}`,
      destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await excluirEtiqueta(e.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro ao excluir.'); return }
      setItens((p) => p.filter((x) => x.id !== e.id))
      toast.success('Etiqueta removida')
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Criar */}
      <div className="h-fit rounded-2xl border bg-card p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-primary" /> Nova etiqueta</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') criar() }}
          placeholder="Nome da etiqueta"
          className="mb-3 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mb-1.5 text-xs text-muted-foreground">Cor</p>
        <PaletaCor value={cor} onChange={setCor} />
        <p className="mb-1.5 mt-3 text-xs text-muted-foreground">Função (comportamento no simulado)</p>
        <FuncaoSelect value={funcao} onChange={setFuncao} />
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${cor}22`, color: cor }}>
            <Tag className="h-3 w-3" /> {nome.trim() || 'Prévia'}
          </span>
          {funcInfo(funcao || null) && <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{funcInfo(funcao || null)!.badge}</span>}
        </div>
        <button
          onClick={criar}
          disabled={pending || !nome.trim()}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar etiqueta
        </button>
      </div>

      {/* Lista */}
      <div className="self-start overflow-hidden rounded-2xl border bg-card shadow-sm">
        {itens.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma etiqueta ainda. Crie a primeira ao lado.</p>
        ) : (
          itens.map((e, i) => (
            <div key={e.id} className={cn(i > 0 && 'border-t')}>
              <div
                className={cn('flex flex-wrap items-center gap-3 px-4 py-3', editId !== e.id && 'cursor-pointer transition-colors hover:bg-muted/40')}
                onClick={editId === e.id ? undefined : () => abrirQuestoes(e)}
                onMouseEnter={() => setHoverId(e.id)}
                onMouseLeave={() => setHoverId((h) => (h === e.id ? null : h))}
                title={editId === e.id ? undefined : 'Ver as questões desta etiqueta'}
              >
                {editId === e.id ? (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={editNome}
                      onChange={(ev) => setEditNome(ev.target.value)}
                      onKeyDown={(ev) => { if (ev.key === 'Enter') salvarEdicao(); if (ev.key === 'Escape') setEditId(null) }}
                      autoFocus
                      className="flex-1 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    />
                    <PaletaCor value={editCor} onChange={setEditCor} compact />
                    <FuncaoSelect value={editFuncao} onChange={setEditFuncao} />
                    <div className="flex gap-1">
                      <button onClick={salvarEdicao} disabled={pending} title="Salvar" className="rounded-md border p-1.5 text-emerald-600 hover:bg-emerald-500/10"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditId(null)} title="Cancelar" className="rounded-md border p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150"
                      style={{
                        background: `${e.cor ?? '#64748b'}${hoverId === e.id ? '3d' : '22'}`,
                        color: e.cor ?? '#64748b',
                        boxShadow: hoverId === e.id ? `0 0 0 1.5px ${e.cor ?? '#64748b'}` : 'none',
                        transform: hoverId === e.id ? 'translateY(-1px)' : 'none',
                      }}
                    >
                      <Tag className="h-3 w-3" /> {e.nome}
                    </span>
                    {funcInfo(e.funcao) && <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={funcInfo(e.funcao)!.desc}>{funcInfo(e.funcao)!.badge}</span>}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {carregandoQ === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {e.total ?? 0} quest{(e.total ?? 0) === 1 ? 'ão' : 'ões'}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <button onClick={(ev) => { ev.stopPropagation(); setEditId(e.id); setEditNome(e.nome); setEditCor(e.cor ?? CORES[5]); setEditFuncao(e.funcao ?? '') }} title="Editar" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={(ev) => { ev.stopPropagation(); excluir(e) }} title="Excluir" className="rounded-md border p-1.5 text-muted-foreground transition hover:border-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pop-up com as questões da etiqueta */}
      {modalEt && (
        <QuestoesModal
          etiqueta={modalEt}
          itens={qCache[modalEt.id]}
          carregando={carregandoQ === modalEt.id && !qCache[modalEt.id]}
          onClose={() => setModalEt(null)}
        />
      )}
    </div>
  )
}

// Pop-up: lista as questões da etiqueta com BUSCA + FILTROS (disciplina/simulado) e, por questão,
// EM QUAIS SIMULADOS ela está com o NÚMERO dela. Cada card vai direto ao editor da questão.
function QuestoesModal({ etiqueta, itens, carregando, onClose }: {
  etiqueta: Etiqueta
  itens: QuestaoDaEtiqueta[] | undefined
  carregando: boolean
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const [disc, setDisc] = useState('')
  const [sim, setSim] = useState('')

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const lista = itens ?? []
  // Opções de filtro derivadas do resultado (só o que existe).
  const disciplinas = useMemo(
    () => [...new Set(lista.map((q) => q.disciplina).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lista],
  )
  const simulados = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of lista) for (const s of q.simulados) m.set(s.id, s.titulo)
    return [...m.entries()].map(([id, titulo]) => ({ id, titulo })).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
  }, [lista])

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lista.filter((q) =>
      (!t || q.titulo.toLowerCase().includes(t) || (q.disciplina ?? '').toLowerCase().includes(t) || q.simulados.some((s) => s.titulo.toLowerCase().includes(t))) &&
      (!disc || q.disciplina === disc) &&
      (!sim || q.simulados.some((s) => s.id === sim)),
    )
  }, [lista, busca, disc, sim])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${etiqueta.cor ?? '#64748b'}22`, color: etiqueta.cor ?? '#64748b' }}>
            <Tag className="h-3 w-3" /> {etiqueta.nome}
          </span>
          <span className="text-sm text-muted-foreground">{etiqueta.total ?? 0} quest{(etiqueta.total ?? 0) === 1 ? 'ão' : 'ões'}</span>
          <button onClick={onClose} title="Fechar" className="ml-auto rounded-md border p-1.5 text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Busca + filtros */}
        <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por enunciado, disciplina ou simulado…"
              className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select value={disc} onChange={(e) => setDisc(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring" title="Filtrar por disciplina">
            <option value="">Todas as disciplinas</option>
            {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={sim} onChange={(e) => setSim(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring" title="Filtrar por simulado">
            <option value="">Todos os simulados</option>
            {simulados.map((s) => <option key={s.id} value={s.id}>{s.titulo}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {carregando && (
            <p className="flex items-center gap-1.5 px-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando questões…</p>
          )}
          {!carregando && (
            <p className="px-1 pb-1 text-xs text-muted-foreground">{filtrados.length} de {lista.length} quest{lista.length === 1 ? 'ão' : 'ões'}{(busca || disc || sim) ? ' (filtrado)' : ''}</p>
          )}
          {filtrados.map((q) => (
            <Link key={q.id} href={`/admin/questoes/${q.id}/editar`}
              className="group flex items-start gap-2.5 rounded-xl border bg-card p-3 text-sm shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 leading-snug transition-colors group-hover:text-primary">{q.titulo}</span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {q.disciplina && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{q.disciplina}</span>}
                </span>
                {q.simulados.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {q.simulados.map((s) => (
                      <span key={s.id}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground/80"
                        title={`${s.titulo} — questão nº ${s.numero}${s.publicado ? ' (publicado)' : ''}`}>
                        <ClipboardList className="h-3 w-3 shrink-0 opacity-70" />
                        <span className="max-w-[180px] truncate">{s.titulo}</span>
                        {s.numero > 0 && <span className="shrink-0 rounded bg-primary/10 px-1 font-semibold text-primary">nº {s.numero}</span>}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="mt-1.5 block text-[11px] text-muted-foreground">Não está em nenhum simulado.</span>
                )}
              </span>
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
          {!carregando && lista.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma questão nesta etiqueta.</p>}
          {!carregando && lista.length > 0 && filtrados.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma questão bate com a busca/filtro.</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function FuncaoSelect({ value, onChange }: { value: FuncaoEtiqueta | ''; onChange: (v: FuncaoEtiqueta | '') => void }) {
  const info = funcInfo(value || null)
  return (
    <div className="min-w-[11rem]">
      <select value={value} onChange={(e) => onChange(e.target.value as FuncaoEtiqueta | '')}
        className="h-9 w-full rounded-lg border bg-[var(--input-bg,transparent)] px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring">
        <option value="">Nenhuma (só rótulo)</option>
        {FUNCOES.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
      {info && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{info.desc}</p>}
    </div>
  )
}

function PaletaCor({ value, onChange, compact }: { value: string; onChange: (c: string) => void; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', compact && 'gap-1')}>
      {CORES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={cn('rounded-full ring-offset-1 transition', compact ? 'h-6 w-6' : 'h-7 w-7', value === c && 'ring-2 ring-foreground ring-offset-2')}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

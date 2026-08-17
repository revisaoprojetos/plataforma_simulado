'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, SlidersHorizontal, Eraser, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Opt = { id: string; nome: string }
export type AssuntoOpt = { id: string; nome: string; disciplina_id: string | null }

export type FiltrosParams = {
  tipo?: string; minhas?: string; disciplina?: string; assunto?: string
  banca?: string; ano?: string; dificuldade?: string; busca?: string; comentadas?: string; favoritas?: string
}

const DIFICULDADES = [{ v: 'facil', r: 'Fácil' }, { v: 'medio', r: 'Médio' }, { v: 'dificil', r: 'Difícil' }]
const MINHAS = [
  { v: '', r: 'Todas' }, { v: 'resolvidas', r: 'Resolvidas' }, { v: 'nao_resolvidas', r: 'Não resolvidas' },
  { v: 'acertei', r: 'Acertei' }, { v: 'errei', r: 'Errei' },
]

/** Painel de filtros do Banco de Questões (estilo QConcursos): abas por tipo, "Minhas questões",
 *  seletores de taxonomia, "com gabarito comentado", chips de filtro ativo e contagem. */
export function QuestoesFiltrosAluno({
  disciplinas, assuntos, bancas, anos, total, params,
}: {
  disciplinas: Opt[]; assuntos: AssuntoOpt[]; bancas: Opt[]; anos: number[]; total: number; params: FiltrosParams
}) {
  const router = useRouter()
  const [f, setF] = useState<FiltrosParams>({ ...params })
  const set = (k: keyof FiltrosParams, v: string) => setF((p) => ({ ...p, [k]: v || undefined }))

  // Assunto depende da disciplina selecionada.
  const assuntosDaDisc = useMemo(
    () => (f.disciplina ? assuntos.filter((a) => a.disciplina_id === f.disciplina) : assuntos),
    [assuntos, f.disciplina],
  )

  function aplicar(extra?: Partial<FiltrosParams>) {
    const merged = { ...f, ...extra }
    const usp = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, String(v))
    router.push(`/aluno/questoes${usp.toString() ? `?${usp}` : ''}`)
  }
  function limpar() { setF({}); router.push('/aluno/questoes') }
  function tirar(k: keyof FiltrosParams) { const nv = { ...f, [k]: undefined }; setF(nv); aplicar({ [k]: undefined }) }

  const nomeDe = (arr: { id: string; nome: string }[], id?: string) => arr.find((x) => x.id === id)?.nome
  const chips: { k: keyof FiltrosParams; label: string }[] = []
  if (f.minhas) chips.push({ k: 'minhas', label: MINHAS.find((m) => m.v === f.minhas)?.r ?? f.minhas })
  if (f.disciplina) chips.push({ k: 'disciplina', label: `Disciplina: ${nomeDe(disciplinas, f.disciplina) ?? '—'}` })
  if (f.assunto) chips.push({ k: 'assunto', label: `Assunto: ${nomeDe(assuntos, f.assunto) ?? '—'}` })
  if (f.banca) chips.push({ k: 'banca', label: `Banca: ${nomeDe(bancas, f.banca) ?? '—'}` })
  if (f.ano) chips.push({ k: 'ano', label: `Ano: ${f.ano}` })
  if (f.dificuldade) chips.push({ k: 'dificuldade', label: DIFICULDADES.find((d) => d.v === f.dificuldade)?.r ?? f.dificuldade })
  if (f.comentadas) chips.push({ k: 'comentadas', label: 'Com gabarito comentado' })
  if (f.favoritas) chips.push({ k: 'favoritas', label: 'Favoritas' })
  if (f.busca) chips.push({ k: 'busca', label: `"${f.busca}"` })

  const selCls = 'h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      {/* Minhas questões */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Minhas questões:</span>
        {MINHAS.map((m) => {
          const on = (f.minhas ?? '') === m.v
          return (
            <button key={m.v || 'todas'} type="button" onClick={() => { set('minhas', m.v); aplicar({ minhas: m.v || undefined }) }}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {m.r}
            </button>
          )
        })}
      </div>

      {/* Busca + seletores */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={f.busca ?? ''} onChange={(e) => set('busca', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aplicar()}
            placeholder="Palavra-chave no enunciado…" className={cn(selCls, 'pl-8')} />
        </div>
        <select value={f.disciplina ?? ''} onChange={(e) => set('disciplina', e.target.value)} className={selCls}>
          <option value="">Disciplina — todas</option>
          {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
        <select value={f.assunto ?? ''} onChange={(e) => set('assunto', e.target.value)} className={selCls}>
          <option value="">Assunto — todos</option>
          {assuntosDaDisc.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <select value={f.banca ?? ''} onChange={(e) => set('banca', e.target.value)} className={selCls}>
          <option value="">Banca — todas</option>
          {bancas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <select value={f.ano ?? ''} onChange={(e) => set('ano', e.target.value)} className={selCls}>
          <option value="">Ano — todos</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={f.dificuldade ?? ''} onChange={(e) => set('dificuldade', e.target.value)} className={selCls}>
          <option value="">Dificuldade — todas</option>
          {DIFICULDADES.map((d) => <option key={d.v} value={d.v}>{d.r}</option>)}
        </select>
      </div>

      {/* Questões com */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-medium text-muted-foreground">Questões com:</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={f.comentadas === '1'} onChange={(e) => { set('comentadas', e.target.checked ? '1' : ''); aplicar({ comentadas: e.target.checked ? '1' : undefined }) }}
            className="h-4 w-4 rounded border accent-primary" />
          Gabarito comentado
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={f.favoritas === '1'} onChange={(e) => { set('favoritas', e.target.checked ? '1' : ''); aplicar({ favoritas: e.target.checked ? '1' : undefined }) }}
            className="h-4 w-4 rounded border accent-primary" />
          <Star className="h-4 w-4 text-amber-500" /> Favoritas
        </label>
      </div>

      {/* Chips de filtro ativo */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs font-medium text-muted-foreground">Filtrar por:</span>
          {chips.map((c) => (
            <button key={c.k} type="button" onClick={() => tirar(c.k)}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium transition hover:bg-muted">
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Ações + contagem */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-sm text-muted-foreground">Foram encontradas <span className="font-semibold text-foreground">{total.toLocaleString('pt-BR')}</span> questões</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={limpar} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted">
            <Eraser className="h-4 w-4" /> Limpar
          </button>
          <button type="button" onClick={() => aplicar()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
            <SlidersHorizontal className="h-4 w-4" /> Filtrar
          </button>
        </div>
      </div>
    </div>
  )
}

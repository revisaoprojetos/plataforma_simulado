'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpenText, CheckCircle2, Search, Scale } from 'lucide-react'
import type { DocumentoAluno } from '@/lib/leitura/acesso'

const SEM_MATERIA = '__sem__'

/** Catálogo do aluno: filtra (matéria/tipo/ano/busca) e agrupa por matéria. */
export function LeituraCatalogo({ docs }: { docs: DocumentoAluno[] }) {
  const [busca, setBusca] = useState('')
  const [materia, setMateria] = useState('')
  const [tipo, setTipo] = useState('')
  const [ano, setAno] = useState('')

  const materias = useMemo(() => [...new Map(docs.filter((d) => d.materiaId).map((d) => [d.materiaId!, { nome: d.materiaNome!, cor: d.materiaCor }])).entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'pt-BR')), [docs])
  const tipos = useMemo(() => [...new Set(docs.map((d) => d.tipoNorma).filter(Boolean))].sort() as string[], [docs])
  const anos = useMemo(() => [...new Set(docs.map((d) => d.ano).filter(Boolean))].sort((a, b) => (b as number) - (a as number)) as number[], [docs])

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim()
    return docs.filter((d) => {
      if (materia && (d.materiaId ?? SEM_MATERIA) !== materia) return false
      if (tipo && d.tipoNorma !== tipo) return false
      if (ano && String(d.ano ?? '') !== ano) return false
      if (q && !(`${d.titulo} ${d.tipoNorma ?? ''} ${d.numero ?? ''} ${d.ano ?? ''} ${d.ementa ?? ''} ${d.materiaNome ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [docs, busca, materia, tipo, ano])

  // Agrupa por matéria (ordem: matérias por nome, "Outros" no fim).
  const grupos = useMemo(() => {
    const map = new Map<string, { nome: string; cor: string | null; itens: DocumentoAluno[] }>()
    for (const d of filtrados) {
      const key = d.materiaId ?? SEM_MATERIA
      if (!map.has(key)) map.set(key, { nome: d.materiaNome ?? 'Outros', cor: d.materiaCor ?? null, itens: [] })
      map.get(key)!.itens.push(d)
    }
    return [...map.entries()].sort((a, b) => (a[0] === SEM_MATERIA ? 1 : b[0] === SEM_MATERIA ? -1 : a[1].nome.localeCompare(b[1].nome, 'pt-BR')))
  }, [filtrados])

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, número, ementa…" className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {materias.length > 0 && (
          <select value={materia} onChange={(e) => setMateria(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="">Todas as matérias</option>
            {materias.map(([id, m]) => <option key={id} value={id}>{m.nome}</option>)}
          </select>
        )}
        {tipos.length > 0 && (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="">Todos os tipos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {anos.length > 0 && (
          <select value={ano} onChange={(e) => setAno(e.target.value)} className="h-9 rounded-lg border bg-[var(--input-bg,transparent)] px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
            <option value="">Todos os anos</option>
            {anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum documento encontrado.</div>
      ) : grupos.map(([key, g]) => (
        <section key={key} className="space-y-3">
          {(materias.length > 0 || key === SEM_MATERIA) && (
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.cor ?? '#64748b' }} /> {g.nome}
              <span className="text-xs font-normal normal-case">({g.itens.length})</span>
            </h2>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {g.itens.map((d) => <CardLei key={d.id} d={d} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function CardLei({ d }: { d: DocumentoAluno }) {
  const c = d.cor ?? '#6d28d9'
  const subtitulo = [d.tipoNorma, d.numero && `nº ${d.numero}`, d.ano].filter(Boolean).join(' ')
  return (
    <Link href={`/aluno/leitura/${d.id}`} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {d.capa_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
      )}
      {!d.capa_url && <Scale className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

      <div className="absolute right-2 top-2 z-20">
        {d.concluido ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
        ) : d.pct > 0 ? (
          <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{d.pct}%</span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 p-3">
        {subtitulo && <p className="text-[10px] font-medium uppercase tracking-wide text-white/70">{subtitulo}</p>}
        <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{d.titulo}</h3>
        {(d.ementa || d.descricao) && <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70">{d.ementa || d.descricao}</p>}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white/90" style={{ width: `${d.pct}%` }} /></div>
      </div>
    </Link>
  )
}

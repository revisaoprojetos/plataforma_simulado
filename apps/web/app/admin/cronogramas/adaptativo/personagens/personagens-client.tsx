'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FichaTipo } from '@/lib/cronograma/adaptativo/regras-campos'

export interface PersonagemLinha {
  slug: string; rotulo: string; nomeAluno: string; familia: string; ordem: number
  duracaoPadraoMin: number | null; duracaoVigenteMin: number | null
  deslocamentoPadraoSem: number | null; deslocamentoVigenteSem: number | null
  prioridadePadrao: number; prioridadeVigente: number
  ficha: FichaTipo
}
type Col = 'slug' | 'rotulo' | 'nomeAluno' | 'familia' | 'duracao' | 'deslocamento' | 'prioridade' | 'ordem'
const FAMILIAS: Record<string, string> = { pf: 'PDFull', fl: 'PDFlash', qu: 'Questões', lp: 'LegProc', jp: 'Jurisprudência' }
const dur = (v: number | null) => (v == null ? 'calculada' : `${v} min`)
const desl = (v: number | null) => (v == null ? '—' : `${v} sem`)
const chave = (l: PersonagemLinha, c: Col): string | number =>
  c === 'duracao' ? (l.duracaoVigenteMin ?? -1) : c === 'deslocamento' ? (l.deslocamentoVigenteSem ?? -1) : c === 'prioridade' ? l.prioridadeVigente : l[c]

export function PersonagensClient({ linhas, versao }: { linhas: PersonagemLinha[]; versao: number }) {
  const [q, setQ] = useState('')
  const [fam, setFam] = useState('')
  const [ord, setOrd] = useState<Col>('ordem')
  const [asc, setAsc] = useState(true)
  const [sel, setSel] = useState<string>(linhas[0]?.slug ?? '')

  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = linhas.filter((l) => (!fam || l.familia === fam) && (!b || `${l.slug} ${l.rotulo} ${l.nomeAluno}`.toLowerCase().includes(b)))
    return [...f].sort((a, c) => {
      const x = chave(a, ord), y = chave(c, ord)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
      return (r || a.slug.localeCompare(c.slug)) * (asc ? 1 : -1)
    })
  }, [linhas, q, fam, ord, asc])
  const ficha = linhas.find((l) => l.slug === sel) ?? lista[0]

  const Th = ({ c, children }: { c: Col; children: string }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(true) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
        O <b>registro de tipos</b> (slug, nomes, família, ordem) é estático no código — somente leitura. Editável por regras: <b>prioridade</b>, limites por dia, tetos e revisão (aba{' '}
        <Link href="/admin/cronogramas/adaptativo/faixas" className="font-medium text-primary underline-offset-2 hover:underline">Faixas e limites</Link>); <b>duração</b> e <b>deslocamento</b> (aba{' '}
        <Link href="/admin/cronogramas/adaptativo/metas" className="font-medium text-primary underline-offset-2 hover:underline">Metas &amp; inteligência</Link>). Regras vigentes: versão {versao || 'padrão'}.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por slug ou nome" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={fam} onChange={(e) => setFam(e.target.value)} className="h-9 rounded-xl border border-input bg-background px-3 text-sm">
          <option value="">Todas as famílias</option>
          {Object.entries(FAMILIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
              <Th c="slug">Slug</Th><Th c="rotulo">Rótulo</Th><Th c="nomeAluno">Nome p/ aluno</Th><Th c="familia">Família</Th><Th c="duracao">Duração</Th><Th c="deslocamento">Desloc.</Th><Th c="prioridade">Prioridade</Th><Th c="ordem">Ordem</Th>
            </tr></thead>
            <tbody>
              {lista.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum tipo encontrado.</td></tr>}
              {lista.map((l) => (
                <tr key={l.slug} onClick={() => setSel(l.slug)} className={cn('cursor-pointer border-t border-border transition hover:bg-muted/40', ficha?.slug === l.slug && 'bg-primary/5')}>
                  <td className="px-3 py-2 font-mono text-xs">{l.slug}</td>
                  <td className="px-3 py-2 font-medium">{l.rotulo}</td>
                  <td className="px-3 py-2">{l.nomeAluno}</td>
                  <td className="px-3 py-2">{FAMILIAS[l.familia] ?? l.familia}</td>
                  <td className={cn('px-3 py-2 tabular-nums', l.duracaoVigenteMin !== l.duracaoPadraoMin && 'font-semibold text-primary')}>{dur(l.duracaoVigenteMin)}</td>
                  <td className={cn('px-3 py-2 tabular-nums', l.deslocamentoVigenteSem !== l.deslocamentoPadraoSem && 'font-semibold text-primary')}>{desl(l.deslocamentoVigenteSem)}</td>
                  <td className={cn('px-3 py-2 tabular-nums', l.prioridadeVigente !== l.prioridadePadrao && 'font-semibold text-primary')}>{l.prioridadeVigente}</td>
                  <td className="px-3 py-2 tabular-nums">{l.ordem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {ficha && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{ficha.slug} · {FAMILIAS[ficha.familia] ?? ficha.familia}</p>
              <h2 className="text-lg font-bold">{ficha.rotulo}</h2>
              <p className="text-sm text-muted-foreground">O aluno vê: “{ficha.nomeAluno}” · duração {dur(ficha.duracaoVigenteMin)} · desloc. {desl(ficha.deslocamentoVigenteSem)}</p>
            </div>
            <Bloco titulo="Avanço" itens={ficha.ficha.avanca} />
            <Bloco titulo="Recuo / retorno" itens={ficha.ficha.recua} />
            <Bloco titulo="Limites e teto" itens={ficha.ficha.teto} />
            {ficha.ficha.chefao && <Bloco titulo="Revisão “chefão”" itens={ficha.ficha.chefao} />}
            <Bloco titulo="Restrições" itens={ficha.ficha.restricoes ?? []} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Editável por regras</p>
              <p className="mt-1 flex flex-wrap gap-1">{ficha.ficha.editavel.map((e) => <code key={e} className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{e}</code>)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Bloco({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{itens.map((t, k) => <li key={k}>{t}</li>)}</ul>
    </div>
  )
}

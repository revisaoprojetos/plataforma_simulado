'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Merge, Search, Check, Loader2, Info, Sparkles, X, Undo2, History, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { confirmar } from '@/components/ui/confirm-dialog'
import { unificarTaxonomia, previewUnificacaoTax } from '@/app/admin/questoes/taxonomia-actions'
import type { TipoTaxonomia, ItemTax } from '@/app/admin/questoes/taxonomia-tipos'
import { desfazerUnificacao, type UnificacaoRecente } from '@/app/admin/questoes/disciplinas-actions'

// Normaliza p/ detectar duplicatas: sem acento, minúsculo, sem pontuação, espaços colapsados.
const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Escolhe a "melhor" p/ manter: mais questões, depois mais "extra" (assuntos), depois nome mais curto.
const melhor = (g: ItemTax[]) => [...g].sort((a, b) => b.questoes - a.questoes || (b.extra ?? 0) - (a.extra ?? 0) || a.nome.length - b.nome.length)[0]

type Meta = { chip: string; singular: string; plural: string; artigo: 'a' | 'o'; extraLabel?: string; undo?: boolean }
const META: Record<TipoTaxonomia, Meta> = {
  disciplina: { chip: 'Disciplinas', singular: 'disciplina', plural: 'disciplinas', artigo: 'a', extraLabel: 'Assuntos', undo: true },
  assunto: { chip: 'Assuntos', singular: 'assunto', plural: 'assuntos', artigo: 'o' },
  banca: { chip: 'Bancas', singular: 'banca', plural: 'bancas', artigo: 'a' },
  orgao: { chip: 'Órgãos', singular: 'órgão', plural: 'órgãos', artigo: 'o' },
  cargo: { chip: 'Cargos', singular: 'cargo', plural: 'cargos', artigo: 'o' },
  assunto_detalhe: { chip: 'Assunto específico', singular: 'assunto específico', plural: 'assuntos específicos', artigo: 'o' },
  ano: { chip: 'Anos', singular: 'ano', plural: 'anos', artigo: 'o' },
}
const ORDEM: TipoTaxonomia[] = ['disciplina', 'assunto', 'banca', 'orgao', 'cargo', 'assunto_detalhe', 'ano']

export function TaxonomiaUnificacao({ tipo, itens, recentes = [] }: { tipo: TipoTaxonomia; itens: ItemTax[]; recentes?: UnificacaoRecente[] }) {
  const router = useRouter()
  const m = META[tipo]
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [manter, setManter] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [desfazendo, setDesfazendo] = useState('')
  const [pagRec, setPagRec] = useState(1) // página da tabela "Unificações recentes" (10/pág)
  const [campoRec, setCampoRec] = useState<'mantida' | 'mescladas' | 'questoes' | 'data'>('data')
  const [dirRec, setDirRec] = useState<'asc' | 'desc'>('desc')
  function ordenarRec(campo: 'mantida' | 'mescladas' | 'questoes' | 'data') {
    if (campoRec === campo) setDirRec((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampoRec(campo); setDirRec(campo === 'mantida' ? 'asc' : 'desc') }
  }

  // Clusters de possíveis duplicatas (mesmo nome normalizado, 2+ variações).
  const clusters = useMemo(() => {
    const map = new Map<string, ItemTax[]>()
    for (const d of itens) { const k = norm(d.nome); const g = map.get(k) ?? []; g.push(d); map.set(k, g) }
    return [...map.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length)
  }, [itens])

  const filtrados = useMemo(() => {
    const q = norm(busca)
    return q ? itens.filter((d) => norm(d.nome).includes(q)) : itens
  }, [itens, busca])

  async function unificar(canonicaId: string, dups: string[]) {
    const alvo = itens.find((d) => d.id === canonicaId)
    if (!alvo || !dups.length) return
    setSalvando(true)
    const pv = await previewUnificacaoTax(tipo, dups)
    const nQ = pv.ok ? (pv.questoes ?? 0) : itens.filter((d) => dups.includes(d.id)).reduce((s, d) => s + d.questoes, 0)
    const ok = await confirmar({
      titulo: `Unificar ${m.plural}?`,
      mensagem: `${dups.length} ${dups.length === 1 ? m.singular : m.plural} ${dups.length === 1 ? 'será mesclad' + (m.artigo === 'a' ? 'a' : 'o') : 'serão mesclad' + (m.artigo === 'a' ? 'as' : 'os')} em «${alvo.nome}»: ${nQ} questão(ões) passam para ${m.artigo === 'a' ? 'ela' : 'ele'} e ${dups.length === 1 ? 'a duplicada some' : 'as duplicadas somem'} do filtro. As questões não são apagadas.${m.undo ? ' Dá para desfazer depois.' : ''}`,
      confirmar: 'Unificar',
    })
    if (!ok) { setSalvando(false); return }
    const r = await unificarTaxonomia(tipo, canonicaId, dups)
    setSalvando(false)
    if (r.ok) { toast.success(`Unificado em «${r.mantida}» — ${r.questoes} questão(ões) movidas, ${r.removidas} removida(s)`); setSel(new Set()); setManter(''); router.refresh() }
    else toast.error(r.error ?? 'Erro ao unificar.')
  }

  async function desfazer(u: UnificacaoRecente) {
    const ok = await confirmar({ titulo: 'Desfazer unificação?', mensagem: `Recria ${u.duplicadas.length} disciplina(s) (${u.duplicadas.join(', ') || '—'}) e devolve ~${u.questoes} questão(ões) para elas.`, confirmar: 'Desfazer' })
    if (!ok) return
    setDesfazendo(u.id)
    const r = await desfazerUnificacao(u.id)
    setDesfazendo('')
    if (r.ok) { toast.success(`Desfeito — ${r.questoes} questão(ões) restauradas`); router.refresh() }
    else toast.error(r.error ?? 'Erro ao desfazer.')
  }

  function toggle(id: string) { setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  const selArr = [...sel]
  const canonManual = (manter && sel.has(manter)) ? manter : melhor(selArr.map((id) => itens.find((d) => d.id === id)!).filter(Boolean))?.id ?? ''

  return (
    <div className="space-y-5">
      {/* Seletor de tipo */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ORDEM.map((t) => (
          <Link key={t} href={`/admin/questoes?tab=unificacao&tipoTax=${t}`}
            className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              t === tipo ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>
            {META[t].chip}
          </Link>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{m.plural.charAt(0).toUpperCase() + m.plural.slice(1)} com nomes diferentes mas que são a mesma coisa (ex.: da criação/import CSV) poluem o filtro. Marque {m.artigo === 'a' ? 'as' : 'os'} duplicad{m.artigo === 'a' ? 'as' : 'os'}, escolha qual <strong>manter</strong> e unifique — as questões passam para {m.artigo === 'a' ? 'a mantida' : 'o mantido'} e {m.artigo === 'a' ? 'as demais somem' : 'os demais somem'} do filtro.</span>
      </div>

      {/* Todos os itens — seleção manual (bloco principal) */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">{m.plural.charAt(0).toUpperCase() + m.plural.slice(1)} <span className="text-xs font-normal text-muted-foreground">({itens.length})</span></p>
          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${m.singular}…`} className="w-full rounded-lg border bg-[var(--input-bg,transparent)] py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div className="max-h-[46vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 font-medium">{m.singular.charAt(0).toUpperCase() + m.singular.slice(1)}</th>
                <th className="px-3 py-2 text-right font-medium">Questões</th>
                {m.extraLabel && <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{m.extraLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={m.extraLabel ? 4 : 3} className="py-10 text-center text-muted-foreground">Nenhum item.</td></tr>
              ) : filtrados.map((d) => {
                const on = sel.has(d.id)
                return (
                  <tr key={d.id} onClick={() => toggle(d.id)} className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', on && 'bg-primary/5')}>
                    <td className="px-3 py-2"><span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{on && <Check className="h-3 w-3" />}</span></td>
                    <td className="px-3 py-2"><span className="block truncate font-medium">{d.nome}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{d.questoes.toLocaleString('pt-BR')}</td>
                    {m.extraLabel && <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{(d.extra ?? 0).toLocaleString('pt-BR')}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Barra de merge manual */}
        {sel.size >= 2 && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
            <span className="text-sm font-medium">{sel.size} selecionad{m.artigo === 'a' ? 'as' : 'os'} · manter:</span>
            <select value={canonManual} onChange={(e) => setManter(e.target.value)} className="rounded-lg border bg-card px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
              {selArr.map((id) => { const d = itens.find((x) => x.id === id); return d ? <option key={id} value={id}>{d.nome} ({d.questoes})</option> : null })}
            </select>
            <button onClick={() => setSel(new Set())} className="rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
            <button onClick={() => unificar(canonManual, selArr.filter((id) => id !== canonManual))} disabled={salvando || !canonManual}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Unificar {sel.size}
            </button>
          </div>
        )}
      </div>

      {/* Sugestões automáticas — abaixo do bloco principal */}
      {clusters.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Sugestões automáticas <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{clusters.length}</span></p>
          <p className="text-xs text-muted-foreground">Grupos com o mesmo nome escrito de formas diferentes. Confira {m.artigo === 'a' ? 'a que' : 'o que'} vai ser mantid{m.artigo} e unifique num clique.</p>
          <div className="max-h-[58vh] overflow-y-auto rounded-2xl border bg-muted/10 p-2">
            <div className="grid gap-2 lg:grid-cols-2">
              {clusters.map((g, i) => <ClusterCard key={i} grupo={g} meta={m} salvando={salvando} onUnificar={unificar} />)}
            </div>
          </div>
        </div>
      )}

      {/* Unificações recentes — desfazer (só disciplina, que tem log/RPC): tabela paginada (10/pág) */}
      {m.undo && recentes.length > 0 && (() => {
        const POR_PAG = 10
        const ordenados = [...recentes].sort((a, b) => {
          let c = 0
          if (campoRec === 'mantida') c = a.mantida.localeCompare(b.mantida, 'pt-BR')
          else if (campoRec === 'mescladas') c = a.duplicadas.length - b.duplicadas.length
          else if (campoRec === 'questoes') c = a.questoes - b.questoes
          else c = (a.criado_em ?? '').localeCompare(b.criado_em ?? '') // data: ISO → ordem cronológica
          return dirRec === 'asc' ? c : -c
        })
        const totalPag = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
        const pag = Math.min(pagRec, totalPag)
        const visiveis = ordenados.slice((pag - 1) * POR_PAG, pag * POR_PAG)
        const ThRec = ({ campo, children, className }: { campo: 'mantida' | 'mescladas' | 'questoes' | 'data'; children: ReactNode; className?: string }) => (
          <th className={cn('px-3 py-2 font-medium', className)}>
            <button type="button" onClick={() => ordenarRec(campo)} className="inline-flex items-center gap-1 hover:text-foreground">
              {children}<ArrowUpDown className={cn('h-3 w-3', campoRec === campo ? 'text-primary' : 'text-muted-foreground/50')} />
            </button>
          </th>
        )
        return (
          <div className="space-y-2 rounded-2xl border bg-card p-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4 text-primary" /> Unificações recentes <span className="text-xs font-normal text-muted-foreground">({recentes.length})</span></p>
            <p className="text-xs text-muted-foreground">Errou na mesclagem? Desfaça — recria as disciplinas e devolve as questões.</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-muted-foreground">
                  <tr className="border-b">
                    <ThRec campo="mantida">Mantida</ThRec>
                    <ThRec campo="mescladas" className="hidden sm:table-cell">Mescladas</ThRec>
                    <ThRec campo="questoes" className="text-right"><span className="ml-auto">Questões</span></ThRec>
                    <ThRec campo="data" className="hidden md:table-cell">Feito em</ThRec>
                    <th className="w-28 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2"><span className="block truncate font-medium">«{u.mantida}»</span></td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell" title={u.duplicadas.join(', ')}><span className="line-clamp-1">{u.duplicadas.length} · {u.duplicadas.join(', ') || '—'}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{u.questoes.toLocaleString('pt-BR')}</td>
                      <td className="hidden px-3 py-2 tabular-nums text-muted-foreground md:table-cell">{formatBrt(u.criado_em) ?? '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => desfazer(u)} disabled={desfazendo === u.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50">
                          {desfazendo === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Desfazer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPag > 1 && (
              <div className="flex items-center justify-between pt-1 text-sm">
                <span className="text-muted-foreground">Página {pag} de {totalPag}</span>
                <div className="flex gap-1.5">
                  <button onClick={() => setPagRec(1)} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Início</button>
                  <button onClick={() => setPagRec((p) => Math.max(1, p - 1))} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Anterior</button>
                  <button onClick={() => setPagRec((p) => Math.min(totalPag, p + 1))} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Próxima</button>
                  <button onClick={() => setPagRec(totalPag)} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Final</button>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function ClusterCard({ grupo, meta, salvando, onUnificar }: { grupo: ItemTax[]; meta: Meta; salvando: boolean; onUnificar: (canonicaId: string, dups: string[]) => void }) {
  const [canonica, setCanonica] = useState(() => melhor(grupo).id)
  const dups = grupo.filter((d) => d.id !== canonica).map((d) => d.id)
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="space-y-1">
        {grupo.map((d) => (
          <label key={d.id} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors', d.id === canonica ? 'border-primary/50 bg-primary/5' : 'hover:bg-muted/40')}>
            <input type="radio" name={`canon-${grupo[0].id}`} checked={d.id === canonica} onChange={() => setCanonica(d.id)} className="h-3.5 w-3.5" />
            <span className="min-w-0 flex-1 truncate">{d.nome}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{d.questoes} q{meta.extraLabel ? ` · ${d.extra ?? 0} as.` : ''}</span>
            {d.id === canonica && <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">manter</span>}
          </label>
        ))}
      </div>
      <button onClick={() => onUnificar(canonica, dups)} disabled={salvando}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted disabled:opacity-50">
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />} Unificar {grupo.length} em «{grupo.find((d) => d.id === canonica)?.nome}»
      </button>
    </div>
  )
}

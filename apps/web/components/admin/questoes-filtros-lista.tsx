'use client'

// Filtros da lista /admin/questoes: busca + botão "Filtros (N)" + card multi-seleção (PainelFiltrosQuestoesAdmin, com contagem ao vivo
// vinda do servidor) + chips por valor removíveis + Limpar. Só COMPÕE o núcleo compartilhado; o estado vive na URL (listas "a|b").

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PainelFiltrosQuestoesAdmin, CAMPOS_CARD, chipsDoEstado, type CampoCard, type RascunhoCard } from '@/components/filtros/painel-filtros-questoes-admin'
import { juntarLista, lerLista } from '@/lib/aluno/filtros-multi'
import type { OpcoesQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { estadoQDeUrlAdmin } from '@/lib/admin-revisao/questoes-lista-url'

export function QuestoesFiltrosLista({ opcoes }: { opcoes: OpcoesQ }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const st = useMemo(() => estadoQDeUrlAdmin(new URLSearchParams(sp.toString())), [sp])
  const [aberto, setAberto] = useState(() => chipsDoEstado(st, opcoes).length > 0)
  const [busca, setBusca] = useState(st.q)
  const ultimaQ = useRef(st.q)

  const navegar = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString())
    mut(p)
    p.delete('page')
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }
  /** grava os campos do card na URL (e descarta as chaves antigas de valor único) */
  const gravarCampos = (p: URLSearchParams, r: Record<CampoCard, string>) => {
    p.delete('disciplina'); p.delete('dificuldade')
    for (const c of CAMPOS_CARD) { if (r[c]) p.set(c, r[c]); else p.delete(c) }
  }

  // busca com debounce; mudança externa de q (Limpar/voltar) ressincroniza sem atropelar a digitação
  useEffect(() => {
    if (busca.trim() === st.q) return
    const t = setTimeout(() => { ultimaQ.current = busca.trim(); navegar((p) => { if (busca.trim()) p.set('q', busca.trim()); else p.delete('q') }) }, 300)
    return () => clearTimeout(t)
  }, [busca]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st.q !== ultimaQ.current) { ultimaQ.current = st.q; setBusca(st.q) } }, [st.q])

  const chips = useMemo(() => chipsDoEstado(st, opcoes), [st, opcoes])
  const temFiltro = chips.length > 0 || !!st.q

  const aplicar = (r: RascunhoCard) => navegar((p) => gravarCampos(p, r))
  const remover = (campo: CampoCard, valor: string) => navegar((p) => {
    const atual: Record<CampoCard, string> = Object.fromEntries(CAMPOS_CARD.map((c) => [c, st[c]])) as Record<CampoCard, string>
    atual[campo] = juntarLista(lerLista(st[campo]).filter((x) => x !== valor)) ?? ''
    gravarCampos(p, atual)
  })
  const limpar = () => { ultimaQ.current = ''; setBusca(''); navegar((p) => { p.delete('q'); gravarCampos(p, Object.fromEntries(CAMPOS_CARD.map((c) => [c, ''])) as Record<CampoCard, string>) }) }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou enunciado..." className="pl-8" aria-label="Buscar questões" />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="h-9">
        <SlidersHorizontal />Filtros{chips.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{chips.length}</span>}
      </Button>
      {temFiltro && (
        <button type="button" onClick={limpar} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />Limpar
        </button>
      )}
      {chips.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-1.5 lg:justify-end" role="group" aria-label="Filtros aplicados">
          {chips.map((c) => (
            <button key={c.campo + c.valor} type="button" onClick={() => remover(c.campo, c.valor)} title="Remover este filtro"
              className="inline-flex h-7 max-w-64 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/15">
              <span className="truncate">{c.label}</span><X className="h-3 w-3 shrink-0" />
            </button>
          ))}
        </div>
      )}
      {aberto && <div className="w-full text-left"><PainelFiltrosQuestoesAdmin st={st} opcoes={opcoes} onAplicar={aplicar} /></div>}
    </div>
  )
}

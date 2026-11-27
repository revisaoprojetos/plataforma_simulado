'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// CENTRAL DE DUPLICADOS — faixa de avisos no topo de Unificação. Um card por seção com o nº do que há a unificar.
// Backend-first: só LÊ os resumos que o servidor já calcula (rotas existentes, cache do servidor); aqui nada é detectado.
// Carrega depois do 1º paint (não disputa com a seção ativa) e cada card falha sozinho (traço + tentar de novo).

export type SecaoCentral = 'duplicadas' | 'termos' | 'etiquetas' | 'disciplinas'
interface Valor { n: number; sub?: string }
type Estado = { carregando: true } | { carregando: false; erro: true } | { carregando: false; erro: false; v: Valor }
const TTL = 60_000
const CACHE = new Map<string, { t: number; v: Valor }>()
const fmt = (n: number) => n.toLocaleString('pt-BR')

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { cache: 'no-store' })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`)
  return j
}

const BUSCAS: Record<SecaoCentral, (fresh: boolean) => Promise<Valor>> = {
  duplicadas: async (f) => {
    const j = await getJson(`/api/admin/revisao/biblioteca/questoes-unificar?s=grupos&vista=pendentes&page=1&pp=1${f ? '&fresh=1' : ''}`)
    return { n: Number(j.resumo?.grupos ?? 0), sub: 'grupos de questões iguais ou parecidas' }
  },
  termos: async (f) => {
    const j = await getJson(`/api/admin/revisao/biblioteca/questoes-termos?s=resumos${f ? '&fresh=1' : ''}`)
    const rs: { tipo: string; grupos: number }[] = j.resumos ?? []
    const n = rs.reduce((t, r) => t + (r.grupos || 0), 0)
    const disc = rs.find((r) => r.tipo === 'disciplina')?.grupos ?? 0
    return { n, sub: disc > 0 ? `inclui ${fmt(disc)} de disciplinas` : 'bancas, órgãos, cargos, disciplinas…' }
  },
  etiquetas: async (f) => {
    const j = await getJson(`/api/admin/revisao/biblioteca/questoes-etiquetas?s=lista&page=1&pp=1${f ? '&fresh=1' : ''}`)
    return { n: Array.isArray(j.indicadores?.duplicadas) ? j.indicadores.duplicadas.length : 0, sub: 'nomes repetidos para mesclar' }
  },
  disciplinas: async (f) => {
    const j = await getJson(`/api/admin/revisao/biblioteca/pastas-unificar?s=grupos&categoria=conteudo&page=1&pp=1${f ? '&fresh=1' : ''}`)
    return { n: Number(j.resumo?.grupos ?? 0), sub: 'pastas-disciplina repetidas' }
  },
}
const TITULO: Record<SecaoCentral, string> = { duplicadas: 'Questões duplicadas', termos: 'Termos da taxonomia', etiquetas: 'Etiquetas repetidas', disciplinas: 'Disciplinas (pastas)' }

export function CentralDuplicados({ secoes, ativa, onIr, inicial }: { secoes: SecaoCentral[]; ativa: SecaoCentral; onIr: (s: SecaoCentral) => void; inicial?: Partial<Record<SecaoCentral, number>> }) {
  const [est, setEst] = useState<Partial<Record<SecaoCentral, Estado>>>(() => {
    const e: Partial<Record<SecaoCentral, Estado>> = {}
    for (const s of secoes) { const c = CACHE.get(s); e[s] = c && Date.now() - c.t < TTL ? { carregando: false, erro: false, v: c.v } : inicial?.[s] !== undefined ? { carregando: false, erro: false, v: { n: inicial[s]! } } : { carregando: true } }
    return e
  })
  const chave = secoes.join(',')
  const carregar = useCallback((s: SecaoCentral, fresh = false) => {
    setEst((e) => ({ ...e, [s]: { carregando: true } }))
    BUSCAS[s](fresh).then((v) => { CACHE.set(s, { t: Date.now(), v }); setEst((e) => ({ ...e, [s]: { carregando: false, erro: false, v } })) })
      .catch(() => setEst((e) => ({ ...e, [s]: { carregando: false, erro: true } })))
  }, [])
  useEffect(() => {
    const t = setTimeout(() => { for (const s of chave.split(',') as SecaoCentral[]) { const c = CACHE.get(s); if (!c || Date.now() - c.t >= TTL) carregar(s) } }, 400)
    return () => clearTimeout(t)
  }, [chave, carregar])

  return (
    <section aria-label="Central de duplicados" className="mb-3 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Central de duplicados</h2>
        <button type="button" onClick={() => { for (const s of secoes) carregar(s, true) }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Atualizar avisos">
          <RefreshCw className="h-3.5 w-3.5" />Atualizar
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {secoes.map((s) => {
          const e = est[s] ?? { carregando: true as const }
          const v = !e.carregando && !e.erro ? e.v : null
          const alerta = !!v && v.n > 0
          return (
            <button key={s} type="button" onClick={() => onIr(s)} aria-pressed={ativa === s} aria-label={`${TITULO[s]}: abrir`}
              className={cn('flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors hover:bg-muted/40',
                alerta && 'border-amber-500/50 bg-amber-500/5', ativa === s && 'ring-2 ring-primary/40')}>
              <span className={cn('mt-0.5 shrink-0', alerta ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                {alerta ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{TITULO[s]}</span>
                {e.carregando ? <span className="mt-1 inline-block h-6 w-14 animate-pulse rounded bg-muted" />
                  : e.erro ? <span className="block text-xs text-destructive">Não foi possível carregar · <span role="button" tabIndex={0} className="underline" onClick={(ev) => { ev.stopPropagation(); carregar(s, true) }} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); carregar(s, true) } }}>tentar de novo</span></span>
                    : <>
                      <span className="block text-2xl font-semibold tabular-nums leading-tight">{fmt(v!.n)}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{v!.n > 0 ? v!.sub : 'nada a unificar'}</span>
                    </>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

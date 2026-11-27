'use client'

// EDIÇÃO INLINE de regras de uso (área × classificação) — peças COMPARTILHADAS entre a matriz geral (regras-uso-client.tsx)
// e a aba "Regras de uso" da página da classificação. Estado de edição (pendências, prévia, salvar) num hook; as colunas da linha
// num componente. Cascata: meta (override) > regra da área > padrão do motor; herdado em cinza. Cálculo/prévia: SERVIDOR (PUT dryRun).

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eraser, Eye, Loader2, Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MODOS_TEMPO, type ModoTempo, type RegrasUso } from '@/lib/conteudo/classificacao/esquema'
import type { AlteracaoRegras, PatchRegras } from '@/lib/conteudo/classificacao/gestao'
import type { MatrizRegras, PreviaRegra } from '@/lib/conteudo/classificacao/gestao-server'

export const API_REGRAS = '/api/admin/biblioteca/classificacao/regras-uso'
export const CELULA = 'h-9 w-full rounded-lg border bg-card px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'
export const ROTULO_MODO: Record<ModoTempo, string> = { por_pagina: 'Por página', por_palavras: 'Por palavras', por_artigo: 'Por artigo', por_caracteres: 'Por caracteres', fixo: 'Fixo', manual: 'Manual (sem cálculo)' }
const PARAM_DO_MODO: Record<ModoTempo, { campo: keyof RegrasUso['tempo'] | null; un: string }> = {
  por_pagina: { campo: 'min_por_pagina', un: 'min/página' }, por_palavras: { campo: 'palavras_por_min', un: 'palavras/min' },
  por_artigo: { campo: 'min_por_artigo', un: 'min/artigo' }, por_caracteres: { campo: 'caracteres_por_min', un: 'caract./min' },
  fixo: { campo: 'minutos_fixo', un: 'minutos' }, manual: { campo: null, un: '' },
}
export const BOOLS = [
  { k: 'gera_meta', r: 'Gera meta' }, { k: 'aceita_partes', r: 'Aceita partes' }, { k: 'conta_como_aula', r: 'Conta como aula' }, { k: 'entra_liberacao', r: 'Entra na liberação' },
] as const

type G = 'tempo' | 'meta'
type Pend = Record<string, PatchRegras & { limpar?: boolean }>
export const chaveCelula = (area: string, id: string) => `${area}:${id}`
export const minutosTxt = (m: number | null) => (m == null ? '—' : `${m} min`)

export async function apiRegras<T = any>(method: string, body?: unknown): Promise<{ ok: boolean; data: T }> {
  try {
    const r = await fetch(API_REGRAS, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { ok: r.ok, data: (await r.json().catch(() => ({}))) as T }
  } catch { return { ok: false, data: { error: 'Falha de rede.' } as T } }
}

export function useRegrasEdicao(matriz: MatrizRegras, podeEditar: boolean) {
  const router = useRouter()
  const [pend, setPend] = useState<Pend>({})
  const [previa, setPrevia] = useState<PreviaRegra[] | null>(null)
  const [medidas, setMedidas] = useState({ paginas: matriz.medidas.paginas ?? 20, palavras: matriz.medidas.palavras ?? 6000, artigos: matriz.medidas.artigos ?? 20 })
  const [ocupado, setOcupado] = useState<'previa' | 'salvar' | null>(null)
  const nPend = Object.keys(pend).length

  const alteracoes = useMemo<AlteracaoRegras[]>(() => Object.entries(pend).map(([k, p]) => {
    const [a, ...resto] = k.split(':')
    return { area: a as AlteracaoRegras['area'], classificacaoId: resto.join(':'), ...(p.limpar ? { limpar: true } : {}), patch: { tempo: p.tempo, meta: p.meta } as AlteracaoRegras['patch'] }
  }), [pend])

  /** valor definido (gravado ou pendente) de um campo; undefined = herdado */
  function definido(a: string, id: string, g: G, k: string): unknown {
    const p = pend[chaveCelula(a, id)]
    if (p?.limpar && !(p[g] && k in (p[g] as object))) return undefined
    const pg = p?.[g] as Record<string, unknown> | undefined
    if (pg && k in pg) return pg[k] === null ? undefined : pg[k]
    return (matriz.celulas[chaveCelula(a, id)]?.definidas[g] as Record<string, unknown> | undefined)?.[k]
  }
  const herdado = (a: string, g: G, k: string) => (matriz.padraoPorArea[a][g] as Record<string, unknown>)[k]

  function editar(a: string, id: string, g: G, k: string, valor: unknown | null) {
    setPrevia(null)
    setPend((prev) => {
      const key = chaveCelula(a, id)
      const cur = prev[key] ?? {}
      const gravado = (matriz.celulas[key]?.definidas[g] as Record<string, unknown> | undefined)?.[k]
      const grupo = { ...((cur[g] as Record<string, unknown>) ?? {}) }
      if (!cur.limpar && ((valor === null && gravado === undefined) || valor === gravado)) delete grupo[k]; else grupo[k] = valor
      const novo = { ...cur, [g]: Object.keys(grupo).length ? grupo : undefined }
      const out = { ...prev }
      if (!novo.tempo && !novo.meta && !novo.limpar) delete out[key]; else out[key] = novo
      return out
    })
  }
  function limparCelula(a: string, id: string) {
    if (!matriz.celulas[chaveCelula(a, id)]) return
    setPrevia(null)
    setPend((prev) => ({ ...prev, [chaveCelula(a, id)]: { limpar: true } }))
  }
  const corpo = (dryRun: boolean) => ({ alteracoes, dryRun, medidas })
  async function preVisualizar() {
    setOcupado('previa')
    const r = await apiRegras('PUT', corpo(true)); setOcupado(null)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível pré-visualizar.')
    setPrevia(r.data.previa as PreviaRegra[])
  }
  async function salvar() {
    setOcupado('salvar')
    const r = await apiRegras('PUT', corpo(false)); setOcupado(null)
    if (!r.ok) return toast.error(r.data?.error || 'Não foi possível salvar.')
    toast.success(`Regras salvas: ${r.data.aplicadas} definida(s), ${r.data.removidas} voltaram a herdar.`)
    setPend({}); setPrevia(null); router.refresh()
  }
  const descartar = () => { setPend({}); setPrevia(null) }
  const setMedida = (k: keyof typeof medidas, v: number) => { setPrevia(null); setMedidas((m) => ({ ...m, [k]: Math.max(0, v) })) }
  return { matriz, podeEditar, pend, nPend, previa, medidas, ocupado, definido, herdado, editar, limparCelula, preVisualizar, salvar, descartar, setMedida }
}
export type RegrasEdicao = ReturnType<typeof useRegrasEdicao>

/** As colunas da linha (modo → prioridade + limpar) de UMA célula área × classificação. Espelha o <thead> de `CabecalhoColunasRegras`. */
export function CamposRegras({ ed, area, classId }: { ed: RegrasEdicao; area: string; classId: string }) {
  const { matriz, podeEditar, definido, herdado, editar, limparCelula, previa } = ed
  const cel = matriz.celulas[chaveCelula(area, classId)]
  const alterada = !!ed.pend[chaveCelula(area, classId)]
  const modoDef = definido(area, classId, 'tempo', 'modo') as ModoTempo | undefined
  const modoEf = (modoDef ?? herdado(area, 'tempo', 'modo')) as ModoTempo
  const param = PARAM_DO_MODO[modoEf]
  const previaLinha = previa?.find((p) => p.area === area && p.classificacaoId === classId)
  const entrada = (g: G, k: string) => {
    const d = definido(area, classId, g, k) as number | undefined
    return (
      <input type="number" min={0} disabled={!podeEditar} className={cn(CELULA, d === undefined && 'italic text-muted-foreground')} value={d ?? ''}
        placeholder={String(herdado(area, g, k) ?? '')} aria-label={k}
        onChange={(e) => editar(area, classId, g, k, e.target.value === '' ? null : Number(e.target.value))} />
    )
  }
  return (
    <>
      <td className="px-2 py-1.5">
        <select disabled={!podeEditar} className={cn(CELULA, modoDef === undefined && 'italic text-muted-foreground')} value={modoDef ?? ''} aria-label="Modo de tempo"
          onChange={(e) => editar(area, classId, 'tempo', 'modo', e.target.value === '' ? null : e.target.value)}>
          <option value="">herdado: {ROTULO_MODO[herdado(area, 'tempo', 'modo') as ModoTempo]}</option>
          {MODOS_TEMPO.map((m) => <option key={m} value={m}>{ROTULO_MODO[m]}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">{param.campo ? <div className="flex items-center gap-1">{entrada('tempo', param.campo)}<span className="shrink-0 text-[11px] text-muted-foreground">{param.un}</span></div> : <span className="text-muted-foreground">—</span>}</td>
      <td className="px-2 py-1.5 tabular-nums" title="Tempo do documento de exemplo, calculado no servidor">
        {alterada && !previaLinha ? <span className="text-muted-foreground" title="Pré-visualize para recalcular">…</span>
          : previaLinha ? <span><span className="text-muted-foreground">{minutosTxt(previaLinha.minutosAntes)} → </span><b>{minutosTxt(previaLinha.minutosDepois)}</b></span>
          : minutosTxt(cel?.minutos ?? null)}
      </td>
      {BOOLS.map((b) => {
        const d = definido(area, classId, 'meta', b.k) as boolean | undefined
        const h = herdado(area, 'meta', b.k) as boolean
        return (
          <td key={b.k} className="px-2 py-1.5">
            <select disabled={!podeEditar} className={cn(CELULA, d === undefined && 'italic text-muted-foreground')} value={d === undefined ? '' : d ? '1' : '0'} aria-label={b.r}
              onChange={(e) => editar(area, classId, 'meta', b.k, e.target.value === '' ? null : e.target.value === '1')}>
              <option value="">herdado: {h ? 'sim' : 'não'}</option><option value="1">Sim</option><option value="0">Não</option>
            </select>
          </td>
        )
      })}
      <td className="px-2 py-1.5">{entrada('meta', 'qtd_semana')}</td>
      <td className="px-2 py-1.5">{entrada('meta', 'prioridade')}</td>
      <td className="px-2 py-1.5">{podeEditar && (
        <Button size="icon-sm" variant="ghost" title="Limpar regras desta célula (volta a herdar)" onClick={() => limparCelula(area, classId)}><Eraser /></Button>
      )}</td>
    </>
  )
}

/** Cabeçalho das colunas de `CamposRegras` (a 1ª coluna — Classificação/Área — é do chamador). */
export function ColunasRegrasTh() {
  return (
    <>
      <th className="px-2 py-2">Cálculo do tempo</th><th className="px-2 py-2">Parâmetro</th><th className="px-2 py-2">Doc. exemplo</th>
      {BOOLS.map((b) => <th key={b.k} className="px-2 py-2">{b.r}</th>)}
      <th className="px-2 py-2">Qtd/semana</th><th className="px-2 py-2">Prioridade</th><th className="px-2 py-2" />
    </>
  )
}

export function MedidasExemplo({ ed }: { ed: RegrasEdicao }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted-foreground" title="Documento de exemplo para calcular o tempo (cálculo feito no servidor)">Doc. exemplo:</span>
      {([['paginas', 'págs'], ['palavras', 'palavras'], ['artigos', 'artigos']] as const).map(([k, r]) => (
        <label key={k} className="inline-flex items-center gap-1">
          <input type="number" min={0} className={cn(CELULA, 'w-20')} value={ed.medidas[k]} onChange={(e) => ed.setMedida(k, Number(e.target.value) || 0)} />{r}
        </label>
      ))}
    </div>
  )
}

export function PreviaRegras({ ed }: { ed: RegrasEdicao }) {
  const { previa, matriz } = ed
  if (!previa) return null
  return (
    <div className="rounded-xl border bg-muted/30 p-3 text-[13px]">
      <div className="mb-1.5 font-semibold text-foreground">O que muda ({previa.length})</div>
      {previa.length === 0 ? <span className="text-muted-foreground">Nada muda.</span> : (
        <ul className="space-y-1">
          {previa.map((p) => (
            <li key={`${p.area}:${p.classificacaoId}`} className="text-muted-foreground">
              <b className="text-foreground">{p.classificacao}</b> · {matriz.areas.find((a) => a.id === p.area)?.nome}: {p.limpar ? 'volta tudo a herdar' : p.campos.map((c) => `${c.campo.split('.')[1]} ${String(c.antes)} → ${String(c.depois)}`).join('; ') || 'sem diferença efetiva'}
              {' '}· tempo do exemplo {minutosTxt(p.minutosAntes)} → <b className="text-foreground">{minutosTxt(p.minutosDepois)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function BarraSalvarRegras({ ed }: { ed: RegrasEdicao }) {
  if (!ed.podeEditar) return null
  return (
    <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 shadow-md">
      <span className="text-[13px] text-muted-foreground">{ed.nPend ? `${ed.nPend} célula(s) com alteração pendente` : 'Nenhuma alteração pendente.'}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!ed.nPend || !!ed.ocupado} onClick={ed.descartar}><Undo2 /> Descartar</Button>
        <Button variant="outline" size="sm" disabled={!ed.nPend || !!ed.ocupado} onClick={ed.preVisualizar}>{ed.ocupado === 'previa' ? <Loader2 className="animate-spin" /> : <Eye />} Pré-visualizar</Button>
        <Button size="sm" disabled={!ed.nPend || !!ed.ocupado || ed.matriz.migracaoPendente} onClick={ed.salvar}>{ed.ocupado === 'salvar' ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações</Button>
      </div>
    </div>
  )
}

'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { TipoConteudo } from '@/lib/cronograma/tipos-conteudo-tipos'
import { REGRA_TIPO_GX_PADRAO, type RegraTipoGx } from '@/lib/cronograma/adaptativo/gx-tipos'
import type { RegistroRegras } from '@/app/admin/cronogramas/adaptativo/regras-actions-tipos'
import { salvarRegrasComTrava } from '@/app/admin/cronogramas/adaptativo/inteligencia-actions'

const URL_FAIXAS = '/admin/cronogramas/adaptativo/faixas'
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const numCls = 'h-8 w-16 rounded-lg border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

type Mapa = Record<string, RegraTipoGx>
type Linha = { ativo: boolean; maxDia: string; maxSem: string; dias: number[]; faixas: number[]; semana: string }

export const tiposGxDe = (r: unknown): Mapa => ((r as { tiposGx?: Mapa } | null)?.tiposGx ?? {})
export const regraEfetiva = (m: Mapa, slug: string): RegraTipoGx => ({ ...REGRA_TIPO_GX_PADRAO, ...(m[slug] ?? {}) })
const ehPadrao = (r: RegraTipoGx) => JSON.stringify(norm(r)) === JSON.stringify(norm(REGRA_TIPO_GX_PADRAO))
const norm = (r: RegraTipoGx): RegraTipoGx => ({ ativo: r.ativo !== false, maxPorDia: r.maxPorDia ?? null, maxPorSemana: r.maxPorSemana ?? null, dias: [...(r.dias ?? [])].sort((a, b) => a - b), faixas: [...(r.faixas ?? [])].sort((a, b) => a - b), aPartirDaSemana: r.aPartirDaSemana ?? 0 })
const paraLinha = (r: RegraTipoGx): Linha => ({ ativo: r.ativo !== false, maxDia: r.maxPorDia == null ? '' : String(r.maxPorDia), maxSem: r.maxPorSemana == null ? '' : String(r.maxPorSemana), dias: [...(r.dias ?? [])], faixas: [...(r.faixas ?? [])], semana: String(r.aPartirDaSemana ?? 0) })
const intPos = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) && n >= 1 ? n : NaN }
const erroLinha = (l: Linha): string | null => {
  if (Number.isNaN(intPos(l.maxDia))) return 'máx/dia deve ser inteiro ≥ 1 ou vazio'
  if (Number.isNaN(intPos(l.maxSem))) return 'máx/semana deve ser inteiro ≥ 1 ou vazio'
  const s = Number(l.semana.trim() === '' ? 0 : l.semana)
  if (!Number.isInteger(s) || s < 0 || s > 104) return 'semana deve ser inteiro de 0 a 104'
  return null
}
const deLinha = (l: Linha): RegraTipoGx => ({ ativo: l.ativo, maxPorDia: intPos(l.maxDia), maxPorSemana: intPos(l.maxSem), dias: [...l.dias].sort((a, b) => a - b), faixas: [...l.faixas].sort((a, b) => a - b), aPartirDaSemana: Number(l.semana.trim() === '' ? 0 : l.semana) })

/** Resumo legível de uma regra (usado na Matriz e na Ficha). */
export function resumoRegraTipo(r: RegraTipoGx): string {
  const n = norm(r)
  if (ehPadrao(n)) return 'Padrão: entra na sobra do dia, na ordem de prioridade do catálogo.'
  const p: string[] = []
  if (!n.ativo) p.push('desativada')
  if (n.maxPorDia != null) p.push(`máx. ${n.maxPorDia}/dia`)
  if (n.maxPorSemana != null) p.push(`máx. ${n.maxPorSemana}/semana`)
  if (n.faixas.length) p.push(`faixas ${n.faixas.join(', ')}`)
  if (n.dias.length) p.push(`dias ${n.dias.map((d) => DIAS[d] ?? d).join(', ')}`)
  if (n.aPartirDaSemana > 0) p.push(`a partir da semana ${n.aPartirDaSemana}`)
  return p.join(' · ')
}

export function LinkFaixas({ className }: { className?: string }) {
  return <Link href={URL_FAIXAS} className={cn('text-xs font-medium text-primary underline-offset-2 hover:underline', className)}>ver Faixas e limites</Link>
}

const Chip = ({ on, off, children, onClick, label }: { on: boolean; off: boolean; children: React.ReactNode; onClick: () => void; label: string }) => (
  <button type="button" disabled={off} onClick={onClick} aria-pressed={on} aria-label={label}
    className={cn('h-7 min-w-7 rounded-full border px-2 text-xs font-medium transition disabled:opacity-60', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground')}>{children}</button>
)

/** Matriz de regras por tipo personalizado com geraMeta (FASE 3a). Rascunho local próprio; um único "Salvar regras". */
export function MatrizRegrasTipo({ tipos, registro, podeEditar, onSalvo }: {
  tipos: TipoConteudo[]; registro: RegistroRegras; podeEditar: boolean; onSalvo: () => Promise<void>
}) {
  const [vigente, setVigente] = useState<Mapa>(tiposGxDe(registro.regras))
  const [versao, setVersao] = useState(registro.versao)
  const [rasc, setRasc] = useState<Record<string, Linha>>({})
  const [q, setQ] = useState('')
  const [soAlterados, setSoAlterados] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [conflito, setConflito] = useState(false)
  const [pend, start] = useTransition()
  const nFaixas = Math.max(1, registro.regras.faixas?.length ?? 1)

  const elegiveis = useMemo(() => tipos.filter((t) => !t.sistema && t.geraMeta).sort((a, c) => a.ordem - c.ordem || a.slug.localeCompare(c.slug)), [tipos])
  const outros = useMemo(() => tipos.filter((t) => t.sistema || !t.geraMeta).sort((a, c) => a.ordem - c.ordem || a.slug.localeCompare(c.slug)), [tipos])
  const linhaDe = (slug: string): Linha => rasc[slug] ?? paraLinha(regraEfetiva(vigente, slug))
  const set = (slug: string, p: Partial<Linha>) => setRasc((o) => ({ ...o, [slug]: { ...linhaDe(slug), ...p } }))
  const alternar = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const alterados = useMemo(() => elegiveis.filter((t) => {
    const l = rasc[t.slug]; if (!l || erroLinha(l)) return !!l
    return JSON.stringify(norm(deLinha(l))) !== JSON.stringify(norm(regraEfetiva(vigente, t.slug)))
  }), [elegiveis, rasc, vigente])
  const erros = alterados.map((t) => { const e = erroLinha(rasc[t.slug]!); return e ? `${t.nome}: ${e}` : null }).filter(Boolean) as string[]
  const sujo = alterados.length > 0

  const b = q.trim().toLowerCase()
  const linhas = elegiveis.filter((t) => (!b || `${t.slug} ${t.nome}`.toLowerCase().includes(b)) && (!soAlterados || !ehPadrao(regraEfetiva(vigente, t.slug)) || alterados.includes(t)))
  const outrosVis = outros.filter((t) => !b || `${t.slug} ${t.nome}`.toLowerCase().includes(b))

  const novoMapa = (): Mapa => {
    const m: Mapa = { ...vigente }
    for (const t of alterados) { const r = norm(deLinha(rasc[t.slug]!)); if (ehPadrao(r)) delete m[t.slug]; else m[t.slug] = r }
    return m
  }

  const salvar = () => start(async () => {
    if (erros.length) { toast.error(erros[0]); return }
    if (!motivo.trim()) { toast.error('Informe o motivo da alteração.'); return }
    const mapa = novoMapa()
    const regras = { ...registro.regras, tiposGx: mapa }
    let r = await salvarRegrasComTrava(regras, versao, motivo.trim(), false)
    if (!r.ok && r.exigeConfirmacao) {
      const s = r.resumo
      const ok = await confirmar({
        titulo: 'Risco detectado na amostra de planos',
        mensagem: `Na amostra de ${s.planos} plano(s): ${s.totalDivergentes} meta(s) concluída(s) divergente(s) e ${s.novosErros} plano(s) que passam a falhar na geração. Salvar mesmo assim? Planos já gravados não mudam.`,
        confirmar: 'Salvar mesmo assim', destrutivo: true,
      })
      if (!ok) return
      r = await salvarRegrasComTrava(regras, versao, motivo.trim(), true)
    }
    if (!r.ok) { setConflito(!!r.conflito); toast.error(r.error ?? 'Falha ao salvar.'); return }
    setConflito(false); setVersao(r.versao); setVigente(mapa); setRasc({}); setMotivo('')
    toast.success(`Regras salvas (versão ${r.versao}). Valem ao gerar/regenerar planos.`)
    await onSalvo()
  })

  const cab = ['Tipo', 'Ativo', 'Máx/dia', 'Máx/semana', 'Faixas de carga', 'Dias', 'A partir da semana', '']
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">Regras de elegibilidade dos tipos personalizados que geram meta: elas só adiam a meta (não criam metas nem alteram outros tipos). Vale ao gerar/regenerar planos; planos já gerados não mudam. Duração, prioridade e ordem ficam no catálogo.</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tipo" aria-label="Buscar tipo nas regras" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soAlterados} onChange={(e) => setSoAlterados(e.target.checked)} /> Só com regra personalizada</label>
      </div>

      {conflito && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Outra pessoa salvou regras depois que você abriu esta tela. Recarregue para ver a versão atual (seu rascunho será perdido). <button type="button" onClick={() => window.location.reload()} className="ml-1 font-semibold underline">Recarregar</button></div>}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{cab.map((h, i) => <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 && outrosVis.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum tipo encontrado.</td></tr>}
            {linhas.map((t) => {
              const l = linhaDe(t.slug)
              const off = !podeEditar || pend
              const e = rasc[t.slug] ? erroLinha(rasc[t.slug]) : null
              const mudou = alterados.includes(t)
              const padrao = !rasc[t.slug] ? ehPadrao(regraEfetiva(vigente, t.slug)) : !e && ehPadrao(deLinha(l))
              return (
                <tr key={t.slug} className={cn('border-t border-border align-top', mudou && 'bg-primary/5')}>
                  <td className="px-3 py-2"><span className="block font-medium">{t.nome}</span><span className="font-mono text-[11px] text-muted-foreground">{t.slug}</span>{e && <span className="mt-1 block text-[11px] text-destructive">{e}</span>}</td>
                  <td className="px-3 py-2"><Switch checked={l.ativo} disabled={off} onCheckedChange={(c) => set(t.slug, { ativo: !!c })} aria-label={`Regra ativa: ${t.nome}`} /></td>
                  <td className="px-3 py-2"><input inputMode="numeric" value={l.maxDia} disabled={off} placeholder="—" onChange={(ev) => set(t.slug, { maxDia: ev.target.value })} aria-label={`Máx por dia de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2"><input inputMode="numeric" value={l.maxSem} disabled={off} placeholder="—" onChange={(ev) => set(t.slug, { maxSem: ev.target.value })} aria-label={`Máx por semana de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2"><div className="flex max-w-56 flex-wrap gap-1">{Array.from({ length: nFaixas }, (_, k) => k + 1).map((f) => <Chip key={f} on={l.faixas.includes(f)} off={off} label={`Faixa ${f} de ${t.nome}`} onClick={() => set(t.slug, { faixas: alternar(l.faixas, f) })}>{f}</Chip>)}</div><span className="mt-1 block text-[11px] text-muted-foreground">{l.faixas.length ? '' : 'todas'}</span></td>
                  <td className="px-3 py-2"><div className="flex max-w-56 flex-wrap gap-1">{DIAS.map((d, k) => <Chip key={d} on={l.dias.includes(k)} off={off} label={`${d} para ${t.nome}`} onClick={() => set(t.slug, { dias: alternar(l.dias, k) })}>{d}</Chip>)}</div><span className="mt-1 block text-[11px] text-muted-foreground">{l.dias.length ? '' : 'todos'}</span></td>
                  <td className="px-3 py-2"><input inputMode="numeric" value={l.semana} disabled={off} onChange={(ev) => set(t.slug, { semana: ev.target.value })} aria-label={`A partir da semana de ${t.nome}`} className={numCls} /></td>
                  <td className="px-3 py-2 text-right">
                    {podeEditar && !padrao && (
                      <button type="button" disabled={pend} onClick={() => set(t.slug, paraLinha(REGRA_TIPO_GX_PADRAO))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"><RotateCcw className="h-3 w-3" />Restaurar padrão</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {outrosVis.map((t) => (
              <tr key={t.slug} className="border-t border-border text-muted-foreground">
                <td className="px-3 py-2"><span className="block font-medium text-foreground">{t.nome}</span><span className="font-mono text-[11px]">{t.slug}{t.sistema ? ' · sistema' : ' · sem meta própria'}</span></td>
                <td colSpan={7} className="px-3 py-2">— <LinkFaixas className="ml-2" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sujo && (
        <details open className="rounded-2xl border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{alterados.length} tipo(s) com alteração não salva</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {alterados.map((t) => {
              const l = rasc[t.slug]!
              return <li key={t.slug}><b>{t.nome}</b>: {resumoRegraTipo(regraEfetiva(vigente, t.slug)).replace(/^Padrão: .*/, 'padrão')} → {erroLinha(l) ? 'inválido' : resumoRegraTipo(deLinha(l)).replace(/^Padrão: .*/, 'padrão (regra removida)')}</li>
            })}
          </ul>
        </details>
      )}

      {podeEditar ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo da alteração (obrigatório)" aria-label="Motivo" className="h-9 min-w-56 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" disabled={!sujo || pend} onClick={() => setRasc({})} className="h-9 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">Descartar alterações</button>
          <button type="button" disabled={!sujo || pend || erros.length > 0 || !motivo.trim()} onClick={salvar} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar regras
          </button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Somente leitura: você não tem permissão para editar (cronogramas:update).</p>}
    </section>
  )
}

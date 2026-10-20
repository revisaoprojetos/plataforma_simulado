'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Play, Loader2, Filter, Cog, Scale, ChevronRight, ChevronDown, Coins } from 'lucide-react'
import Link from 'next/link'
import { rodarPipelineDemo, statusIA, type ResultadoDemo, type NivelAgregado } from './actions'

const EXEMPLO = [
  'Segundo a CF/88, a vedação à acumulação remunerada de cargos públicos aplica-se também às autarquias, fundações, empresas públicas e sociedades de economia mista. (Gabarito: CERTO)',
  'A Lei 14.133/2021 revogou integralmente a Lei 8.666/93 na data de sua publicação, sem qualquer período de convivência entre os diplomas. (Gabarito: CERTO)',
  'No processo civil, a concessão de tutela de urgência exige apenas a probabilidade do direito, sendo dispensável a demonstração do perigo de dano ou risco ao resultado útil do processo. (Gabarito: ERRADO)',
  'A usucapião extraordinária de bem imóvel, na forma do Código Civil, exige posse mansa e pacífica por 15 anos, independentemente de justo título e boa-fé. (Gabarito: CERTO)',
].join('\n---\n')

const MODELO_LABEL: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5', 'claude-sonnet-4-6': 'Sonnet 4.6', 'claude-opus-4-8': 'Opus 4.8',
}
const mlabel = (m: string) => MODELO_LABEL[m] || m
const ICONE: Record<string, any> = { triagem: Filter, execucao: Cog, consolidacao: Scale }
const VEREDITO_CLS: Record<string, string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ajustar: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  refazer: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

export function AgentesLab() {
  const [texto, setTexto] = useState(EXEMPLO)
  const [rodando, setRodando] = useState(false)
  const [res, setRes] = useState<ResultadoDemo | null>(null)
  const [status, setStatus] = useState<{ configurada: boolean; provider?: string; modelos: Record<string, string> } | null>(null)
  const [traceAberto, setTraceAberto] = useState(false)

  useEffect(() => { statusIA().then(setStatus).catch(() => {}) }, [])

  async function rodar() {
    setRodando(true); setRes(null)
    try {
      const itens = texto.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean)
      setRes(await rodarPipelineDemo(itens))
    } catch (e) { setRes({ ok: false, erro: (e as Error).message }) }
    finally { setRodando(false) }
  }

  const nItens = texto.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean).length
  const modelos = status?.modelos || { triagem: 'claude-haiku-4-5-20251001', execucao: 'claude-sonnet-4-6', consolidacao: 'claude-opus-4-8' }

  // dados dos 3 cards de nível (estáticos + preenchidos após rodar)
  const niveisBase = [
    { nivel: 'triagem', titulo: 'Nível 1 · Triagem', papel: 'Filtra barato: só o que merece segue adiante.' },
    { nivel: 'execucao', titulo: 'Nível 2 · Execução', papel: 'Revisa a fundo, em paralelo, os que passaram.' },
    { nivel: 'consolidacao', titulo: 'Nível 3 · Consolidação', papel: 'Juiz dos casos de dúvida (confiança < 0.7).' },
  ] as const
  const agg = (nivel: string): NivelAgregado | undefined => (res?.ok ? res.niveis.find((n) => n.nivel === nivel) : undefined)

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/teste" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Área de Teste</Link>
        <h1 className="text-2xl font-bold tracking-tight">Pipeline de multi-agents · níveis</h1>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Demonstração do motor <code className="rounded bg-muted px-1">lib/ia/agentes</code>: 3 agentes em níveis (Haiku → Sonnet → Opus),
        escalando o modelo caro só quando necessário. Caso de exemplo: <b>revisão de qualidade de questões</b>. Quando a sua nova etapa chegar, trocam-se os 3 agentes.
      </p>

      {status && !status.configurada && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          IA não configurada — defina <code>ANTHROPIC_API_KEY</code> no servidor (ou cadastre uma chave em Transcrição/IA) para rodar de verdade. O mapa dos níveis abaixo já mostra a arquitetura.
        </div>
      )}

      {/* Mapa dos 3 níveis */}
      <div className="grid gap-3 md:grid-cols-3">
        {niveisBase.map((n, i) => {
          const Icon = ICONE[n.nivel]; const a = agg(n.nivel)
          return (
            <div key={n.nivel} className="relative rounded-2xl border bg-card p-4 shadow-sm">
              {i < 2 && <ChevronRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground md:block" />}
              <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                <div>
                  <div className="text-sm font-semibold">{n.titulo}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{mlabel(modelos[n.nivel])}</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{n.papel}</p>
              {a && (
                <div className="mt-3 space-y-1 border-t pt-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">chamadas</span><b>{a.itens}</b></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">tokens</span><span className="font-mono">{a.entrada.toLocaleString('pt-BR')}↑ {a.saida.toLocaleString('pt-BR')}↓</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">custo</span><span className="font-mono">US$ {a.custoUSD.toFixed(4)}</span></div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Entrada + rodar */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold">Itens (questões) — separe por uma linha com <code className="rounded bg-muted px-1">---</code></label>
          <span className="text-xs text-muted-foreground">{nItens} item(ns)</span>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
          className="w-full resize-y rounded-lg border bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40" />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={rodar} disabled={rodando || !nItens}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Rodar pipeline
          </button>
          <button onClick={() => setTexto(EXEMPLO)} className="text-xs text-muted-foreground hover:text-foreground">restaurar exemplos</button>
        </div>
      </div>

      {res && !res.ok && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{res.erro}</div>
      )}

      {res?.ok && (
        <>
          {/* Resumo de uso */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-muted/40 px-4 py-3 text-sm">
            <span className="inline-flex items-center gap-1.5 font-semibold"><Coins className="h-4 w-4 text-primary" /> Uso total</span>
            <span className="text-muted-foreground">{res.uso.chamadas} chamadas</span>
            <span className="font-mono">{res.uso.entrada.toLocaleString('pt-BR')} tok↑ · {res.uso.saida.toLocaleString('pt-BR')} tok↓</span>
            <span className="ml-auto font-mono font-semibold">~US$ {res.uso.custoUSD.toFixed(4)}</span>
          </div>

          {/* Resultados por item */}
          <div className="space-y-3">
            {res.resultados.map((r: any, i: number) => {
              const ex = typeof r.execucao === 'object' ? r.execucao : null
              const co = typeof r.consolidacao === 'object' ? r.consolidacao : null
              return (
                <div key={i} className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <p className="flex-1 text-sm">{String(r.item)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                    {!r.triado ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">descartado na triagem (sem indício de problema)</span>
                    ) : (
                      <>
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">revisado</span>
                        {ex && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ex.gabarito_ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>gabarito {ex.gabarito_ok ? 'ok' : 'suspeito'}</span>}
                        {ex && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono">confiança {Number(ex.confianca ?? 0).toFixed(2)}</span>}
                        {co && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VEREDITO_CLS[co.veredito] || 'bg-muted'}`}>Juiz: {co.veredito}</span>}
                      </>
                    )}
                  </div>
                  {ex && (
                    <div className="mt-2 space-y-1 pl-8 text-xs text-muted-foreground">
                      {ex.resumo && <p className="text-foreground">{ex.resumo}</p>}
                      {Array.isArray(ex.problemas) && ex.problemas.length > 0 && <ul className="list-disc pl-4">{ex.problemas.map((p: string, k: number) => <li key={k}>{p}</li>)}</ul>}
                      {co?.correcao && <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-amber-700 dark:text-amber-400"><b>Correção (Juiz):</b> {co.correcao}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Trace detalhado */}
          <div className="rounded-2xl border bg-card shadow-sm">
            <button onClick={() => setTraceAberto((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold">
              {traceAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Trace ({res.trace.length} passos)
            </button>
            {traceAberto && (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground"><tr className="[&>th]:px-4 [&>th]:py-2"><th>#</th><th>Agente</th><th>Nível</th><th>Modelo</th><th className="text-right">tok↑</th><th className="text-right">tok↓</th><th className="text-right">US$</th></tr></thead>
                  <tbody>
                    {res.trace.map((p: any, i: number) => (
                      <tr key={i} className="border-t [&>td]:px-4 [&>td]:py-1.5">
                        <td className="text-muted-foreground">{i + 1}</td><td className="font-medium">{p.agente}</td><td>{p.nivel}</td>
                        <td className="font-mono">{mlabel(p.modelo)}</td>
                        <td className="text-right font-mono">{p.usage.entrada.toLocaleString('pt-BR')}</td>
                        <td className="text-right font-mono">{p.usage.saida.toLocaleString('pt-BR')}</td>
                        <td className="text-right font-mono">{p.custoUSD.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

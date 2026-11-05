'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Database, Loader2, Play, CheckCircle2, Info } from 'lucide-react'
import { obterEstadoEspelho, espelharPlanosLote, type EstadoEspelho } from '@/app/admin/cronogramas/adaptativo/actions'

/** Metas do plano EM LINHAS (tabela simulado_cronograma_adaptativo_plano_meta): estado + preenchimento em lote dos planos existentes. */
export function EspelhoMetas() {
  const [e, setE] = useState<EstadoEspelho | null>(null)
  const [rodando, setRodando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const atualizar = useCallback(async () => { setE(await obterEstadoEspelho()) }, [])
  useEffect(() => { atualizar() }, [atualizar])

  async function preencher() {
    setRodando(true); setMsg(null)
    try {
      let total = 0, linhas = 0
      for (let i = 0; i < 400; i++) { // lotes de 20 planos até zerar (teto de segurança)
        const r = await espelharPlanosLote()
        if (!r.ok) { toast.error(r.error || 'Falha ao preencher.'); break }
        total += r.processados ?? 0; linhas += r.linhas ?? 0
        setMsg(`${total} planos espelhados · ${linhas.toLocaleString('pt-BR')} metas gravadas · restam ${r.restantes ?? 0}`)
        if (!r.restantes || !r.processados) break
      }
      toast.success('Preenchimento concluído.')
    } finally { setRodando(false); await atualizar() }
  }

  if (!e) return <div className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  const pendentes = Math.max(0, e.planos - e.espelhados)

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Database className="h-4 w-4" /> Metas do plano em linhas</h3>
        <p className="text-xs text-muted-foreground">
          O motor guarda a grade de cada aluno num JSON. Aqui ela também fica em <span className="font-mono">simulado_cronograma_adaptativo_plano_meta</span>, uma linha por meta
          (tipo, disciplina, aula, título, documento, semana, dia, data, horas, ordem, criado_em), como no cronograma normal.
          A tabela <span className="font-mono">simulado_cronograma_adaptativo_meta</span> é só o <b>progresso do aluno</b>. Planos novos ou recalculados são espelhados sozinhos.
        </p>
      </div>
      {!e.migrado ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"><Info className="mt-0.5 h-4 w-4 shrink-0" /> Aplique a migração <span className="font-mono">20261105050000_cronograma_adaptativo_plano_meta.sql</span> no Supabase para ativar.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Planos</p><p className="text-lg font-bold tabular-nums">{e.planos.toLocaleString('pt-BR')}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Já espelhados</p><p className="text-lg font-bold tabular-nums">{e.espelhados.toLocaleString('pt-BR')}</p></div>
            <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Metas em linhas</p><p className="text-lg font-bold tabular-nums">{e.linhas.toLocaleString('pt-BR')}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={preencher} disabled={rodando || pendentes === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
              {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : pendentes === 0 ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {pendentes === 0 ? 'Todos os planos espelhados' : `Espelhar ${pendentes.toLocaleString('pt-BR')} plano${pendentes === 1 ? '' : 's'} pendente${pendentes === 1 ? '' : 's'}`}
            </button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
        </>
      )}
    </section>
  )
}

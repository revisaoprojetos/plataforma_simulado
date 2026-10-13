'use client'

// Player da "Leitura rápida" (aluno): renderiza o HTML (página enxuta com leitura + questões) num
// IFRAME sandbox isolado e conversa em 2 vias por postMessage (ver lib/leitura/leitura-rapida).
//  • iframe → player: 'resposta' (persiste cada marcação), 'progresso' (HUD), 'concluido', 'pronto'.
//  • player → iframe: 'restaurar' (devolve as marcações salvas quando o aluno sai e volta).
// Cada marcação é PERSISTIDA em /api/leitura/rapida (o iframe sandbox não guarda nada). O SERVIDOR
// decide a conclusão quando todas as questões foram feitas e credita o desafio (XP + sequência +
// ranking + medalhas) — mesmo motor do game. Idempotente: conclui uma vez por documento.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Loader2, CheckCircle2, Zap } from 'lucide-react'
import { parseEventoLeituraRapida, montarRestauracaoLeituraRapida, type RespostaRapida } from '@/lib/leitura/leitura-rapida'

export function LeituraRapidaPlayer({ documentoId, versao, html, titulo, voltarHref, desafio }: {
  documentoId: string; versao: number; html: string; titulo?: string; voltarHref?: string
  /** Id do Desafio de Jurisprudência (quando a leitura rápida é a leitura do dia do juris): ao concluir,
   *  grava o dia no ledger da sequência do juris (origem='jurisprudencia'). Vazio no Lei Seca. */
  desafio?: string
}) {
  // Repara placeholders MAL-FORMADOS do HTML colado: o gerador às vezes emite "{{a.l})" (só um "}") →
  // o framework de template não substitui a LETRA da alternativa e ela aparece literal ("{{a.l})") para
  // TODAS as alternativas (a letra fica dentro de um <sc-for>). Fecha qualquer "{{token}" com um único
  // "}" para "{{token}}", SEM tocar nos corretos "{{token}}" (lookahead evita dupla substituição).
  const htmlSafe = useMemo(() => (html || '').replace(/\{\{([a-zA-Z0-9_.]+)\}(?!\})/g, '{{$1}}'), [html])
  const [prog, setProg] = useState<{ respondidas: number; total: number; acertos: number } | null>(null)
  const [concluido, setConcluido] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const respostasRef = useRef<Record<string, RespostaRapida>>({}) // mapa acumulado de marcações
  const totalRef = useRef(0)
  const salvandoRef = useRef(false)
  const pendenteRef = useRef(false)
  const concluidoRef = useRef(false)

  // Devolve as marcações salvas ao iframe (retomar de onde parou).
  const restaurar = useCallback(() => {
    const win = iframeRef.current?.contentWindow
    if (win) win.postMessage(montarRestauracaoLeituraRapida(respostasRef.current), '*')
  }, [])

  // Persiste o estado atual no servidor (o servidor conclui quando todas forem respondidas).
  const persistir = useCallback(() => {
    if (salvandoRef.current) { pendenteRef.current = true; return }
    salvandoRef.current = true
    setSalvando(true)
    fetch('/api/leitura/rapida', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento_id: documentoId, versao, respostas: respostasRef.current, total: totalRef.current, desafio }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((r) => {
        if (r?.concluiuAgora && !concluidoRef.current) { concluidoRef.current = true; setConcluido(true); toast.success('Leitura rápida concluída! Progresso salvo.') }
        else if (r?.concluido && !concluidoRef.current) { concluidoRef.current = true; setConcluido(true) }
      })
      .catch(() => { /* best-effort; tenta de novo na próxima marcação */ })
      .finally(() => {
        salvandoRef.current = false; setSalvando(false)
        if (pendenteRef.current) { pendenteRef.current = false; persistir() } // coalescência: salva o último estado
      })
  }, [documentoId, versao, desafio])

  // CONCLUIR (nível plataforma): o HTML do JurisClub é um slide isolado que NÃO reporta as respostas,
  // então o aluno conclui aqui. Grava o GATE (libera o desafio do dia) e volta ao desafio.
  const [concluindo, setConcluindo] = useState(false)
  const concluir = useCallback(() => {
    if (concluindo || concluidoRef.current) return
    setConcluindo(true)
    fetch('/api/leitura/rapida', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento_id: documentoId, versao, respostas: respostasRef.current, total: totalRef.current, concluir: true, desafio }),
    })
      .then((r) => r.json().catch(() => ({})))
      .then((r) => {
        if (r?.ok && (r.concluiuAgora || r.concluido)) {
          concluidoRef.current = true; setConcluido(true)
          toast.success('Leitura concluída! Liberando o desafio…')
          setTimeout(() => { if (voltarHref) window.location.href = voltarHref }, 700)
        } else {
          toast.error(r?.message ?? 'Não foi possível concluir. Tente de novo.')
        }
      })
      .catch(() => toast.error('Não foi possível concluir. Tente de novo.'))
      .finally(() => setConcluindo(false))
  }, [documentoId, versao, voltarHref, concluindo, desafio])

  // 1) Carrega o estado salvo ao montar (p/ restaurar as marcações no iframe quando ele avisar 'pronto').
  useEffect(() => {
    let vivo = true
    fetch(`/api/leitura/rapida?documento_id=${encodeURIComponent(documentoId)}`)
      .then((r) => r.json().catch(() => ({})))
      .then((r) => {
        if (!vivo || !r?.ok) return
        respostasRef.current = (r.respostas ?? {}) as Record<string, RespostaRapida>
        totalRef.current = Number(r.total) || 0
        const respondidas = Number(r.respondidas) || 0
        if (totalRef.current > 0) setProg({ respondidas, total: totalRef.current, acertos: Number(r.acertos) || 0 })
        if (r.concluido) { concluidoRef.current = true; setConcluido(true) }
        restaurar() // caso o iframe já tenha carregado antes do fetch
      })
    return () => { vivo = false }
  }, [documentoId, restaurar])

  // 2) Escuta os eventos do iframe.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      const ev = parseEventoLeituraRapida(e.data)
      if (!ev) return
      if (ev.tipo === 'pronto') { restaurar(); return }
      if (ev.tipo === 'progresso') {
        if (ev.total > 0) totalRef.current = ev.total
        setProg({ respondidas: ev.respondidas, total: ev.total || totalRef.current, acertos: ev.acertos })
        return
      }
      if (ev.tipo === 'resposta') {
        const q = String(ev.questao)
        if (!q) return
        respostasRef.current = { ...respostasRef.current, [q]: { alternativa: ev.alternativa, correta: ev.correta } }
        const respondidas = Object.keys(respostasRef.current).length
        setProg((p) => ({ respondidas, total: Math.max(p?.total ?? 0, totalRef.current, respondidas), acertos: Object.values(respostasRef.current).filter((r) => r.correta).length }))
        persistir()
        return
      }
      if (ev.tipo === 'concluido') {
        if (ev.total > 0) totalRef.current = ev.total
        persistir() // o servidor confirma a conclusão quando respondidas >= total
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [persistir, restaurar])

  const pct = prog && prog.total > 0 ? Math.min(100, Math.round((prog.respondidas / prog.total) * 100)) : 0

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-muted dark:bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5">
        {voltarHref && (
          <Link href={voltarHref} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Link>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"><Zap className="h-4 w-4 text-primary" /> {titulo || 'Leitura rápida'}</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {salvando && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> salvando…</span>}
          {!concluido && prog && prog.total > 0 && (
            <span className="hidden items-center gap-2 text-muted-foreground sm:inline-flex">
              <span className="font-medium text-foreground">{prog.respondidas}/{prog.total}</span> respondidas
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></span>
            </span>
          )}
          {concluido ? (
            voltarHref ? (
              <Link href={voltarHref} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"><CheckCircle2 className="h-3.5 w-3.5" /> Voltar ao desafio</Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Concluído{prog && prog.total > 0 ? ` · ${prog.acertos}/${prog.total}` : ''}</span>
            )
          ) : (
            <button type="button" onClick={concluir} disabled={concluindo}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
              {concluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Concluir leitura
            </button>
          )}
        </div>
      </header>
      {/* IFRAME sandbox allow-scripts (sem same-origin): roda o JS da página isolado; comunica só por postMessage. */}
      <iframe ref={iframeRef} title={titulo || 'Leitura rápida'} sandbox="allow-scripts" srcDoc={htmlSafe} className="min-h-0 w-full flex-1 border-0 bg-white" />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/components/markdown-content'
import type { QuestaoLeituraDados } from '@/lib/leitura/acesso'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

type Resultado = { correta: boolean; corretaId: string | null }

/**
 * Questão inserida no meio da leitura. Validação no servidor (não expõe o gabarito).
 * Funciona em 2 modos: CONTROLADA (escolha/resultado no pai — quiz, persiste ao navegar) quando `onEscolher`
 * é passado; ou INTERNA (leitor inline) com estado próprio.
 */
export function QuestaoLeitura({ documentoId, q, corFg, corMuted, escolhida: escolhidaProp, resultado: resultadoProp, onEscolher, onRespondida }: {
  documentoId: string
  q: QuestaoLeituraDados
  corFg: string
  corMuted: string
  escolhida?: string | null
  resultado?: Resultado | null
  onEscolher?: (docQuestaoId: string, altId: string) => void
  onRespondida: (docQuestaoId: string, r: Resultado) => void
}) {
  const controlado = onEscolher !== undefined
  const [escInterna, setEscInterna] = useState<string | null>(q.resposta?.alternativaId ?? null)
  const [resInterno, setResInterno] = useState<Resultado | null>(q.resposta ? { correta: q.resposta.correta, corretaId: q.resposta.corretaId } : null)
  const [enviando, setEnviando] = useState(false)
  const escolhida = controlado ? (escolhidaProp ?? null) : escInterna
  const res = controlado ? (resultadoProp ?? null) : resInterno
  const respondido = !!res

  const escolher = (altId: string) => { if (controlado) onEscolher!(q.docQuestaoId, altId); else setEscInterna(altId) }

  async function responder() {
    if (!escolhida || respondido) return
    setEnviando(true)
    try {
      const r = await fetch('/api/leitura/resposta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documento_id: documentoId, questao_id: q.questaoId, alternativa_id: escolhida }) })
      const j = await r.json()
      if (j?.ok) { const rr = { correta: j.correta, corretaId: j.correta_id }; if (!controlado) setResInterno(rr); onRespondida(q.docQuestaoId, rr) }
      else toast.error(j?.message ?? 'Erro ao responder.')
    } catch { toast.error('Erro ao responder.') } finally { setEnviando(false) }
  }

  return (
    <div className="my-6 break-inside-avoid rounded-2xl border-2 border-primary/40 bg-primary/[0.03] p-4 shadow-sm" style={{ fontSize: 15, lineHeight: 1.5 }}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
        <HelpCircle className="h-4 w-4" /> Pergunta sobre a leitura
        {q.obrigatoria && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] normal-case tracking-normal">obrigatória</span>}
      </div>
      <MarkdownContent className="mb-3 text-sm leading-relaxed" >{q.enunciado}</MarkdownContent>

      <div className="space-y-2">
        {q.alternativas.map((alt, i) => {
          const escolha = escolhida === alt.id
          const certa = respondido && res!.corretaId === alt.id
          const erradaEscolhida = respondido && escolha && !res!.correta
          return (
            <button key={alt.id} disabled={respondido} onClick={() => escolher(alt.id)}
              className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-all',
                !respondido && escolha && 'border-primary bg-primary/[0.06] ring-1 ring-primary/30',
                !respondido && !escolha && 'hover:border-primary/40 hover:bg-black/[0.03]',
                certa && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
                erradaEscolhida && 'border-rose-500 bg-rose-50 dark:bg-rose-950/30',
              )}
              style={{ color: corFg, borderColor: certa || erradaEscolhida ? undefined : '#0000001f' }}>
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                certa && 'border-emerald-500 bg-emerald-500 text-white',
                erradaEscolhida && 'border-rose-500 bg-rose-500 text-white',
                !certa && !erradaEscolhida && escolha && 'border-primary bg-primary text-primary-foreground',
              )} style={{ borderColor: !certa && !erradaEscolhida && !escolha ? '#00000030' : undefined }}>{LETRA[i] ?? i + 1}</span>
              <MarkdownContent inline className="flex-1 pt-0.5">{alt.texto}</MarkdownContent>
              {certa && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300 dark:text-emerald-400" />}
              {erradaEscolhida && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300 dark:text-rose-400" />}
            </button>
          )
        })}
      </div>

      {!respondido ? (
        <div className="mt-3 flex justify-end">
          <button onClick={responder} disabled={!escolhida || enviando} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Responder
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300">
          <div className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-sm font-semibold',
            res!.correta ? 'border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border-rose-500/40 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400')}>
            {res!.correta ? <CheckCircle2 className="h-4 w-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300" /> : <XCircle className="h-4 w-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300" />}
            {res!.correta ? 'Você acertou!' : 'Resposta incorreta.'}
          </div>
          {q.comentario && (
            <div className="rounded-lg border p-2.5 text-sm" style={{ borderColor: '#0000001f' }}>
              <p className="mb-1 text-xs font-semibold" style={{ color: corMuted }}>Comentário</p>
              <MarkdownContent className="text-sm">{q.comentario}</MarkdownContent>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

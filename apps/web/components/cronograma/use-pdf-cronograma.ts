'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/** De quanto em quanto tempo perguntamos ao servidor se o PDF ficou pronto. */
const INTERVALO_MS = 1500
/** Teto de espera. Um cronograma de 90 semanas é um PDF grande, mas não é eterno. */
const LIMITE_MS = 90_000

/**
 * "Salvar em PDF" do cronograma Revisão — pede o PDF pela esteira que a plataforma já tem
 * (web enfileira → worker chama o Gotenberg → arquivo no bucket `pdfs`) e acompanha o job.
 *
 * Quando a esteira não está no ar — sem Redis, sem worker, sem `PDF_RENDER_SECRET`, que é o
 * caso do ambiente de desenvolvimento — a rota responde `semFila` e cai na impressão do
 * navegador, abrindo a MESMA página de impressão com `?print=1`. Sem essa queda, "Salvar em PDF"
 * funcionaria ou não conforme a infraestrutura do dia.
 *
 * Hook (e não botão) porque o gatilho vive dentro do iframe do cronograma: o iframe avisa o portal
 * (postMessage) e o portal executa isto.
 */
export function usePdfCronograma(emissaoId: string) {
  const [gerando, setGerando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelado = useRef(false)
  const ocupado = useRef(false)

  useEffect(
    () => () => {
      cancelado.current = true
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const pedir = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    setGerando(true)
    cancelado.current = false
    const parar = () => {
      ocupado.current = false
      setGerando(false)
    }
    const imprimirNoNavegador = (motivo?: string) => {
      parar()
      if (motivo) toast.info(motivo)
      window.open(`/imprimir/cronograma/${emissaoId}?print=1`, '_blank', 'noopener')
    }

    let jobId: string
    try {
      const res = await fetch('/api/aluno/cronograma-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emissaoId }),
        signal: AbortSignal.timeout(15_000),
      })
      const corpo = (await res.json().catch(() => ({}))) as { jobId?: string; message?: string; semFila?: boolean }
      if (corpo.semFila) {
        imprimirNoNavegador('Geração em segundo plano indisponível — abrindo a impressão do navegador.')
        return
      }
      if (!res.ok || !corpo.jobId) {
        parar()
        toast.error(corpo.message ?? 'Não foi possível gerar o PDF.')
        return
      }
      jobId = corpo.jobId
    } catch {
      imprimirNoNavegador('Não conseguimos falar com o servidor — abrindo a impressão do navegador.')
      return
    }

    const inicio = Date.now()
    const perguntar = async () => {
      if (cancelado.current) return
      if (Date.now() - inicio > LIMITE_MS) {
        imprimirNoNavegador('O PDF está demorando — abrindo a impressão do navegador enquanto isso.')
        return
      }
      try {
        const res = await fetch(`/api/aluno/cronograma-pdf/${jobId}`, { cache: 'no-store' })
        const j = (await res.json()) as { status?: string; url?: string | null; erro?: string | null }
        if (j.status === 'concluido' && j.url) {
          parar()
          toast.success('PDF pronto — o download vai começar.')
          window.open(j.url, '_blank', 'noopener')
          return
        }
        if (j.status === 'erro') {
          imprimirNoNavegador(`Falhou ao gerar o PDF${j.erro ? `: ${j.erro}` : ''}. Abrindo a impressão do navegador.`)
          return
        }
      } catch {
        /* uma consulta que falha não derruba a espera — a próxima tenta de novo */
      }
      timer.current = setTimeout(perguntar, INTERVALO_MS)
    }
    timer.current = setTimeout(perguntar, INTERVALO_MS)
  }, [emissaoId])

  return { gerando, pedir }
}

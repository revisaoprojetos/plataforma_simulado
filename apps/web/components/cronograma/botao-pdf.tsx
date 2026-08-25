'use client'

import { useEffect, useRef, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** De quanto em quanto tempo perguntamos ao servidor se o PDF ficou pronto. */
const INTERVALO_MS = 1500
/** Teto de espera. Um cronograma de 90 semanas é um PDF grande, mas não é eterno. */
const LIMITE_MS = 90_000

/**
 * "Salvar em PDF" — pede o PDF ao Gotenberg pela esteira que a plataforma já tem
 * (web enfileira → worker chama o Gotenberg → arquivo no bucket `pdfs`) e acompanha o job.
 *
 * Quando a esteira não está no ar — sem Redis, sem worker, sem `PDF_RENDER_SECRET`, que é o
 * caso do ambiente de desenvolvimento — a rota responde `semFila` e o botão cai na impressão
 * do navegador, abrindo a MESMA página de impressão com `?print=1`.
 *
 * Essa queda não é enfeite: sem ela, "Salvar em PDF" seria um botão que funciona ou não
 * conforme a infraestrutura do dia, e o aluno ficaria sem o cronograma sem entender por quê.
 */
export function BotaoPdfCronograma({
  emissaoId,
  variante = 'outline',
}: {
  emissaoId: string
  variante?: 'outline' | 'default' | 'secondary'
}) {
  const [estado, setEstado] = useState<'parado' | 'gerando'>('parado')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelado = useRef(false)

  useEffect(
    () => () => {
      cancelado.current = true
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function imprimirNoNavegador(motivo?: string) {
    setEstado('parado')
    if (motivo) toast.info(motivo)
    window.open(`/imprimir/cronograma/${emissaoId}?print=1`, '_blank', 'noopener')
  }

  async function pedir() {
    if (estado === 'gerando') return
    setEstado('gerando')
    cancelado.current = false

    let jobId: string
    try {
      // Segunda trava, do lado do cliente: a rota já limita a espera da fila, mas se o próprio
      // servidor estiver ruim o botão não pode ficar girando sem fim.
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
        setEstado('parado')
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
          setEstado('parado')
          toast.success('PDF pronto — o download vai começar.')
          // Aba nova em vez de navegar: o aluno não perde a tela em que estava.
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
  }

  return (
    <Button size="sm" variant={variante} onClick={pedir} disabled={estado === 'gerando'}>
      {estado === 'gerando' ? (
        <>
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          Gerando PDF…
        </>
      ) : (
        <>
          <FileDown className="mr-1 h-4 w-4" />
          Salvar em PDF
        </>
      )}
    </Button>
  )
}

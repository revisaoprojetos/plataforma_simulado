'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, FileDown } from 'lucide-react'
import { toast } from 'sonner'

type Payload =
  | { tipo: 'caderno'; cadernoId: string; mod?: string; todos?: boolean; aluno?: string; sessao?: string; gabarito?: boolean; titulo?: string }
  | { tipo: 'resultado'; sessaoToken: string; titulo?: string }

/**
 * Botão que gera o PDF NO SERVIDOR (worker + Gotenberg), sem travar o navegador.
 * Enfileira → faz polling do job → abre o link quando pronto.
 */
export function GerarPdfServidor({
  payload,
  label = 'Gerar PDF (servidor)',
  variant = 'outline',
  size = 'sm',
  icon,
}: {
  payload: Payload
  label?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  icon?: React.ReactNode
}) {
  const [estado, setEstado] = useState<'idle' | 'processando'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function poll(jobId: string, tentativas = 0) {
    // ~2min de teto (60 * 2s)
    if (tentativas > 60) {
      setEstado('idle')
      toast.error('A geração demorou demais. Tente novamente em instantes.')
      return
    }
    try {
      const res = await fetch(`/api/pdf/jobs/${jobId}`)
      const job = await res.json()
      if (job.status === 'concluido' && job.url) {
        setEstado('idle')
        toast.success('PDF pronto! Abrindo…')
        window.open(job.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (job.status === 'erro') {
        setEstado('idle')
        toast.error(`Falha ao gerar o PDF: ${job.erro ?? 'erro desconhecido'}`)
        return
      }
    } catch {
      /* rede instável — tenta de novo */
    }
    timer.current = setTimeout(() => poll(jobId, tentativas + 1), 2000)
  }

  async function gerar() {
    setEstado('processando')
    try {
      const res = await fetch('/api/pdf/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.jobId) {
        setEstado('idle')
        toast.error(data.message ?? 'Não foi possível iniciar a geração.')
        return
      }
      toast.info('Gerando o PDF no servidor… você pode continuar trabalhando.')
      poll(data.jobId)
    } catch (e) {
      setEstado('idle')
      toast.error('Erro de rede ao iniciar a geração.')
    }
  }

  return (
    <Button onClick={gerar} disabled={estado === 'processando'} variant={variant} size={size}>
      {estado === 'processando'
        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        : (icon ?? <FileDown className="mr-1.5 h-4 w-4" />)}
      {estado === 'processando' ? 'Gerando…' : label}
    </Button>
  )
}

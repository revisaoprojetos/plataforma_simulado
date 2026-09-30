'use client'

import { useEffect, useState } from 'react'
import { Zap, ZapOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Liga/desliga as animações de gamificação (level-up/partículas) por aluno. Preferência em
 * localStorage (`gamAnimacoesOff`), lida pela celebração de XP. Desligado = só a barra enche.
 */
export function AnimacoesToggle({ className }: { className?: string }) {
  const [off, setOff] = useState(false)
  useEffect(() => { try { setOff(localStorage.getItem('gamAnimacoesOff') === '1') } catch { /* ignore */ } }, [])
  const toggle = () => {
    const novo = !off
    setOff(novo)
    try { novo ? localStorage.setItem('gamAnimacoesOff', '1') : localStorage.removeItem('gamAnimacoesOff') } catch { /* ignore */ }
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={off}
      title={off ? 'Animações desativadas — clique para ativar' : 'Animações ativadas — clique para desativar'}
      aria-label={off ? 'Ativar animações' : 'Desativar animações'}
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground', className)}>
      {off ? <ZapOff className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
    </button>
  )
}

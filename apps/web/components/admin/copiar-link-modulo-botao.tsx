'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copiarTexto } from '@/lib/clipboard'

/** Botão que copia o link direto da TRILHA do módulo (aluno): /aluno/leitura?modulo=<id>.
 * `claro` = versão sobre o banner escuro (branco translúcido). */
export function CopiarLinkModuloBotao({ pastaId, claro = false }: { pastaId: string; claro?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    if (await copiarTexto(`${base}/aluno/leitura?modulo=${pastaId}`)) { setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
    else toast.error('Não foi possível copiar o link.')
  }
  return (
    <button type="button" onClick={copiar} title="Copiar link direto da trilha (para os alunos)"
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        claro ? 'border-white/25 bg-white/15 text-white backdrop-blur hover:bg-white/25' : 'text-foreground hover:bg-muted')}>
      {copiado ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} {copiado ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}

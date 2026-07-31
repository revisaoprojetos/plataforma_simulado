'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Lock, ArrowRight } from 'lucide-react'

/** Pop-up mostrado quando o aluno chega (via banner) a uma pasta/simulado que ele NÃO tem acesso.
 *  Explica o bloqueio e leva de volta ao início do portal. */
export function SemAcessoModal({ titulo = 'Acesso não liberado', mensagem, contato }: { titulo?: string; mensagem?: string; contato?: string }) {
  const [montado, setMontado] = useState(false)
  useEffect(() => { setMontado(true) }, [])
  if (!montado || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card p-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {mensagem ?? 'Você ainda não tem acesso a esses simulados. Eles fazem parte de outro plano da plataforma.'}
        </p>
        {contato && <p className="mt-2 text-xs text-muted-foreground">Para liberar, fale com <span className="font-medium text-foreground">{contato}</span>.</p>}
        <Link href="/aluno" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
          Ir para o início <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>,
    document.body,
  )
}

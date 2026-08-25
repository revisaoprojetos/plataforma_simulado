'use client'

import { useState, type ReactNode } from 'react'
import { FlaskConical, ChevronDown } from 'lucide-react'
import { NovoCadernoTesteBtn } from '@/components/admin/caderno-teste-novo-btn'

/** Esconde a área "Cadernos do construtor" (intacta) atrás de um único botão, recolhida por padrão.
 *  Assim os cadernos já criados aqui (e usados por outros simulados) NÃO são tocados — só ficam
 *  fora do caminho. A criação/edição do dia a dia acontece nos cards da Entrega. */
export function ConstrutorColapsavel({ bancoId, cor, count, children }: {
  bancoId: string; cor: string; count: number; children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
        style={aberto ? { background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` } : undefined}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><FlaskConical className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">Cadernos do construtor <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">avançado</span></h3>
          <p className="text-xs text-muted-foreground">{count} caderno(s) — abra só para gerenciar/editar direto (a criação do dia a dia é nos cards acima)</p>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="border-t p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Editar/apagar os cadernos existentes. Nada aqui é removido automaticamente.</p>
            <NovoCadernoTesteBtn bancoId={bancoId} />
          </div>
          {children}
        </div>
      )}
    </div>
  )
}

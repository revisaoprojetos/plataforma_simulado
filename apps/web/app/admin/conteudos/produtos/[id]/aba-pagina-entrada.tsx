'use client'

// Entrada da aba "Página do extensivo": cartão para o EDITOR VISUAL; o formulário antigo fica atrás de um toggle ("Modo simples").
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, LayoutTemplate, TriangleAlert } from 'lucide-react'

export function AbaPaginaEntrada({ produtoId, podeEditar, children }: { produtoId: string; podeEditar: boolean; children: ReactNode }) {
  const [simples, setSimples] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><LayoutTemplate className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Editor visual da página</h3>
          <p className="text-sm text-muted-foreground">Veja a página do aluno enquanto edita: adicione, arraste e personalize elementos, com rascunho e publicação.</p>
        </div>
        {podeEditar ? (
          <Link href={`/admin/conteudos/produtos/${produtoId}/pagina`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Abrir editor visual<ChevronRight className="h-4 w-4" />
          </Link>
        ) : <span className="text-xs text-muted-foreground">Sem permissão para editar.</span>}
      </div>
      <div className="rounded-2xl border bg-card shadow-sm">
        <button type="button" onClick={() => setSimples((v) => !v)} aria-expanded={simples} className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-medium">
          {simples ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}Modo simples (formulário)
        </button>
        {simples && (
          <div className="space-y-4 border-t p-5">
            <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />O modo simples grava no formato antigo (seções). Se a página já foi publicada pelo editor visual, estas alterações podem não aparecer para o aluno.
            </p>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

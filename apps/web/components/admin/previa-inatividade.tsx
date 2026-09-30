'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ListChecks, Loader2, X, AlertTriangle } from 'lucide-react'
import { previaInatividadeLeitura } from '@/app/admin/conexoes/webhooks/actions'

type Item = { estudanteId: string; nome: string | null; email: string | null; telefone: string | null; modulo: string | null; dias: number; ultimoDia: string; mensagem: string; webhook: string | null }

/**
 * Botão "Prévia de inatividade (dry-run)": lista quem RECEBERIA a cobrança de inatividade AGORA,
 * com a mensagem já com o nome real — para conferir antes de qualquer disparo. Não envia nada.
 */
export function PreviaInatividadeButton() {
  const [carregando, setCarregando] = useState(false)
  const [itens, setItens] = useState<Item[] | null>(null)

  async function gerar() {
    setCarregando(true)
    try {
      const r = await previaInatividadeLeitura()
      if (!r.ok) { toast.error(r.error ?? 'Falha ao gerar a prévia.'); return }
      setItens(r.itens ?? [])
    } finally {
      setCarregando(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={gerar} disabled={carregando} className="gap-1.5">
        {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />} Prévia de inatividade
      </Button>
      {itens != null && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setItens(null)} />
          <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" /> Prévia de inatividade — {itens.length} aluno(s) receberiam agora</h3>
              <button onClick={() => setItens(null)} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-start gap-2 border-b bg-amber-500/5 px-5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Nada foi enviado. Confira os nomes contra o cadastro antes do disparo real (cron). "Recebeu inativo" = sem <b>aula-completa</b> (leitura + quiz) no dia-alvo.
            </div>
            <div className="overflow-auto">
              {itens.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">Ninguém bateria a regra de inatividade agora.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Aluno</th>
                      <th className="px-4 py-2 font-medium">Contato</th>
                      <th className="px-4 py-2 font-medium">Módulo</th>
                      <th className="px-4 py-2 text-center font-medium">Dias</th>
                      <th className="px-4 py-2 font-medium">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {itens.map((it) => (
                      <tr key={`${it.estudanteId}-${it.modulo}`} className="align-top">
                        <td className="px-4 py-2.5"><span className="block font-medium">{it.nome ?? '—'}</span><span className="block text-[11px] text-muted-foreground">último dia: {it.ultimoDia}</span></td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{it.telefone ?? it.email ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{it.modulo ?? '—'}</td>
                        <td className="px-4 py-2.5 text-center tabular-nums">{it.dias}</td>
                        <td className="max-w-[320px] px-4 py-2.5 text-xs text-muted-foreground">{it.mensagem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

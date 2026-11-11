'use client'

// Histórico de versões publicadas/arquivadas (paginado no servidor). Restaurar = carrega como RASCUNHO.
import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar } from '@/components/ui/confirm-dialog'
import { PaginacaoBib } from '@/app/admin/revisao/biblioteca/paginacao-bib'
import { listarVersoes, restaurarVersaoComoRascunho } from '@/lib/produtos/pagina/actions-versoes'
import type { VersaoResumo } from '@/lib/produtos/pagina/versoes'
import type { PaginaV1 } from '@/lib/produtos/pagina/tipos'
import { cn } from '@/lib/utils'
import { fmtData } from './util'

export function DialogoHistorico({ open, onOpenChange, produtoId, sujo, onRestaurar }: {
  open: boolean; onOpenChange: (v: boolean) => void; produtoId: string; sujo: boolean; onRestaurar: (p: PaginaV1) => void
}) {
  const [page, setPage] = useState(1); const [pp, setPP] = useState(10)
  const [itens, setItens] = useState<VersaoResumo[]>([]); const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(false); const [erro, setErro] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState<string | null>(null)

  const carregar = useCallback(async (p: number, n: number) => {
    setCarregando(true); setErro(null)
    const r = await listarVersoes(produtoId, p, n)
    if ('error' in r) setErro(r.error ?? null)
    else { setItens(r.itens); setTotal(r.total) }
    setCarregando(false)
  }, [produtoId])

  useEffect(() => { if (open) setPage(1) }, [open])
  useEffect(() => { if (open) carregar(page, pp) }, [open, page, pp, carregar])

  async function restaurar(v: VersaoResumo) {
    const aviso = sujo ? ' As alterações não salvas do editor também serão perdidas.' : ''
    if (!(await confirmar({ titulo: 'Restaurar versão', mensagem: `Carregar esta versão como rascunho? O rascunho atual será substituído.${aviso} A página dos alunos só muda quando você publicar.`, confirmar: 'Restaurar como rascunho' }))) return
    setRestaurando(v.id)
    const r = await restaurarVersaoComoRascunho(produtoId, v.id)
    setRestaurando(null)
    if ('error' in r) { toast.error(r.error); return }
    { onRestaurar(r.pagina); toast.success('Versão carregada como rascunho.'); onOpenChange(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de versões</DialogTitle>
          <DialogDescription>Versões já publicadas desta página. Restaurar carrega a versão como rascunho.</DialogDescription>
        </DialogHeader>
        {erro && <AlertBox variante="aviso">{erro}</AlertBox>}
        <div className="min-h-40">
          {carregando && itens.length === 0 && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
          {!carregando && !erro && itens.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground"><History className="h-6 w-6" />Nenhuma versão publicada ainda.</div>
          )}
          {itens.length > 0 && (
            <ul className={cn('divide-y rounded-lg border', carregando && 'opacity-60')}>
              {itens.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium', v.estado === 'publicado' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                    {v.estado === 'publicado' ? 'No ar' : 'Arquivada'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{v.rotulo || 'Sem rótulo'}</span>
                    <span className="block truncate text-xs text-muted-foreground">{fmtData(v.publicado_em ?? v.criado_em)} · {v.autor || 'autor desconhecido'} · {v.blocos} bloco{v.blocos === 1 ? '' : 's'}</span>
                  </span>
                  <Button variant="outline" size="sm" disabled={!!restaurando} onClick={() => restaurar(v)}>
                    {restaurando === v.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {total > 0 && <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={[5, 10, 20]} selecionados={0} carregando={carregando} onPage={setPage} onPP={(n) => { setPP(n); setPage(1) }} />}
      </DialogContent>
    </Dialog>
  )
}

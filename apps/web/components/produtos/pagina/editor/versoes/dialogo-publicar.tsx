'use client'

// Diálogo de PUBLICAÇÃO: resumo do que mudou (rascunho × publicado) por bloco, alerta de blocos vazios e rótulo da versão.
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Rocket, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertBox } from '@/components/ui/alert-box'
import { cn } from '@/lib/utils'
import { compararParaPublicar, publicarPagina } from '@/lib/produtos/pagina/actions-versoes'
import { blocosVazios, diffPaginas, type StatusDiff } from '@/lib/produtos/pagina/diff'
import type { PaginaV1 } from '@/lib/produtos/pagina/tipos'

const ROTULO: Record<StatusDiff, string> = { adicionado: 'Adicionado', removido: 'Removido', alterado: 'Alterado', reordenado: 'Reordenado', igual: 'Sem mudança' }
const PLURAL: Record<string, string> = { adicionado: 'adicionados', removido: 'removidos', alterado: 'alterados', reordenado: 'reordenados' }
const COR: Record<StatusDiff, string> = {
  adicionado: 'bg-primary/10 text-primary', removido: 'bg-destructive/10 text-destructive',
  alterado: 'bg-chart-2/15 text-foreground', reordenado: 'bg-muted text-muted-foreground', igual: 'bg-muted text-muted-foreground',
}

/** Parte apresentacional do resumo (também usada na página de teste). */
export function ResumoMudancas({ diff, vazios, origem }: { diff: ReturnType<typeof diffPaginas>; vazios: ReturnType<typeof blocosVazios>; origem?: string }) {
  const mudancas = diff.itens.filter((i) => i.status !== 'igual' || i.reordenado)
  return (
    <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(['adicionado', 'removido', 'alterado', 'reordenado'] as const).map((k) => (
                <span key={k} className={cn('rounded-full px-2.5 py-1 font-medium', COR[k])}>{diff.contagem[k]} {diff.contagem[k] === 1 ? ROTULO[k].toLowerCase() : PLURAL[k]}</span>
              ))}
              {diff.temaAlterado && <span className={cn('rounded-full px-2.5 py-1 font-medium', COR.alterado)}>tema da página alterado</span>}
            </div>
            {origem === 'legado' && <p className="text-xs text-muted-foreground">Primeira publicação pelo editor visual: a comparação usa a página atual derivada das seções antigas.</p>}

            {diff.igual
              ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">O rascunho é idêntico à versão publicada. Você pode publicar mesmo assim para registrar uma nova versão.</p>
              : (
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {mudancas.map((i) => (
                    <li key={i.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                      <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium', COR[i.status])}>{ROTULO[i.status]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{i.rotulo}</span>
                        {i.campos.length > 0 && <span className="block text-xs text-muted-foreground">{i.campos.join(', ')}</span>}
                      </span>
                      {i.reordenado && i.status !== 'reordenado' && <ArrowUpDown className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Também mudou de posição" />}
                    </li>
                  ))}
                </ul>
              )}

            {vazios.length > 0 && (
              <AlertBox variante="aviso" titulo={`${vazios.length} bloco${vazios.length === 1 ? '' : 's'} ativo${vazios.length === 1 ? '' : 's'} sem conteúdo`}>
                {vazios.map((v) => <span key={v.id} className="block">{v.rotulo} — {v.motivo}</span>)}
              </AlertBox>
            )}
    </div>
  )
}

export function DialogoPublicar({ open, onOpenChange, produtoId, sujo, salvar, onPublicado }: {
  open: boolean; onOpenChange: (v: boolean) => void; produtoId: string; sujo: boolean
  salvar: () => Promise<boolean>; onPublicado: () => void
}) {
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dados, setDados] = useState<{ temRascunho: boolean; rascunho: PaginaV1 | null; publicado: PaginaV1; origem: string } | null>(null)
  const [rotulo, setRotulo] = useState('')
  const [publicando, setPublicando] = useState(false)

  useEffect(() => {
    if (!open) return
    let vivo = true
    setRotulo(''); setErro(null); setDados(null); setCarregando(true)
    ;(async () => {
      if (sujo && !(await salvar())) { if (vivo) { setErro('Não foi possível salvar o rascunho antes de comparar.'); setCarregando(false) } return }
      const r = await compararParaPublicar(produtoId)
      if (!vivo) return
      if ('error' in r) setErro(r.error ?? null)
      else setDados({ temRascunho: r.temRascunho, rascunho: r.rascunho, publicado: r.publicado, origem: r.publicadoOrigem })
      setCarregando(false)
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, produtoId])

  const diff = useMemo(() => (dados?.rascunho ? diffPaginas(dados.publicado, dados.rascunho) : null), [dados])
  const vazios = useMemo(() => blocosVazios(dados?.rascunho), [dados])

  async function publicar() {
    setPublicando(true)
    const r = await publicarPagina(produtoId, rotulo)
    setPublicando(false)
    if ('error' in r) { toast.error(r.error); return }
    if ('aviso' in r && r.aviso) toast.warning(r.aviso); else toast.success('Página publicada. Os alunos já veem a nova versão.')
    onOpenChange(false); onPublicado()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!publicando) onOpenChange(v) }}>
      <DialogContent showCloseButton className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publicar página</DialogTitle>
          <DialogDescription>Confira o que muda para os alunos. A versão publicada atual vai para o histórico.</DialogDescription>
        </DialogHeader>

        {carregando && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Comparando rascunho e publicado…</div>}
        {erro && <AlertBox variante="perigo">{erro}</AlertBox>}
        {dados && !dados.temRascunho && <AlertBox variante="info">Não há rascunho para publicar. Edite a página e salve o rascunho antes.</AlertBox>}

        {diff && (
          <div className="space-y-3">
            <ResumoMudancas diff={diff} vazios={vazios} origem={dados?.origem} />

            <div className="space-y-1.5">
              <Label htmlFor="rotulo-versao">Rótulo da versão (opcional)</Label>
              <Input id="rotulo-versao" value={rotulo} maxLength={120} onChange={(e) => setRotulo(e.target.value)} placeholder="Ex.: Nova capa e trilha de abril" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publicando}>Cancelar</Button>
          <Button onClick={publicar} disabled={publicando || carregando || !dados?.temRascunho}>
            {publicando ? <Loader2 className="animate-spin" /> : <Rocket />}Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

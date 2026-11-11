'use client'

// Variações salvas (presets de página): salvar a página atual, listar (paginado), aplicar por cima do rascunho,
// renomear e excluir. Variações globais são só leitura (aplicar apenas).
import { useCallback, useEffect, useState } from 'react'
import { Globe, Layers, Loader2, Pencil, Save, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertBox } from '@/components/ui/alert-box'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { PaginacaoBib } from '@/app/admin/revisao/biblioteca/paginacao-bib'
import { aplicarPreset, excluirPreset, listarPresets, renomearPreset, salvarPreset } from '@/lib/produtos/pagina/actions-versoes'
import type { PresetResumo } from '@/lib/produtos/pagina/versoes'
import type { PaginaV1 } from '@/lib/produtos/pagina/tipos'
import { cn } from '@/lib/utils'
import { fmtData } from './util'

export function DialogoVariacoes({ open, onOpenChange, produtoId, pagina, sujo, onRestaurar }: {
  open: boolean; onOpenChange: (v: boolean) => void; produtoId: string; pagina: PaginaV1; sujo: boolean; onRestaurar: (p: PaginaV1) => void
}) {
  const [page, setPage] = useState(1); const [pp, setPP] = useState(5)
  const [itens, setItens] = useState<PresetResumo[]>([]); const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(false); const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState(''); const [descricao, setDescricao] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null) // 'salvar' | id do preset em operação

  const carregar = useCallback(async (p: number, n: number) => {
    setCarregando(true); setErro(null)
    const r = await listarPresets(p, n)
    if ('error' in r) setErro(r.error ?? null)
    else { setItens(r.itens); setTotal(r.total) }
    setCarregando(false)
  }, [])

  useEffect(() => { if (open) { setPage(1); setNome(''); setDescricao('') } }, [open])
  useEffect(() => { if (open) carregar(page, pp) }, [open, page, pp, carregar])

  async function salvar() {
    setOcupado('salvar')
    const r = await salvarPreset(nome, descricao, pagina)
    setOcupado(null)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Variação salva.'); setNome(''); setDescricao(''); setPage(1); carregar(1, pp)
  }

  async function aplicar(p: PresetResumo) {
    const aviso = sujo ? ' As alterações não salvas do editor serão perdidas.' : ''
    if (!(await confirmar({ titulo: 'Aplicar variação', mensagem: `Aplicar “${p.nome}” por cima do rascunho? O rascunho atual será substituído.${aviso} Nada muda para os alunos até você publicar.`, confirmar: 'Aplicar no rascunho' }))) return
    setOcupado(p.id)
    const r = await aplicarPreset(produtoId, p.id)
    setOcupado(null)
    if ('error' in r) { toast.error(r.error); return }
    { onRestaurar(r.pagina); toast.success('Variação aplicada ao rascunho.'); onOpenChange(false) }
  }

  async function renomear(p: PresetResumo) {
    const n = await pedirTexto({ titulo: 'Renomear variação', label: 'Nome', valorInicial: p.nome, confirmar: 'Renomear' })
    if (!n || n.trim() === p.nome) return
    setOcupado(p.id)
    const r = await renomearPreset(p.id, n)
    setOcupado(null)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Variação renomeada.'); carregar(page, pp)
  }

  async function excluir(p: PresetResumo) {
    if (!(await confirmar({ titulo: 'Excluir variação', mensagem: `Excluir a variação “${p.nome}”? Páginas que já usaram esta variação não são afetadas.`, confirmar: 'Excluir', destrutivo: true }))) return
    setOcupado(p.id)
    const r = await excluirPreset(p.id)
    setOcupado(null)
    if ('error' in r) { toast.error(r.error); return }
    toast.success('Variação excluída.')
    const novaPag = itens.length === 1 && page > 1 ? page - 1 : page
    setPage(novaPag); carregar(novaPag, pp)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Variações salvas</DialogTitle>
          <DialogDescription>Guarde a página atual como modelo para reaproveitar em outros produtos ou testar um novo visual.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Salvar a página atual como variação</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="var-nome" className="text-xs">Nome</Label><Input id="var-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Capa + trilha" /></div>
            <div className="space-y-1"><Label htmlFor="var-desc" className="text-xs">Descrição (opcional)</Label><Input id="var-desc" value={descricao} maxLength={300} onChange={(e) => setDescricao(e.target.value)} placeholder="Para que serve" /></div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={salvar} disabled={!nome.trim() || !!ocupado}>{ocupado === 'salvar' ? <Loader2 className="animate-spin" /> : <Save />}Salvar variação</Button>
          </div>
        </div>

        {erro && <AlertBox variante="aviso">{erro}</AlertBox>}
        <div className="min-h-32">
          {carregando && itens.length === 0 && <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
          {!carregando && !erro && itens.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground"><Layers className="h-6 w-6" />Nenhuma variação salva ainda.</div>
          )}
          {itens.length > 0 && (
            <ul className={cn('divide-y rounded-lg border', carregando && 'opacity-60')}>
              {itens.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.nome}</span>
                      {p.global && <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"><Globe className="h-3 w-3" />Global</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{p.descricao ? `${p.descricao} · ` : ''}{p.blocos} bloco{p.blocos === 1 ? '' : 's'}{!p.global && ` · ${fmtData(p.criado_em)}${p.autor ? ` · ${p.autor}` : ''}`}</span>
                  </span>
                  <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => aplicar(p)}>{ocupado === p.id ? <Loader2 className="animate-spin" /> : <Wand2 />}Aplicar</Button>
                  {!p.global && (
                    <>
                      <Button variant="ghost" size="icon-sm" disabled={!!ocupado} onClick={() => renomear(p)} aria-label={`Renomear ${p.nome}`}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" disabled={!!ocupado} onClick={() => excluir(p)} aria-label={`Excluir ${p.nome}`} className="text-destructive"><Trash2 /></Button>
                    </>
                  )}
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

'use client'

// BARRA DE VERSÕES do editor da página do extensivo (CONTRATO d): Salvar rascunho · Publicar · Histórico · Variações salvas.
// Ctrl+S (do shell) dispara o mesmo handler via evento 'pagina:salvar' (ver dispararSalvarRascunho / useSalvarRascunho).
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Eye, History, Layers, Loader2, Rocket, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { salvarRascunho } from '@/lib/produtos/pagina/actions-base'
import { descartarRascunho } from '@/lib/produtos/pagina/actions-versoes'
import type { PaginaV1 } from '@/lib/produtos/pagina/tipos'
import { DialogoPublicar } from './dialogo-publicar'
import { DialogoHistorico } from './dialogo-historico'
import { DialogoVariacoes } from './dialogo-variacoes'

export const PAGINA_SALVAR_EVENTO = 'pagina:salvar'
/** Pede à BarraVersoes montada que salve o rascunho (usado pelo atalho Ctrl+S do shell). */
export function dispararSalvarRascunho() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PAGINA_SALVAR_EVENTO)) }
/** Hook de conveniência: devolve o disparo estável do salvar. */
export function useSalvarRascunho() { return dispararSalvarRascunho }

export interface BarraVersoesProps {
  produtoId: string
  pagina: PaginaV1
  sujo: boolean
  onSalvo: (p: PaginaV1) => void
  onRestaurar: (p: PaginaV1) => void
  /** Opcional: link da pré-visualização do rascunho no portal do aluno (?preview=rascunho). */
  previaHref?: string
}

export function BarraVersoes({ produtoId, pagina, sujo, onSalvo, onRestaurar, previaHref }: BarraVersoesProps) {
  const [salvando, setSalvando] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const [dlg, setDlg] = useState<null | 'publicar' | 'historico' | 'variacoes'>(null)
  const ref = useRef({ pagina, produtoId, onSalvo, salvando: false })
  ref.current = { pagina, produtoId, onSalvo, salvando }

  /** Salva o rascunho; true = ok. Estável (lê o estado mais recente via ref). Chamadas concorrentes COMPARTILHAM o mesmo
   *  salvamento em andamento (antes a 2ª devolvia false — ex.: o StrictMode do dev roda o efeito do diálogo 2x). */
  const emVoo = useRef<Promise<boolean> | null>(null)
  const salvar = useCallback((): Promise<boolean> => {
    if (emVoo.current) return emVoo.current
    setSalvando(true)
    const p = (async (): Promise<boolean> => {
      try {
        const r = await salvarRascunho(ref.current.produtoId, ref.current.pagina)
        if ('error' in r) { toast.error(r.error); return false }
        ref.current.onSalvo(r.pagina); toast.success('Rascunho salvo.')
        return true
      } catch {
        toast.error('Não foi possível salvar o rascunho agora. Tente novamente.')
        return false
      } finally { setSalvando(false); emVoo.current = null }
    })()
    emVoo.current = p
    return p
  }, [])

  useEffect(() => {
    const h = () => { void salvar() }
    window.addEventListener(PAGINA_SALVAR_EVENTO, h)
    return () => window.removeEventListener(PAGINA_SALVAR_EVENTO, h)
  }, [salvar])

  async function descartar() {
    if (!(await confirmar({ titulo: 'Descartar alterações', mensagem: 'Descartar o rascunho? O editor volta para a versão publicada (ou para a página atual, se ainda não houver publicação). Isso não afeta o que os alunos veem.', confirmar: 'Descartar rascunho', destrutivo: true }))) return
    setDescartando(true)
    const r = await descartarRascunho(produtoId)
    setDescartando(false)
    if ('error' in r) { toast.error(r.error); return }
    { onRestaurar(r.pagina); toast.success(r.removido ? 'Rascunho descartado.' : 'Não havia rascunho salvo; alterações locais descartadas.') }
  }

  const ocupado = salvando || descartando
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sujo && <span className="mr-1 text-xs text-muted-foreground" role="status">Alterações não salvas</span>}
      <Button variant="outline" size="sm" onClick={() => void salvar()} disabled={ocupado} title="Salvar rascunho (Ctrl+S)">
        {salvando ? <Loader2 className="animate-spin" /> : <Save />}Salvar rascunho
      </Button>
      <Button variant="ghost" size="sm" onClick={descartar} disabled={ocupado} title="Descartar o rascunho e voltar ao publicado">
        {descartando ? <Loader2 className="animate-spin" /> : <Undo2 />}Descartar
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDlg('variacoes')}><Layers />Variações salvas</Button>
      <Button variant="ghost" size="sm" onClick={() => setDlg('historico')}><History />Histórico</Button>
      {previaHref && (
        <Link href={previaHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted">
          <Eye className="size-3.5" />Pré-visualizar
        </Link>
      )}
      <Button size="sm" onClick={() => setDlg('publicar')} disabled={ocupado}><Rocket />Publicar</Button>

      <DialogoPublicar open={dlg === 'publicar'} onOpenChange={(v) => setDlg(v ? 'publicar' : null)} produtoId={produtoId} sujo={sujo} salvar={salvar} onPublicado={() => { /* a página publicada passa a ser a base; o rascunho segue igual */ }} />
      <DialogoHistorico open={dlg === 'historico'} onOpenChange={(v) => setDlg(v ? 'historico' : null)} produtoId={produtoId} sujo={sujo} onRestaurar={onRestaurar} />
      <DialogoVariacoes open={dlg === 'variacoes'} onOpenChange={(v) => setDlg(v ? 'variacoes' : null)} produtoId={produtoId} pagina={pagina} sujo={sujo} onRestaurar={onRestaurar} />
    </div>
  )
}

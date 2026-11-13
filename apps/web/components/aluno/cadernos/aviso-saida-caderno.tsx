'use client'

// Aviso IN-APP ao sair do leitor. Não depende de beforeunload (o leitor roda iframe dentro de iframe na
// Curseduca, onde o aviso nativo não é confiável): é aberto pelos botões Voltar/Concluir do próprio leitor.
//  - PENDENTES (grifos/notas/folhas ainda fora de qualquer caderno): escolhe/cria o caderno e "Salvar e sair".
//  - RESUMO (o que já foi salvo nesta leitura): atalho "Ver no caderno".
import { useEffect, useState } from 'react'
import { BookMarked, Check, Loader2, NotebookPen, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { descreverResumo, type CadernoLista, type ResumoCaderno } from '@/lib/aluno/cadernos-cliente'

export type PendentesResumo = { grifo: number; comentario: number; anotacao: number; total: number }
const pl = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`
function descreverPendentes(p: PendentesResumo) {
  const l: string[] = []
  if (p.grifo) l.push(pl(p.grifo, 'grifo', 'grifos'))
  if (p.comentario) l.push(pl(p.comentario, 'nota', 'notas'))
  if (p.anotacao) l.push(pl(p.anotacao, 'anotação', 'anotações'))
  return l.join(', ')
}

export function AvisoSaidaCaderno({ resumo, pendentes, cadernos, cadernoPadraoId, onSalvarESair, onVer, onSair, onFicar }: {
  /** null = fechado (só fecha se não houver nada a mostrar). */
  resumo: ResumoCaderno[] | null
  pendentes?: PendentesResumo | null
  cadernos?: CadernoLista[]
  cadernoPadraoId?: string | null
  /** Salva os pendentes no caderno (existente ou novo) e, se tudo deu certo, o host sai. Devolve false se falhou (não sai). */
  onSalvarESair?: (alvo: { caderno_id: string } | { novo_nome: string }) => Promise<boolean>
  onVer: (cadernoId: string) => void
  onSair: () => void
  onFicar: () => void
}) {
  const aberto = !!resumo || !!pendentes
  const lista = cadernos ?? []
  const [sel, setSel] = useState('') // id | 'novo'
  const [nome, setNome] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setNome(''); setBusy(false)
    setSel(cadernoPadraoId && lista.some((c) => c.id === cadernoPadraoId) ? cadernoPadraoId : lista.length === 1 ? lista[0].id : lista.length ? '' : 'novo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cadernoPadraoId])

  const criando = sel === 'novo'
  const podeSalvar = !busy && (criando ? nome.trim().length > 0 : !!sel)
  async function salvar() {
    if (!onSalvarESair || !podeSalvar) return
    setBusy(true)
    const ok = await onSalvarESair(criando ? { novo_nome: nome.trim() } : { caderno_id: sel })
    if (!ok) setBusy(false) // falhou: fica na tela, o aluno pode tentar de novo / sair sem salvar
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o && !busy) onFicar() }}>
      <DialogContent overlayClassName="z-[300]" className="z-[301] max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="h-4 w-4" /> {pendentes ? 'Você está saindo sem salvar' : 'Seus cadernos foram atualizados'}
          </DialogTitle>
          <DialogDescription>
            {pendentes
              ? `Você está saindo sem salvar ${descreverPendentes(pendentes)} no caderno. Escolha onde guardar ou saia sem salvar.`
              : 'Tudo o que você salvou já está guardado. Pode sair sem perder nada.'}
          </DialogDescription>
        </DialogHeader>

        {pendentes && (
          <div className="space-y-2">
            <div className="max-h-48 min-w-0 space-y-1 overflow-y-auto overflow-x-hidden">
              {lista.map((c) => (
                <button key={c.id} type="button" disabled={busy} onClick={() => setSel(c.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${sel === c.id ? 'border-primary bg-muted' : ''}`}>
                  <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{c.total}</span>
                  {sel === c.id && <Check className="h-4 w-4 text-primary" />}
                </button>
              ))}
              <button type="button" disabled={busy} onClick={() => setSel('novo')}
                className={`flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${criando ? 'border-primary bg-muted' : ''}`}>
                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Criar novo caderno</span>
                {criando && <Check className="h-4 w-4 text-primary" />}
              </button>
            </div>
            {criando && (
              <Input autoFocus value={nome} maxLength={120} disabled={busy} onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar() } }}
                placeholder="Nome do novo caderno" aria-label="Nome do novo caderno" />
            )}
          </div>
        )}

        {resumo && resumo.length > 0 && (
          <ul className="space-y-2">
            {resumo.map((r) => (
              <li key={r.cadernoId} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="block truncate">Já salvo em {r.nome}</b>
                  <span className="text-xs text-muted-foreground">{descreverResumo(r)}</span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => onVer(r.cadernoId)}>Ver no caderno</Button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" onClick={onFicar} disabled={busy}>Ficar aqui</Button>
          {pendentes ? (
            <>
              <Button variant="outline" onClick={onSair} disabled={busy}>Sair sem salvar</Button>
              <Button onClick={salvar} disabled={!podeSalvar}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar no caderno e sair
              </Button>
            </>
          ) : (
            <Button onClick={onSair}>Continuar saindo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

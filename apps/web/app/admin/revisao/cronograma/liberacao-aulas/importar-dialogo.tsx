'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pilula } from '../../_comp/lista'
import { dataBr, type PreviaImportacao } from './tipos'

// Importar planilha (.xlsx) em 2 passos: PRÉVIA (casamento com as aulas do produto, nada é gravado) → CONFIRMAR (substitui
// as linhas do produto). Upload multipart para a rota de API — o arquivo é reenviado na confirmação (sem estado no servidor).

const ROTA = '/api/admin/revisao/liberacao-aulas/importar'
type Filtro = 'sem' | 'suspeitas' | 'ok'

export function ImportarPlanilha({ produtoId }: { produtoId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null)
  const [lendo, setLendo] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ver, setVer] = useState<Filtro>('sem')

  function fechar(v: boolean) {
    if (gravando) return
    setAberto(v)
    if (!v) { setArquivo(null); setPrevia(null); setErro(null); if (inputRef.current) inputRef.current.value = '' }
  }
  async function enviar(f: File, modo: 'previa' | 'gravar') {
    const fd = new FormData()
    fd.set('arquivo', f); fd.set('produtoId', produtoId); fd.set('modo', modo)
    const r = await fetch(ROTA, { method: 'POST', body: fd })
    return (await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))) as { ok: boolean; error?: string; previa?: PreviaImportacao; gravadas?: number; removidas?: number }
  }
  async function escolher(f: File | null) {
    setArquivo(f); setPrevia(null); setErro(null)
    if (!f) return
    setLendo(true)
    try {
      const r = await enviar(f, 'previa')
      if (!r.ok || !r.previa) { setErro(r.error ?? 'Não foi possível ler a planilha.'); return }
      setPrevia(r.previa); setVer(r.previa.semVinculo ? 'sem' : r.previa.suspeitas ? 'suspeitas' : 'ok')
    } catch { setErro('Falha de rede ao enviar a planilha.') } finally { setLendo(false) }
  }
  async function confirmar() {
    if (!arquivo) return
    setGravando(true)
    try {
      const r = await enviar(arquivo, 'gravar')
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível gravar.')
      toast.success(`${r.gravadas} linha(s) importadas${r.removidas ? ` (${r.removidas} antigas removidas)` : ''}.`)
      fechar(false); router.refresh()
    } catch { toast.error('Falha de rede ao gravar.') } finally { setGravando(false) }
  }

  const lista = previa?.linhas.filter((l) => (ver === 'sem' ? !l.aulaId : ver === 'suspeitas' ? l.suspeito : !!l.aulaId && !l.suspeito)) ?? []
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}><FileUp />Importar planilha</Button>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar planilha de liberação de aulas</DialogTitle>
            <DialogDescription>Arquivo .xlsx com Nº, data de liberação, matéria, nº e título da aula etc. Primeiro mostramos como as linhas casam com as aulas do produto; só grava ao confirmar, e substitui as linhas atuais do produto.</DialogDescription>
          </DialogHeader>

          <input ref={inputRef} type="file" accept=".xlsx" onChange={(e) => escolher(e.target.files?.[0] ?? null)} disabled={lendo || gravando}
            className="block w-full cursor-pointer rounded-lg border bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
          {lendo && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo e casando as linhas…</p>}
          {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

          {previa && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-4">
                {[
                  ['Linhas lidas', previa.total, ''],
                  ['Casaram com aula', previa.casadas, 'ok'],
                  ['Sem vínculo', previa.semVinculo, previa.semVinculo ? 'warn' : ''],
                  ['Casamento a conferir', previa.suspeitas, previa.suspeitas ? 'warn' : ''],
                ].map(([r, v, t]) => (
                  <div key={String(r)} className="rounded-xl border bg-card p-3"><span className="block text-xs uppercase tracking-wide text-muted-foreground">{r}</span><b className={`text-2xl tabular-nums ${t === 'warn' ? 'text-amber-700 dark:text-amber-400' : ''}`}>{v}</b></div>
                ))}
              </div>
              {previa.existentes > 0 && <p className="text-sm text-amber-700 dark:text-amber-400">Atenção: o produto já tem {previa.existentes} linha(s). Ao confirmar elas são substituídas por estas {previa.total}.</p>}
              {previa.invalidas.length > 0 && <p className="text-sm text-muted-foreground">Ignoradas por erro ({previa.invalidas.length}): {previa.invalidas.slice(0, 5).map((i) => `linha ${i.linha} (${i.motivo})`).join('; ')}{previa.invalidas.length > 5 ? '…' : ''}</p>}

              <div className="flex gap-4 border-b">
                {([['sem', `Sem vínculo (${previa.semVinculo})`], ['suspeitas', `A conferir (${previa.suspeitas})`], ['ok', `Casadas (${previa.casadas - previa.suspeitas > 0 ? previa.casadas - previa.suspeitas : 0})`]] as const).map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setVer(id)} className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${ver === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
                ))}
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card"><tr className="border-b text-left uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">Nº</th><th className="px-2 py-2">Data</th><th className="px-2 py-2">Matéria / aula da planilha</th><th className="px-2 py-2">Aula do produto</th></tr></thead>
                  <tbody>
                    {lista.length === 0 && <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nada nesta lista.</td></tr>}
                    {lista.map((l) => (
                      <tr key={l.ordem} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{l.ordem}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{dataBr(l.dataLiberacao)}</td>
                        <td className="px-2 py-1.5"><b className="font-medium">{l.disciplina}</b> · {l.numeroAula != null ? `aula ${l.numeroAula} · ` : ''}{l.titulo}</td>
                        <td className="px-2 py-1.5">{l.aulaId ? <span>{l.aulaTitulo} <Pilula tipo={l.suspeito ? 'warn' : 'mut'}>{l.metodo}</Pilula></span> : <span className="text-amber-700 dark:text-amber-400">⚠ {l.motivo ?? 'sem vínculo'}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Linhas sem vínculo são gravadas mesmo assim (com a data) e podem ser ligadas depois à mão na tabela.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => fechar(false)} disabled={gravando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!previa || previa.total === 0 || gravando || lendo}>{gravando && <Loader2 className="animate-spin" />}Confirmar e gravar {previa ? `${previa.total} linhas` : ''}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

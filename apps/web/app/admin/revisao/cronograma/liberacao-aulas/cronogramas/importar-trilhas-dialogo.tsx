'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Pilula } from '../../../_comp/lista'
import { dataBr } from '../tipos'
import type { PreviaImportTrilhas } from '../tipos-trilhas'
import { ROTA_TRILHAS_IMPORTAR } from './api'

// Importar a 2ª aba “Data em cada cronograma” em 2 passos: PRÉVIA (nada é gravado) → CONFIRMAR. As linhas casam com as
// aulas da 1ª aba pelo Nº. Reimportar atualiza as datas dos cronogramas SEM perder as datas manuais.

type Ver = 'sem' | 'amostra'

export function ImportarTrilhas({ produtoId }: { produtoId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [desconto, setDesconto] = useState(28)
  const [previa, setPrevia] = useState<PreviaImportTrilhas | null>(null)
  const [lendo, setLendo] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ver, setVer] = useState<Ver>('amostra')

  function fechar(v: boolean) {
    if (gravando) return
    setAberto(v)
    if (!v) { setArquivo(null); setPrevia(null); setErro(null); if (inputRef.current) inputRef.current.value = '' }
  }
  async function enviar(f: File, modo: 'previa' | 'gravar', d: number) {
    const fd = new FormData()
    fd.set('arquivo', f); fd.set('produtoId', produtoId); fd.set('modo', modo); fd.set('desconto', String(d))
    const r = await fetch(ROTA_TRILHAS_IMPORTAR, { method: 'POST', body: fd })
    return (await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }))) as { ok: boolean; error?: string; previa?: PreviaImportTrilhas; trilhasCriadas?: number; celulas?: number }
  }
  async function ler(f: File | null, d = desconto) {
    setArquivo(f); setPrevia(null); setErro(null)
    if (!f) return
    setLendo(true)
    try {
      const r = await enviar(f, 'previa', d)
      if (!r.ok || !r.previa) return void setErro(r.error ?? 'Não foi possível ler a planilha.')
      setPrevia(r.previa); setVer(r.previa.linhasSemAula ? 'sem' : 'amostra')
    } catch { setErro('Falha de rede ao enviar a planilha.') } finally { setLendo(false) }
  }
  async function confirmar() {
    if (!arquivo) return
    setGravando(true)
    try {
      const r = await enviar(arquivo, 'gravar', desconto)
      if (!r.ok) return void toast.error(r.error ?? 'Não foi possível gravar.')
      toast.success(`Importado: ${r.trilhasCriadas ?? 0} trilha(s) criada(s), ${r.celulas ?? 0} data(s) gravada(s).`)
      fechar(false); router.refresh()
    } catch { toast.error('Falha de rede ao gravar.') } finally { setGravando(false) }
  }

  const lista = previa ? (ver === 'sem' ? previa.semAula : previa.amostra) : []
  const nomes = previa?.trilhas.map((t) => t.nome) ?? []
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}><FileUp />Importar datas dos cronogramas</Button>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Importar “Data em cada cronograma”</DialogTitle>
            <DialogDescription>Arquivo .xlsx com a 2ª aba da planilha (Nº, Matéria, Nº da aula, Título e uma coluna por cronograma). Cria/atualiza as trilhas e as datas; só grava ao confirmar. Célula vazia = a aula não existe naquela trilha.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3">
            <input ref={inputRef} type="file" accept=".xlsx" onChange={(e) => ler(e.target.files?.[0] ?? null)} disabled={lendo || gravando}
              className="block min-w-[16rem] flex-1 cursor-pointer rounded-lg border bg-background text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground" />
            <label className="text-xs text-muted-foreground" title="As datas da planilha já vêm antecipadas (liberação = cronograma − 28 dias). Somamos este valor para obter a data do cronograma.">
              Datas da planilha já antecipadas em (dias)
              <input type="number" min={0} max={365} value={desconto} disabled={lendo || gravando}
                onChange={(e) => setDesconto(Number(e.target.value))} onBlur={() => arquivo && ler(arquivo, desconto)}
                className="ml-2 h-9 w-20 rounded-lg border bg-background px-2 text-sm text-foreground" />
            </label>
          </div>
          {lendo && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo e casando as linhas…</p>}
          {erro && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

          {previa && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {([
                  ['Aulas lidas', previa.linhasLidas, ''], ['Casaram', previa.linhasCasadas, ''], ['Sem aula na 1ª aba', previa.linhasSemAula, previa.linhasSemAula ? 'warn' : ''],
                  ['Células com data', previa.celulasComData, ''], ['Novas / alteradas', `${previa.celulasNovas} / ${previa.celulasAlteradas}`, ''], ['Manuais preservadas', previa.manuaisPreservadas, ''],
                ] as const).map(([r, v, t]) => (
                  <div key={r} className="rounded-xl border bg-card p-3"><span className="block text-xs uppercase tracking-wide text-muted-foreground">{r}</span><b className={cn('text-xl tabular-nums', t === 'warn' && 'text-amber-700 dark:text-amber-400')}>{v}</b></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {previa.trilhas.map((t) => (
                  <Pilula key={t.nome} tipo={t.existente ? 'mut' : 'vio'}>{t.nome} · {t.celulasComData} aulas · início {dataBr(t.inicio)} · {t.existente ? 'atualiza' : 'nova'}</Pilula>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{previa.celulasVazias.toLocaleString('pt-BR')} célula(s) vazia(s) (aula fora da trilha) · {previa.celulasIguais.toLocaleString('pt-BR')} já iguais · offset das trilhas novas: 28 dias · data do cronograma = data da planilha + {previa.descontoDias} dia(s). Depois de importar, use “Recalcular data-base”.</p>
              {previa.invalidas.length > 0 && <p className="text-xs text-muted-foreground">Ignoradas por erro ({previa.invalidas.length}): {previa.invalidas.slice(0, 5).map((i) => `linha ${i.linha} (${i.motivo})`).join('; ')}{previa.invalidas.length > 5 ? '…' : ''}</p>}

              <div className="flex gap-4 border-b">
                {([['sem', `Sem aula correspondente (${previa.linhasSemAula})`], ['amostra', 'Amostra das casadas']] as const).map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setVer(id)} className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${ver === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
                ))}
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Nº</th><th className="px-2 py-2">Aula</th>
                      {nomes.map((n) => <th key={n} className="whitespace-nowrap px-2 py-2">{n}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.length === 0 && <tr><td colSpan={2 + nomes.length} className="px-2 py-6 text-center text-muted-foreground">Nada nesta lista.</td></tr>}
                    {lista.map((l, i) => (
                      <tr key={`${l.ordem}-${i}`} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{l.ordem}</td>
                        <td className="px-2 py-1.5"><b className="font-medium">{l.disciplina}</b> · {l.titulo}{l.casou === 'titulo' && <span className="ml-1 text-amber-700 dark:text-amber-400">(casou por título)</span>}</td>
                        {nomes.map((n) => <td key={n} className="whitespace-nowrap px-2 py-1.5 tabular-nums">{l.datas[n] ? dataBr(l.datas[n]) : '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => fechar(false)} disabled={gravando}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!previa || previa.linhasCasadas === 0 || gravando || lendo}>{gravando && <Loader2 className="animate-spin" />}Confirmar e gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

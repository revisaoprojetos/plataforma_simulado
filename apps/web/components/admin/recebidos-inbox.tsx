'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Loader2, RefreshCw, Eye, Copy, Check, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { ModalRequisicao } from '@/components/admin/modal-requisicao'
import { listarRecebidos, getRecebidoDetalhe, type RecebidoDTO } from '@/app/admin/integracoes/actions'

type Detalhe = Awaited<ReturnType<typeof getRecebidoDetalhe>>['detalhe']

export function RecebidosInbox({ appUrl, token }: { appUrl: string; token: string | null }) {
  const [itens, setItens] = useState<RecebidoDTO[] | null>(null)
  const [fontes, setFontes] = useState<string[]>([])
  const [filtro, setFiltro] = useState<string>('')
  const [semTabela, setSemTabela] = useState(false)
  const [carregando, start] = useTransition()
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = () => start(async () => {
    const r = await listarRecebidos(filtro || undefined)
    if (!r.ok) { toast.error(r.error ?? 'Falha ao carregar'); setItens([]); return }
    setItens(r.itens ?? []); setFontes(r.fontes ?? []); setSemTabela(!!r.semTabela)
  })
  useEffect(() => { carregar() }, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (id: string) => { setAbrindo(id); (async () => { const r = await getRecebidoDetalhe(id); setAbrindo(null); if (r.ok && r.detalhe) setDetalhe(r.detalhe); else toast.error(r.error ?? 'Erro') })() }
  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const corStatus = (s: number | null) => s == null ? 'bg-muted text-muted-foreground' : s < 300 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : s < 500 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'

  const urlGenerica = token ? `${appUrl}/api/webhooks/in/${token}?fonte=minha_fonte` : null
  const copiar = (url: string) => { navigator.clipboard.writeText(url).then(() => { setCopiado('gen'); setTimeout(() => setCopiado(null), 1500) }) }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">URL de recebimento (multi-fonte)</h3>
          <p className="mb-2 text-xs text-muted-foreground">Aponte outras fontes (Hotmart, Kiwify, Eduzz, n8n, Zapier…) para esta URL. Troque <code>minha_fonte</code> pelo nome da origem — ela aparece na coluna <b>Fonte</b>. A URL <b>dedicada da Guru</b> fica em <b>Integrações → Guru</b>.</p>
          {urlGenerica ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2.5 py-1.5 text-xs">{urlGenerica}</code>
              <Button variant="outline" size="sm" onClick={() => copiar(urlGenerica)}>{copiado === 'gen' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
            </div>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400">Nenhum token de webhook configurado ainda. Configure uma integração (ex.: Guru) para gerar o token do tenant.</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Fonte:</span>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
          <option value="">Todas</option>
          {fontes.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <Button variant="outline" size="sm" className="ml-auto" onClick={carregar} disabled={carregando}>{carregando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />} Atualizar</Button>
      </div>

      {semTabela && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          A tabela do inbox ainda não foi criada. Aplique as migrations <b>20260717000002_webhook_inbox</b> e <b>20260717000003_webhook_inbox_fonte</b>.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 font-medium">Recebido</th>
              <th className="px-3 py-2 font-medium">Fonte</th>
              <th className="px-3 py-2 font-medium">Método</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Resultado</th>
              <th className="px-3 py-2 font-medium">Comprador</th>
              <th className="px-3 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {itens === null ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma requisição recebida ainda. Envie um POST/GET para a URL acima (ou use a coleção do Postman) para ver aparecer aqui.</td></tr>
            ) : itens.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{fmt(e.recebidoEm)}</td>
                <td className="px-3 py-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{e.fonte ?? e.provider}</span></td>
                <td className="px-3 py-2 text-xs font-medium">{e.metodo}</td>
                <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', corStatus(e.statusResp))}>{e.statusResp ?? '—'}</span></td>
                <td className="max-w-[240px] px-3 py-2 text-xs">{e.resultado ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{e.comprador ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => abrir(e.id)} disabled={abrindo === e.id} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60">
                    {abrindo === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />} Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null) }}>
        <ModalRequisicao detalhe={detalhe ?? null} />
      </Dialog>
    </div>
  )
}

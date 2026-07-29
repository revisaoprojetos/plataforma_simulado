'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, Trash2, XCircle, Loader2, Clock, CheckCircle2, ShieldOff } from 'lucide-react'
import { confirmar, pedirTexto } from '@/components/ui/confirm-dialog'
import { AlertBox } from '@/components/ui/alert-box'
import { listarSolicitacoes, exportarEstudanteAdmin, anonimizarSolicitacao, rejeitarSolicitacao, type SolicitacaoLgpd } from './actions'

const dataBrt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

function baixarJson(nome: string, dados: unknown) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

const TIPO_LABEL: Record<string, string> = { exclusao: 'Exclusão', exportacao: 'Exportação', portabilidade: 'Portabilidade' }

function Badge({ children, tom }: { children: React.ReactNode; tom: 'amber' | 'emerald' | 'slate' | 'rose' | 'sky' }) {
  const cls: Record<string, string> = {
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    slate: 'bg-muted text-muted-foreground',
    rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls[tom]}`}>{children}</span>
}

export function LgpdClient({ inicial, tabelaAusente }: { inicial: SolicitacaoLgpd[]; tabelaAusente: boolean }) {
  const [lista, setLista] = useState<SolicitacaoLgpd[]>(inicial)
  const [pending, start] = useTransition()
  const [aviso, setAviso] = useState(tabelaAusente)

  async function recarregar() {
    const r = await listarSolicitacoes()
    setLista(r.solicitacoes ?? [])
    setAviso(!!r.tabelaAusente)
  }

  function exportar(s: SolicitacaoLgpd) {
    start(async () => {
      const r = await exportarEstudanteAdmin(s.estudante_id)
      if (!r.ok || !r.dados) { toast.error(r.error ?? 'Erro ao exportar.'); return }
      baixarJson(`lgpd-${s.estudante_nome.replace(/\s+/g, '-').toLowerCase()}.json`, r.dados)
      toast.success('Dados exportados (JSON).')
    })
  }

  async function anonimizar(s: SolicitacaoLgpd) {
    const ok = await confirmar({
      titulo: 'Anonimizar dados do titular',
      mensagem: `Isso substitui nome, e-mail, CPF e telefone de "${s.estudante_nome}" por marcadores anônimos. As estatísticas (sessões/notas) são preservadas, mas sem PII. Ação irreversível. Continuar?`,
      confirmar: 'Anonimizar', destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await anonimizarSolicitacao(s.id)
      if (!r.ok) { toast.error(r.error ?? 'Erro.'); return }
      toast.success('Titular anonimizado. Solicitação concluída.')
      await recarregar()
    })
  }

  async function rejeitar(s: SolicitacaoLgpd) {
    const motivo = await pedirTexto({ titulo: 'Rejeitar solicitação', label: 'Motivo (ex.: retenção legal obrigatória)', confirmar: 'Rejeitar' })
    if (motivo == null) return
    start(async () => {
      const r = await rejeitarSolicitacao(s.id, motivo)
      if (!r.ok) { toast.error(r.error ?? 'Erro.'); return }
      toast.success('Solicitação rejeitada.')
      await recarregar()
    })
  }

  return (
    <div className="space-y-4">
      {aviso && <AlertBox variante="aviso">Aplique a migração <code>20260730000002_lgpd_solicitacoes</code> no banco para registrar e processar pedidos de exclusão. A exportação de dados já funciona.</AlertBox>}

      {lista.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <ShieldOff className="h-7 w-7" />
          Nenhuma solicitação LGPD no momento.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <Card key={s.id}><CardContent className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{s.estudante_nome}</span>
                  <Badge tom={s.tipo === 'exclusao' ? 'rose' : 'sky'}>{TIPO_LABEL[s.tipo] ?? s.tipo}</Badge>
                  {s.status === 'pendente' && <Badge tom="amber"><Clock className="h-3 w-3" /> Pendente</Badge>}
                  {s.status === 'concluida' && <Badge tom="emerald"><CheckCircle2 className="h-3 w-3" /> Concluída</Badge>}
                  {s.status === 'rejeitada' && <Badge tom="slate"><XCircle className="h-3 w-3" /> Rejeitada</Badge>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {s.estudante_email ?? 'sem e-mail'} · {s.canal === 'aluno' ? 'pedido do aluno' : 'admin'} · {dataBrt(s.criado_em)}
                  {s.motivo && s.status === 'rejeitada' && <> · motivo: {s.motivo}</>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => exportar(s)} disabled={pending}><Download className="mr-1.5 h-3.5 w-3.5" /> Exportar</Button>
                {s.status === 'pendente' && s.tipo === 'exclusao' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => rejeitar(s)} disabled={pending}>Rejeitar</Button>
                    <Button size="sm" onClick={() => anonimizar(s)} disabled={pending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />} Anonimizar
                    </Button>
                  </>
                )}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}

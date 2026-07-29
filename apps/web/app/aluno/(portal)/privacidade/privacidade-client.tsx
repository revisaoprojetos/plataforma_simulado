'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Download, Trash2, Loader2, ShieldCheck, Clock } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { exportarMeusDados, solicitarExclusao, minhaSolicitacaoExclusao } from './actions'

export function PrivacidadeClient() {
  const [pending, start] = useTransition()
  const [exclusaoPendente, setExclusaoPendente] = useState(false)

  useEffect(() => { minhaSolicitacaoExclusao().then((r) => setExclusaoPendente(!!r.pendente)).catch(() => {}) }, [])

  function baixar() {
    start(async () => {
      const r = await exportarMeusDados()
      if (!r.ok || !r.dados) { toast.error(r.error ?? 'Erro ao exportar seus dados.'); return }
      const blob = new Blob([JSON.stringify(r.dados, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success('Seus dados foram baixados (JSON).')
    })
  }

  async function pedirExclusao() {
    const ok = await confirmar({
      titulo: 'Solicitar exclusão dos meus dados',
      mensagem: 'Vamos registrar seu pedido para a equipe da plataforma. Seus dados pessoais (nome, e-mail, CPF, telefone) serão anonimizados. Deseja continuar?',
      confirmar: 'Solicitar exclusão',
      destrutivo: true,
    })
    if (!ok) return
    start(async () => {
      const r = await solicitarExclusao()
      if (!r.ok) { toast.error(r.error ?? 'Erro ao registrar o pedido.'); return }
      setExclusaoPendente(true)
      toast.success('Pedido de exclusão registrado. A plataforma vai processá-lo.')
    })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Download className="h-4 w-4 text-primary" /> Baixar meus dados</div>
          <p className="flex-1 text-sm text-muted-foreground">Exporte tudo o que a plataforma guarda sobre você — cadastro, matrículas e histórico de simulados — em um arquivo JSON.</p>
          <Button onClick={baixar} disabled={pending} className="w-full">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar em JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold"><Trash2 className="h-4 w-4 text-destructive" /> Excluir meus dados</div>
          {exclusaoPendente ? (
            <>
              <p className="flex-1 text-sm text-muted-foreground">Seu pedido de exclusão foi registrado e está em análise pela equipe da plataforma.</p>
              <div className="flex items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-amber-50 p-2.5 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"><Clock className="h-4 w-4" /> Pedido em análise</div>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm text-muted-foreground">Solicite a anonimização dos seus dados pessoais. A equipe da plataforma vai processar o pedido conforme a LGPD.</p>
              <Button onClick={pedirExclusao} disabled={pending} variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/5">
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Solicitar exclusão
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

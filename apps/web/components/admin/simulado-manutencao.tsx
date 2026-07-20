'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isoParaBrtLocal, BRT_LABEL } from '@/lib/brt'
import { salvarManutencaoSimulado } from '@/app/admin/simulados/actions'

export function SimuladoManutencao({ simuladoId, inicial }: { simuladoId: string; inicial: { ativo?: boolean; inicio?: string | null; fim?: string | null } | null }) {
  const router = useRouter()
  const [ativo, setAtivo] = useState(!!inicial?.ativo)
  const [inicio, setInicio] = useState(inicial?.inicio ? isoParaBrtLocal(inicial.inicio) : '')
  const [fim, setFim] = useState(inicial?.fim ? isoParaBrtLocal(inicial.fim) : '')
  const [pending, start] = useTransition()

  // Está em manutenção AGORA? (ativo + dentro da janela)
  const agora = Date.now()
  const iniMs = inicio ? new Date(inicio).getTime() : null
  const fimMs = fim ? new Date(fim).getTime() : null
  const emManutencaoAgora = ativo && (!iniMs || agora >= iniMs) && (!fimMs || agora <= fimMs)

  function salvar() {
    start(async () => {
      const r = await salvarManutencaoSimulado(simuladoId, { ativo, inicio: inicio || null, fim: fim || null })
      if (r?.error) { toast.error(r.error); return }
      toast.success('Manutenção salva')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wrench className="h-4.5 w-4.5 text-amber-500" /> Manutenção</CardTitle>
        <CardDescription>Enquanto ativa e dentro da janela, o aluno vê um aviso de manutenção e não consegue iniciar/retomar a prova (não gasta tentativa nem tempo).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {emManutencaoAgora && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Este simulado está EM MANUTENÇÃO agora — os alunos veem o aviso.
          </div>
        )}

        <div className="flex items-start gap-3">
          <Switch id="manut_ativo" checked={ativo} onCheckedChange={setAtivo} className="mt-0.5" />
          <div>
            <Label htmlFor="manut_ativo">Colocar o simulado em manutenção</Label>
            <p className="text-xs text-muted-foreground">Deixe a janela em branco para manutenção imediata até você desligar.</p>
          </div>
        </div>

        {ativo && (
          <div className="space-y-1.5 rounded-lg border bg-amber-500/5 p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="manut_inicio">Início da manutenção</Label><Input id="manut_inicio" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="manut_fim">Fim da manutenção</Label><Input id="manut_fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">{BRT_LABEL}. Em branco = sem limite (início já / fim manual). O aluno vê o horário de fim no aviso.</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Salvar manutenção
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

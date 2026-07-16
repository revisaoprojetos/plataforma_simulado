'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { salvarSyncSimples } from '@/app/admin/curseduca/actions'

const INTERVALOS: Record<string, string> = { '15': '15 minutos', '30': '30 minutos', '60': '1 hora', '120': '2 horas', '240': '4 horas' }

/**
 * Card compacto (coluna direita do Importar) para regular a sincronização automática:
 * liga/desliga + intervalo. Reimporta os grupos da Curseduca no intervalo (só adiciona novos).
 */
export function CurseducaSyncCard({ grupos, inicialAtivo, inicialIntervalo }: {
  grupos: { id: number }[]; inicialAtivo: boolean; inicialIntervalo: number
}) {
  const [ativo, setAtivo] = useState(inicialAtivo)
  const [intervalo, setIntervalo] = useState(String(inicialIntervalo || 30))
  const [salvando, start] = useTransition()

  function salvar() {
    start(async () => {
      const r = await salvarSyncSimples(Number(intervalo), ativo, grupos.map((g) => g.id))
      if (r.ok) toast.success(ativo ? 'Sincronização automática ativada' : 'Sincronização automática desligada')
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }

  return (
    <div className="space-y-2.5 rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><RefreshCw className="h-4 w-4" /></span>
        <h3 className="text-sm font-semibold leading-tight">Sincronização automática</h3>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 rounded border" />
        Ativar
      </label>

      <div className={cn('flex items-center gap-2 transition-opacity', !ativo && 'pointer-events-none opacity-50')}>
        <label className="shrink-0 text-xs font-medium text-muted-foreground">A cada</label>
        <Select value={intervalo} onValueChange={(v) => setIntervalo(v ?? '30')} items={INTERVALOS}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(INTERVALOS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={salvar} disabled={salvando} size="sm" className="shrink-0">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">Só adiciona alunos novos (nunca remove). Roda no intervalo escolhido.</p>
    </div>
  )
}

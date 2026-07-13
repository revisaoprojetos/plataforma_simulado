import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { History } from 'lucide-react'
import type { SessaoRow } from './historico-estudante'

/** Histórico compacto (lado direito): só nome do simulado, situação e quando foi feito. */
export function HistoricoSimples({ rows, estudanteId }: { rows: SessaoRow[]; estudanteId: string }) {
  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><History className="h-4 w-4" /></span> Histórico</CardTitle>
        <span className="text-[11px] text-muted-foreground">{rows.length} sessão(ões)</span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum simulado realizado.</p>
        ) : (
          <div className="scroll-claro max-h-[520px] divide-y overflow-y-auto">
            {rows.map((r) => (
              <Link key={r.id} href={`/admin/estudantes/${estudanteId}/simulado/${r.simuladoId}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.finalizado !== '—' ? r.finalizado : r.iniciado}</p>
                </div>
                <Badge variant={r.statusVariant} className="shrink-0 text-[10px]">{r.statusLabel}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

'use client'

// Carrega o Relatório SOB DEMANDA (cliente), para a aba abrir na hora com um spinner em vez de
// pendurar o render do Server Component quando o loader pesado demora (causa do "não abre"). Reusa
// o mesmo componente visual `LeituraRelatorio` (Lei Seca E Jurisprudência via `area` + `rotulos`).

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { LeituraRelatorio } from '@/components/admin/leitura-relatorio'
import { obterRelatorioModulo } from '@/app/admin/leitura/actions'
import { obterRelatorioJuris } from '@/app/admin/jurisprudencia/actions'
import type { RelatorioModulo } from '@/lib/leitura/relatorio'

export function RelatorioAsync({
  moduloId, area = 'leitura', rotulos,
}: {
  moduloId: string
  area?: 'leitura' | 'jurisprudencia'
  rotulos?: { aulas?: string; aulaSingular?: string; excelHref?: string | null }
}) {
  const [rel, setRel] = useState<RelatorioModulo | null>(null)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')

  useEffect(() => {
    let vivo = true
    setEstado('carregando'); setRel(null)
    const loader = area === 'jurisprudencia' ? obterRelatorioJuris : obterRelatorioModulo
    loader(moduloId)
      .then((r) => { if (!vivo) return; if (r.ok && r.rel) { setRel(r.rel); setEstado('ok') } else setEstado('erro') })
      .catch(() => { if (vivo) setEstado('erro') })
    return () => { vivo = false }
  }, [moduloId, area])

  if (estado === 'carregando') {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando o relatório…
      </div>
    )
  }
  // erro → rel=null aciona o estado de erro gracioso do próprio LeituraRelatorio.
  return <LeituraRelatorio rel={estado === 'ok' ? rel : null} moduloId={moduloId} rotulos={rotulos} />
}

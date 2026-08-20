import Link from 'next/link'
import { CalendarCheck, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { fmtBr } from '@/lib/cronograma/datas'
import type { EmissaoResumo } from './emissoes-actions'

/**
 * "Meus cronogramas": o que o aluno já gerou, para reabrir.
 *
 * É a resposta à maior dor do gerador legado — lá, fechar a página perdia o cronograma.
 * Arquivados ficam fora da lista principal, mas o registro é preservado.
 */
export function MinhasEmissoes({ itens }: { itens: EmissaoResumo[] }) {
  const ativas = itens.filter((e) => !e.arquivada)
  if (!ativas.length) return null

  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <CalendarCheck className="h-5 w-5 text-primary" />
        <div>
          <p className="font-semibold leading-tight">Meus cronogramas</p>
          <p className="text-xs text-muted-foreground">
            {ativas.length === 1 ? '1 cronograma salvo' : `${ativas.length} cronogramas salvos`} — clique para abrir
          </p>
        </div>
      </div>

      <div className="divide-y">
        {ativas.slice(0, 10).map((e) => {
          const inicio = e.formulario?.inicio as string | undefined
          return (
            <Link
              key={e.id}
              href={`/aluno/cronograma/${e.id}`}
              className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{e.titulo || e.cronograma_nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.titulo && `${e.cronograma_nome} · `}
                  {inicio && `começa em ${fmtBr(inicio)} · `}
                  {e.resumo?.subtitulo ?? `gerado em ${new Date(e.criado_em).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              {e.resumo?.conclusao && (
                <Badge variant="outline" className="shrink-0">
                  termina em {fmtBr(e.resumo.conclusao)}
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

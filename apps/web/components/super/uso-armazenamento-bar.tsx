'use client'

import { formatarBytes } from '@/lib/storage/formato'
import type { BucketUso } from '@/lib/storage/uso'

// Barra de uso estilo Google Drive: segmentos por categoria + legenda + "usado X de Y".
// Cores de data-viz FIXAS e distintas (o console /super é escopo neutro; isto é gráfico,
// não elemento de marca) — paleta acessível reaproveitável entre as barras.
const PALETA = ['#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#0ea5e9']

export function UsoArmazenamentoBar({ b, href }: { b: BucketUso; href?: (categoria: string) => string }) {
  const comLimite = b.limiteBytes != null && b.limiteBytes > 0
  const denominador = comLimite ? (b.limiteBytes as number) : Math.max(b.totalBytes, 1)
  const usadoPct = comLimite ? Math.min(100, (b.totalBytes / denominador) * 100) : 100
  const excedido = comLimite && b.totalBytes > (b.limiteBytes as number)
  const naoVazias = b.categorias.filter((c) => c.bytes > 0)

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold capitalize">{b.bucket}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {b.publico ? 'público' : 'privado'}
          </span>
          <span className="text-[11px] text-muted-foreground">{b.arquivos.toLocaleString('pt-BR')} arquivos</span>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className={`font-semibold ${excedido ? 'text-destructive' : 'text-foreground'}`}>{formatarBytes(b.totalBytes)}</span>
          {comLimite ? <> de {formatarBytes(b.limiteBytes)}</> : <span className="text-xs"> — sem limite definido</span>}
        </p>
      </div>

      {/* Trilha */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Uso do bucket ${b.bucket}`}>
        {naoVazias.map((c, i) => {
          const w = (c.bytes / denominador) * 100
          return (
            <div
              key={c.chave}
              title={`${c.label}: ${formatarBytes(c.bytes)}`}
              style={{ width: `${w}%`, backgroundColor: excedido && i === naoVazias.length - 1 ? 'var(--destructive)' : PALETA[i % PALETA.length] }}
              className="h-full first:rounded-l-full last:rounded-r-full"
            />
          )
        })}
      </div>
      {comLimite && (
        <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(usadoPct)}% do limite usado</p>
      )}

      {/* Legenda / atalhos por categoria */}
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {naoVazias.map((c, i) => {
          const conteudo = (
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PALETA[i % PALETA.length] }} />
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              <span className="shrink-0 text-muted-foreground">{formatarBytes(c.bytes)}</span>
            </span>
          )
          return (
            <li key={c.chave} className="text-sm">
              {href ? (
                <a href={href(c.chave)} className="-mx-1 block rounded px-1 py-0.5 transition-colors hover:bg-muted">{conteudo}</a>
              ) : (
                conteudo
              )}
            </li>
          )
        })}
        {naoVazias.length === 0 && <li className="text-sm text-muted-foreground">Bucket vazio.</li>}
      </ul>
    </div>
  )
}

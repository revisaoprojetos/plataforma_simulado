import { TIPOS_CONTEUDO, seloStyle, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import { cn } from '@/lib/utils'

/**
 * Selo do TIPO de conteúdo (DOC/PDF/PPT/XLS/VID/MP3). Cor = token fixo `--sel-*` (semântico por tipo,
 * igual em todo tenant). Presentacional puro (sem estado) → serve em listas client ou server.
 */
export function SeloTipo({
  kind,
  className,
  tamanho = 'md',
}: {
  kind: KindConteudo
  className?: string
  tamanho?: 'sm' | 'md'
}) {
  const t = TIPOS_CONTEUDO[kind]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md font-semibold tracking-wide',
        tamanho === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        className,
      )}
      style={seloStyle(kind)}
      title={t.label}
      aria-label={t.label}
    >
      {t.sigla}
    </span>
  )
}

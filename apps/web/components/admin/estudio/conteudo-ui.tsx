/**
 * Helpers de UI compartilhados pelo bloco Biblioteca do Estúdio de Conteúdo
 * (telas Biblioteca/BibliotecaPasta/Aulas/Arquivos). Puro/presentacional — sem hooks,
 * usável em componentes client. Cores via tokens (nunca hex); nunca ícone Sparkles.
 */

import {
  Folder, FileText, FileType, Presentation, FileSpreadsheet, Video, Music, type LucideIcon,
} from 'lucide-react'
import { TIPOS_CONTEUDO, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import { cn } from '@/lib/utils'

/** tipo_origem (docx|pdf|html|pptx|xlsx|video|audio) → KindConteudo dos selos. */
export function kindDeTipoOrigem(tipoOrigem: string): KindConteudo {
  switch (tipoOrigem) {
    case 'pdf': return 'pdf'
    case 'pptx': return 'pptx'
    case 'xlsx': return 'xlsx'
    case 'video': return 'video'
    case 'audio': return 'audio'
    default: return 'docx' // docx/html e desconhecidos → documento
  }
}

const ICONE_POR_KIND: Record<KindConteudo, LucideIcon> = {
  docx: FileText, pdf: FileType, pptx: Presentation, xlsx: FileSpreadsheet, video: Video, audio: Music,
}

/** Rótulo humano do tipo (pt-BR). */
export function rotuloTipo(tipoOrigem: string): string {
  return TIPOS_CONTEUDO[kindDeTipoOrigem(tipoOrigem)].label
}

/** Sigla curta (DOC/PDF/PPT/…). */
export function siglaTipo(tipoOrigem: string): string {
  return TIPOS_CONTEUDO[kindDeTipoOrigem(tipoOrigem)].sigla
}

/** Ícone quadrado de um item da lista (pasta ou documento), com cor da marca por token. */
export function IconeItem({
  kind, pasta, cor, className,
}: { kind?: string; pasta?: boolean; cor?: string | null; className?: string }) {
  if (pasta) {
    return (
      <span
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary', className)}
        style={cor ? { color: cor, backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)' } : undefined}
      >
        <Folder className="h-5 w-5" aria-hidden />
      </span>
    )
  }
  const Icone = ICONE_POR_KIND[kindDeTipoOrigem(kind ?? 'docx')]
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground', className)}>
      <Icone className="h-5 w-5" aria-hidden />
    </span>
  )
}

/** Pílula de uma tag (etiqueta). `onRemover` mostra o X. */
export function TagPill({ nome, cor, onRemover }: { nome: string; cor?: string | null; onRemover?: () => void }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
      style={cor ? { color: cor, backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)' } : undefined}
    >
      <span className="truncate">{nome}</span>
      {onRemover && (
        <button type="button" onClick={onRemover} aria-label={`Remover tag ${nome}`} className="-mr-0.5 opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  )
}

/** Rótulo "restrito" (acesso) quando o item não é liberado a todos. */
export function BadgeRestrito() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      Restrito
    </span>
  )
}

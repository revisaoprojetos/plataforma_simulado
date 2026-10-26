'use client'
import { useState } from 'react'
import { FileText, FileType, Presentation, Table2, Video, Music } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeloTipo } from './selo-tipo'
import { TIPOS_CONTEUDO, seloStyle, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

const ICONE: Record<KindConteudo, typeof FileText> = {
  docx: FileText, pdf: FileType, pptx: Presentation, xlsx: Table2, video: Video, audio: Music,
}
// Proporção da capa por tipo: papel (A4-ish), vídeo (16:9), áudio (4:3).
const ASPECTO: Record<KindConteudo, string> = {
  docx: 'aspect-[1/1.3]', pdf: 'aspect-[1/1.3]', pptx: 'aspect-[4/3]',
  xlsx: 'aspect-[4/3]', video: 'aspect-video', audio: 'aspect-[4/3]',
}

/**
 * Card de CONTEÚDO do redrive (seção "Documentos"). Capa (thumb) por tipo, selo do tipo, selo NOVO,
 * barra de progresso (aluno) e slot de ações (menu/botões). Presentacional — admin e aluno alimentam.
 */
export function CardConteudo({
  kind,
  titulo,
  subtitulo,
  capaUrl,
  progressoPct,
  novo,
  versao,
  pilulas,
  acoes,
  onClick,
  className,
}: {
  kind: KindConteudo
  titulo: string
  subtitulo?: React.ReactNode
  capaUrl?: string | null
  /** 0–100; mostra a barra fina no rodapé da capa (visão do aluno). */ progressoPct?: number | null
  novo?: boolean
  /** ex.: "v3" → mostra "Atualizado: v3". */ versao?: string | null
  pilulas?: React.ReactNode
  acoes?: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  const Icone = ICONE[kind]
  const tipo = TIPOS_CONTEUDO[kind]
  // Capa lazy pode dar 404 (não cacheada) → cai no placeholder do tipo, sem imagem quebrada.
  const [imgErro, setImgErro] = useState(false)
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all',
        onClick && 'cursor-pointer hover:border-primary/30 hover:shadow-md',
        className,
      )}
    >
      {/* Capa */}
      <div className={cn('relative w-full overflow-hidden bg-muted', ASPECTO[kind])}>
        {capaUrl && !imgErro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capaUrl} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setImgErro(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: `color-mix(in oklab, ${seloStyle(kind).color} 10%, var(--card))` }}>
            <Icone className="h-10 w-10 opacity-70" style={{ color: seloStyle(kind).color }} aria-hidden />
          </div>
        )}
        <div className="absolute left-2 top-2"><SeloTipo kind={kind} tamanho="sm" /></div>
        {novo && (
          <span className="absolute right-2 top-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow">NOVO</span>
        )}
        {typeof progressoPct === 'number' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/15">
            <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, progressoPct))}%` }} />
          </div>
        )}
      </div>
      {/* Rodapé */}
      <div className="flex min-w-0 flex-1 items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={titulo}>{titulo}</div>
          {subtitulo && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</div>}
          {versao && <div className="mt-0.5 text-[11px] text-muted-foreground">Atualizado: {versao}</div>}
          {pilulas && <div className="mt-1.5 flex flex-wrap gap-1">{pilulas}</div>}
          {!subtitulo && !pilulas && !versao && <div className="mt-0.5 truncate text-xs text-muted-foreground">{tipo.label}</div>}
        </div>
        {acoes && <div onClick={(e) => e.stopPropagation()} className="shrink-0">{acoes}</div>}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CheckSelecao } from './selecao-lote'

/**
 * Card de PASTA do redrive (seção "Pastas"). Presentacional: a cor vem do token da marca por padrão,
 * ou de `cor` (hex do tenant, ex.: pasta colorida). `pilulas` = modos de acesso; `acoes` = menu (…).
 * Card inteiro clicável (div, não button, p/ permitir o menu dentro sem HTML inválido).
 */
export function CardPasta({
  nome,
  cor,
  capaUrl,
  contagem,
  pilulas,
  acoes,
  onClick,
  className,
  selecao,
}: {
  nome: string
  cor?: string | null
  /** Capa da pasta (imagem do card). Sem ela, ícone de pasta na cor. */
  capaUrl?: string | null
  contagem?: string
  pilulas?: React.ReactNode
  acoes?: React.ReactNode
  onClick?: () => void
  className?: string
  /** Modo de seleção (admin): checkbox à esquerda; o clique no card alterna a seleção. */
  selecao?: { marcado: boolean; onToggle: (shift: boolean) => void; rotulo?: string; /** fora do modo de seleção: só mostra o ícone (hover) que ENTRA no modo ao clicar */ inativo?: boolean }
}) {
  const [imgErro, setImgErro] = useState(false)
  const inativo = !!selecao?.inativo
  const selAtiva = selecao && !inativo ? selecao : undefined
  return (
    <div
      onClick={selAtiva ? (e) => selAtiva.onToggle(e.shiftKey) : onClick}
      role={selAtiva ? 'checkbox' : onClick ? 'button' : undefined}
      aria-checked={selAtiva ? selAtiva.marcado : undefined}
      tabIndex={onClick || selAtiva ? 0 : undefined}
      onKeyDown={onClick || selAtiva ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (selAtiva) selAtiva.onToggle(e.shiftKey); else onClick?.() } } : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-all',
        (onClick || selAtiva) && 'cursor-pointer hover:border-primary/30 hover:shadow-md',
        selecao?.marcado && 'border-primary ring-2 ring-primary/60',
        className,
      )}
    >
      {selecao && <span className={cn('shrink-0', inativo && 'w-0 overflow-visible opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100')}><CheckSelecao marcado={selecao.marcado} onToggle={selecao.onToggle} rotulo={selecao.rotulo ?? `Selecionar pasta ${nome}`} className={inativo ? 'absolute left-1.5 top-1.5 z-10' : undefined} /></span>}
      {capaUrl && !imgErro ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={capaUrl} alt="" loading="lazy" onError={() => setImgErro(true)} className="h-14 w-11 shrink-0 rounded-lg border object-cover" />
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={cor ? { background: `color-mix(in oklab, ${cor} 16%, var(--card))`, color: cor } : undefined}
        >
          <Folder className={cn('h-5 w-5', !cor && 'text-primary')} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground" title={nome}>{nome}</div>
        {contagem && <div className="truncate text-xs text-muted-foreground">{contagem}</div>}
        {pilulas && <div className="mt-1 flex flex-wrap gap-1">{pilulas}</div>}
      </div>
      {acoes && <div onClick={(e) => e.stopPropagation()} className="shrink-0">{acoes}</div>}
    </div>
  )
}

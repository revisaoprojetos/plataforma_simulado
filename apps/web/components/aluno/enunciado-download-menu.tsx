'use client'

import type React from 'react'
import { MoreVertical, FileDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Baixa o "Enunciado de Questões" (PDF, já com ?download=<nome>.pdf) sem navegar/abrir inline. */
function baixarEnunciado(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Botão-ícone de download do "Caderno de questões (sem respostas)" — fica AO LADO do botão de
 * iniciar no card. Clica sem navegar (stopPropagation + preventDefault sobre o link do card).
 */
export function EnunciadoDownloadBotao({ url }: { url: string }) {
  function baixar(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    baixarEnunciado(url)
  }
  return (
    <button
      type="button"
      onClick={baixar}
      title="Baixar caderno de questões"
      aria-label="Baixar caderno de questões"
      className="pointer-events-auto flex w-[42px] shrink-0 items-center justify-center rounded-lg bg-black/45 text-white ring-1 ring-white/20 transition-colors hover:bg-black/65"
    >
      <FileDown className="h-4 w-4" />
    </button>
  )
}

/**
 * Menu de 3 pontos no card do simulado — permite ao aluno baixar o "Enunciado de Questões"
 * (PDF importado) ANTES de iniciar. Só é renderizado quando há URL (o card gate isso).
 * Fica ACIMA do link do card (z-20 + pointer-events-auto) para não navegar ao clicar.
 */
export function EnunciadoDownloadMenu({ url }: { url: string }) {
  function baixar() {
    // A URL já vem com ?download=<nome>.pdf → o navegador baixa direto (sem abrir inline).
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        title="Mais opções"
        aria-label="Mais opções"
        className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/45 text-white shadow-sm ring-1 ring-white/20 outline-none backdrop-blur transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={baixar}>
          <FileDown className="mr-2 h-4 w-4" /> Baixar enunciado
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

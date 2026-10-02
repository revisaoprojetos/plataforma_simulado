'use client'

import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

/**
 * Desafio de Jurisprudência (JurisClub) — jogo arcade de labirinto em canvas.
 *
 * O jogo é um app vanilla (DOM + canvas + WebAudio) auto-contido em `public/jurisprudencia/`.
 * Para preservar FIDELIDADE TOTAL (animações/efeitos/sons/pixel art, à risca) e isolar do
 * reconciliador do React, ele roda num <iframe> same-origin — assim o motor (`jogo.js`) fica
 * exatamente como no pacote e, por ser mesma origem, pode falar com as nossas rotas /api na
 * integração (progresso/ranking/conteúdo). Imersivo (fixed inset-0) como o runner do simulado.
 */
export function JurisprudenciaJogo({ desafioId }: { desafioId: string }) {
  const router = useRouter()
  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <iframe
        src={`/jurisprudencia/index.html?desafio=${encodeURIComponent(desafioId)}`}
        title="Desafio de Jurisprudência"
        className="h-full w-full border-0"
        allow="autoplay; fullscreen"
      />
      <button
        type="button"
        onClick={() => router.push('/aluno/jurisprudencia')}
        aria-label="Sair do desafio"
        title="Sair do desafio"
        className="absolute right-3 top-3 z-[61] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  )
}

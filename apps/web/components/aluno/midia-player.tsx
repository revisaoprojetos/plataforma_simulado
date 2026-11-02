'use client'

// PLAYER DE MÍDIA da Biblioteca (vídeo/áudio) — espelha o cabeçalho do LeitorBiblioteca (Voltar + título),
// mas em vez do iframe do leitor de PDF renderiza um player NATIVO. Largura cheia, tokens, dark/light.
// A URL é a assinada do arquivo ORIGINAL (gate feito server-side em carregarMidiaAluno).

import Link from 'next/link'
import { ArrowLeft, Download, Music, Video } from 'lucide-react'

export function MidiaPlayer({ titulo, url, kind, voltarHref }: {
  titulo: string; url: string | null; kind: 'video' | 'audio'; voltarHref: string
}) {
  const Icone = kind === 'video' ? Video : Music
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-auto bg-background">
      {/* Cabeçalho (mesmo esqueleto do leitor: Voltar + título) */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <Link
          href={voltarHref}
          aria-label="Voltar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Icone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground" title={titulo}>{titulo}</h1>
        {url && (
          <a
            href={url}
            download
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Baixar</span>
          </a>
        )}
      </header>

      {/* Corpo */}
      <div className="flex w-full flex-1 items-center justify-center bg-muted px-4 py-6">
        {!url ? (
          <div className="text-sm text-muted-foreground">Não foi possível carregar a mídia.</div>
        ) : kind === 'video' ? (
          <div className="mx-auto w-full max-w-5xl">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={url} controls preload="metadata" playsInline className="w-full rounded-2xl border bg-black" />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Music className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground" title={titulo}>{titulo}</div>
                <div className="text-xs text-muted-foreground">Áudio</div>
              </div>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={url} controls className="w-full" />
          </div>
        )}
      </div>
    </div>
  )
}

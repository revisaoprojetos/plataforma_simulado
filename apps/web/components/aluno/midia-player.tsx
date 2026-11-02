'use client'

// PLAYER DE MÍDIA da Biblioteca (vídeo/áudio) — espelha o cabeçalho do LeitorBiblioteca (Voltar + título),
// mas em vez do iframe do leitor de PDF renderiza um player NATIVO. Largura cheia, tokens, dark/light.
// A URL é a assinada do arquivo ORIGINAL (gate feito server-side em carregarMidiaAluno).
//
// CARREGAMENTO (feedback): este player é `fixed inset-0` e COBRE a topbar do portal, então a linha
// de carregamento global (<NavProgress/>, que vive na topbar) fica ATRÁS dele e some da vista.
// Por isso o player tem a SUA própria linha de topo: acende enquanto o vídeo/áudio carrega e enquanto
// o aluno volta (navProgressStart também liga a global, para o destino já entrar com a animação).

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, Download, Loader2, Music, Video } from 'lucide-react'
import { navProgressStart } from '@/lib/nav-progress'

export function MidiaPlayer({ titulo, url, kind, voltarHref }: {
  titulo: string; url: string | null; kind: 'video' | 'audio'; voltarHref: string
}) {
  const router = useRouter()
  const Icone = kind === 'video' ? Video : Music
  const [saindo, setSaindo] = useState(false)
  const [carregando, setCarregando] = useState(!!url) // mídia ainda não pôde tocar
  const [erro, setErro] = useState(false)

  function voltar() {
    if (saindo) return
    setSaindo(true)
    navProgressStart()      // acende a global também (destino entra já com a barra)
    router.push(voltarHref)
  }

  const prontoOuErro = () => setCarregando(false)
  const aoErrar = () => { setCarregando(false); setErro(true) }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-auto bg-background">
      {/* Linha de carregamento PRÓPRIA do player (a global fica atrás deste overlay em tela cheia).
          Desliza "pro lado" enquanto a mídia carrega ou enquanto o aluno volta. */}
      {(saindo || (carregando && !erro)) && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] overflow-hidden">
          <style>{`@keyframes mpg-move{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}`}</style>
          <span
            className="absolute top-0 h-full w-2/5 rounded"
            style={{
              background: 'linear-gradient(90deg,transparent,var(--gold,#F1C232),var(--brand,#8F75FF),transparent)',
              boxShadow: '0 0 12px 2px color-mix(in oklab,var(--gold,#F1C232) 60%,transparent)',
              animation: 'mpg-move 1.4s cubic-bezier(.45,0,.35,1) infinite',
            }}
          />
        </div>
      )}

      {/* Cabeçalho (mesmo esqueleto do leitor: Voltar + título) */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={voltar}
          disabled={saindo}
          aria-label="Voltar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
        >
          {saindo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeft className="h-5 w-5" />}
        </button>
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
          <div className="relative mx-auto w-full max-w-5xl">
            {/* Spinner por cima do vídeo até ele poder tocar */}
            {carregando && !erro && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/50 text-white">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm font-medium">Carregando vídeo…</span>
              </div>
            )}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              src={url}
              controls
              preload="metadata"
              playsInline
              onLoadedData={prontoOuErro}
              onCanPlay={prontoOuErro}
              onError={aoErrar}
              className="w-full rounded-2xl border bg-black"
            />
            {erro && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                Não foi possível carregar o vídeo. Tente baixar para assistir offline.
              </p>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                {carregando && !erro ? <Loader2 className="h-6 w-6 animate-spin" /> : <Music className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground" title={titulo}>{titulo}</div>
                <div className="text-xs text-muted-foreground">
                  {erro ? 'Falha ao carregar' : carregando ? 'Carregando áudio…' : 'Áudio'}
                </div>
              </div>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              src={url}
              controls
              preload="metadata"
              onLoadedData={prontoOuErro}
              onCanPlay={prontoOuErro}
              onError={aoErrar}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}

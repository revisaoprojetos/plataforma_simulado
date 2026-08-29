'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Library, FilePlus2, ChevronRight, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DRAFT_KEY } from '@/app/admin/simulados/criar/criar-context'

// Pop-up disparado por QUALQUER botão "Novo simulado". Duas escolhas:
//  1) Banco existente → criação atual (wizard intacto).
//  2) Gerar simulado  → a nova sequência página-por-página (/criar/personalizar).
// `trigger` é o botão do chamador (mantém o estilo de cada local) — base-ui injeta o clique.
export function NovoSimuladoDialog({ trigger, origem = 'aplicacao' }: { trigger: React.ReactElement; origem?: 'inicio' | 'aplicacao' }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  // Qual opção está carregando (navegação em andamento) — mostra o loader e trava o fechamento.
  const [carregando, setCarregando] = useState<'banco' | 'novo' | null>(null)

  function aoAbrir(v: boolean) {
    if (!v && carregando) return // não deixa fechar enquanto carrega
    setOpen(v)
    // Prefetch ao abrir: começa a compilar/baixar as rotas enquanto o usuário decide (abre mais rápido).
    if (v) {
      router.prefetch('/admin/simulados/criar/personalizar')
      router.prefetch('/admin/simulados/novo')
    }
  }

  // Mantém o pop-up ABERTO mostrando o loader durante a navegação (a rota pode demorar a compilar
  // no dev). O `startTransition` faz `carregando` valer até a página nova assumir (o modal some com ela).
  function escolher(key: 'banco' | 'novo', destino: string, limpar?: boolean) {
    if (carregando) return
    if (limpar) { try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* ignora */ } }
    setCarregando(key)
    startTransition(() => router.push(destino))
  }

  const OPCOES = [
    { key: 'banco' as const, icon: Library, titulo: 'Criar com um banco existente', desc: 'Aproveite um banco já pronto (questões e estudantes) e configure a aplicação.', cta: 'Continuar', destino: '/admin/simulados/novo', limpar: false },
    { key: 'novo' as const, icon: FilePlus2, titulo: 'Gerar simulado', desc: 'Monte do zero em etapas: personalização, questões, cadernos, estudantes e regras.', cta: 'Começar', destino: `/admin/simulados/criar/personalizar?de=${origem}`, limpar: true },
  ]

  return (
    <Dialog open={open} onOpenChange={aoAbrir}>
      <DialogTrigger render={trigger} />
      <DialogContent showCloseButton={!carregando} className="overflow-hidden p-0 sm:max-w-xl">
        {/* Cabeçalho com faixa sutil da marca. */}
        <div className="relative border-b bg-gradient-to-br from-primary/[0.07] to-transparent px-6 pt-6 pb-5">
          <DialogTitle className="text-lg font-bold tracking-tight">Novo simulado</DialogTitle>
          <DialogDescription className="mt-0.5">{carregando ? 'Abrindo…' : 'Como você quer começar?'}</DialogDescription>
        </div>

        {carregando ? (
          <div className="animate-in fade-in-0 flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Preparando…</p>
              <p className="text-xs text-muted-foreground">{carregando === 'banco' ? 'Abrindo a criação com banco existente.' : 'Abrindo o gerador de simulado.'}</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3.5 p-5 sm:grid-cols-2">
            {OPCOES.map((op, i) => {
              const Icone = op.icon
              return (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => escolher(op.key, op.destino, op.limpar)}
                  style={{ animationDelay: `${80 + i * 70}ms` }}
                  className="animate-rise group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm outline-none transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {/* wash da marca no hover */}
                  <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  {/* marca d'água do ícone no canto */}
                  <Icone aria-hidden className="pointer-events-none absolute -right-3 -top-3 h-20 w-20 text-primary/5 transition-all duration-500 group-hover:scale-110 group-hover:text-primary/[0.09]" />
                  {/* badge do ícone */}
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-md shadow-primary/25 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
                    <Icone className="h-5 w-5" />
                  </span>
                  <span className="relative space-y-1">
                    <span className="block font-semibold leading-tight">{op.titulo}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{op.desc}</span>
                  </span>
                  <span className="relative mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold text-primary">
                    {op.cta} <ChevronRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, Loader2, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { STEPS, primeiraIncompleta, stepCompleta, useCriar } from './criar-context'

const MENSAGENS: Record<string, string> = {
  personalizar: 'Preencha o nome do banco, o nome do simulado (mín. 3 letras) e o tipo.',
  regras: 'Confira a aplicação: janela fixa exige início e fim; prazo relativo exige o prazo.',
}

export function CriarStepper() {
  const { draft, reset } = useCriar()
  const router = useRouter()
  const pathname = usePathname()
  const [salvando, setSalvando] = useState(false)

  const slugAtual = (pathname.split('/').pop() || 'personalizar') as (typeof STEPS)[number]['slug']
  const idx = Math.max(0, STEPS.findIndex((s) => s.slug === slugAtual))
  const teto = primeiraIncompleta(draft)
  const ultima = idx === STEPS.length - 1

  function irPara(i: number) {
    if (i < 0 || i >= STEPS.length) return
    router.push(`/admin/simulados/criar/${STEPS[i].slug}`)
  }

  function avancar() {
    if (!stepCompleta(draft, slugAtual)) {
      toast.error(MENSAGENS[slugAtual] ?? 'Complete esta etapa antes de avançar.')
      return
    }
    irPara(idx + 1)
  }

  async function criar() {
    // Revalida tudo até o fim.
    const t = primeiraIncompleta(draft)
    if (t < STEPS.length - 1) {
      toast.error('Ainda há etapas pendentes.')
      irPara(t)
      return
    }
    setSalvando(true)
    try {
      // Import dinâmico: a ação pesada (cria banco+simulado) só é carregada ao clicar "Criar".
      const { criarSimuladoCompletoAction } = await import('./salvar')
      const r = await criarSimuladoCompletoAction(draft as any)
      if (r?.error || !r?.simuladoId) {
        toast.error(r?.error ?? 'Não foi possível criar o simulado.')
        return
      }
      const id = r.simuladoId
      reset() // limpa o rascunho ANTES de navegar (evita re-submit no back)
      toast.success('Simulado criado como rascunho.')
      router.push(`/admin/simulados/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o simulado.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Trilha de etapas */}
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {STEPS.map((s, i) => {
          const feito = i < idx && stepCompleta(draft, s.slug)
          const ativo = i === idx
          const acessivel = i <= teto || i <= idx
          return (
            <li key={s.slug} className="flex items-center">
              <button
                type="button"
                onClick={() => acessivel && irPara(i)}
                disabled={!acessivel}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                  ativo
                    ? 'border-primary bg-primary/10 text-primary'
                    : feito
                      ? 'border-transparent bg-muted text-foreground hover:bg-muted/70'
                      : 'border-transparent text-muted-foreground',
                  !acessivel && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                    ativo ? 'bg-primary text-primary-foreground' : feito ? 'bg-emerald-500 text-white' : 'bg-muted-foreground/20 text-muted-foreground',
                  )}
                >
                  {feito ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
            </li>
          )
        })}
      </ol>

      {/* Voltar / Avançar / Criar — NO TOPO */}
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => irPara(idx - 1)} disabled={idx === 0 || salvando}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
        {ultima ? (
          <Button size="sm" onClick={criar} disabled={salvando} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            Criar simulado
          </Button>
        ) : (
          <Button size="sm" onClick={avancar} disabled={salvando}>
            Avançar <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

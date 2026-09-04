'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCriar } from './criar-context'
import { SecaoPersonalizar } from './secao-personalizar'
import { SecaoEstrutura } from './secao-estrutura'
import { SecaoMontagem } from './secao-montagem'
import { SecaoMetas } from './secao-metas'
import { SecaoLinks } from './secao-links'
import { SecaoAcessos } from './secao-acessos'
import { PreviaViva } from './previa-viva'

export default function CriarCronogramaPage() {
  const { draft, patch, reset } = useCriar()
  const router = useRouter()
  const [salvando, setSalvando] = useState(false)

  const valido =
    draft.nome.trim().length >= 3 &&
    draft.cargaHoraria > 0 &&
    Number.isInteger(draft.totalSemanas) &&
    draft.totalSemanas >= 1 &&
    draft.diasCurso.length >= 1

  async function criar() {
    if (!valido) {
      toast.error('Preencha o nome (3+ letras) e a estrutura (carga, semanas e ao menos um dia).')
      return
    }
    setSalvando(true)
    try {
      const { criarCronogramaCompletoAction } = await import('./salvar')
      const r = await criarCronogramaCompletoAction(draft)
      if (r?.error || !r?.id) {
        toast.error(r?.error ?? 'Não foi possível criar o cronograma.')
        return
      }
      const id = r.id
      reset()
      toast.success('Cronograma criado como rascunho.')
      router.push(`/admin/cronogramas/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar o cronograma.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    // lg: ocupa a altura do painel e NÃO rola por fora — cada coluna rola por dentro.
    // Abaixo de lg cai no fluxo normal (a página rola), que é o esperado no mobile.
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-7rem)]">
      {/* Barra de ação. */}
      <div className="sticky top-2 z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/80 lg:static">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">Novo cronograma</h1>
          <p className="text-xs text-muted-foreground">Edite à esquerda, veja a prévia ao vivo à direita. Nasce como rascunho.</p>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            title={draft.metas.length ? 'Já fica visível para quem tem acesso' : 'Aplique as metas (seção Conteúdos) para poder publicar'}
          >
            <input
              type="checkbox"
              checked={draft.liberar}
              onChange={(e) => patch({ liberar: e.target.checked })}
              disabled={!draft.metas.length}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            Publicar já
          </label>
          <Button onClick={criar} disabled={salvando} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            Criar cronograma
          </Button>
        </div>
      </div>

      {/* 2 colunas, cada uma um CARD único com rolagem interna; as seções ficam separadas por
          divisória (sem card individual). A linha 1fr faz o grid preencher a altura disponível. */}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-1">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
            <SecaoPersonalizar />
            <SecaoEstrutura />
            <SecaoMontagem />
            <SecaoMetas />
            <SecaoLinks />
            <SecaoAcessos />
          </div>
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <PreviaViva />
          </div>
        </div>
      </div>
    </div>
  )
}

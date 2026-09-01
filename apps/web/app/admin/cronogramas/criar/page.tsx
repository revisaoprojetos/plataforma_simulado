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
    <div className="space-y-4">
      {/* Barra de ação fixa — tudo se cria daqui, sem etapas. */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 p-3 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/80">
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight">Novo cronograma</h1>
          <p className="text-xs text-muted-foreground">Preencha as seções abaixo e crie — tudo em uma página. Nasce como rascunho.</p>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
            title={draft.metas.length ? 'Já fica visível para quem tem acesso' : 'Adicione ao menos uma meta para poder publicar'}
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

      <SecaoPersonalizar />
      <SecaoEstrutura />
      <SecaoMontagem />
      <SecaoMetas />
      <SecaoLinks />
      <SecaoAcessos />
    </div>
  )
}

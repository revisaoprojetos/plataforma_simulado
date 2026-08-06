'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Save, Loader2, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Loader, ESTILOS_LOADER, type EstiloLoader } from '@/components/admin/loaders'

export function CarregamentoForm({ estiloInicial, animacaoInicial = true, salvarTema }: { estiloInicial: EstiloLoader; animacaoInicial?: boolean; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [estilo, setEstilo] = useState<EstiloLoader>(estiloInicial)
  const [animacao, setAnimacao] = useState(animacaoInicial)
  const [pending, start] = useTransition()
  const [savingAnim, startAnim] = useTransition()

  function salvar() {
    start(async () => {
      try { await salvarTema({ loading_estilo: estilo }); toast.success('Estilo de carregamento salvo!') }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  // Toggle salva na hora → dá para testar ligando/desligando sem procurar botão.
  function alternarAnimacao(v: boolean) {
    setAnimacao(v)
    startAnim(async () => {
      try { await salvarTema({ animacao_entrada: v }); toast.success(v ? 'Animação de entrada ligada' : 'Animação de entrada desligada') }
      catch (err) { setAnimacao(!v); toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  return (
    <div className="space-y-6">
      {/* Toggle da animação de entrada (cascata dos cards). */}
      <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4 cursor-pointer">
        <span className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><Sparkles className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Animação de entrada dos elementos</p>
          <p className="text-xs text-muted-foreground">Os cards surgem em cascata (de cima para baixo, esquerda → direita) a cada página. Desligue para os elementos aparecerem instantâneos.</p>
        </div>
        <Switch checked={animacao} onCheckedChange={alternarAnimacao} disabled={savingAnim} />
      </label>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Escolha do estilo */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Estilo da tela de carregamento</p>
          <div className="grid grid-cols-2 gap-2">
            {ESTILOS_LOADER.map((e) => (
              <button key={e.id} type="button" onClick={() => setEstilo(e.id)}
                className={cn('relative rounded-lg border-2 p-3 text-left text-sm transition-colors', estilo === e.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50')}>
                {estilo === e.id && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                <span className="font-medium">{e.nome}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={salvar} disabled={pending}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>

        {/* Prévia ao vivo */}
        <div className="rounded-xl border bg-muted/30 p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia</p>
          <div className="rounded-lg border bg-background p-5">
            <Loader key={estilo} estilo={estilo} />
          </div>
        </div>
      </div>
    </div>
  )
}

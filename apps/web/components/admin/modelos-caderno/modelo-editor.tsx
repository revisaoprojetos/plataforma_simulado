'use client'

import { Component, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, Save, Loader2, LayoutTemplate } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { Previa } from '@/lib/caderno-teste/previa'
import { presetDoItem, metaDaModalidade, type ItemCaderno, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { salvarModelo } from '@/app/admin/modelos-caderno/actions'

/** Questões de EXEMPLO — um modelo é sobre layout/estilo, não sobre questões reais. */
const SAMPLE: PreviewQuestao[] = Array.from({ length: 6 }, (_, i) => ({
  id: `ex-${i + 1}`, numero: i + 1, tipo: 'objetiva',
  enunciado: `Questão de exemplo ${i + 1}: este é um enunciado ilustrativo para pré-visualizar o layout do modelo. As questões reais entram quando o modelo é usado num simulado.`,
  alternativas: ['A', 'B', 'C', 'D', 'E'].map((l, j) => ({ letra: l, texto: `Alternativa ${l} de exemplo.`, correta: j === 1, comentario: j === 1 ? 'Comentário de exemplo da alternativa correta.' : '' })),
}))

class Boundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state: { erro: Error | null } = { erro: null }
  static getDerivedStateFromError(erro: Error) { return { erro } }
  render() {
    if (this.state.erro) return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-destructive">
          <p className="text-sm font-semibold">Erro ao renderizar a prévia do modelo.</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-left text-xs">{String(this.state.erro?.message ?? this.state.erro)}</pre>
        </div>
        <button type="button" onClick={() => this.setState({ erro: null })} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Tentar de novo</button>
      </div>
    )
    return this.props.children
  }
}

export function ModeloEditor({ id, nomeInicial, configInicial }: { id: string; nomeInicial: string; configInicial: unknown }) {
  const router = useRouter()
  const cfg = (configInicial ?? {}) as { item?: ItemCaderno }
  const [item] = useState<ItemCaderno | null>(cfg?.item ?? null)
  const [nome, setNome] = useState(nomeInicial)
  const baselineRef = useRef(JSON.stringify({ nome: nomeInicial, item: cfg?.item ?? null }))
  const [, bump] = useState(0)
  const [pending, start] = useTransition()

  const sujo = JSON.stringify({ nome, item }) !== baselineRef.current
  const preset = item ? presetDoItem(item) : undefined
  const meta = item ? metaDaModalidade(item.modalidade) : null
  const modeloNome = item ? (meta?.modelos.find((m) => m.id === item.modelo)?.nome ?? item.modelo) : ''

  function salvar() {
    if (!item) return
    start(async () => {
      const r = await salvarModelo(id, { nome: nome.trim() || 'Modelo', config: { v: 1, item }, modalidade: item.modalidade })
      if (r.ok) { baselineRef.current = JSON.stringify({ nome, item }); bump((x) => x + 1); toast.success('Modelo salvo') }
      else toast.error(r.error ?? 'Erro ao salvar')
    })
  }
  async function sair() { router.push('/admin/modelos-caderno') }

  return (
    <div className="-m-6 flex h-screen flex-col overflow-hidden bg-background">
      <div className="relative z-30 flex items-center justify-between gap-3 border-b bg-card/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={sair} title="Voltar" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="h-5 w-5" /></button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutTemplate className="h-4 w-4" /></span>
          <div className="min-w-0">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do modelo"
              className="w-full max-w-sm rounded-md border-transparent bg-transparent px-1 text-base font-bold leading-tight outline-none hover:border-border focus:border-border focus:bg-background" />
            <p className="truncate px-1 text-xs text-muted-foreground">{meta ? `${meta.nome} · ${modeloNome}` : 'Modelo'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('hidden items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium sm:inline-flex', sujo ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', sujo ? 'bg-amber-500' : 'bg-emerald-500')} />
            {sujo ? 'Não salvo' : 'Salvo'}
          </span>
          <Button onClick={salvar} disabled={pending || !item} size="sm">{pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Salvar</Button>
        </div>
      </div>

      <div className="scroll-claro relative min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,theme(colors.slate.300)_1px,transparent_1px)] [background-size:18px_18px] px-3 py-5 dark:bg-[radial-gradient(circle,theme(colors.slate.700)_1px,transparent_1px)]">
        <Boundary>
          {item ? (
            <div key={`${item.modalidade}:${item.modelo}`} className="mx-auto" style={{ zoom: 0.7 } as Record<string, unknown>}>
              {preset ? (
                <PreviaBlocos presetId={preset} questoes={SAMPLE} vars={{}} titulo={item.ajustes.titulo} capaUrl={item.ajustes.capaUrl} ultimaUrl={item.ajustes.ultimaUrl} folhaUrl={item.ajustes.folhaUrl} cabecalhoUrl={item.ajustes.cabecalhoUrl} rodapeUrl={item.ajustes.rodapeUrl} margemTopo={item.ajustes.margemTopo} margemBase={item.ajustes.margemBase} capa={item.capa} docOverride={item.docEdit} />
              ) : (
                <Previa item={item} questoes={SAMPLE} vars={{}} discBanco={[]} />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">Modelo sem conteúdo.</div>
          )}
        </Boundary>
        {/* Nota: a edição por blocos/campos entra na próxima etapa deste editor. */}
        <div className="pointer-events-none sticky bottom-2 z-20 mx-auto mt-3 w-fit rounded-full border bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          Prévia com questões de exemplo · edição por blocos em breve
        </div>
      </div>
    </div>
  )
}

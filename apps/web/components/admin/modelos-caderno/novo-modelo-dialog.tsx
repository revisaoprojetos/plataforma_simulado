'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Loader2, Sparkles, LayoutTemplate, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PreviaBlocos, docDoPreset, idsDeterministicos } from '@/lib/caderno-teste/previa-blocos'
import { Previa } from '@/lib/caderno-teste/previa'
import { MODALIDADES, modelosVisiveis, novoItem, novoItemVazio, presetDoModelo, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { criarModeloComConfig } from '@/app/admin/modelos-caderno/actions'
import { MODALIDADE_META } from './modelo-card'

const SAMPLE: PreviewQuestao[] = Array.from({ length: 4 }, (_, i) => ({
  id: `ex-${i + 1}`, numero: i + 1, tipo: 'objetiva',
  enunciado: `Questão de exemplo ${i + 1} — enunciado ilustrativo do layout.`,
  alternativas: ['A', 'B', 'C', 'D', 'E'].map((l, j) => ({ letra: l, texto: `Alternativa ${l}.`, correta: j === 1, comentario: j === 1 ? 'Comentário de exemplo.' : '' })),
}))

/** Cria um modelo: do zero OU a partir de um modelo padrão (com prévia + "Salvar como" editável). */
export function NovoModeloDialog({ pastaAtual, modoInicial = 'padrao', modalidadeInicial = 'folha_respostas', modeloInicial, onClose }: {
  pastaAtual: string | null
  modoInicial?: 'zero' | 'padrao'
  modalidadeInicial?: Modalidade
  modeloInicial?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'zero' | 'padrao'>(modoInicial)
  const [modalidade, setModalidade] = useState<Modalidade>(modalidadeInicial)
  const meta = useMemo(() => MODALIDADES.find((m) => m.id === modalidade) ?? MODALIDADES[0], [modalidade])
  const visiveis = useMemo(() => modelosVisiveis(modalidade), [modalidade])
  const [modeloId, setModeloId] = useState(modeloInicial ?? modelosVisiveis(modalidadeInicial)[0]?.id ?? meta.modelos[0].id)
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()

  const modeloSel = visiveis.find((m) => m.id === modeloId) ?? visiveis[0] ?? meta.modelos[0]
  const previewItem = useMemo(() => {
    if (modo === 'zero') return null
    const it = novoItem(modalidade, modeloId)
    const preset = presetDoModelo(modalidade, modeloId)
    if (preset && !it.docEdit) it.docEdit = idsDeterministicos(docDoPreset(preset)!)
    return it
  }, [modo, modalidade, modeloId])
  const previewPreset = previewItem ? presetDoModelo(previewItem.modalidade, previewItem.modelo) : undefined

  function trocarModalidade(m: Modalidade) {
    setModalidade(m)
    setModeloId(modelosVisiveis(m)[0]?.id ?? '')
  }

  function criar() {
    start(async () => {
      const nomeFinal = nome.trim() || (modo === 'zero' ? 'Novo modelo' : modeloSel.nome)
      let config: unknown, mod: Modalidade, origem: string
      if (modo === 'zero') {
        const it = novoItemVazio(); config = { v: 1, item: it, origem: 'zero' }; mod = it.modalidade; origem = 'zero'
      } else {
        const it = novoItem(modalidade, modeloId)
        const preset = presetDoModelo(modalidade, modeloId)
        if (preset && !it.docEdit) it.docEdit = idsDeterministicos(docDoPreset(preset)!)
        else if (it.docEdit) it.docEdit = idsDeterministicos(it.docEdit)
        config = { v: 1, item: it, origem: 'padrao_copia', padraoRef: { modalidade, modeloId } }; mod = modalidade; origem = 'padrao_copia'
      }
      const r = await criarModeloComConfig(nomeFinal, config, mod, origem, pastaAtual)
      if (r.ok && r.id) { toast.success('Modelo criado'); router.push(`/admin/modelos-caderno/${r.id}`) }
      else toast.error(r.error ?? 'Erro ao criar')
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><LayoutTemplate className="h-4 w-4" /> Novo modelo de caderno</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {/* Modo */}
        <div className="flex gap-2 border-b px-5 py-3">
          <ModoBtn ativo={modo === 'padrao'} onClick={() => setModo('padrao')} icon={<LayoutTemplate className="h-4 w-4" />} titulo="A partir de um modelo padrão" sub="Escolha um modelo pronto e edite" />
          <ModoBtn ativo={modo === 'zero'} onClick={() => setModo('zero')} icon={<Sparkles className="h-4 w-4" />} titulo="Do zero" sub="Comece com um canvas em branco" />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
          {/* Seletor */}
          <div className="scroll-claro min-h-0 overflow-y-auto border-r p-3">
            {modo === 'padrao' ? (
              <>
                <div className="mb-2 grid grid-cols-2 gap-1.5">
                  {MODALIDADES.map((m) => {
                    const Icone = MODALIDADE_META[m.id]?.icon ?? LayoutTemplate
                    return (
                      <button key={m.id} type="button" onClick={() => trocarModalidade(m.id)} className={cn('flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] font-medium transition-colors', modalidade === m.id ? 'border-primary bg-primary/5 text-primary' : 'hover:border-primary/40')}>
                        <Icone className="h-3.5 w-3.5 shrink-0" /> <span className="min-w-0 truncate">{m.nome}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-1">
                  {visiveis.map((m) => (
                    <button key={m.id} type="button" onClick={() => setModeloId(m.id)} className={cn('flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors', modeloId === m.id ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
                      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', modeloId === m.id ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>{modeloId === m.id && <Check className="h-3 w-3" />}</span>
                      <span className="min-w-0"><span className="block text-[13px] font-semibold leading-tight">{m.nome}</span><span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{m.descricao}</span></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">Canvas em branco</p>
                <p className="text-xs text-muted-foreground">Você monta o modelo do zero adicionando blocos pelo painel de Estrutura.</p>
              </div>
            )}
          </div>

          {/* Prévia */}
          <div className="scroll-claro min-h-0 overflow-auto bg-muted/20 p-4">
            {previewItem ? (
              <div className="mx-auto w-fit" style={{ zoom: 0.34 } as Record<string, unknown>}>
                {previewPreset ? (
                  <PreviaBlocos presetId={previewPreset} questoes={SAMPLE} vars={{}} titulo={previewItem.ajustes.titulo} docOverride={previewItem.docEdit} capa={previewItem.capa} />
                ) : (
                  <Previa item={previewItem} questoes={SAMPLE} vars={{}} discBanco={[]} />
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed bg-background/40 p-8 text-center text-sm text-muted-foreground">
                <div><LayoutTemplate className="mx-auto mb-2 h-8 w-8 opacity-40" /> Comece do zero — a prévia aparece conforme você adiciona blocos no editor.</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={modo === 'zero' ? 'Nome do modelo (opcional)' : `Nome (padrão: ${modeloSel.nome})`}
            className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30" />
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Cancelar</button>
          <button type="button" onClick={criar} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {modo === 'zero' ? 'Criar' : 'Salvar como editável'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ModoBtn({ ativo, onClick, icon, titulo, sub }: { ativo: boolean; onClick: () => void; icon: ReactNode; titulo: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex flex-1 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors', ativo ? 'border-primary bg-primary/5' : 'hover:border-primary/40')}>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{icon}</span>
      <span className="min-w-0"><span className="block text-[13px] font-semibold leading-tight">{titulo}</span><span className="block truncate text-[11px] text-muted-foreground">{sub}</span></span>
    </button>
  )
}

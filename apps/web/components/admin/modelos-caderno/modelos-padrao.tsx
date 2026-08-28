'use client'

import { useState } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PreviaBlocos, docDoPreset, idsDeterministicos } from '@/lib/caderno-teste/previa-blocos'
import { Previa } from '@/lib/caderno-teste/previa'
import { MODALIDADES, novoItem, presetDoModelo, type Modalidade, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { MODALIDADE_META } from './modelo-card'
import { NovoModeloDialog } from './novo-modelo-dialog'

const SAMPLE: PreviewQuestao[] = Array.from({ length: 3 }, (_, i) => ({
  id: `ex-${i + 1}`, numero: i + 1, tipo: 'objetiva',
  enunciado: `Questão de exemplo ${i + 1}.`,
  alternativas: ['A', 'B', 'C', 'D', 'E'].map((l, j) => ({ letra: l, texto: `Alternativa ${l}.`, correta: j === 1, comentario: '' })),
}))

/** Seção somente-leitura com os MODELOS PADRÃO (hardcoded em MODALIDADES). Clique → prévia + "Salvar como". */
export function ModelosPadrao({ pastaAtual }: { pastaAtual: string | null }) {
  const [abrir, setAbrir] = useState<{ modalidade: Modalidade; modeloId: string } | null>(null)
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Modelos prontos do sistema (não editáveis). Clique num modelo para pré-visualizar e <strong>salvar uma cópia editável</strong> na sua biblioteca.</p>
      {MODALIDADES.map((mod) => {
        const Icone = MODALIDADE_META[mod.id]?.icon ?? LayoutTemplate
        return (
          <section key={mod.id}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
              <h3 className="text-sm font-semibold">{mod.nome}</h3>
              <span className="hidden text-xs text-muted-foreground sm:inline">· {mod.descricao}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {mod.modelos.map((m) => <PadraoCard key={m.id} modalidade={mod.id} modeloId={m.id} nome={m.nome} descricao={m.descricao} onClick={() => setAbrir({ modalidade: mod.id, modeloId: m.id })} />)}
            </div>
          </section>
        )
      })}
      {abrir && <NovoModeloDialog pastaAtual={pastaAtual} modoInicial="padrao" modalidadeInicial={abrir.modalidade} modeloInicial={abrir.modeloId} onClose={() => setAbrir(null)} />}
    </div>
  )
}

function PadraoCard({ modalidade, modeloId, nome, descricao, onClick }: { modalidade: Modalidade; modeloId: string; nome: string; descricao: string; onClick: () => void }) {
  // Miniatura ao vivo (1ª página do modelo). Preset → PreviaBlocos; senão (classico/diagnóstico) → Previa.
  const item = novoItem(modalidade, modeloId)
  const preset = presetDoModelo(modalidade, modeloId)
  if (preset && !item.docEdit) item.docEdit = idsDeterministicos(docDoPreset(preset)!)
  return (
    <button type="button" onClick={onClick} title={descricao}
      className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      {/* Miniatura */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[repeating-linear-gradient(45deg,theme(colors.muted.DEFAULT),theme(colors.muted.DEFAULT)_10px,transparent_10px,transparent_20px)]">
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 origin-top" style={{ zoom: 0.16 } as Record<string, unknown>}>
          {preset ? (
            <PreviaBlocos presetId={preset} questoes={SAMPLE} vars={{}} titulo={item.ajustes.titulo} docOverride={item.docEdit} capa={item.capa} />
          ) : (
            <Previa item={item} questoes={SAMPLE} vars={{}} discBanco={[]} />
          )}
        </div>
        <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
        <span className={cn('absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground opacity-0 shadow transition-opacity group-hover:opacity-100')}>Salvar como</span>
      </div>
      {/* Rótulo */}
      <div className="shrink-0 border-t px-2.5 py-2">
        <p className="line-clamp-1 text-[13px] font-semibold leading-tight">{nome}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{descricao}</p>
      </div>
    </button>
  )
}

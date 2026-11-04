'use client'

// PRÉVIA (pop-up) de como o aluno VÊ o conteúdo do produto em cada formato de exibição.
// Reusa o componente REAL do aluno (ModulosVitrine) com módulos de EXEMPLO — demonstração fiel.
// O container é pointer-events-none (nada navega; é só a demonstração).
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { VITRINE_LAYOUTS, type VitrineLayout } from '@/lib/produtos/tipos'
import { ModulosVitrine } from '@/app/aluno/(portal)/extensivos/[slug]/curriculo'
import type { ModuloAluno, AulaAluno } from '@/lib/produtos/curriculo-aluno'
import type { TipoRef } from '@/lib/produtos/curriculo'

const aula = (id: string, titulo: string, lida: boolean, liberada = true, tipoRef: TipoRef = 'documento_biblioteca'): AulaAluno => ({
  id, titulo, subtipo: null, tipoRef, href: '#', externo: false, liberada, liberaEm: null, lida, exclusivo: false,
})
const modulo = (id: string, titulo: string, aulas: AulaAluno[], over: Partial<ModuloAluno> = {}): ModuloAluno => ({
  id, titulo, descricao: null, imagemUrl: null, aberto: true, liberado: true, liberaEm: null, exclusivo: false,
  aulas, submodulos: [], ...over,
})

// Exemplo variado: módulos concluídos, em andamento, bloqueado por data e exclusivo — p/ mostrar os estados.
const MODULOS_PREVIA: ModuloAluno[] = [
  modulo('pv1', 'LegProc - Direito Constitucional', [aula('a1', 'Princípios fundamentais', true, true, 'video_url'), aula('a2', 'Direitos e garantias', true), aula('a3', 'Simulado do módulo', true, true, 'simulado')]),
  modulo('pv2', 'LegProc - Direito Administrativo', [aula('a4', 'Atos administrativos', true, true, 'video_url'), aula('a5', 'Licitações', false), aula('a6', 'Improbidade', false)]),
  modulo('pv3', 'Jurisprudência do STF', [aula('a7', 'Informativo comentado', false), aula('a8', 'Quiz de fixação', false, true, 'quiz')]),
  modulo('pv4', 'Simulados da banca', [aula('a9', 'Simulado dirigido 1', false, false)], { liberado: false, liberaEm: '2026-12-01' }),
  modulo('pv5', 'Revisão final (turbo)', [aula('a10', 'Mapa de revisão', false, false)], { liberado: false, exclusivo: true }),
]

export function PreviaFormatoVitrine({ inicial, cor, onClose }: { inicial: VitrineLayout; cor: string | null; onClose: () => void }) {
  const [layout, setLayout] = useState<VitrineLayout>(inicial)
  const corDemo = cor || 'var(--brand-primary, var(--primary))'
  const info = VITRINE_LAYOUTS.find((l) => l.v === layout)
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="max-h-[90vh] overflow-hidden sm:max-w-4xl">
        <DialogTitle>Prévia da exibição — visão do aluno</DialogTitle>

        {/* Troca de formato dentro do pop-up (começa no formato clicado) */}
        <div className="flex flex-wrap gap-2">
          {VITRINE_LAYOUTS.map((l) => (
            <button key={l.v} type="button" onClick={() => setLayout(l.v)}
              className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors', l.v === layout ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}>
              {l.label}
            </button>
          ))}
        </div>
        {info && <p className="-mt-1 text-xs text-muted-foreground">{info.descricao}</p>}

        {/* Demonstração real (módulos de exemplo). pointer-events-none = nada navega. */}
        <div className="max-h-[62vh] overflow-auto rounded-2xl border bg-muted/30 p-4">
          <div className="pointer-events-none select-none">
            <ModulosVitrine modulos={MODULOS_PREVIA} slug="previa" cor={corDemo} layout={layout} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Conteúdo ilustrativo. Os módulos e capas reais são os que você montou na aba Conteúdos.</p>
      </DialogContent>
    </Dialog>
  )
}

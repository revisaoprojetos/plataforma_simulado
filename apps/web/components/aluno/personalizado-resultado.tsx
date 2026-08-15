'use client'

import { useTheme } from 'next-themes'
import { RevisaoFinal } from '@/components/aluno/revisao-final'
import { efetivarHud } from '@/lib/caderno-designer/types'
import { hudCssVars } from '@/lib/caderno-designer/hud'

/**
 * Overlay full-screen com o RESULTADO de um simulado PESSOAL — reusa a MESMA tela do simulado
 * oficial (RevisaoFinal), que busca /api/sessoes/resultado pela sessão. Usado tanto pelo runner
 * (ao finalizar) quanto pela rota /personalizados/[id]/resultado (ver depois).
 *
 * - Fundo OPACO (bg-background): a raiz do RevisaoFinal tem gradiente translúcido (to-muted/30) que,
 *   numa página alta, deixava a área "Meus simulados" do portal vazar por trás.
 * - Fita/acentos no ROXO da marca (--brand-primary), IGUAL à área do simulado (o runner usa
 *   `from-primary via-primary to-primary/30`), no lugar do arco-íris padrão do FitaTopo.
 * - Caminhos do topo iguais ao oficial: Início da plataforma → /aluno; Refazer → a HUD deste pessoal.
 */
export function PersonalizadoResultado({ sessaoId, simuladoId }: { sessaoId: string; simuladoId: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
      style={{
        ...hudCssVars(efetivarHud(undefined, undefined, 'encerrada'), dark),
        ['--primary' as any]: 'var(--brand-primary)',
        ['--prova-fita1' as any]: 'var(--brand-primary)',
        ['--prova-fita2' as any]: 'var(--brand-primary)',
        ['--prova-fita3' as any]: 'color-mix(in oklab, var(--brand-primary) 30%, transparent)',
      } as any}
    >
      <RevisaoFinal
        sessionToken={sessaoId}
        voltarUrl="/aluno/simulados?aba=personalizados"
        simuladosUrl="/aluno"
        inicioUrl={`/aluno/simulados/personalizados/${simuladoId}/fazer`}
        dark={dark}
        onToggleDark={() => setTheme(dark ? 'light' : 'dark')}
      />
    </div>
  )
}

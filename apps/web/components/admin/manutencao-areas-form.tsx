'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wrench, Loader2, ShieldAlert, PenLine, ClipboardList, BookOpen, Database, BarChart3, Trophy, GraduationCap, Users, Layers, Plug } from 'lucide-react'
import { toast } from 'sonner'
import { AlertBox } from '@/components/ui/alert-box'
import { AREAS_MANUTENCAO, type ManutencaoAreas } from '@/lib/sistema/manutencao-areas'
import { salvarManutencaoAreas } from '@/app/admin/sistema/actions'

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  discursiva: PenLine, simulados: ClipboardList, questoes: BookOpen, banco: Database,
  relatorios: BarChart3, gamificacao: Trophy, matriculas: GraduationCap, grupos: Layers,
  integracoes: Plug, estudantes: Users,
}

export function ManutencaoAreasForm({ inicial }: { inicial: ManutencaoAreas }) {
  const router = useRouter()
  const [mapa, setMapa] = useState<ManutencaoAreas>(inicial)
  const [pending, start] = useTransition()
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null)

  const bloqueadas = AREAS_MANUTENCAO.filter((a) => mapa[a.key]).length

  function toggle(key: string, valor: boolean) {
    const anterior = mapa
    const novo = { ...mapa, [key]: valor }
    setMapa(novo)
    setSalvandoKey(key)
    start(async () => {
      const r = await salvarManutencaoAreas(novo)
      setSalvandoKey(null)
      if (r?.error) { setMapa(anterior); toast.error(r.error); return }
      toast.success(valor ? 'Área colocada em manutenção' : 'Área reativada')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <AlertBox variante="info" icon={Wrench} titulo="Manutenção por área">
        Ligue o botão de uma área para colocá-la <b>em manutenção</b>: ela some do menu e fica inacessível
        (mostra “em manutenção” a quem abrir). A <b>Correção discursiva</b>, além disso, esconde <b>todas</b> as
        opções de discursiva (tipo da questão, filtros, wizard de simulado, banco e relatórios) — volta a ficar como era antes.
      </AlertBox>

      {bloqueadas > 0 && (
        <AlertBox variante="aviso" icon={ShieldAlert}>
          {bloqueadas === 1 ? '1 área está' : `${bloqueadas} áreas estão`} em manutenção agora.
        </AlertBox>
      )}

      <div className="space-y-2">
        {AREAS_MANUTENCAO.map((a) => {
          const Icon = ICONES[a.key] ?? Wrench
          const on = !!mapa[a.key]
          const salvando = salvandoKey === a.key && pending
          return (
            <div key={a.key} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{a.label}</p>
                  {on && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">Em manutenção</span>}
                  {a.discursiva && <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Bloqueio completo</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.descricao}</p>
              </div>
              <button
                type="button" role="switch" aria-checked={on} aria-label={`Manutenção: ${a.label}`}
                disabled={salvando}
                onClick={() => toggle(a.key, !on)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}
              >
                {salvando
                  ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin text-white" />
                  : <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

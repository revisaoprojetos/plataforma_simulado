'use client'

import { useState, useEffect } from 'react'
import { KeyRound, DownloadCloud, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CurseducaConfig } from '@/components/admin/curseduca-config'
import { CurseducaImport } from '@/components/admin/curseduca-import'
import { CurseducaSyncCard } from '@/components/admin/curseduca-sync-card'
import { listarGruposCurseduca } from '@/app/admin/curseduca/actions'

/**
 * Curseduca dentro de Integrações. Os GRUPOS são carregados SOB DEMANDA (client-side)
 * só quando a aba Importar é aberta — assim a página e a aba Credenciais abrem rápido
 * (não bloqueiam esperando a API da Curseduca listar/contar centenas de grupos).
 * A aba "Sincronização" completa está oculta; o intervalo fica no card do Importar.
 */
type Aba = 'importar' | 'credenciais'

export function IntegracaoCurseducaTabs({ configurado, inativo = false, regras }: { configurado: boolean; inativo?: boolean; regras: any[] }) {
  const [aba, setAba] = useState<Aba>(configurado ? 'importar' : 'credenciais')
  const [grupos, setGrupos] = useState<any[] | null>(null)
  const [sistema, setSistema] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erroGrupos, setErroGrupos] = useState<string | null>(null)

  // Carrega os grupos uma vez, quando a aba Importar é aberta.
  useEffect(() => {
    if (aba !== 'importar' || !configurado || grupos !== null || carregando) return
    setCarregando(true)
    listarGruposCurseduca()
      .then((r) => { if (r.ok) { setGrupos(r.grupos ?? []); setSistema(r.sistema ?? []) } else setErroGrupos(r.error ?? 'Falha ao carregar grupos') })
      .finally(() => setCarregando(false))
  }, [aba, configurado, grupos, carregando])

  const regra0 = regras?.[0]
  const abas: { id: Aba; label: string; Icon: any }[] = [
    { id: 'importar', label: 'Importar', Icon: DownloadCloud },
    { id: 'credenciais', label: 'Credenciais', Icon: KeyRound },
  ]

  const aviso = (titulo: string, msg: string) => (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-amber-700 dark:text-amber-400">{titulo}</p>
        <p className="text-muted-foreground">{msg}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {abas.map(({ id, label, Icon }) => (
          <button key={id} type="button" onClick={() => setAba(id)}
            className={cn('inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors', aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {aba === 'importar' && (
        !configurado ? (
          inativo
            ? aviso('Integração inativa', 'As credenciais estão salvas, mas a integração está desativada. Vá na aba Credenciais, marque “Integração ativa para este cliente” e salve.')
            : aviso('Integração não configurada', 'Configure as credenciais na aba Credenciais.')
        )
          : carregando || grupos === null ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" /> Carregando grupos da Curseduca…
            </div>
          ) : erroGrupos ? aviso('Não foi possível carregar os grupos', erroGrupos)
            : <CurseducaImport grupos={grupos} sistema={sistema}
                extra={<CurseducaSyncCard grupos={grupos} sistema={sistema} inicialAtivo={!!regra0?.ativo} inicialIntervalo={regra0?.intervalo_min ?? 30} inicialGrupos={regra0?.grupos ?? []} />} />
      )}
      {aba === 'credenciais' && <div className="max-w-3xl"><CurseducaConfig inicialAberto semColapso /></div>}
    </div>
  )
}

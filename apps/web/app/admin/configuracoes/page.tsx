import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { LayoutDashboard } from 'lucide-react'
import { isSuperAdmin } from '@/lib/auth/permissions'

// A edição visual (identidade, cores/tema, seleção, carregamento, avançado) foi MIGRADA para o
// Console (super-admin) — Plataformas → (sua plataforma) → Aparência. O painel do tenant não edita
// mais os visuais, para centralizar e padronizar a manutenção. Esta rota agora só orienta.
export default async function ConfiguracoesPage() {
  const sup = await isSuperAdmin()
  return (
    <div className="space-y-6">
      <CabecalhoArea
        titulo="Aparência da plataforma"
        descricao="A edição visual foi centralizada no Console de administração."
      />

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground/90">
          Identidade, cores &amp; tema, tela de seleção, telas de carregamento e ajustes avançados agora são editados
          no <b>Console</b> (super-admin), por plataforma — assim a manutenção fica unificada e profissional.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Caminho: <span className="font-mono">Console → Plataformas → (sua plataforma) → Aparência</span>.</p>
        {sup && (
          <a href="/super/plataformas" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            <LayoutDashboard className="h-4 w-4" /> Abrir o Console
          </a>
        )}
      </div>
    </div>
  )
}

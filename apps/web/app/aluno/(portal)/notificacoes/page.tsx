import { Bell } from 'lucide-react'
import { NotificacoesLista } from '@/components/aluno/notificacoes-lista'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notificações' }

export default function NotificacoesPage() {
  return (
    <div className="animate-page mx-auto max-w-2xl space-y-5">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Atualizações</span>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-[2rem]"><Bell className="h-6 w-6 text-primary" /> Notificações</h1>
        <p className="mt-1 text-muted-foreground">Novidades, resultados liberados e avisos da plataforma.</p>
      </div>
      <NotificacoesLista />
    </div>
  )
}

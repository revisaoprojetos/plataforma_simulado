import Link from 'next/link'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { DownloadCloud, CreditCard, ChevronRight, AlertTriangle } from 'lucide-react'
import { verificarSilencioWebhook, formatarSilencio } from '@/lib/integracoes/silencio'
import { SemPermissao } from '@/components/ui/alert-box'

export const dynamic = 'force-dynamic'

const PROVIDERS = [
  { id: 'curseduca', nome: 'Curseduca', desc: 'Importa alunos e grupos de acesso (pull).', cor: 'var(--pn-7c3aed,#7c3aed)', Icon: DownloadCloud },
  { id: 'guru', nome: 'Guru', desc: 'Compras e assinaturas (webhook em tempo real).', cor: 'var(--pn-0ea5e9,#0ea5e9)', Icon: CreditCard },
] as const

export default async function IntegracoesPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('estudantes:view') || access.permissions.includes('estudantes:create')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <SemPermissao>Sem permissão.</SemPermissao>
      </div>
    )
  }

  // Status por provedor (configurado/ativo).
  const svc = createAdminClient()
  const { data: cfgs } = await svc.from('simulado_integracao_config').select('provider, ativo, credenciais').eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  const statusPorProvider = new Map((cfgs ?? []).map((c: any) => [c.provider, c.ativo]))
  // Alerta de silêncio: Guru ativo mas sem NENHUMA requisição além do tolerado (ver lib/integracoes/silencio.ts).
  const silencioGuru = statusPorProvider.get('guru') && access.tenantId ? await verificarSilencioWebhook(svc, access.tenantId, 'guru') : null

  // Alerta de segurança: webhook ativo SEM segredo configurado (só o token da URL protege). Não derruba nada, só avisa.
  const semSegredo = (cfgs ?? []).filter((c: any) => c.ativo && !(c.credenciais && c.credenciais.webhook_secret))
    .map((c: any) => PROVIDERS.find((p) => p.id === c.provider)).filter(Boolean) as unknown as { id: string; nome: string }[]

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <p className="text-muted-foreground">Conecte plataformas externas (Curseduca, Guru) para importar alunos e conceder acesso automaticamente.</p>
      </div>

      {silencioGuru?.emSilencio && silencioGuru.silencioMin != null && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">O Guru não envia nada à plataforma há {formatarSilencio(silencioGuru.silencioMin)}</p>
            <p className="text-muted-foreground">
              A última requisição chegou há mais que o tolerado ({formatarSilencio(silencioGuru.limiteMin)}). Compras feitas agora podem não liberar acesso.
              Confira a URL e o token do webhook no Guru (<Link href="/admin/integracoes/guru" className="font-medium text-primary underline">configuração do Guru</Link>).
            </p>
          </div>
        </div>
      )}

      {semSegredo.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-300">Webhook sem segredo: {semSegredo.map((p) => p.nome).join(', ')}</p>
            <p className="text-muted-foreground">
              Hoje só o token da URL protege a entrada de eventos. Configure o segredo e ative o <strong>modo estrito</strong> em{' '}
              {semSegredo.map((p, i) => (<span key={p.id}>{i > 0 && ', '}<Link href={`/admin/integracoes/${p.id}`} className="font-medium text-primary underline">{p.nome}</Link></span>))}.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROVIDERS.map(({ id, nome, desc, cor, Icon }) => {
          const configurado = statusPorProvider.has(id)
          const ativo = statusPorProvider.get(id)
          return (
            <Link key={id} href={`/admin/integracoes/${id}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><Icon className="h-5 w-5" /></span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${!configurado ? 'bg-muted text-muted-foreground' : ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                  {!configurado ? 'Não configurado' : ativo ? 'Ativo' : 'Pausado'}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold">{nome}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">Configurar <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

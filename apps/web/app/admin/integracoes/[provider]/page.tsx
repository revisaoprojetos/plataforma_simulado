import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ShieldAlert } from 'lucide-react'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { criptografiaAtiva } from '@/lib/crypto'
import { PROVIDER_META } from '../campos'
import { IntegracaoProviderClient } from '@/components/admin/integracao-provider-client'
import { IntegracaoCurseducaTabs } from '@/components/admin/integracao-curseduca-tabs'
import { curseducaConfigurado, listarRegrasSync } from '../../curseduca/actions'
import type { Provider } from '@/lib/integracoes/tipos'

export const dynamic = 'force-dynamic'

export default async function IntegracaoProviderPage({ params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  if (!(provider in PROVIDER_META)) notFound()
  const prov = provider as Provider

  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('estudantes:view') || access.permissions.includes('estudantes:create')
  if (!pode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Integrações</h1>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"><ShieldAlert className="h-4 w-4" /> Sem permissão.</div>
      </div>
    )
  }

  const meta = PROVIDER_META[prov]
  const header = (
    <div>
      <Link href="/admin/integracoes" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Integrações</Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: meta.cor }} />
        <h1 className="text-2xl font-bold tracking-tight">{meta.nome}</h1>
      </div>
    </div>
  )

  // Curseduca: reusa as telas existentes como abas. Os GRUPOS são carregados sob demanda
  // (client-side) só na aba Importar — assim a página e a aba Credenciais abrem rápido
  // (não esperam a API da Curseduca listar/contar 234 grupos).
  if (prov === 'curseduca') {
    const [configurado, regras] = await Promise.all([curseducaConfigurado(), listarRegrasSync()])
    return (
      <div className="animate-page space-y-6">
        {header}
        <IntegracaoCurseducaTabs configurado={configurado} regras={(regras as any).regras ?? []} />
      </div>
    )
  }

  // Demais provedores (Guru): sistema unificado novo (credenciais + mapeamentos).
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const svc = createAdminClient()
  const [{ data: cfg }, { data: maps }, { data: grupos }, { data: simulados }] = await Promise.all([
    svc.from('simulado_integracao_config').select('base_url, credenciais, ativo, webhook_token').eq('tenant_id', tid).eq('provider', prov).maybeSingle(),
    svc.from('simulado_integracao_mapeamentos').select('id, fonte_ref, fonte_nome, classificacao, grupo_id, simulado_id, ativo').eq('tenant_id', tid).eq('provider', prov).order('fonte_nome'),
    svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tid).eq('deletado', false).order('nome'),
    svc.from('simulado_simulados').select('id, titulo').eq('tenant_id', tid).eq('deletado', false).order('titulo'),
  ])
  const cred = ((cfg as any)?.credenciais ?? {}) as Record<string, string>

  return (
    <div className="animate-page space-y-6">
      {header}
      <IntegracaoProviderClient
        provider={prov}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
        config={{
          ativo: (cfg as any)?.ativo ?? false,
          baseUrl: (cfg as any)?.base_url ?? '',
          camposPreenchidos: Object.entries(cred).filter(([, v]) => !!v).map(([k]) => k),
          webhookToken: (cfg as any)?.webhook_token ?? null,
          cripto: criptografiaAtiva(),
        }}
        mapeamentos={(maps ?? []).map((m: any) => ({ id: m.id, fonteRef: m.fonte_ref, fonteNome: m.fonte_nome, classificacao: m.classificacao, grupoId: m.grupo_id, simuladoId: m.simulado_id, ativo: m.ativo }))}
        gruposSistema={(grupos ?? []).map((g: any) => ({ id: g.id, nome: g.nome }))}
        simuladosSistema={(simulados ?? []).map((s: any) => ({ id: s.id, nome: s.titulo }))}
      />
    </div>
  )
}

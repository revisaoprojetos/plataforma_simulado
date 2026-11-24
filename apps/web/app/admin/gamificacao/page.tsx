import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { getGamConfig } from '@/lib/gamificacao'
import { metricasGamificacao } from '@/lib/gamificacao/metricas'
import { listarConquistasModuloTenant } from '@/lib/leitura/carimbos'
import { SemPermissao } from '@/components/ui/alert-box'
import { GamificacaoTabs } from './gamificacao-tabs'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gamificação' }

export default async function GamificacaoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('gamificacao:view'))) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Gamificação" />
        <SemPermissao>Sem permissão para acessar a gamificação.</SemPermissao>
      </div>
    )
  }

  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const podeGerenciar = access.isAdmin || access.permissions.includes('gamificacao:manage')
  // Independentes entre si → em paralelo (métricas dependem só da config, encadeadas dentro do mesmo ramo).
  // Conquistas dos módulos de Leitura: exibidas na aba Conquistas com etiqueta de origem.
  // Nível mais alto que algum aluno tem HOJE (ponto de virada) — query barata (max de coluna denormalizada).
  const [{ config, metricas }, conquistasModulos, nivelMaisAlto] = await Promise.all([
    (async () => {
      const config = await getGamConfig(svc, tenantId)
      const metricas = config && tenantId ? await metricasGamificacao(svc, tenantId, config) : null
      return { config, metricas }
    })(),
    tenantId ? listarConquistasModuloTenant(svc, tenantId) : Promise.resolve([] as Awaited<ReturnType<typeof listarConquistasModuloTenant>>),
    (async () => {
      if (!tenantId) return 1
      try {
        const { data } = await svc.from('simulado_gamificacao_estudante').select('nivel').eq('tenant_id', tenantId).order('nivel', { ascending: false }).limit(1).maybeSingle()
        return Math.max(1, Number((data as any)?.nivel ?? 1))
      } catch { return 1 }
    })(),
  ])

  return (
    <div className="tema-gam space-y-6">
      <CabecalhoArea
        titulo="Gamificação"
        descricao="Configure XP, níveis, ligas, missões e conquistas do portal do aluno."
        acoes={
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${config?.ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
            {config?.ativo ? '● Ativa' : '○ Inativa'}
          </span>
        }
      />

      {config && metricas && <GamificacaoTabs config={config} podeGerenciar={podeGerenciar} metricas={metricas} tabInicial={tab} conquistasModulos={conquistasModulos} nivelMaisAlto={nivelMaisAlto} />}
    </div>
  )
}

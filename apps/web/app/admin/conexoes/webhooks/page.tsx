import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { ConexoesTabs } from '@/components/admin/conexoes-tabs'
import { EVENTOS_WEBHOOK } from '@/lib/webhooks/dispatch'

export const dynamic = 'force-dynamic'

export default async function WebhooksPage() {
  const svc = await createServiceClient()
  const tenantId = await getCurrentTenantId()

  let webhooks: any[] = []
  let precisaMigrar = false
  // Tolerante às colunas novas (envios_simultaneos, filtro_simulados).
  let r: any = await svc
    .from('simulado_webhook_saida')
    .select('id, nome, url, eventos, secret, ativo, ultimo_status, ultimo_envio, envios_simultaneos, filtro_simulados')
    .eq('tenant_id', tenantId ?? '')
    .order('criado_em', { ascending: false })
  if (r.error && /envios_simultaneos|filtro_simulados|column/i.test(r.error.message)) {
    r = await svc.from('simulado_webhook_saida').select('id, nome, url, eventos, secret, ativo, ultimo_status, ultimo_envio').eq('tenant_id', tenantId ?? '').order('criado_em', { ascending: false })
  }
  if (r.error) precisaMigrar = /webhook_saida|relation|does not exist/i.test(r.error.message)
  else webhooks = r.data ?? []

  const { data: sims } = await svc.from('simulado_simulados').select('id, titulo').eq('deletado', false).eq('tenant_id', tenantId ?? '').order('titulo')

  // Automações (aba n8n) — tolerante se a tabela ainda não foi migrada.
  let automacoes: any[] = []
  const ra = await svc.from('simulado_automacoes').select('id, nome, ativo, gatilho, passos, ultimo_status, ultimo_run').eq('tenant_id', tenantId ?? '').order('criado_em', { ascending: false })
  if (!ra.error) automacoes = ra.data ?? []

  return (
    <div className="animate-page space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webhooks & n8n</h1>
        <p className="text-muted-foreground">Notifique e automatize com base na progressão do estudante — envie eventos por webhook ou monte fluxos (estilo n8n).</p>
      </div>
      <ConexoesTabs
        webhooks={webhooks.map((w) => ({
          id: w.id, nome: w.nome, url: w.url,
          eventos: Array.isArray(w.eventos) ? w.eventos : [],
          secret: w.secret ?? null, ativo: !!w.ativo,
          ultimoStatus: w.ultimo_status ?? null, ultimoEnvio: w.ultimo_envio ?? null,
          enviosSimultaneos: w.envios_simultaneos ?? 5,
          filtroSimulados: Array.isArray(w.filtro_simulados) ? w.filtro_simulados : [],
        }))}
        automacoes={automacoes.map((a) => ({
          id: a.id, nome: a.nome, ativo: !!a.ativo, gatilho: a.gatilho ?? null,
          passos: Array.isArray(a.passos) ? a.passos : [],
          ultimoStatus: a.ultimo_status ?? null, ultimoRun: a.ultimo_run ?? null,
        }))}
        eventos={EVENTOS_WEBHOOK.map((e) => ({ chave: e.chave, label: e.label }))}
        simulados={(sims ?? []).map((s: any) => ({ id: s.id, titulo: s.titulo ?? 'Simulado' }))}
        precisaMigrar={precisaMigrar}
      />
    </div>
  )
}

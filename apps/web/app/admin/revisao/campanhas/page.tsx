import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead, RevisaoAbas } from '@/components/admin/revisao/ui'
import { createClient } from '@/lib/supabase/server'
import { envioConfigurado } from '@/lib/admin-revisao/campanha-envio'
import { apiConfig, campanhasRecentes, cursosOpcoes, gruposOpcoes, NADA } from '@/lib/admin-revisao/cs'
import { isUuid } from '@/lib/admin-revisao/cs-server'
import type { PublicoItem } from '@/lib/admin-revisao/cs-tipos'
import { CampanhaApi, CampanhaEmail } from './campanhas-cliente'

export const dynamic = 'force-dynamic'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

// CS › Disparo de Campanha (#email e #campanhaapi). Abas por ?aba=email|api. A página só LÊ (grupos, conexão, últimos envios);
// registrar/agendar passa por ./actions.ts (checkPermission + auditoria). Nada é enviado de verdade (sem provedor).
export default async function CampanhasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'estudantes:view')) return <SemPermissao>Você não tem permissão para ver as campanhas.</SemPermissao>
  const tenantId = access.tenantId ?? NADA
  const sp = await searchParams
  const aba = um(sp.aba) === 'api' ? 'api' : 'email'
  const svc = createAdminClient()

  // ?membro=<id> (vem de Membros › "Enviar e-mail"): público de UMA pessoa.
  let membro: PublicoItem | null = null
  if (isUuid(um(sp.membro))) {
    const { data } = await svc.from('simulado_estudantes').select('id, nome').eq('tenant_id', tenantId).eq('id', um(sp.membro)).eq('deletado', false).maybeSingle()
    if (data) membro = { tipo: 'membro', id: (data as any).id, nome: (data as any).nome ?? 'Aluno' }
  }

  const [grupos, recentes, tenant, cursos, auth] = await Promise.all([
    gruposOpcoes(tenantId),
    campanhasRecentes(tenantId, aba, 6),
    svc.from('simulado_tenants').select('nome').eq('id', tenantId).maybeSingle(),
    cursosOpcoes(tenantId),
    createClient().then((c) => c.auth.getUser()),
  ])
  const u = auth.data.user
  const nomeExemplo = String((u?.user_metadata as any)?.full_name ?? u?.email?.split('@')[0] ?? 'aluno').trim().split(/s+/)[0]
  const cursoExemplo = cursos[0]?.nome ?? 'seu curso'
  const envioOn = envioConfigurado()
  const plataforma = ((tenant.data as any)?.nome as string | undefined) ?? 'Plataforma'
  const podeEnviar = accessCan(access, 'estudantes:update')

  return (
    <div className="animate-page">
      <RevisaoHead secao="CS" titulo="Disparo de Campanha"
        subtitulo="Envie uma campanha para todos os alunos ou para um grupo, por e-mail ou por mensagem pela API (WhatsApp). {nome} vira o primeiro nome de cada aluno." />
      <RevisaoAbas abas={[{ id: 'email', titulo: 'E-mail' }, { id: 'api', titulo: 'Mensagem por API' }]} atual={aba} base="/admin/revisao/campanhas" param="aba" />
      {aba === 'email'
        ? <CampanhaEmail key={membro?.id ?? 'e'} grupos={grupos} membro={membro} plataforma={plataforma} recentes={recentes} podeEnviar={podeEnviar} envioOn={envioOn} nomeExemplo={nomeExemplo} cursoExemplo={cursoExemplo} />
        : <ApiAba grupos={grupos} membro={membro} plataforma={plataforma} recentes={recentes} podeEnviar={podeEnviar} podeConfigurar={accessCan(access, 'configuracoes:manage')} tenantId={tenantId} envioOn={envioOn} nomeExemplo={nomeExemplo} />}
    </div>
  )
}

async function ApiAba(p: { grupos: Awaited<ReturnType<typeof gruposOpcoes>>; membro: PublicoItem | null; plataforma: string; recentes: Awaited<ReturnType<typeof campanhasRecentes>>; podeEnviar: boolean; podeConfigurar: boolean; tenantId: string; envioOn: boolean; nomeExemplo: string }) {
  const { cfg, ok } = await apiConfig(p.tenantId)
  return <CampanhaApi key={`${cfg.conectada}-${cfg.numero}`} grupos={p.grupos} membro={p.membro} plataforma={p.plataforma} cfg={cfg} cfgOk={ok} recentes={p.recentes} podeEnviar={p.podeEnviar} podeConfigurar={p.podeConfigurar} envioOn={p.envioOn} nomeExemplo={p.nomeExemplo} />
}

import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { resumoRegistro } from '@/lib/auditoria/resumo'
import { sqlQuery } from '@/lib/data/sql'
import { remember } from '@/lib/cache/relatorio-cache'
import { quandoHora, quandoRel } from './datas'
import { AREAS_EQUIPE, mascararEmail, rotuloPapel, type EquipeDados, type Nivel, type PapelEquipe, type PessoaEquipe } from './equipe-tipos'

// PERMISSÕES DA EQUIPE — leitura pronta para a tela: papéis (RBAC real) × áreas, pessoas e histórico (auditoria).
// A página só LÊ. Mutação = actions (checkPermission('rbac:manage')). Tenant sempre explícito.

const ENTIDADES_ADMIN = [
  'simulado_conteudo_documentos', 'simulado_documentos', 'simulado_conteudo_atualizacoes', 'simulado_pastas', 'simulado_produtos',
  'simulado_produto_modulos', 'simulado_produto_modulo_itens', 'simulado_simulados', 'simulado_questoes', 'simulado_estudantes',
  'simulado_grupos', 'simulado_tenants', 'simulado_roles', 'simulado_role_permissions', 'simulado_tenant_acessos', 'simulado_banners',
  'simulado_cronograma_adaptativo_qf', 'simulado_cronograma_adaptativo_cfg', 'simulado_cadernos_teste', 'simulado_assuntos',
  'simulado_disciplinas', 'simulado_eventos_calendario', 'simulado_campanhas', 'simulado_sessoes_prova',
]

const TOTAL = new Set(['admin', 'admin_geral', 'super_admin'])

export async function carregarEquipe(tenantId: string, voceId: string | null): Promise<EquipeDados> {
  const svc = createAdminClient()
  try {
    const [rolesR, permsR, acessosR] = await Promise.all([
      svc.from('simulado_roles').select('id, nome, tenant_id, is_sistema').or(`tenant_id.eq.${tenantId},is_sistema.eq.true`).order('nome').limit(500),
      svc.from('simulado_permissions').select('id, resource, action').limit(2000),
      svc.from('simulado_tenant_acessos').select('user_id, role, ativo, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(1000)
    ])
    if (rolesR.error) return { papeis: [], pessoas: [], historico: [], indisponivel: true, areasSemPermissao: [] }

    // permissões por recurso
    const permsPorRecurso = new Map<string, { id: string; action: string }[]>()
    for (const p of (permsR.data ?? []) as any[]) permsPorRecurso.set(p.resource, [...(permsPorRecurso.get(p.resource) ?? []), { id: p.id, action: p.action }])

    // dedupe de papéis por nome (prefere o do próprio tenant)
    const porNome = new Map<string, any>()
    for (const r of (rolesR.data ?? []) as any[]) {
      const atual = porNome.get(r.nome)
      if (!atual || (r.tenant_id === tenantId && atual.tenant_id !== tenantId)) porNome.set(r.nome, r)
    }
    const roleIds = [...porNome.values()].map((r) => r.id)
    const rpPorRole = new Map<string, Set<string>>()
    for (let i = 0; i < roleIds.length; i += 80) {
      const { data } = await svc.from('simulado_role_permissions').select('role_id, permission_id').in('role_id', roleIds.slice(i, i + 80)).limit(20000)
      for (const x of (data ?? []) as any[]) { if (!rpPorRole.has(x.role_id)) rpPorRole.set(x.role_id, new Set()); rpPorRole.get(x.role_id)!.add(x.permission_id) }
    }

    const acessos = ((acessosR.data ?? []) as any[]).filter((a) => a.role && a.role !== 'estudante')
    const contagem = new Map<string, number>()
    for (const a of acessos) contagem.set(a.role, (contagem.get(a.role) ?? 0) + 1)

    const nivelDe = (roleId: string, recurso: string): Nivel => {
      const ps = permsPorRecurso.get(recurso) ?? []
      const tem = rpPorRole.get(roleId) ?? new Set<string>()
      const view = ps.find((p) => p.action === 'view')
      const outras = ps.filter((p) => p.action !== 'view')
      if (outras.some((p) => tem.has(p.id))) return 2
      return view && tem.has(view.id) ? 1 : 0
    }

    // só mostra papéis "de equipe": os com pessoas, os do próprio tenant e os de acesso total; esconde 'estudante'
    const papeis: PapelEquipe[] = [...porNome.values()]
      .filter((r) => r.nome !== 'estudante' && (r.tenant_id === tenantId || contagem.has(r.nome) || TOTAL.has(r.nome)))
      .map((r) => {
        const total = TOTAL.has(r.nome)
        const niveis: Record<string, Nivel> = {}
        for (const a of AREAS_EQUIPE) niveis[a.id] = total ? 2 : nivelDe(r.id, a.recurso)
        return { id: r.id, nome: r.nome, rotulo: rotuloPapel(r.nome), acessoTotal: total, editavel: r.tenant_id === tenantId && !total, pessoas: contagem.get(r.nome) ?? 0, niveis }
      })
      .sort((a, b) => Number(b.acessoTotal) - Number(a.acessoTotal) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

    // pessoas (nome/e-mail em lote + último login via auditoria)
    const userIds = [...new Set(acessos.map((a) => a.user_id as string))]
    const perfil = new Map<string, { nome: string | null; email: string | null }>()
    for (let i = 0; i < userIds.length; i += 80) {
      const { data } = await svc.from('simulado_users').select('id, nome, email').in('id', userIds.slice(i, i + 80))
      for (const u of (data ?? []) as any[]) perfil.set(u.id, { nome: u.nome ?? null, email: u.email ?? null })
    }
    await Promise.all(userIds.filter((id) => !perfil.has(id)).slice(0, 40).map(async (id) => {
      try {
        const { data } = await svc.auth.admin.getUserById(id)
        const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>
        perfil.set(id, { nome: (meta.full_name as string) ?? (meta.nome as string) ?? null, email: data?.user?.email ?? null })
      } catch { /* sem perfil */ }
    }))
    // último acesso = simulado_users.ultimo_login (sem varrer a auditoria, que tem ~770 mil linhas)
    const ultimos = new Map<string, string>()
    for (let i = 0; i < userIds.length; i += 80) {
      const { data } = await svc.from('simulado_users').select('id, ultimo_login').in('id', userIds.slice(i, i + 80))
      for (const u of (data ?? []) as any[]) if (u.ultimo_login) ultimos.set(u.id, u.ultimo_login)
    }
    // quem não tem ultimo_login: último login do Auth (last_sign_in_at)
    await Promise.all(userIds.filter((id) => !ultimos.has(id)).slice(0, 40).map(async (id) => {
      try { const v = await remember<string | null>(`revisao-equipe:login:${id}`, 300, async () => (await svc.auth.admin.getUserById(id)).data?.user?.last_sign_in_at ?? null); if (v) ultimos.set(id, v) } catch { /* sem dado */ }
    }))
    const pessoas: PessoaEquipe[] = acessos.map((a) => {
      const p = perfil.get(a.user_id)
      return { userId: a.user_id, nome: p?.nome ?? null, emailMascarado: mascararEmail(p?.email), cargo: a.role, ativo: !!a.ativo, ultimoAcesso: ultimos.has(a.user_id) ? quandoRel(ultimos.get(a.user_id)) : 'sem registro', ehVoce: a.user_id === voceId }
    }).sort((x, y) => (x.nome ?? x.emailMascarado).localeCompare(y.nome ?? y.emailMascarado, 'pt-BR'))

    // histórico: últimas ações de ADMIN. Consulta por entidade (índice tenant+entidade+criado_em) — filtrar só por
    // ator_tipo varre a tabela inteira (8 s). Entidades = as que a equipe administra (lista fixa em ENTIDADES_ADMIN).
    const logs = (await sqlQuery<any>(
      `SELECT l.id, l.criado_em, l.actor_user_id, l.entidade, l.entidade_id, l.operacao, l.dados_anteriores, l.dados_novos
         FROM unnest($2::text[]) e(ent)
         CROSS JOIN LATERAL (
           SELECT id, criado_em, actor_user_id, entidade, entidade_id, operacao, dados_anteriores, dados_novos
             FROM simulado_audit_logs
            WHERE tenant_id = $1 AND entidade = e.ent AND ator_tipo = 'admin'
              AND operacao IN ('INSERT','UPDATE','DELETE','LIBERAR','BLOQUEAR','ANULAR','RECORRIGIR')
            ORDER BY criado_em DESC LIMIT 8) l
        ORDER BY l.criado_em DESC LIMIT 8`, [tenantId, ENTIDADES_ADMIN])) ?? []
    const atores = [...new Set(logs.map((l: any) => l.actor_user_id).filter(Boolean))] as string[]
    const nomeAtor = new Map<string, string>()
    if (atores.length) {
      const { data } = await svc.from('simulado_users').select('id, nome, email').in('id', atores)
      for (const u of (data ?? []) as any[]) nomeAtor.set(u.id, u.nome || mascararEmail(u.email))
    }
    const historico = logs.map((l: any) => ({ id: l.id as string, texto: resumoRegistro(l, new Map()), quando: quandoHora(l.criado_em), ator: nomeAtor.get(l.actor_user_id) ?? 'Equipe' }))

    return { papeis, pessoas, historico, indisponivel: false, areasSemPermissao: AREAS_EQUIPE.filter((a) => !permsPorRecurso.has(a.recurso)).map((a) => a.id) }
  } catch (e) {
    console.error('[revisao/equipe]', e)
    return { papeis: [], pessoas: [], historico: [], indisponivel: true, areasSemPermissao: [] }
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'

// Mensagens padrão por tenant (bloqueio / liberação / alerta) com variáveis {{...}}.
const MENSAGENS_PADRAO: { chave: string; titulo: string; corpo: string }[] = [
  { chave: 'bloqueio_sem_matricula', titulo: 'Acesso não autorizado', corpo: 'Olá {{nome}}, você não possui matrícula ativa nesta plataforma. Entre em contato: {{contato}}' },
  { chave: 'bloqueio_fora_janela', titulo: 'Simulado não disponível', corpo: 'O simulado {{simulado}} não está disponível no momento. Aguarde o período de aplicação.' },
  { chave: 'bloqueio_prazo_expirado', titulo: 'Prazo expirado', corpo: 'Olá {{nome}}, o prazo para realizar o simulado {{simulado}} expirou. Entre em contato: {{contato}}' },
  { chave: 'bloqueio_tentativas', titulo: 'Tentativas esgotadas', corpo: 'Olá {{nome}}, você atingiu o limite de tentativas para {{simulado}}. Entre em contato: {{contato}}' },
  { chave: 'bloqueio_identidade', titulo: 'Identificação não encontrada', corpo: 'Não encontramos seu cadastro. Verifique seus dados ou entre em contato: {{contato}}' },
  { chave: 'liberacao_disponivel', titulo: 'Simulado disponível!', corpo: 'Olá {{nome}}, o simulado {{simulado}} já está disponível para você. Boas provas!' },
  { chave: 'liberacao_gabarito', titulo: 'Gabarito liberado', corpo: 'O gabarito do simulado {{simulado}} foi liberado. Acesse sua área do aluno para ver o resultado.' },
  { chave: 'liberacao_nota', titulo: 'Resultado disponível', corpo: 'Olá {{nome}}, sua nota no simulado {{simulado}} foi publicada. Acesse para conferir!' },
  { chave: 'alerta_tempo', titulo: 'Atenção: tempo acabando', corpo: 'Olá {{nome}}, você tem pouco tempo restante no simulado {{simulado}}. Finalize logo!' },
  { chave: 'alerta_prazo', titulo: 'Prazo encerrando em breve', corpo: 'Olá {{nome}}, o prazo para {{simulado}} encerra em {{prazo}}. Não deixe para depois!' },
]

/**
 * Semeia os defaults de um tenant recém-criado: perfis RBAC + permissões,
 * mensagens, contatos e embed_config. Idempotente e tolerante a falhas parciais.
 */
export async function seedTenantDefaults(svc: SupabaseClient, tenantId: string) {
  // 1) Perfis RBAC + permissões
  try {
    const { data: perms } = await svc.from('simulado_permissions').select('id, resource, action')
    if (perms && perms.length) {
      const has = (p: any, r: string, a: string) => p.resource === r && p.action === a
      const filtros: Record<string, (p: any) => boolean> = {
        admin: () => true,
        admin_conteudo: (p) =>
          p.resource === 'questoes' || p.resource === 'simulados' ||
          has(p, 'estudantes', 'view') || has(p, 'matriculas', 'view') || has(p, 'relatorios', 'view'),
        admin_relatorio: (p) =>
          p.resource === 'relatorios' || has(p, 'auditoria', 'view') || has(p, 'estudantes', 'view'),
        estudante: () => false,
      }
      const descricoes: Record<string, string> = {
        admin: 'Administrador geral (acesso total)',
        admin_conteudo: 'Gerencia questões e simulados',
        admin_relatorio: 'Relatórios e auditoria',
        estudante: 'Aluno (sem painel)',
      }
      for (const nome of Object.keys(filtros)) {
        let role = (await svc.from('simulado_roles').select('id').eq('tenant_id', tenantId).eq('nome', nome).maybeSingle()).data
        if (!role) {
          role = (
            await svc.from('simulado_roles').insert({ tenant_id: tenantId, nome, descricao: descricoes[nome], is_sistema: nome === 'admin' }).select('id').single()
          ).data
        }
        if (role?.id) {
          await svc.from('simulado_role_permissions').delete().eq('role_id', role.id)
          const ids = perms.filter(filtros[nome]).map((p: any) => p.id)
          if (ids.length) await svc.from('simulado_role_permissions').insert(ids.map((id: string) => ({ role_id: role!.id, permission_id: id })))
        }
      }
    }
  } catch {
    /* RBAC indisponível */
  }

  // 2) Mensagens padrão
  try {
    const rows = MENSAGENS_PADRAO.map((m) => ({ ...m, tenant_id: tenantId }))
    await svc.from('simulado_tenant_mensagens').upsert(rows, { onConflict: 'tenant_id,chave' })
  } catch {
    /* mensagens indisponíveis / sem tenant_id ainda */
  }

  // 3) Contatos (linha vazia)
  try {
    await svc.from('simulado_tenant_contatos').insert({ tenant_id: tenantId })
  } catch {
    /* contatos indisponíveis */
  }

  // 4) Embed config padrão
  try {
    await svc.from('simulado_embed_config').insert({ tenant_id: tenantId, origens_permitidas: [], metodo_identificacao: 'email' })
  } catch {
    /* embed indisponível */
  }
}

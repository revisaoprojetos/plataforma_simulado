import { Injectable } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'

export interface AuditLogEntry {
  tenant_id: string | null
  actor_user_id: string | null
  tabela: string
  operacao: string
  dados_anteriores: Record<string, unknown> | null
  dados_novos: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
}

export interface ListAuditLogsFilter {
  actor_user_id?: string
  tabela?: string
  operacao?: string
  data_inicio?: string
  data_fim?: string
  page?: number
  limit?: number
}

@Injectable()
export class AuditService {
  constructor(private readonly supabase: SupabaseService) {}

  async log(entry: AuditLogEntry) {
    try {
      await this.supabase.getClient().from('audit_logs').insert(entry)
    } catch {
      // Audit must never block the main flow
    }
  }

  async findAll(tenantId: string, filter: ListAuditLogsFilter) {
    const page = filter.page ?? 1
    const limit = Math.min(filter.limit ?? 50, 200)
    const offset = (page - 1) * limit

    let query = this.supabase.getClient()
      .from('audit_logs')
      .select('id, actor_user_id, tabela, operacao, dados_anteriores, dados_novos, ip, user_agent, criado_em', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filter.actor_user_id) query = query.eq('actor_user_id', filter.actor_user_id)
    if (filter.tabela) query = query.eq('tabela', filter.tabela)
    if (filter.operacao) query = query.eq('operacao', filter.operacao)
    if (filter.data_inicio) query = query.gte('criado_em', filter.data_inicio)
    if (filter.data_fim) query = query.lte('criado_em', filter.data_fim)

    const { data, count, error } = await query
    if (error) throw new Error(error.message)

    return {
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
      total_pages: Math.ceil((count ?? 0) / limit),
    }
  }

  async findOne(id: string, tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('audit_logs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    return data
  }
}

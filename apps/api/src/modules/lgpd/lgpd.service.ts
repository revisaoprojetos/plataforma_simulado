import { Injectable, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { AcceptConsentDto } from './dto/accept-consent.dto.js'
import { CreateSolicitacaoDto } from './dto/create-solicitacao.dto.js'

// Current policy version — bump this to force re-consent
export const CURRENT_POLICY_VERSION = '1.0'

@Injectable()
export class LgpdService {
  constructor(private readonly supabase: SupabaseService) {}

  async checkConsent(userId: string): Promise<{ needs_consent: boolean; versao_atual: string }> {
    const { data } = await this.supabase.getClient()
      .from('lgpd_consentimentos')
      .select('versao_politica, aceito_em')
      .eq('user_id', userId)
      .eq('versao_politica', CURRENT_POLICY_VERSION)
      .single()

    return {
      needs_consent: !data,
      versao_atual: CURRENT_POLICY_VERSION,
    }
  }

  async acceptConsent(userId: string, dto: AcceptConsentDto, ip: string, userAgent: string) {
    if (dto.versao_politica !== CURRENT_POLICY_VERSION) {
      throw new BadRequestException(`Versão de política incorreta. Aceite a versão ${CURRENT_POLICY_VERSION}`)
    }

    const { data, error } = await this.supabase.getClient()
      .from('lgpd_consentimentos')
      .upsert(
        {
          user_id: userId,
          versao_politica: dto.versao_politica,
          ip,
          user_agent: userAgent,
          aceito_em: new Date().toISOString(),
        },
        { onConflict: 'user_id,versao_politica' },
      )
      .select()
      .single()

    if (error) throw new BadRequestException(error.message)
    return { accepted: true, data }
  }

  async getConsentHistory(userId: string) {
    const { data } = await this.supabase.getClient()
      .from('lgpd_consentimentos')
      .select('versao_politica, aceito_em, ip')
      .eq('user_id', userId)
      .order('aceito_em', { ascending: false })
    return data ?? []
  }

  async createSolicitacao(userId: string, dto: CreateSolicitacaoDto) {
    // Only one pending request per type at a time
    const { data: existing } = await this.supabase.getClient()
      .from('lgpd_solicitacoes')
      .select('id')
      .eq('user_id', userId)
      .eq('tipo', dto.tipo)
      .eq('status', 'pendente')
      .single()

    if (existing) throw new BadRequestException('Já existe uma solicitação pendente deste tipo')

    const { data, error } = await this.supabase.getClient()
      .from('lgpd_solicitacoes')
      .insert({
        user_id: userId,
        tipo: dto.tipo,
        status: 'pendente',
        observacao: dto.observacao ?? null,
      })
      .select()
      .single()

    if (error) throw new BadRequestException(error.message)
    return data
  }

  async getSolicitacoes(userId: string) {
    const { data } = await this.supabase.getClient()
      .from('lgpd_solicitacoes')
      .select('id, tipo, status, criado_em, processado_em')
      .eq('user_id', userId)
      .order('criado_em', { ascending: false })
    return data ?? []
  }

  // Admin: list all pending requests
  async listPendingSolicitacoes(tenantId: string) {
    const { data } = await this.supabase.getClient()
      .from('lgpd_solicitacoes')
      .select('id, user_id, tipo, status, criado_em, observacao')
      .eq('status', 'pendente')
      .order('criado_em', { ascending: true })
    return data ?? []
  }

  // Admin: process a request
  async processSolicitacao(solicitacaoId: string, status: 'processado' | 'rejeitado') {
    const { data, error } = await this.supabase.getClient()
      .from('lgpd_solicitacoes')
      .update({ status, processado_em: new Date().toISOString() })
      .eq('id', solicitacaoId)
      .select()
      .single()
    if (error) throw new BadRequestException(error.message)
    return data
  }

  // Export user data as JSON (for "acesso" and "portabilidade" requests)
  async exportUserData(userId: string) {
    const [user, estudantes, sessoes, respostas] = await Promise.all([
      this.supabase.getClient().auth.admin.getUserById(userId),
      this.supabase.getClient().from('estudantes').select('*').eq('user_id', userId),
      this.supabase.getClient().from('sessoes_prova').select('id, simulado_id, status, nota, iniciado_em, finalizado_em').eq('estudante_id', userId),
      this.supabase.getClient().from('respostas_objetivas').select('sessao_id, questao_id, respondido_em').eq('estudante_id', userId),
    ])

    return {
      exportado_em: new Date().toISOString(),
      usuario: {
        id: user.data.user?.id,
        email: user.data.user?.email,
        criado_em: user.data.user?.created_at,
      },
      perfis: estudantes.data ?? [],
      sessoes: sessoes.data ?? [],
      respostas: respostas.data ?? [],
    }
  }
}

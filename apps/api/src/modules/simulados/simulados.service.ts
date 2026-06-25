import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateSimuladoDto } from './dto/create-simulado.dto.js'

@Injectable()
export class SimuladosService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('simulados')
      .select(
        `id, titulo, descricao, modo_aplicacao, status, data_inicio, data_fim,
         tempo_limite_min, embed_ativo, criado_em,
         simulado_questoes(count)`,
      )
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })

    if (error) throw new Error(error.message)
    return data ?? []
  }

  async findOne(id: string, tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('simulados')
      .select(
        `id, titulo, descricao, modo_aplicacao, status, data_inicio, data_fim,
         tempo_limite_min, metodo_identificacao, embed_ativo, embed_token, regras,
         criado_em, atualizado_em,
         simulado_questoes(id, questao_id, ordem, peso, anulada, questoes(id, enunciado, tipo))`,
      )
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundException('Simulado não encontrado')
    return data
  }

  async create(tenantId: string, userId: string, dto: CreateSimuladoDto) {
    // Generate a unique embed token
    const embedToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const { data, error } = await this.supabase
      .getClient()
      .from('simulados')
      .insert({
        tenant_id: tenantId,
        titulo: dto.titulo,
        descricao: dto.descricao ?? null,
        modo_aplicacao: dto.modo_aplicacao,
        status: 'rascunho',
        data_inicio: dto.data_inicio ?? null,
        data_fim: dto.data_fim ?? null,
        tempo_limite_min: dto.tempo_limite_min ?? null,
        metodo_identificacao: dto.metodo_identificacao ?? null,
        embed_ativo: dto.embed_ativo ?? false,
        embed_token: embedToken,
        regras: dto.regras ?? {},
        criado_por: userId,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  }

  async update(id: string, tenantId: string, dto: Partial<CreateSimuladoDto>) {
    const existing = await this.findOne(id, tenantId)

    if ((existing as { status: string }).status === 'encerrado') {
      throw new BadRequestException('Simulado encerrado não pode ser editado')
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('simulados')
      .update({ ...dto, atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundException('Simulado não encontrado')
    return data
  }

  async remove(id: string, tenantId: string) {
    const existing = await this.findOne(id, tenantId)

    if ((existing as { status: string }).status === 'publicado') {
      throw new BadRequestException(
        'Simulado publicado não pode ser excluído. Encerre-o primeiro.',
      )
    }

    const { error } = await this.supabase
      .getClient()
      .from('simulados')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new Error(error.message)
    return { message: 'Simulado excluído' }
  }

  async publish(id: string, tenantId: string) {
    const simulado = await this.findOne(id, tenantId)
    const s = simulado as {
      status: string
      modo_aplicacao: string
      data_inicio: string | null
      data_fim: string | null
      simulado_questoes: unknown[]
    }

    if (s.status !== 'rascunho') {
      throw new BadRequestException('Apenas simulados em rascunho podem ser publicados')
    }

    if (!s.simulado_questoes || s.simulado_questoes.length === 0) {
      throw new BadRequestException('Simulado deve ter ao menos uma questão')
    }

    if (s.modo_aplicacao === 'janela_fixa') {
      if (!s.data_inicio || !s.data_fim) {
        throw new BadRequestException(
          'Simulado de janela fixa requer data_inicio e data_fim',
        )
      }
      if (new Date(s.data_fim) <= new Date(s.data_inicio)) {
        throw new BadRequestException('data_fim deve ser posterior a data_inicio')
      }
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('simulados')
      .update({
        status: 'publicado',
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new Error(error?.message ?? 'Erro ao publicar')
    return data
  }

  async getSessoes(simuladoId: string, tenantId: string) {
    // Verify simulado belongs to tenant
    await this.findOne(simuladoId, tenantId)

    const { data, error } = await this.supabase
      .getClient()
      .from('sessoes_prova')
      .select(
        `id, estudante_id, tentativa_num, is_teste, status, iniciado_em,
         finalizado_em, nota, posicao_ranking,
         estudantes(nome)`,
      )
      .eq('simulado_id', simuladoId)
      .order('iniciado_em', { ascending: false })

    if (error) throw new Error(error.message)
    return data ?? []
  }
}

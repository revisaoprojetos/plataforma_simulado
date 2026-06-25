import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateMatriculaDto } from './dto/create-matricula.dto.js'
import { UpdateMatriculaDto } from './dto/update-matricula.dto.js'

@Injectable()
export class MatriculasService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(
    tenantId: string,
    filter: { estudante_id?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = filter.page ?? 1
    const limit = Math.min(filter.limit ?? 50, 200)
    const offset = (page - 1) * limit

    let query = this.supabase.getClient()
      .from('matriculas')
      .select('id, estudante_id, plano, status, validade, criado_em, estudantes(nome, email)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })
      .range(offset, offset + limit - 1)

    if (filter.estudante_id) query = query.eq('estudante_id', filter.estudante_id)
    if (filter.status) query = query.eq('status', filter.status)

    const { data, count, error } = await query
    if (error) throw new BadRequestException(error.message)

    return {
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
      total_pages: Math.ceil((count ?? 0) / limit),
    }
  }

  async findOne(id: string, tenantId: string) {
    const { data, error } = await this.supabase.getClient()
      .from('matriculas')
      .select('*, estudantes(nome, email, cpf)')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()
    if (error || !data) throw new NotFoundException('Matrícula não encontrada')
    return data
  }

  async create(tenantId: string, dto: CreateMatriculaDto) {
    // Verify student exists in this tenant
    const { data: estudante } = await this.supabase.getClient()
      .from('estudantes')
      .select('id')
      .eq('id', dto.estudante_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!estudante) throw new NotFoundException('Estudante não encontrado neste tenant')

    const { data, error } = await this.supabase.getClient()
      .from('matriculas')
      .insert({
        tenant_id: tenantId,
        estudante_id: dto.estudante_id,
        plano: dto.plano ?? 'basico',
        status: 'ativa',
        validade: dto.validade ?? null,
      })
      .select()
      .single()

    if (error) throw new BadRequestException(error.message)
    return data
  }

  async update(id: string, tenantId: string, dto: UpdateMatriculaDto) {
    const existing = await this.findOne(id, tenantId)

    const { data, error } = await this.supabase.getClient()
      .from('matriculas')
      .update({
        ...dto,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error) throw new BadRequestException(error.message)
    return data
  }

  async cancel(id: string, tenantId: string) {
    return this.update(id, tenantId, { status: 'cancelada' })
  }

  // Check if a student has an active matricula
  async hasActiveMatricula(estudanteId: string, tenantId: string): Promise<boolean> {
    const now = new Date().toISOString()
    const { data } = await this.supabase.getClient()
      .from('matriculas')
      .select('id, validade')
      .eq('estudante_id', estudanteId)
      .eq('tenant_id', tenantId)
      .eq('status', 'ativa')
      .single()

    if (!data) return false
    if (data.validade && data.validade < now) return false
    return true
  }

  // Run daily: expire overdue matriculas
  async expireOverdue(tenantId: string) {
    const now = new Date().toISOString()
    const { data, error } = await this.supabase.getClient()
      .from('matriculas')
      .update({ status: 'expirada' })
      .eq('tenant_id', tenantId)
      .eq('status', 'ativa')
      .lt('validade', now)
      .select('id')

    if (error) throw new BadRequestException(error.message)
    return { expired: data?.length ?? 0 }
  }
}

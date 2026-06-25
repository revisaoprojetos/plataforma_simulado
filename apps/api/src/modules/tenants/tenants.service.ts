import { Injectable, NotFoundException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateTenantDto } from './dto/create-tenant.dto.js'

@Injectable()
export class TenantsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenants')
      .select('id, nome, dominio, plano, ativo, criado_em')
      .order('nome')

    if (error) throw new Error(error.message)
    return data ?? []
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenants')
      .select('id, nome, dominio, tema, plano, ativo, criado_em')
      .eq('id', id)
      .single()

    if (error || !data) throw new NotFoundException('Tenant não encontrado')
    return data
  }

  async create(dto: CreateTenantDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenants')
      .insert({
        nome: dto.nome,
        dominio: dto.dominio,
        tema: dto.tema ?? {},
        plano: dto.plano ?? 'basico',
        ativo: true,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data
  }

  async update(id: string, dto: Partial<CreateTenantDto>) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenants')
      .update(dto)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) throw new NotFoundException('Tenant não encontrado')
    return data
  }
}

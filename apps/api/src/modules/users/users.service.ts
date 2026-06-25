import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateUserDto } from './dto/create-user.dto.js'

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .select('user_id, role, ativo, users(id, email, nome, status, ultimo_login)')
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: false })

    if (error) throw new Error(error.message)
    return data ?? []
  }

  async findOne(id: string, tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .select('user_id, role, ativo, users(id, email, nome, status)')
      .eq('user_id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundException('Usuário não encontrado')
    return data
  }

  async create(dto: CreateUserDto, tenantId: string) {
    // Create user in Supabase Auth
    const { data: authUser, error: authError } = await this.supabase
      .getClient()
      .auth.admin.createUser({
        email: dto.email,
        password: dto.password,
        user_metadata: { nome: dto.nome },
        email_confirm: true,
      })

    if (authError) {
      if (authError.message.includes('already registered')) {
        throw new ConflictException('E-mail já cadastrado')
      }
      throw new Error(authError.message)
    }

    const userId = authUser.user.id

    // Insert user profile
    await this.supabase.getClient().from('users').insert({
      id: userId,
      email: dto.email,
      nome: dto.nome,
      status: 'ativo',
    })

    // Link user to tenant
    await this.supabase.getClient().from('tenant_acessos').insert({
      user_id: userId,
      tenant_id: tenantId,
      role: dto.role ?? 'estudante',
      ativo: true,
    })

    // If it's a student, create estudante profile
    if (!dto.role || dto.role === 'estudante') {
      await this.supabase.getClient().from('estudantes').insert({
        user_id: userId,
        tenant_id: tenantId,
        nome: dto.nome,
      })
    }

    return { id: userId, email: dto.email, nome: dto.nome }
  }

  async deactivate(id: string, tenantId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .update({ ativo: false })
      .eq('user_id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new Error(error.message)
    return { message: 'Usuário desativado' }
  }
}

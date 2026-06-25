import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { SupabaseService } from '../supabase/supabase.service.js'
import { RbacService } from '../rbac/rbac.service.js'
import { LoginDto } from './dto/login.dto.js'
import { RefreshTokenDto } from './dto/refresh-token.dto.js'
import { EmbedIdentifyDto } from './dto/embed-identify.dto.js'
import { JwtPayload } from './strategies/jwt.strategy.js'

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwtService: JwtService,
    private readonly rbacService: RbacService,
  ) {}

  async login(dto: LoginDto) {
    const { data, error } = await this.supabase
      .getClient()
      .auth.signInWithPassword({ email: dto.email, password: dto.password })

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const { data: acessos } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .select('tenant_id, role, ativo')
      .eq('user_id', data.user.id)
      .eq('ativo', true)

    const roles = (acessos ?? []).map((a) => a.role as string)
    const tenantId = (acessos ?? [])[0]?.tenant_id as string | undefined

    // Load permissions for all roles in the first (or only) tenant
    let permissions: string[] = []
    if (tenantId) {
      permissions = await this.rbacService.getPermissionsForUser(data.user.id, tenantId)
    }

    const payload: JwtPayload = {
      sub: data.user.id,
      email: data.user.email ?? dto.email,
      tenantId,
      roles,
      permissions,
      type: 'access',
    }

    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' })

    return {
      access_token,
      refresh_token: data.session.refresh_token,
      user: { id: data.user.id, email: data.user.email, roles, permissions, tenant_acessos: acessos ?? [] },
    }
  }

  async refresh(dto: RefreshTokenDto) {
    const { data, error } = await this.supabase
      .getClient()
      .auth.refreshSession({ refresh_token: dto.refresh_token })

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Refresh token inválido ou expirado')
    }

    const { data: acessos } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .select('tenant_id, role, ativo')
      .eq('user_id', data.user.id)
      .eq('ativo', true)

    const roles = (acessos ?? []).map((a) => a.role as string)
    const tenantId = (acessos ?? [])[0]?.tenant_id as string | undefined

    let permissions: string[] = []
    if (tenantId) {
      permissions = await this.rbacService.getPermissionsForUser(data.user.id, tenantId)
    }

    const payload: JwtPayload = {
      sub: data.user.id,
      email: data.user.email ?? '',
      tenantId,
      roles,
      permissions,
      type: 'access',
    }

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '15m' }),
      refresh_token: data.session.refresh_token,
    }
  }

  async logout(userId: string) {
    await this.supabase.getClient().auth.admin.signOut(userId)
    return { message: 'Logout realizado com sucesso' }
  }

  async me(userId: string) {
    const { data: user, error } = await this.supabase
      .getClient()
      .auth.admin.getUserById(userId)

    if (error || !user) throw new UnauthorizedException('Usuário não encontrado')

    const { data: acessos } = await this.supabase
      .getClient()
      .from('tenant_acessos')
      .select('tenant_id, role, ativo, tenants(nome, dominio)')
      .eq('user_id', userId)
      .eq('ativo', true)

    return { id: user.user.id, email: user.user.email, tenant_acessos: acessos ?? [] }
  }

  async embedIdentify(dto: EmbedIdentifyDto, tenantId: string) {
    const { data: simulado, error: simError } = await this.supabase
      .getClient()
      .from('simulados')
      .select('id, titulo, status, metodo_identificacao, embed_ativo, tenant_id')
      .eq('tenant_id', tenantId)
      .eq('embed_token', dto.simulado_token)
      .single()

    if (simError || !simulado) throw new BadRequestException('Simulado não encontrado ou embed inativo')
    if (!simulado.embed_ativo) throw new BadRequestException('Embed não habilitado para este simulado')
    if (simulado.status !== 'publicado') throw new BadRequestException('Simulado não está publicado')

    const { data: users } = await this.supabase
      .getClient()
      .from('users')
      .select('id')
      .eq('email', dto.email)
      .single()

    if (!users) throw new UnauthorizedException('Aluno não encontrado')

    let query = this.supabase
      .getClient()
      .from('estudantes')
      .select('id, user_id, nome, cpf, telefone')
      .eq('tenant_id', tenantId)
      .eq('user_id', users.id)

    const { data: estudante, error: estError } = await query.single()
    if (estError || !estudante) throw new UnauthorizedException('Aluno não encontrado')

    const metodo: string = simulado.metodo_identificacao ?? 'email'
    if (metodo === 'email_cpf') {
      if (!dto.cpf || estudante.cpf !== dto.cpf.replace(/\D/g, '')) {
        throw new UnauthorizedException('CPF inválido')
      }
    }
    if (metodo === 'email_telefone') {
      if (!dto.telefone || estudante.telefone !== dto.telefone.replace(/\D/g, '')) {
        throw new UnauthorizedException('Telefone inválido')
      }
    }

    const payload: JwtPayload = {
      sub: estudante.user_id as string,
      email: dto.email,
      tenantId,
      type: 'embed',
    }

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '6h' }),
      estudante: { id: estudante.id, nome: estudante.nome },
      simulado: { id: simulado.id, titulo: simulado.titulo },
    }
  }
}

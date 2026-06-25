import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { CreateQuestaoDto } from './dto/create-questao.dto.js'
import { ListQuestoesDto } from './dto/list-questoes.dto.js'

@Injectable()
export class QuestoesService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(tenantId: string, filters: ListQuestoesDto) {
    const { page = 1, limit = 20, search, disciplina_id, banca_id, status } = filters
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = this.supabase
      .getClient()
      .from('questoes')
      .select(
        'id, external_id, tipo, enunciado, banca_id, orgao_id, ano, disciplina_id, assunto_id, nivel_dificuldade, status, versao, criado_em, bancas(nome), disciplinas(nome)',
        { count: 'exact' },
      )
      .eq('tenant_id', tenantId)
      .range(from, to)
      .order('criado_em', { ascending: false })

    if (search) {
      query = query.ilike('enunciado', `%${search}%`)
    }
    if (disciplina_id) {
      query = query.eq('disciplina_id', disciplina_id)
    }
    if (banca_id) {
      query = query.eq('banca_id', banca_id)
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) throw new Error(error.message)

    return {
      data: data ?? [],
      meta: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    }
  }

  async findOne(id: string, tenantId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('questoes')
      .select(
        `id, external_id, tipo, enunciado, banca_id, orgao_id, ano, disciplina_id,
         assunto_id, nivel_dificuldade, gabarito_tipo, comentario_professor, status,
         versao, criado_em, atualizado_em,
         alternativas(id, texto, correta, ordem),
         bancas(nome), orgaos(nome), disciplinas(nome), assuntos(nome)`,
      )
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (error || !data) throw new NotFoundException('Questão não encontrada')
    return data
  }

  async create(tenantId: string, userId: string, dto: CreateQuestaoDto) {
    if (dto.tipo === 'objetiva' && (!dto.alternativas || dto.alternativas.length < 2)) {
      throw new BadRequestException('Questão objetiva requer ao menos 2 alternativas')
    }

    const { data: questao, error } = await this.supabase
      .getClient()
      .from('questoes')
      .insert({
        tenant_id: tenantId,
        external_id: dto.external_id ?? null,
        tipo: dto.tipo,
        enunciado: dto.enunciado,
        banca_id: dto.banca_id ?? null,
        orgao_id: dto.orgao_id ?? null,
        ano: dto.ano ?? null,
        disciplina_id: dto.disciplina_id ?? null,
        assunto_id: dto.assunto_id ?? null,
        nivel_dificuldade: dto.nivel_dificuldade ?? null,
        gabarito_tipo: dto.gabarito_tipo ?? 'oficial',
        comentario_professor: dto.comentario_professor ?? null,
        status: 'rascunho',
        versao: 1,
        criado_por: userId,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    if (dto.alternativas && dto.alternativas.length > 0) {
      const alternativas = dto.alternativas.map((alt) => ({
        questao_id: questao.id,
        tenant_id: tenantId,
        texto: alt.texto,
        correta: alt.correta,
        ordem: alt.ordem,
      }))

      const { error: altError } = await this.supabase
        .getClient()
        .from('alternativas')
        .insert(alternativas)

      if (altError) throw new Error(altError.message)
    }

    return this.findOne(questao.id as string, tenantId)
  }

  async update(id: string, tenantId: string, dto: Partial<CreateQuestaoDto>) {
    const existing = await this.findOne(id, tenantId)

    const { alternativas: _alts, ...fields } = dto

    const { data, error } = await this.supabase
      .getClient()
      .from('questoes')
      .update({
        ...fields,
        versao: (existing as { versao: number }).versao + 1,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single()

    if (error || !data) throw new NotFoundException('Questão não encontrada')
    return data
  }

  async softDelete(id: string, tenantId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('questoes')
      .update({ status: 'arquivada', atualizado_em: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) throw new NotFoundException('Questão não encontrada')
    return { message: 'Questão arquivada com sucesso' }
  }
}

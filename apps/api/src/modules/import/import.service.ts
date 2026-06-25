import { Injectable, ForbiddenException, BadRequestException } from '@nestjs/common'
import { SupabaseService } from '../supabase/supabase.service.js'
import { ImportQuestoesDto, ImportQuestaoDto } from './dto/import-questoes.dto.js'

const REQUIRED_SCOPES = ['import:run', 'questoes:create']

@Injectable()
export class ImportService {
  constructor(private readonly supabase: SupabaseService) {}

  async importarQuestoes(
    tenantId: string,
    dto: ImportQuestoesDto,
    apiKeyEscopos: string[],
  ) {
    const hasScope = REQUIRED_SCOPES.some(s => apiKeyEscopos.includes(s))
    if (!hasScope) {
      throw new ForbiddenException(
        `Escopo insuficiente. Necessário: ${REQUIRED_SCOPES.join(' ou ')}`,
      )
    }

    let importadas = 0
    let atualizadas = 0
    const erros: Array<{ index: number; external_id?: string; erro: string }> = []

    for (let i = 0; i < dto.questoes.length; i++) {
      const q = dto.questoes[i]
      try {
        const isUpdate = await this.upsertQuestao(tenantId, q)
        if (isUpdate) atualizadas++
        else importadas++
      } catch (err) {
        erros.push({
          index: i,
          external_id: q.external_id,
          erro: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { importadas, atualizadas, erros }
  }

  private async upsertQuestao(tenantId: string, q: ImportQuestaoDto): Promise<boolean> {
    const supabase = this.supabase.getClient()

    let disciplinaId: string | null = null
    if (q.disciplina_nome) {
      disciplinaId = await this.resolveOrCreate(
        'disciplinas',
        { nome: q.disciplina_nome, tenant_id: tenantId },
        tenantId,
      )
    }

    let bancaId: string | null = null
    if (q.banca_nome) {
      bancaId = await this.resolveOrCreate(
        'bancas',
        { nome: q.banca_nome, tenant_id: tenantId },
        tenantId,
      )
    }

    let isUpdate = false

    if (q.external_id) {
      const { data: existing } = await supabase
        .from('questoes')
        .select('id')
        .eq('external_id', q.external_id)
        .eq('tenant_id', tenantId)
        .single()

      if (existing) {
        isUpdate = true
        const { error } = await supabase
          .from('questoes')
          .update({
            enunciado: q.enunciado,
            tipo: q.tipo ?? 'objetiva',
            disciplina_id: disciplinaId,
            banca_id: bancaId,
            nivel_dificuldade: q.nivel_dificuldade ?? null,
            ano: q.ano ?? null,
            comentario_professor: q.comentario_professor ?? null,
            status: 'publicada',
          })
          .eq('id', existing.id)
          .eq('tenant_id', tenantId)

        if (error) throw new BadRequestException(error.message)
        await this.upsertAlternativas(existing.id, q.alternativas)
        return true
      }
    }

    const { data: questao, error: questaoError } = await supabase
      .from('questoes')
      .insert({
        tenant_id: tenantId,
        external_id: q.external_id ?? null,
        enunciado: q.enunciado,
        tipo: q.tipo ?? 'objetiva',
        disciplina_id: disciplinaId,
        banca_id: bancaId,
        nivel_dificuldade: q.nivel_dificuldade ?? null,
        ano: q.ano ?? null,
        comentario_professor: q.comentario_professor ?? null,
        status: 'publicada',
      })
      .select('id')
      .single()

    if (questaoError || !questao) {
      throw new BadRequestException(questaoError?.message ?? 'Erro ao criar questão')
    }

    await this.upsertAlternativas(questao.id, q.alternativas)
    return isUpdate
  }

  private async upsertAlternativas(
    questaoId: string,
    alternativas: ImportQuestaoDto['alternativas'],
  ) {
    if (!alternativas?.length) return

    await this.supabase.getClient()
      .from('alternativas')
      .delete()
      .eq('questao_id', questaoId)

    const rows = alternativas.map((alt, idx) => ({
      questao_id: questaoId,
      texto: alt.texto,
      correta: alt.correta,
      ordem: alt.ordem ?? idx,
    }))

    const { error } = await this.supabase.getClient()
      .from('alternativas')
      .insert(rows)

    if (error) throw new BadRequestException(error.message)
  }

  private async resolveOrCreate(
    table: string,
    fields: Record<string, unknown>,
    tenantId: string,
  ): Promise<string> {
    const supabase = this.supabase.getClient()

    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq('nome', fields['nome'])
      .eq('tenant_id', tenantId)
      .single()

    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from(table)
      .insert(fields)
      .select('id')
      .single()

    if (error || !created) throw new BadRequestException(`Erro ao criar ${table}: ${error?.message}`)
    return created.id
  }
}

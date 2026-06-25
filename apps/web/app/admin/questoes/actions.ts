'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface AlternativaData {
  texto: string
  correta: boolean
  ordem: number
}

interface QuestaoData {
  tipo: string
  enunciado: string
  banca_id?: string
  orgao_id?: string
  ano?: number
  disciplina_id?: string
  assunto_id?: string
  nivel_dificuldade?: string
  gabarito_tipo?: string
  comentario_professor?: string
  status: string
  alternativas?: AlternativaData[]
}

export async function createQuestaoAction(data: QuestaoData) {
  const supabase = await createClient()

  const { data: questao, error } = await supabase
    .from('questoes')
    .insert({
      tipo: data.tipo,
      enunciado: data.enunciado,
      banca_id: data.banca_id || null,
      orgao_id: data.orgao_id || null,
      ano: data.ano || null,
      disciplina_id: data.disciplina_id || null,
      assunto_id: data.assunto_id || null,
      nivel_dificuldade: data.nivel_dificuldade || null,
      gabarito_tipo: data.gabarito_tipo || 'oficial',
      comentario_professor: data.comentario_professor || null,
      status: data.status,
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  if (data.tipo === 'objetiva' && data.alternativas?.length) {
    const { error: altError } = await supabase.from('alternativas').insert(
      data.alternativas.map((alt) => ({
        questao_id: questao.id,
        texto: alt.texto,
        correta: alt.correta,
        ordem: alt.ordem,
      }))
    )
    if (altError) {
      return { error: altError.message }
    }
  }

  revalidatePath('/admin/questoes')
  redirect('/admin/questoes')
}

export async function updateQuestaoAction(id: string, data: QuestaoData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('questoes')
    .update({
      tipo: data.tipo,
      enunciado: data.enunciado,
      banca_id: data.banca_id || null,
      orgao_id: data.orgao_id || null,
      ano: data.ano || null,
      disciplina_id: data.disciplina_id || null,
      assunto_id: data.assunto_id || null,
      nivel_dificuldade: data.nivel_dificuldade || null,
      gabarito_tipo: data.gabarito_tipo || 'oficial',
      comentario_professor: data.comentario_professor || null,
      status: data.status,
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  if (data.tipo === 'objetiva' && data.alternativas) {
    await supabase.from('alternativas').delete().eq('questao_id', id)
    await supabase.from('alternativas').insert(
      data.alternativas.map((alt) => ({
        questao_id: id,
        texto: alt.texto,
        correta: alt.correta,
        ordem: alt.ordem,
      }))
    )
  }

  revalidatePath('/admin/questoes')
  revalidatePath(`/admin/questoes/${id}/editar`)
  redirect('/admin/questoes')
}

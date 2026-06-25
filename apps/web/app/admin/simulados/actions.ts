'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface SimuladoData {
  titulo: string
  descricao?: string
  modo_aplicacao: string
  data_inicio?: string
  data_fim?: string
  tempo_limite_min?: number
  metodo_identificacao?: string
  embed_ativo?: boolean
  regras?: Record<string, unknown>
  status?: string
}

export async function createSimuladoAction(data: SimuladoData) {
  const supabase = await createClient()

  const { data: simulado, error } = await supabase
    .from('simulados')
    .insert({
      titulo: data.titulo,
      descricao: data.descricao || null,
      modo_aplicacao: data.modo_aplicacao,
      data_inicio: data.data_inicio || null,
      data_fim: data.data_fim || null,
      tempo_limite_min: data.tempo_limite_min || null,
      metodo_identificacao: data.metodo_identificacao || null,
      embed_ativo: data.embed_ativo ?? false,
      regras: data.regras ?? {},
      status: 'rascunho',
    })
    .select()
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/simulados')
  redirect(`/admin/simulados/${simulado.id}`)
}

export async function updateSimuladoAction(id: string, data: SimuladoData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('simulados')
    .update({
      titulo: data.titulo,
      descricao: data.descricao || null,
      modo_aplicacao: data.modo_aplicacao,
      data_inicio: data.data_inicio || null,
      data_fim: data.data_fim || null,
      tempo_limite_min: data.tempo_limite_min || null,
      metodo_identificacao: data.metodo_identificacao || null,
      embed_ativo: data.embed_ativo ?? false,
      regras: data.regras ?? {},
    })
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin/simulados')
  revalidatePath(`/admin/simulados/${id}`)
  redirect(`/admin/simulados/${id}`)
}

export async function publishSimuladoAction(id: string) {
  const supabase = await createClient()
  await supabase.from('simulados').update({ status: 'publicado' }).eq('id', id)
  revalidatePath(`/admin/simulados/${id}`)
}

export async function encerrarSimuladoAction(id: string) {
  const supabase = await createClient()
  await supabase.from('simulados').update({ status: 'encerrado' }).eq('id', id)
  revalidatePath(`/admin/simulados/${id}`)
}

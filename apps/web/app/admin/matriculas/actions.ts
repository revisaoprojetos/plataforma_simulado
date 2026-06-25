'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function criarMatricula(data: {
  estudante_id: string
  simulado_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    const { error } = await supabase.from('matriculas').insert({
      estudante_id: data.estudante_id,
      simulado_id: data.simulado_id,
      liberado: true,
    })

    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function toggleMatriculaAcesso(
  matriculaId: string,
  liberado: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('matriculas')
      .update({ liberado })
      .eq('id', matriculaId)

    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function excluirMatricula(
  matriculaId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const { error } = await supabase
      .from('matriculas')
      .delete()
      .eq('id', matriculaId)

    if (error) return { ok: false, error: error.message }
    revalidatePath('/admin/matriculas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

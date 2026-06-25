'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

export async function salvarContatos(formData: FormData) {
  const payload = {
    whatsapp:            (formData.get('whatsapp') as string | null) ?? null,
    email_suporte:       (formData.get('email_suporte') as string | null) ?? null,
    telefone:            (formData.get('telefone') as string | null) ?? null,
    link_ajuda:          (formData.get('link_ajuda') as string | null) ?? null,
    horario_atendimento: (formData.get('horario_atendimento') as string | null) ?? null,
    updated_at:          new Date().toISOString(),
  }

  const supabase = await createServiceClient()

  const { data: existing } = await supabase
    .from('tenant_contatos')
    .select('id')
    .limit(1)
    .single()

  if (existing?.id) {
    const { error } = await supabase
      .from('tenant_contatos')
      .update(payload)
      .eq('id', existing.id)

    if (error) throw new Error(`Erro ao salvar contatos: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('tenant_contatos')
      .insert(payload)

    if (error) throw new Error(`Erro ao criar contatos: ${error.message}`)
  }

  revalidatePath('/admin/configuracoes/mensagens')
}

export async function salvarMensagens(
  items: Array<{ id: string; titulo: string; corpo: string; ativo: boolean }>,
) {
  const supabase = await createServiceClient()

  for (const item of items) {
    const payload = {
      titulo:     item.titulo,
      corpo:      item.corpo,
      ativo:      item.ativo,
      updated_at: new Date().toISOString(),
    }

    // If id looks like a real UUID (from DB), update by id; otherwise upsert by chave
    const isRealId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)

    if (isRealId) {
      const { error } = await supabase
        .from('tenant_mensagens')
        .update(payload)
        .eq('id', item.id)

      if (error) throw new Error(`Erro ao salvar mensagem ${item.id}: ${error.message}`)
    } else {
      const { error } = await supabase
        .from('tenant_mensagens')
        .upsert({ chave: item.id, ...payload }, { onConflict: 'chave' })

      if (error) throw new Error(`Erro ao salvar mensagem ${item.id}: ${error.message}`)
    }
  }

  revalidatePath('/admin/configuracoes/mensagens')
}

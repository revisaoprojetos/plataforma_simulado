import { createServiceClient } from '@/lib/supabase/server'

export interface TenantMensagem {
  id: string
  chave: string
  titulo: string
  corpo: string
  canal: string
  ativo: boolean
}

export interface TenantContato {
  id?: string
  whatsapp?: string | null
  email_suporte?: string | null
  telefone?: string | null
  link_ajuda?: string | null
  horario_atendimento?: string | null
}

const DEFAULT_MENSAGENS: Record<string, Pick<TenantMensagem, 'titulo' | 'corpo'>> = {
  bloqueio_sem_matricula:  { titulo: 'Acesso não autorizado',        corpo: 'Olá {{nome}}, você não possui matrícula ativa nesta plataforma. Entre em contato: {{contato}}' },
  bloqueio_fora_janela:    { titulo: 'Simulado não disponível',      corpo: 'O simulado {{simulado}} não está disponível no momento. Aguarde o período de aplicação.' },
  bloqueio_prazo_expirado: { titulo: 'Prazo expirado',               corpo: 'Olá {{nome}}, o prazo para realizar o simulado {{simulado}} expirou. Entre em contato: {{contato}}' },
  bloqueio_tentativas:     { titulo: 'Tentativas esgotadas',         corpo: 'Olá {{nome}}, você atingiu o limite de tentativas para {{simulado}}. Entre em contato: {{contato}}' },
  bloqueio_identidade:     { titulo: 'Identificação não encontrada', corpo: 'Não encontramos seu cadastro. Verifique seus dados ou entre em contato: {{contato}}' },
  liberacao_disponivel:    { titulo: 'Simulado disponível!',         corpo: 'Olá {{nome}}, o simulado {{simulado}} já está disponível para você. Boas provas!' },
  liberacao_gabarito:      { titulo: 'Gabarito liberado',            corpo: 'O gabarito do simulado {{simulado}} foi liberado. Acesse sua área do aluno para ver o resultado.' },
  liberacao_nota:          { titulo: 'Resultado disponível',         corpo: 'Olá {{nome}}, sua nota no simulado {{simulado}} foi publicada. Acesse para conferir!' },
  alerta_tempo:            { titulo: 'Atenção: tempo acabando',      corpo: 'Olá {{nome}}, você tem pouco tempo restante no simulado {{simulado}}. Finalize logo!' },
  alerta_prazo:            { titulo: 'Prazo encerrando em breve',    corpo: 'Olá {{nome}}, o prazo para {{simulado}} encerra em {{prazo}}. Não deixe para depois!' },
}

export function renderMessage(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

export async function getTenantMensagem(
  chave: string,
  vars: Record<string, string> = {},
): Promise<{ titulo: string; corpo: string }> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('tenant_mensagens')
      .select('titulo, corpo')
      .eq('chave', chave)
      .eq('ativo', true)
      .single()

    if (error || !data) {
      const fallback = DEFAULT_MENSAGENS[chave] ?? { titulo: 'Aviso', corpo: 'Acesso não disponível.' }
      return {
        titulo: renderMessage(fallback.titulo, vars),
        corpo:  renderMessage(fallback.corpo, vars),
      }
    }

    return {
      titulo: renderMessage(data.titulo, vars),
      corpo:  renderMessage(data.corpo, vars),
    }
  } catch {
    const fallback = DEFAULT_MENSAGENS[chave] ?? { titulo: 'Aviso', corpo: 'Acesso não disponível.' }
    return {
      titulo: renderMessage(fallback.titulo, vars),
      corpo:  renderMessage(fallback.corpo, vars),
    }
  }
}

export async function getTenantContato(): Promise<TenantContato> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('tenant_contatos')
      .select('*')
      .limit(1)
      .single()

    if (error || !data) return {}
    return data as TenantContato
  } catch {
    return {}
  }
}

export async function getAllTenantMensagens(): Promise<TenantMensagem[]> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('tenant_mensagens')
      .select('*')
      .order('chave')

    if (error || !data) return buildDefaultList()
    return data as TenantMensagem[]
  } catch {
    return buildDefaultList()
  }
}

function buildDefaultList(): TenantMensagem[] {
  return Object.entries(DEFAULT_MENSAGENS).map(([chave, msg]) => ({
    id: chave,
    chave,
    titulo: msg.titulo,
    corpo: msg.corpo,
    canal: 'inapp',
    ativo: true,
  }))
}

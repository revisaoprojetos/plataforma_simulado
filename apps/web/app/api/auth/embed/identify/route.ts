import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getTenantMensagem, getTenantContato, type TenantContato } from '@/lib/tenant-messages'
import { rateLimit } from '@/lib/rate-limit'
import { registrarAudit } from '@/lib/audit'
import { dispararWebhook } from '@/lib/webhooks/dispatch'
import { contatoEstudante } from '@/lib/webhooks/payload'

interface RequestBody {
  embed_token?: string
  token?: string
  email: string
  cpf?: string
  telefone?: string
}

/** Monta um texto curto de contato a partir dos canais do tenant. */
function formatarContato(c: TenantContato): string {
  if (c.whatsapp) return `WhatsApp ${c.whatsapp}`
  if (c.email_suporte) return c.email_suporte
  if (c.telefone) return c.telefone
  if (c.link_ajuda) return c.link_ajuda
  return 'o suporte'
}

/**
 * Resposta de bloqueio personalizada pelo tenant (mensagem + variáveis + contato).
 * Retorna { titulo, message, contato } com status 403.
 */
// Mapeia a chave de bloqueio para o tipo de pop-up mostrado no login.
const TIPO_POR_CHAVE: Record<string, 'email_invalido' | 'nao_iniciado' | 'encerrado'> = {
  bloqueio_fora_janela: 'nao_iniciado',
  bloqueio_prazo_expirado: 'encerrado',
  bloqueio_identidade: 'email_invalido',
  bloqueio_sem_matricula: 'email_invalido',
  bloqueio_tentativas: 'email_invalido',
}

async function bloqueio(
  tenantId: string,
  chave: string,
  vars: Record<string, string>,
) {
  const contato = await getTenantContato(tenantId)
  const msg = await getTenantMensagem(chave, { contato: formatarContato(contato), ...vars }, tenantId)
  return NextResponse.json(
    { titulo: msg.titulo, message: msg.corpo, contato, tipo: TIPO_POR_CHAVE[chave] ?? 'email_invalido' },
    { status: 403 },
  )
}

export async function POST(request: NextRequest) {
  let body: RequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: 'Requisição inválida.' }, { status: 400 })
  }

  // Accept both embed_token (embed flow) and token (aluno/login flow)
  const embed_token = body.embed_token ?? body.token
  const { email, cpf, telefone } = body

  if (!embed_token || !email) {
    return NextResponse.json({ message: 'Dados obrigatórios ausentes.' }, { status: 400 })
  }

  // Rate-limit: protege o 2º fator (CPF/telefone) contra brute-force.
  // Por IP+simulado (8 tentativas / 5 min) e por e-mail+simulado (5 / 5 min).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown'
  const janela = 5 * 60 * 1000
  const rlIp = rateLimit(`identify:ip:${ip}:${embed_token}`, 8, janela)
  const rlEmail = rateLimit(`identify:email:${email.toLowerCase().trim()}:${embed_token}`, 5, janela)
  if (!rlIp.ok || !rlEmail.ok) {
    const retry = Math.max(rlIp.retryAfter, rlEmail.retryAfter)
    return NextResponse.json(
      { titulo: 'Muitas tentativas', message: `Você excedeu o limite de tentativas. Aguarde ${retry}s e tente novamente.` },
      { status: 429, headers: { 'Retry-After': String(retry) } },
    )
  }

  const supabase = await createServiceClient()

  // 1. Buscar simulado por embed_token
  const { data: simulado, error: simError } = await supabase
    .from('simulado_simulados')
    .select('id, titulo, status, metodo_identificacao, embed_ativo, tenant_id, data_inicio, data_fim, tempo_limite_min, regras, modo_aplicacao')
    .eq('embed_token', embed_token)
    .single()

  if (simError || !simulado) {
    return NextResponse.json({ message: 'Simulado não encontrado.' }, { status: 404 })
  }

  const tenantId = simulado.tenant_id as string
  const tituloSimulado = (simulado.titulo as string) ?? ''
  const regrasSim = (simulado.regras as Record<string, unknown>) ?? {}
  // Regra: "entrada antecipada" permite o aluno LOGAR antes do início e ficar aguardando.
  const entradaAntecipada = !!regrasSim.entrada_antecipada
  const agora = new Date()
  const antesDoInicio = !!simulado.data_inicio && new Date(simulado.data_inicio) > agora

  // 2. Identidade: buscar o estudante por e-mail (+ 2º fator) ANTES das checagens de janela/acesso,
  //    porque um TESTADOR pula essas checagens (mas ainda precisa provar quem é).
  const metodo = (simulado.metodo_identificacao as string) ?? 'email'
  // deletado=false + limit(1): ignora cadastros soft-deletados e tolera duplicata (mesmo e-mail).
  const { data: estudantesMatch } = await supabase
    .from('simulado_estudantes')
    .select('id, nome, email, user_id, cpf, telefone, classificacao')
    .eq('tenant_id', simulado.tenant_id)
    .eq('deletado', false)
    .ilike('email', email.toLowerCase().trim())
    .order('id')
    .limit(1)
  const estudante = estudantesMatch?.[0]

  if (!estudante) {
    return bloqueio(tenantId, 'bloqueio_identidade', { simulado: tituloSimulado })
  }

  // Validar segundo fator conforme metodo
  if (metodo === 'email_cpf') {
    if (!cpf) {
      return NextResponse.json({ message: 'CPF é obrigatório para este simulado.' }, { status: 400 })
    }
    const cpfNorm = cpf.replace(/\D/g, '')
    const estudanteCpfNorm = (estudante.cpf as string | null)?.replace(/\D/g, '') ?? ''
    if (cpfNorm !== estudanteCpfNorm) {
      return bloqueio(tenantId, 'bloqueio_identidade', { nome: estudante.nome ?? '', simulado: tituloSimulado })
    }
  } else if (metodo === 'email_telefone') {
    if (!telefone) {
      return NextResponse.json({ message: 'Telefone é obrigatório para este simulado.' }, { status: 400 })
    }
    const telNorm = telefone.replace(/\D/g, '')
    const estudanteTelNorm = (estudante.telefone as string | null)?.replace(/\D/g, '') ?? ''
    if (telNorm !== estudanteTelNorm) {
      return bloqueio(tenantId, 'bloqueio_identidade', { nome: estudante.nome ?? '', simulado: tituloSimulado })
    }
  }

  // 3. TESTADOR? Se sim, faz o simulado como TESTE: pula status/janela/manutenção/matrícula, sem
  //    limite de tentativas, e a sessão nasce is_teste=true (fora de estatísticas/ranking/relatórios).
  const ehTeste = await isTestador(supabase, estudante.id, simulado.id)

  let acessoAvulso: { id: string; expira_em: string | null; tentativas_permitidas: number; tentativas_usadas: number } | null = null
  if (!ehTeste) {
    if (simulado.status !== 'publicado' && simulado.status !== 'ativo') {
      return bloqueio(tenantId, 'bloqueio_fora_janela', { simulado: tituloSimulado })
    }
    // Manutenção: se ativa e dentro da janela, o aluno vê um aviso e NÃO acessa a prova.
    const manut = (regrasSim.manutencao ?? null) as { ativo?: boolean; inicio?: string | null; fim?: string | null } | null
    if (manut?.ativo) {
      const mIni = manut.inicio ? new Date(manut.inicio) : null
      const mFim = manut.fim ? new Date(manut.fim) : null
      const emManutencao = (!mIni || agora >= mIni) && (!mFim || agora <= mFim)
      if (emManutencao) {
        const fmtM = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        const msg = `Este simulado está em manutenção${mFim ? ` até ${fmtM(mFim)} (horário de Brasília)` : ''}. Tente novamente mais tarde.`
        return NextResponse.json({ titulo: 'Simulado em manutenção', message: msg, tipo: 'nao_iniciado' }, { status: 403 })
      }
    }
    if (antesDoInicio && !entradaAntecipada) {
      return bloqueio(tenantId, 'bloqueio_fora_janela', { simulado: tituloSimulado })
    }
    if (simulado.data_fim && new Date(simulado.data_fim) < agora) {
      return bloqueio(tenantId, 'bloqueio_prazo_expirado', { simulado: tituloSimulado })
    }

    // Acesso: modo prazo_relativo usa acesso avulso (simulado_acessos); demais usam matrícula ativa.
    if (simulado.modo_aplicacao === 'prazo_relativo') {
      const { data: acesso } = await supabase
        .from('simulado_acessos')
        .select('id, expira_em, tentativas_permitidas, tentativas_usadas')
        .eq('simulado_id', simulado.id)
        .eq('estudante_id', estudante.id)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!acesso) {
        return bloqueio(tenantId, 'bloqueio_sem_matricula', { nome: estudante.nome ?? '', simulado: tituloSimulado })
      }
      if (acesso.expira_em && new Date(acesso.expira_em) < new Date()) {
        return bloqueio(tenantId, 'bloqueio_prazo_expirado', { nome: estudante.nome ?? '', simulado: tituloSimulado })
      }
      acessoAvulso = acesso
    } else {
      const temAcesso = await verificarAcesso(supabase, estudante.id, simulado.id)
      if (!temAcesso) {
        return bloqueio(tenantId, 'bloqueio_sem_matricula', { nome: estudante.nome ?? '', simulado: tituloSimulado })
      }
    }

    // Entrada antecipada + ainda antes do início: valida tudo mas NÃO cria a sessão (tela de espera).
    if (entradaAntecipada && antesDoInicio) {
      return NextResponse.json({ aguardando: true, data_inicio: simulado.data_inicio, estudante_nome: estudante.nome })
    }
  }

  // 4. Abrir ou retomar sessao_prova (is_teste = ehTeste — teste e prova real não se misturam).
  const { data: sessaoExistente } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, status')
    .eq('simulado_id', simulado.id)
    .eq('estudante_id', estudante.id)
    .eq('is_teste', ehTeste)
    .neq('status', 'finalizada')
    .order('iniciado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sessaoId: string

  if (sessaoExistente) {
    // Retoma a sessão em andamento.
    sessaoId = sessaoExistente.id
  } else {
    let tentativaNum: number

    if (ehTeste) {
      // Testador: sem limite de tentativas; numera pelas sessões de teste já finalizadas.
      const { count } = await supabase
        .from('simulado_sessoes_prova')
        .select('*', { count: 'exact', head: true })
        .eq('simulado_id', simulado.id).eq('estudante_id', estudante.id).eq('is_teste', true).eq('status', 'finalizada')
      tentativaNum = (count ?? 0) + 1
    } else if (acessoAvulso) {
      // Modo prazo relativo: limite e contagem vêm do acesso avulso.
      if (acessoAvulso.tentativas_usadas >= acessoAvulso.tentativas_permitidas) {
        return bloqueio(tenantId, 'bloqueio_tentativas', { nome: estudante.nome ?? '', simulado: tituloSimulado, tentativas_restantes: '0' })
      }
      tentativaNum = acessoAvulso.tentativas_usadas + 1
      await supabase.from('simulado_acessos').update({ tentativas_usadas: tentativaNum }).eq('id', acessoAvulso.id)
    } else {
      // Demais modos — limite de retentativas pela regra (sem config = ilimitado).
      const regras = (simulado.regras as Record<string, unknown>) ?? {}
      const max = Number(regras.max_tentativas ?? regras.retentativas ?? 0)
      const ilimitado = !(max > 0)
      const { count: finalizadas } = await supabase
        .from('simulado_sessoes_prova')
        .select('*', { count: 'exact', head: true })
        .eq('simulado_id', simulado.id)
        .eq('estudante_id', estudante.id)
        .eq('is_teste', false)
        .eq('status', 'finalizada')

      if (!ilimitado && (finalizadas ?? 0) >= max) {
        return bloqueio(tenantId, 'bloqueio_tentativas', { nome: estudante.nome ?? '', simulado: tituloSimulado, tentativas_restantes: '0' })
      }
      tentativaNum = (finalizadas ?? 0) + 1
    }

    const { data: novaSessao, error: sessaoError } = await supabase
      .from('simulado_sessoes_prova')
      .insert({
        tenant_id: simulado.tenant_id,
        simulado_id: simulado.id,
        estudante_id: estudante.id,
        is_teste: ehTeste,
        status: 'em_andamento',
        iniciado_em: new Date().toISOString(),
        tentativa_num: tentativaNum,
      })
      .select('id')
      .single()

    if (sessaoError || !novaSessao) {
      console.error('[embed/identify] Erro ao criar sessão:', sessaoError)
      return NextResponse.json({ message: 'Erro ao iniciar sessão. Tente novamente.' }, { status: 500 })
    }

    sessaoId = novaSessao.id

    // Notifica sistemas externos só na prova REAL (não em sessão de teste).
    if (!ehTeste) {
      await dispararWebhook(simulado.tenant_id, 'estudante.iniciou', {
        contact: contatoEstudante(estudante),
        simulado: { id: simulado.id, name: tituloSimulado },
        sessao_id: sessaoId,
        tentativa: tentativaNum,
      })
    }
  }

  // Auditoria: acesso do aluno ao simulado (entrada na prova).
  await registrarAudit({
    operacao: 'LOGIN', entidade: 'simulado_acesso', entidadeId: estudante.id, atorTipo: 'estudante', tenantId,
    depois: { nome: estudante.nome ?? 'Aluno', email: estudante.email ?? null, simulado_id: simulado.id, simulado: tituloSimulado, sessao_id: sessaoId },
  })

  return NextResponse.json({
    sessao_id: sessaoId,
    sessionToken: sessaoId,
    estudante_nome: estudante.nome,
  })
}

async function verificarAcesso(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  estudanteId: string,
  simuladoId: string
): Promise<boolean> {
  // Matrícula ativa e liberada para este simulado. IMPORTANTE: pode haver matrícula
  // DUPLICADA (re-matrícula, sync de passaporte, etc.). `.maybeSingle()` LANÇA erro com
  // 2+ linhas → retornava null → "sem matrícula" indevido. Buscamos TODAS e liberamos
  // se ALGUMA estiver ativa e liberada.
  const { data: matriculas } = await supabase
    .from('simulado_matriculas')
    .select('id, liberado, status')
    .eq('estudante_id', estudanteId)
    .eq('simulado_id', simuladoId)

  if (!matriculas || matriculas.length === 0) return false
  return matriculas.some((m) => (!m.status || m.status === 'ativa') && m.liberado !== false)
}

/** O estudante tem "acesso de teste" neste simulado? (faz como is_teste, fora da janela). */
async function isTestador(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  estudanteId: string,
  simuladoId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('simulado_testadores')
    .select('id')
    .eq('simulado_id', simuladoId)
    .eq('estudante_id', estudanteId)
    .limit(1)
    .maybeSingle()
  if (error) return false // tabela pode não existir ainda → ninguém é testador
  return !!data
}

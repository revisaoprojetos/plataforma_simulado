'use server'
// CS › Disparo de Campanha. IMPORTANTE: não existe (ainda) provedor de e-mail/WhatsApp no servidor — estas actions
// REGISTRAM a campanha (público, texto, agendamento, estimativa) na fila (`simulado_campanhas`), mas NÃO enviam.
// O disparo real (worker + provedor) é a pendência; teste e envio retornam aviso explícito em vez de fingir sucesso.
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { registrarAudit } from '@/lib/audit'
import { brtLocalParaIso } from '@/lib/brt'
import { createClient } from '@/lib/supabase/server'
import { envioConfigurado, enviarTeste } from '@/lib/admin-revisao/campanha-envio'
import { guardCs, isUuid, contarPublico } from '@/lib/admin-revisao/cs-server'
import { API_PROVEDORES, type PublicoItem } from '@/lib/admin-revisao/cs-tipos'

type R = { ok: boolean; error?: string; id?: string; status?: string }

function publicoValido(p: PublicoItem[]): PublicoItem[] | null {
  if (!Array.isArray(p) || !p.length || p.length > 60) return null
  const out: PublicoItem[] = []
  for (const x of p) {
    if (!['todos', 'sem_acesso_7d', 'grupo', 'membro'].includes(x?.tipo)) return null
    if ((x.tipo === 'grupo' || x.tipo === 'membro') && !isUuid(x.id)) return null
    out.push({ tipo: x.tipo, id: x.id, nome: String(x.nome ?? '').slice(0, 160) })
  }
  return out
}

/** "N alunos vão receber" — contagem SERVER-SIDE (alunos distintos, sem bloqueados). */
export async function estimarPublicoAction(publico: PublicoItem[], canal: 'email' | 'api' = 'email'): Promise<{ ok: boolean; total?: number; error?: string }> {
  const g = await guardCs('estudantes:view'); if (!g.ok) return g
  const p = publicoValido(publico); if (!p) return { ok: true, total: 0 }
  return { ok: true, total: await contarPublico(g.tenantId, p, canal) }
}

export async function salvarApiConfigAction(i: { provedor: string; numero: string; conectada: boolean }): Promise<R> {
  const g = await guardCs('configuracoes:manage'); if (!g.ok) return g
  if (!API_PROVEDORES.includes(i.provedor as (typeof API_PROVEDORES)[number])) return { ok: false, error: 'Serviço inválido.' }
  const numero = (i.numero ?? '').trim().slice(0, 30)
  if (numero && !/^[+\d()\s-]{8,30}$/.test(numero)) return { ok: false, error: 'Número inválido. Use o formato +55 (31) 00000-0000.' }
  if (i.conectada && !numero) return { ok: false, error: 'Informe o número que envia antes de marcar como conectada.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_campanha_api_config').upsert({ tenant_id: g.tenantId, provedor: i.provedor, numero: numero || null, conectada: !!i.conectada, atualizado_em: new Date().toISOString() }, { onConflict: 'tenant_id' })
  if (error) return { ok: false, error: /relation|schema cache|does not exist/i.test(error.message) ? 'Aplique a migração 20261112040000 (campanhas) e tente de novo.' : error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_campanha_api_config', depois: { provedor: i.provedor, numero: numero || null, conectada: !!i.conectada } })
  revalidatePath('/admin/revisao/campanhas')
  return { ok: true }
}

/** Teste: envia SÓ para o e-mail do próprio admin, e só se o fluxo de envio estiver configurado (CAMPANHA_WEBHOOK_URL). */
export async function enviarTesteAction(i: { canal: 'email' | 'api'; assunto: string; mensagem: string; cta?: string }): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (!envioConfigurado()) return { ok: false, error: 'Envio desligado: o fluxo de envio (CAMPANHA_WEBHOOK_URL) ainda não foi configurado no servidor. Nada foi enviado.' }
  if (i.canal !== 'email') return { ok: false, error: 'Teste por mensagem de celular indisponível: o cadastro de admin não tem celular.' }
  if (!(i.mensagem ?? '').trim() || !(i.assunto ?? '').trim()) return { ok: false, error: 'Escreva assunto e mensagem antes de testar.' }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user?.email) return { ok: false, error: 'Seu usuário não tem e-mail.' }
  const r = await enviarTeste(g.tenantId, 'email', { assunto: i.assunto.trim(), mensagem: i.mensagem.trim(), cta: i.cta }, { id: user.id, nome: (user.user_metadata as any)?.full_name ?? user.email, email: user.email, telefone: null })
  return r.ok ? { ok: true } : { ok: false, error: 'Falha no fluxo de envio: ' + (r.erro ?? 'erro') }
}

export async function criarCampanhaAction(i: { canal: 'email' | 'api'; assunto: string; mensagem: string; cta?: string; modelo?: string; publico: PublicoItem[]; quando?: string | null; agendar: boolean }): Promise<R> {
  const g = await guardCs('estudantes:update'); if (!g.ok) return g
  if (i.canal !== 'email' && i.canal !== 'api') return { ok: false, error: 'Canal inválido.' }
  const mensagem = (i.mensagem ?? '').trim()
  const assunto = (i.assunto ?? '').trim()
  if (!mensagem) return { ok: false, error: 'Escreva a mensagem.' }
  if (mensagem.length > 4000) return { ok: false, error: 'Mensagem muito longa (máx. 4.000 caracteres).' }
  if (i.canal === 'email' && !assunto) return { ok: false, error: 'Escreva o assunto.' }
  const publico = publicoValido(i.publico); if (!publico) return { ok: false, error: 'Escolha para quem enviar.' }
  const svc = createAdminClient()
  if (i.canal === 'api') {
    const { data: cfg } = await svc.from('simulado_campanha_api_config').select('conectada').eq('tenant_id', g.tenantId).maybeSingle()
    if (!(cfg as any)?.conectada) return { ok: false, error: 'Conecte a API de mensagens antes de disparar.' }
  }
  let agendado: string | null = null
  if (i.agendar) {
    agendado = brtLocalParaIso(i.quando)
    if (!agendado || new Date(agendado).getTime() < Date.now() + 60_000) return { ok: false, error: 'Escolha uma data e hora futuras (horário de Brasília).' }
  }
  const estimativa = await contarPublico(g.tenantId, publico, i.canal)
  if (estimativa === 0) return { ok: false, error: 'Nenhum aluno encontrado para este público.' }
  const status = agendado ? 'agendada' : 'na_fila'
  const { data, error } = await svc.from('simulado_campanhas').insert({
    tenant_id: g.tenantId, canal: i.canal, assunto: assunto || i.modelo || null, mensagem, cta: (i.cta ?? '').trim() || null, modelo: i.modelo || null,
    publico, estimativa, agendado_para: agendado, status,
  }).select('id').single()
  if (error) return { ok: false, error: /relation|schema cache|does not exist/i.test(error.message) ? 'Aplique a migração 20261112040000 (campanhas) e tente de novo.' : error.message }
  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_campanhas', entidadeId: data.id, depois: { canal: i.canal, assunto: assunto || null, estimativa, status, agendado_para: agendado, publico: publico.map((p) => p.nome) } })
  revalidatePath('/admin/revisao/campanhas')
  return { ok: true, id: data.id, status }
}

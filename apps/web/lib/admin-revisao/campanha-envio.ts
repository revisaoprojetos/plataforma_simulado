import 'server-only'
// ENVIO de campanhas (CS › Disparo de Campanha). O repositório NÃO tem provedor de e-mail/WhatsApp próprio; o único
// mecanismo de saída é HTTP (webhooks de saída/n8n). Aqui o envio é um POST assinado (HMAC-SHA256) para um
// fluxo configurável — quem entrega de fato (e-mail, Meta/Z-API/Twilio) é o fluxo do n8n.
//
// DESLIGADO ATÉ CONFIGURAR: sem `CAMPANHA_WEBHOOK_URL` nada é enviado (a campanha só fica registrada na fila).
//   CAMPANHA_WEBHOOK_URL     = URL do fluxo (obrigatória)      CAMPANHA_WEBHOOK_SECRET = segredo HMAC (recomendado)
// Cron `/api/cron/campanhas-enviar` (CRON_SECRET) processa 'agendada' vencidas e 'na_fila'; dry-run por padrão.
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { destinatariosCampanha, type Destinatario } from '@/lib/admin-revisao/cs-server'
import type { PublicoItem } from '@/lib/admin-revisao/cs-tipos'

const LOTE = 200

export function envioConfigurado(): boolean { return /^https?:\/\//i.test(process.env.CAMPANHA_WEBHOOK_URL ?? '') }

const primeiroNome = (n: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'aluno'

async function postar(corpo: unknown): Promise<{ ok: boolean; status: number | null; erro?: string }> {
  const url = process.env.CAMPANHA_WEBHOOK_URL
  if (!url) return { ok: false, status: null, erro: 'CAMPANHA_WEBHOOK_URL não configurada.' }
  const raw = JSON.stringify(corpo)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const seg = process.env.CAMPANHA_WEBHOOK_SECRET
  if (seg) headers['x-signature'] = `sha256=${crypto.createHmac('sha256', seg).update(raw).digest('hex')}`
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15_000)
  try {
    const r = await fetch(url, { method: 'POST', headers, body: raw, signal: ctrl.signal })
    return { ok: r.ok, status: r.status, erro: r.ok ? undefined : `HTTP ${r.status}` }
  } catch (e: any) { return { ok: false, status: null, erro: e?.name === 'AbortError' ? 'timeout' : (e?.message ?? 'falha de rede') } }
  finally { clearTimeout(t) }
}

type Camp = { id: string; tenant_id: string; canal: 'email' | 'api'; assunto: string | null; mensagem: string; cta: string | null; modelo: string | null; publico: PublicoItem[] }

function corpoLote(c: Camp, plataforma: string, dest: Destinatario[], lote: number, teste = false) {
  return {
    evento: 'campanha.disparo', teste, plataforma, tenant_id: c.tenant_id, campanha_id: c.id, canal: c.canal,
    assunto: c.assunto, mensagem: c.mensagem, cta: c.cta, modelo: c.modelo, lote,
    destinatarios: dest.map((d) => ({ id: d.id, nome: d.nome, primeiro_nome: primeiroNome(d.nome), email: d.email, telefone: d.telefone })),
  }
}

async function nomePlataforma(tenantId: string): Promise<string> {
  const { data } = await createAdminClient().from('simulado_tenants').select('nome').eq('id', tenantId).maybeSingle()
  return ((data as any)?.nome as string) ?? 'Plataforma'
}

/** Envia UMA campanha (todos os lotes). Atualiza o status. Só chame quando `envioConfigurado()`. */
export async function enviarCampanha(c: Camp): Promise<{ ok: boolean; enviados: number; erro?: string }> {
  const svc = createAdminClient()
  const marca = await svc.from('simulado_campanhas').update({ status: 'enviando' }).eq('id', c.id).eq('tenant_id', c.tenant_id).in('status', ['agendada', 'na_fila']).select('id')
  if (!marca.data?.length) return { ok: false, enviados: 0, erro: 'Campanha já em andamento ou finalizada.' }
  const plataforma = await nomePlataforma(c.tenant_id)
  let depois: string | null = null, enviados = 0, lote = 0
  for (;;) {
    const dest = await destinatariosCampanha(c.tenant_id, c.publico, c.canal, depois, LOTE)
    if (dest == null) { await svc.from('simulado_campanhas').update({ status: 'erro', enviados }).eq('id', c.id); return { ok: false, enviados, erro: 'SQL direto indisponível (DATABASE_URL) para listar destinatários.' } }
    if (!dest.length) break
    const r = await postar(corpoLote(c, plataforma, dest, ++lote))
    if (!r.ok) { await svc.from('simulado_campanhas').update({ status: 'erro', enviados }).eq('id', c.id); return { ok: false, enviados, erro: r.erro } }
    enviados += dest.length; depois = dest[dest.length - 1].id
    if (dest.length < LOTE) break
  }
  await svc.from('simulado_campanhas').update({ status: 'enviada', enviados, enviado_em: new Date().toISOString() }).eq('id', c.id)
  return { ok: true, enviados }
}

/** E-mail de TESTE para um único destinatário (o próprio admin). Marca `teste:true` no payload. */
export async function enviarTeste(tenantId: string, canal: 'email' | 'api', c: { assunto: string; mensagem: string; cta?: string }, para: Destinatario): Promise<{ ok: boolean; erro?: string }> {
  const plataforma = await nomePlataforma(tenantId)
  const r = await postar(corpoLote({ id: 'teste', tenant_id: tenantId, canal, assunto: c.assunto, mensagem: c.mensagem, cta: c.cta ?? null, modelo: null, publico: [] }, plataforma, [para], 1, true))
  return { ok: r.ok, erro: r.erro }
}

/** Processa o que está vencido. dry=true só lista. */
export async function processarPendentes(opts: { dry: boolean; tenantId?: string }) {
  const svc = createAdminClient()
  const agora = new Date().toISOString()
  let q = svc.from('simulado_campanhas').select('id, tenant_id, canal, assunto, mensagem, cta, modelo, publico, status, agendado_para')
    .or(`status.eq.na_fila,and(status.eq.agendada,agendado_para.lte.${agora})`).order('criado_em', { ascending: true }).order('id', { ascending: true }).limit(20)
  if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
  const { data, error } = await q
  if (error) return { ok: false, error: error.message, itens: [] as unknown[] }
  const itens: unknown[] = []
  for (const c of (data ?? []) as any[]) {
    if (opts.dry || !envioConfigurado()) { itens.push({ id: c.id, canal: c.canal, status: c.status, acao: opts.dry ? 'dry-run' : 'desligado (sem CAMPANHA_WEBHOOK_URL)' }); continue }
    itens.push({ id: c.id, ...(await enviarCampanha(c as Camp)) })
  }
  return { ok: true, envioConfigurado: envioConfigurado(), itens }
}

import 'server-only'
import { contatoEstudante, COLS_CONTATO } from '@/lib/webhooks/payload'
import { enviarWebhookDireto, type PlataformaWh } from '@/lib/webhooks/dispatch'
import { resolverRegras, interpolar, type EngajamentoRegras } from '@/lib/webhooks/engajamento-regras'
import { diaLocal, diaAnterior } from './datas'

/**
 * Engajamento POR WEBHOOK: cada webhook de saída que assina `gamificacao.inativo/sequencia/marco`
 * tem SUAS regras (dias/marcos/mensagem, em `engajamento_regras`) e recebe o evento na SUA URL.
 * Substitui a config global. Idempotência por (aluno, tipo, ref) — o ref inclui o id do webhook,
 * então o mesmo marco pode ir para vários webhooks sem repetir em cada um.
 */

type WhGamif = { id: string; nome: string | null; url: string; secret: string | null; eventos: string[]; regras: EngajamentoRegras }

/** Webhooks ATIVOS do tenant que assinam algum evento de gamificação, já com as regras resolvidas. */
async function carregarWebhooksGamif(svc: any, tenantId: string): Promise<WhGamif[]> {
  let r = await svc.from('simulado_webhook_saida').select('id, nome, url, secret, eventos, engajamento_regras').eq('tenant_id', tenantId).eq('ativo', true)
  if (r.error && /engajamento_regras|column/i.test(r.error.message)) {
    r = await svc.from('simulado_webhook_saida').select('id, nome, url, secret, eventos').eq('tenant_id', tenantId).eq('ativo', true)
  }
  if (r.error) return []
  return ((r.data ?? []) as any[])
    .filter((w) => Array.isArray(w.eventos) && w.eventos.some((e: string) => e.startsWith('gamificacao.')))
    .map((w) => ({ id: w.id, nome: w.nome ?? null, url: w.url, secret: w.secret ?? null, eventos: w.eventos, regras: resolverRegras(w.engajamento_regras) }))
}

async function plataformaDo(svc: any, tenantId: string): Promise<PlataformaWh> {
  const { data } = await svc.from('simulado_tenants').select('nome, slug').eq('id', tenantId).maybeSingle()
  return { id: tenantId, nome: (data as any)?.nome ?? null, slug: (data as any)?.slug ?? null }
}

/** Dispara UM gatilho para UM webhook — idempotente por (aluno,tipo,ref:webhookId). Retorna true se enviou. */
async function dispararParaWebhook(
  svc: any, tenantId: string, plataforma: PlataformaWh, wh: WhGamif,
  tipo: 'inativo' | 'sequencia' | 'marco', baseRef: string,
  est: any, estudanteId: string, extra: { dias: number | null; marco: number | null; streakAtual: number; streakMaior: number; mensagemTpl: string },
): Promise<boolean> {
  const ref = `${baseRef}:${wh.id}`
  const { data: inserido, error } = await svc
    .from('simulado_gamificacao_engajamento_log')
    .upsert({ tenant_id: tenantId, estudante_id: estudanteId, tipo, ref }, { onConflict: 'tenant_id,estudante_id,tipo,ref', ignoreDuplicates: true })
    .select('id')
  if (error || !inserido?.length) return false // já enviado (ou sem tabela de log)
  const nome = (est?.nome ?? '').split(' ')[0] || 'estudante'
  const mensagem = interpolar(extra.mensagemTpl, { nome, dias: extra.dias ?? extra.streakAtual, marco: extra.marco ?? '', streak: extra.streakAtual, maior: extra.streakMaior })
  return enviarWebhookDireto(svc, tenantId, plataforma, `gamificacao.${tipo}` as any, {
    contact: contatoEstudante(est, estudanteId),
    engajamento: { tipo, dias: extra.dias, marco: extra.marco, streak_atual: extra.streakAtual, streak_maior: extra.streakMaior, mensagem },
  }, { webhookId: wh.id, nome: wh.nome, url: wh.url, secret: wh.secret })
}

/**
 * Chamado ao registrar atividade (streak.ts): avalia SEQUÊNCIA e MARCO de cada webhook contra o streak
 * atual do aluno e dispara os que casam. `hoje` = dia local (para montar o ref estável da sequência).
 */
export async function avaliarEngajamentoAoEstudar(
  svc: any, args: { tenantId: string; estudanteId: string; streakAtual: number; streakMaior: number; hoje: string },
): Promise<void> {
  try {
    const whs = await carregarWebhooksGamif(svc, args.tenantId)
    const alvo = whs.filter((w) => w.eventos.includes('gamificacao.sequencia') || w.eventos.includes('gamificacao.marco'))
    if (!alvo.length) return
    const { data: est } = await svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', args.estudanteId).eq('tenant_id', args.tenantId).maybeSingle()
    if (!est) return
    const plataforma = await plataformaDo(svc, args.tenantId)
    // Início da sequência (ref estável): recua streak-1 dias a partir de hoje.
    let inicio = args.hoje
    for (let i = 0; i < Math.max(0, args.streakAtual - 1); i++) inicio = diaAnterior(inicio)
    for (const wh of alvo) {
      if (wh.eventos.includes('gamificacao.sequencia') && (wh.regras.sequencia.dias ?? 0) === args.streakAtual) {
        await dispararParaWebhook(svc, args.tenantId, plataforma, wh, 'sequencia', `seq-${inicio}`, est, args.estudanteId,
          { dias: wh.regras.sequencia.dias ?? null, marco: null, streakAtual: args.streakAtual, streakMaior: args.streakMaior, mensagemTpl: wh.regras.sequencia.mensagem })
      }
      if (wh.eventos.includes('gamificacao.marco') && (wh.regras.marco.marcos ?? []).includes(args.streakAtual)) {
        await dispararParaWebhook(svc, args.tenantId, plataforma, wh, 'marco', `marco-${args.streakAtual}`, est, args.estudanteId,
          { dias: null, marco: args.streakAtual, streakAtual: args.streakAtual, streakMaior: args.streakMaior, mensagemTpl: wh.regras.marco.mensagem })
      }
    }
  } catch { /* best-effort */ }
}

/**
 * Chamado pelo cron: para CADA webhook que assina gamificacao.inativo, acha os alunos que ficaram
 * exatamente `dias` (a regra DAQUELE webhook) sem entrar e dispara. Retorna quantos envios fez.
 */
export async function avaliarEngajamentoInatividade(svc: any, tenantId: string, timezone: string): Promise<number> {
  let enviados = 0
  try {
    const whs = (await carregarWebhooksGamif(svc, tenantId)).filter((w) => w.eventos.includes('gamificacao.inativo'))
    if (!whs.length) return 0
    const plataforma = await plataformaDo(svc, tenantId)
    for (const wh of whs) {
      const dias = Math.max(1, wh.regras.inativo.dias ?? 1)
      let alvoDia = diaLocal(timezone)
      for (let i = 0; i < dias; i++) alvoDia = diaAnterior(alvoDia)
      const { data: alunos } = await svc
        .from('simulado_gamificacao_estudante')
        .select('estudante_id, streak_atual, streak_maior, ultimo_dia_ativo')
        .eq('tenant_id', tenantId).eq('ultimo_dia_ativo', alvoDia).limit(5000)
      for (const a of (alunos ?? []) as any[]) {
        const { data: est } = await svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', a.estudante_id).eq('tenant_id', tenantId).maybeSingle()
        if (!est) continue
        const ok = await dispararParaWebhook(svc, tenantId, plataforma, wh, 'inativo', `inativo-${a.ultimo_dia_ativo}`, est, a.estudante_id,
          { dias, marco: null, streakAtual: a.streak_atual ?? 0, streakMaior: a.streak_maior ?? 0, mensagemTpl: wh.regras.inativo.mensagem })
        if (ok) enviados++
      }
    }
  } catch { /* best-effort */ }
  return enviados
}

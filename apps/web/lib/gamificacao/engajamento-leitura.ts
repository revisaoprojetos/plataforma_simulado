import 'server-only'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { contatoEstudante, COLS_CONTATO } from '@/lib/webhooks/payload'
import { enviarWebhookDireto, type PlataformaWh } from '@/lib/webhooks/dispatch'
import { resolverRegras, interpolar, type EngajamentoRegras } from '@/lib/webhooks/engajamento-regras'
import { diaAnterior } from './datas'

/**
 * Engajamento da LEITURA (Lei Seca) POR MÓDULO. Diferente do engajamento global (gamificacao.*),
 * aqui a "sequência" é dias consecutivos em que o aluno concluiu uma AULA COMPLETA (leitura + quiz)
 * NAQUELE módulo — a MESMA métrica que o ranking do módulo mostra. Cada webhook que assina
 * `leitura.inativo/sequencia/marco` tem SUAS regras e pode filtrar por módulos (filtro_modulos).
 * Idempotente por (aluno, tipo, ref) — o ref inclui o módulo e o id do webhook.
 */

type WhLeitura = { id: string; nome: string | null; url: string; secret: string | null; eventos: string[]; origem: string | null; modulos: string[]; regras: EngajamentoRegras }

/** Webhooks ATIVOS do tenant que assinam algum evento leitura.*, com regras e filtro de módulos resolvidos. */
async function carregarWebhooksLeitura(svc: any, tenantId: string): Promise<WhLeitura[]> {
  let r = await svc.from('simulado_webhook_saida').select('id, nome, url, secret, eventos, origem, filtro_modulos, engajamento_regras').eq('tenant_id', tenantId).eq('ativo', true)
  if (r.error && /filtro_modulos|engajamento_regras|origem|column/i.test(r.error.message)) {
    r = await svc.from('simulado_webhook_saida').select('id, nome, url, secret, eventos').eq('tenant_id', tenantId).eq('ativo', true)
  }
  if (r.error) return []
  return ((r.data ?? []) as any[])
    .filter((w) => Array.isArray(w.eventos) && w.eventos.some((e: string) => e.startsWith('leitura.')))
    .map((w) => ({ id: w.id, nome: w.nome ?? null, url: w.url, secret: w.secret ?? null, eventos: w.eventos, origem: w.origem ?? null, modulos: Array.isArray(w.filtro_modulos) ? w.filtro_modulos : [], regras: resolverRegras(w.engajamento_regras) }))
}

/** filtro vazio = todos os módulos; senão só os módulos escolhidos. */
const aplicavelAoModulo = (wh: WhLeitura, pastaId: string) => !wh.modulos.length || wh.modulos.includes(pastaId)

async function plataformaDo(svc: any, tenantId: string): Promise<PlataformaWh> {
  const { data } = await svc.from('simulado_tenants').select('nome, slug').eq('id', tenantId).maybeSingle()
  return { id: tenantId, nome: (data as any)?.nome ?? null, slug: (data as any)?.slug ?? null }
}

/** Aulas publicadas do módulo + questões do quiz por documento (mesma base do ranking). */
async function quizDoModulo(svc: any, tenantId: string, pastaId: string): Promise<{ aulaIds: string[]; quizPorDoc: Map<string, Set<string>> }> {
  const { data: docs } = await svc.from('simulado_documentos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('publicado', true).eq('pasta_id', pastaId)
  const aulaIds = (docs ?? []).map((d: { id: string }) => d.id)
  const quizPorDoc = new Map<string, Set<string>>()
  if (!aulaIds.length) return { aulaIds, quizPorDoc }
  const quiz = await fetchAllByIn<{ documento_id: string; questao_id: string }>(aulaIds, (chunk) =>
    svc.from('simulado_documento_quiz_questoes').select('documento_id, questao_id').eq('tenant_id', tenantId).eq('deletado', false).in('documento_id', chunk).order('id')).catch(() => [])
  for (const q of quiz) (quizPorDoc.get(q.documento_id) ?? quizPorDoc.set(q.documento_id, new Set()).get(q.documento_id)!).add(q.questao_id)
  return { aulaIds, quizPorDoc }
}

/** Dos dias em que o aluno completou aula, calcula a sequência atual e o último dia (fuso tz). */
function sequenciaDeDias(diasSet: Set<string>, tz: string): { streakAtual: number; ultimoDia: string | null } {
  const dias = [...diasSet].sort()
  if (!dias.length) return { streakAtual: 0, ultimoDia: null }
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const ontem = new Date(Date.parse(hoje + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  let run = 0, prev = ''
  for (const d of dias) { run = prev && Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === 86_400_000 ? run + 1 : 1; prev = d }
  const ultimo = dias[dias.length - 1]
  return { streakAtual: ultimo === hoje || ultimo === ontem ? run : 0, ultimoDia: ultimo }
}

/** Dias em que UMA aula do módulo ficou completa (leitura+quiz) para UM aluno. */
async function diasCompletosAluno(svc: any, tenantId: string, pastaId: string, estudanteId: string, tz: string): Promise<{ streakAtual: number; ultimoDia: string | null }> {
  const { aulaIds, quizPorDoc } = await quizDoModulo(svc, tenantId, pastaId)
  if (!aulaIds.length) return { streakAtual: 0, ultimoDia: null }
  const resp = await fetchAllByIn<{ documento_id: string; questao_id: string; respondido_em: string | null }>(aulaIds, (chunk) =>
    svc.from('simulado_leitura_respostas').select('documento_id, questao_id, respondido_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('documento_id', chunk).order('id')).catch(() => [])
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
  const cellDoc = new Map<string, { answered: Set<string>; ultima: string | null }>()
  for (const r of resp) {
    const q = quizPorDoc.get(r.documento_id); if (!q || !q.has(r.questao_id)) continue
    const c = cellDoc.get(r.documento_id) ?? cellDoc.set(r.documento_id, { answered: new Set(), ultima: null }).get(r.documento_id)!
    c.answered.add(r.questao_id); if (r.respondido_em && (!c.ultima || r.respondido_em > c.ultima)) c.ultima = r.respondido_em
  }
  const dias = new Set<string>()
  for (const [docId, c] of cellDoc) { const qs = quizPorDoc.get(docId)!; if (qs.size > 0 && [...qs].every((qid) => c.answered.has(qid)) && c.ultima) dias.add(diaDe(c.ultima)) }
  return sequenciaDeDias(dias, tz)
}

/** Último dia com aula completa por aluno no módulo (cron de inatividade). */
async function ultimoDiaPorAluno(svc: any, tenantId: string, pastaId: string, tz: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const { aulaIds, quizPorDoc } = await quizDoModulo(svc, tenantId, pastaId)
  if (!aulaIds.length) return out
  const resp = await fetchAllByIn<{ estudante_id: string; documento_id: string; questao_id: string; respondido_em: string | null }>(aulaIds, (chunk) =>
    svc.from('simulado_leitura_respostas').select('estudante_id, documento_id, questao_id, respondido_em').eq('tenant_id', tenantId).in('documento_id', chunk).order('id')).catch(() => [])
  const diaDe = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz })
  // (aluno, doc) → {answered, ultima}
  const porAluno = new Map<string, Map<string, { answered: Set<string>; ultima: string | null }>>()
  for (const r of resp) {
    const q = quizPorDoc.get(r.documento_id); if (!q || !q.has(r.questao_id)) continue
    const dmap = porAluno.get(r.estudante_id) ?? porAluno.set(r.estudante_id, new Map()).get(r.estudante_id)!
    const c = dmap.get(r.documento_id) ?? dmap.set(r.documento_id, { answered: new Set(), ultima: null }).get(r.documento_id)!
    c.answered.add(r.questao_id); if (r.respondido_em && (!c.ultima || r.respondido_em > c.ultima)) c.ultima = r.respondido_em
  }
  for (const [alunoId, dmap] of porAluno) {
    let ultimo = ''
    for (const [docId, c] of dmap) { const qs = quizPorDoc.get(docId)!; if (qs.size > 0 && [...qs].every((qid) => c.answered.has(qid)) && c.ultima) { const d = diaDe(c.ultima); if (d > ultimo) ultimo = d } }
    if (ultimo) out.set(alunoId, ultimo)
  }
  return out
}

/** Dispara UM gatilho de leitura para UM webhook — idempotente por (aluno, tipo, ref:webhookId). */
async function dispararLeitura(
  svc: any, tenantId: string, plataforma: PlataformaWh, wh: WhLeitura,
  tipo: 'inativo' | 'sequencia' | 'marco', baseRef: string, est: any, estudanteId: string,
  modulo: { id: string; nome: string | null },
  extra: { dias: number | null; marco: number | null; streakAtual: number; streakMaior: number; mensagemTpl: string },
): Promise<boolean> {
  const ref = `${baseRef}:${wh.id}`
  const { data: inserido, error } = await svc
    .from('simulado_gamificacao_engajamento_log')
    .upsert({ tenant_id: tenantId, estudante_id: estudanteId, tipo: `leitura_${tipo}`, ref }, { onConflict: 'tenant_id,estudante_id,tipo,ref', ignoreDuplicates: true })
    .select('id')
  if (error || !inserido?.length) return false // já enviado (ou sem tabela de log)
  const nome = (est?.nome ?? '').split(' ')[0] || 'estudante'
  const mensagem = interpolar(extra.mensagemTpl, { nome, dias: extra.dias ?? extra.streakAtual, marco: extra.marco ?? '', streak: extra.streakAtual, maior: extra.streakMaior, modulo: modulo.nome ?? '' })
  return enviarWebhookDireto(svc, tenantId, plataforma, `leitura.${tipo}` as any, {
    contact: contatoEstudante(est, estudanteId),
    modulo,
    engajamento: { tipo, dias: extra.dias, marco: extra.marco, streak_atual: extra.streakAtual, streak_maior: extra.streakMaior, mensagem },
  }, { webhookId: wh.id, nome: wh.nome, url: wh.url, secret: wh.secret, origem: wh.origem })
}

/**
 * Chamado ao concluir aula/quiz no módulo (index.ts): avalia SEQUÊNCIA e MARCO da leitura DAQUELE
 * módulo contra a sequência do aluno e dispara os webhooks que casam (e que cobrem o módulo).
 */
export async function avaliarEngajamentoLeituraAoEstudar(
  svc: any, args: { tenantId: string; estudanteId: string; pastaId: string; hoje: string; timezone: string },
): Promise<void> {
  try {
    if (!args.pastaId) return
    const whs = (await carregarWebhooksLeitura(svc, args.tenantId))
      .filter((w) => (w.eventos.includes('leitura.sequencia') || w.eventos.includes('leitura.marco')) && aplicavelAoModulo(w, args.pastaId))
    if (!whs.length) return
    const { streakAtual, ultimoDia } = await diasCompletosAluno(svc, args.tenantId, args.pastaId, args.estudanteId, args.timezone)
    if (!streakAtual || ultimoDia !== args.hoje) return // só dispara quando a aula de HOJE fechou a sequência
    const { data: est } = await svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', args.estudanteId).eq('tenant_id', args.tenantId).maybeSingle()
    if (!est) return
    const plataforma = await plataformaDo(svc, args.tenantId)
    const nome = await nomeModulo(svc, args.tenantId, args.pastaId)
    const modulo = { id: args.pastaId, nome }
    // Início da sequência (ref estável): recua streak-1 dias a partir de hoje.
    let inicio = args.hoje
    for (let i = 0; i < Math.max(0, streakAtual - 1); i++) inicio = diaAnterior(inicio)
    for (const wh of whs) {
      if (wh.eventos.includes('leitura.sequencia') && (wh.regras.sequencia.dias ?? 0) === streakAtual) {
        await dispararLeitura(svc, args.tenantId, plataforma, wh, 'sequencia', `leitura-seq-${args.pastaId}-${inicio}`, est, args.estudanteId, modulo,
          { dias: wh.regras.sequencia.dias ?? null, marco: null, streakAtual, streakMaior: streakAtual, mensagemTpl: wh.regras.sequencia.mensagem })
      }
      if (wh.eventos.includes('leitura.marco') && (wh.regras.marco.marcos ?? []).includes(streakAtual)) {
        await dispararLeitura(svc, args.tenantId, plataforma, wh, 'marco', `leitura-marco-${args.pastaId}-${streakAtual}`, est, args.estudanteId, modulo,
          { dias: null, marco: streakAtual, streakAtual, streakMaior: streakAtual, mensagemTpl: wh.regras.marco.mensagem })
      }
    }
  } catch { /* best-effort */ }
}

async function nomeModulo(svc: any, tenantId: string, pastaId: string): Promise<string | null> {
  const { data } = await svc.from('simulado_pastas').select('nome').eq('id', pastaId).eq('tenant_id', tenantId).maybeSingle()
  return (data as any)?.nome ?? null
}

/**
 * Chamado pelo cron: para cada webhook que assina leitura.inativo, acha os alunos que ficaram
 * exatamente `dias` (regra do webhook) sem concluir aula NO módulo e dispara. Retorna nº de envios.
 */
export async function avaliarEngajamentoLeituraInatividade(svc: any, tenantId: string, timezone: string): Promise<number> {
  let enviados = 0
  try {
    const whs = (await carregarWebhooksLeitura(svc, tenantId)).filter((w) => w.eventos.includes('leitura.inativo'))
    if (!whs.length) return 0
    // Módulos a avaliar: se algum webhook cobre "todos" (filtro vazio), carrega todos os módulos de leitura.
    const cobreTodos = whs.some((w) => !w.modulos.length)
    let modulos: { id: string; nome: string | null }[]
    if (cobreTodos) {
      const { data } = await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).eq('is_folder', true).eq('folder_area', 'leitura')
      modulos = (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome ?? null }))
    } else {
      const ids = [...new Set(whs.flatMap((w) => w.modulos))]
      const { data } = await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tenantId).in('id', ids)
      modulos = (data ?? []).map((p: any) => ({ id: p.id, nome: p.nome ?? null }))
    }
    if (!modulos.length) return 0
    const plataforma = await plataformaDo(svc, tenantId)
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
    const diaMenos = (n: number) => { let d = hoje; for (let i = 0; i < n; i++) d = diaAnterior(d); return d }

    for (const mod of modulos) {
      const whsMod = whs.filter((w) => aplicavelAoModulo(w, mod.id))
      if (!whsMod.length) continue
      const ultimoPorAluno = await ultimoDiaPorAluno(svc, tenantId, mod.id, timezone)
      if (!ultimoPorAluno.size) continue
      for (const wh of whsMod) {
        const dias = Math.max(1, wh.regras.inativo.dias ?? 1)
        const alvo = diaMenos(dias)
        for (const [estudanteId, ultimoDia] of ultimoPorAluno) {
          if (ultimoDia !== alvo) continue
          const { data: est } = await svc.from('simulado_estudantes').select(COLS_CONTATO).eq('id', estudanteId).eq('tenant_id', tenantId).maybeSingle()
          if (!est) continue
          const ok = await dispararLeitura(svc, tenantId, plataforma, wh, 'inativo', `leitura-inativo-${mod.id}-${ultimoDia}`, est, estudanteId, mod,
            { dias, marco: null, streakAtual: 0, streakMaior: 0, mensagemTpl: wh.regras.inativo.mensagem })
          if (ok) enviados++
        }
      }
    }
  } catch { /* best-effort */ }
  return enviados
}

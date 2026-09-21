import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverCfg, executarImport } from '@/lib/curseduca/import-core'
import { agruparPorNomeTick } from '@/lib/curseduca/agrupar'

export const dynamic = 'force-dynamic'

/**
 * Sincronização automática (polling) das regras da Curseduca. Protegido por CRON_SECRET.
 * Chamado pelo worker (setInterval 60s). Roda as regras `ativas` cujo intervalo já venceu,
 * com lock otimista (só assume a regra se `ultima_execucao` não mudou desde a leitura).
 * Reusa `executarImport` (sem limite de detalhe). Prepara caminho p/ webhook futuro (mesma lógica).
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })
  const svc = createAdminClient()

  // Colunas novas (agrupar_por_nome/sync_cursor) são opcionais: se a migração ainda não rodou,
  // o select cai no formato antigo e o agrupamento fica desligado (comportamento anterior).
  const COLS = 'id, tenant_id, grupos, destino, sincronizar, intervalo_min, ultima_execucao, ultimo_resultado, agrupar_por_nome, sync_cursor, descobrir_canais'
  let regras: any[] | null = null
  {
    const r1 = await svc.from('simulado_curseduca_sync').select(COLS).eq('ativo', true).order('ultima_execucao', { ascending: true, nullsFirst: true }).limit(50)
    if (r1.error && /agrupar_por_nome|sync_cursor|column/i.test(r1.error.message)) {
      const r2 = await svc.from('simulado_curseduca_sync').select('id, tenant_id, grupos, destino, sincronizar, intervalo_min, ultima_execucao, ultimo_resultado').eq('ativo', true).order('ultima_execucao', { ascending: true, nullsFirst: true }).limit(50)
      regras = r2.data as any[]
    } else regras = r1.data as any[]
  }

  const agora = Date.now()
  const nowISO = new Date().toISOString()
  let rodadas = 0
  for (const r of (regras ?? []) as any[]) {
    const auto = !!r.agrupar_por_nome
    // Agrupar por nome roda a CADA tick (processa um lote via cursor); o import "só cadastros"
    // continua respeitando o intervalo configurado.
    const venceu = auto || !r.ultima_execucao || (agora - new Date(r.ultima_execucao).getTime()) >= (r.intervalo_min ?? 30) * 60_000
    if (!venceu) continue
    if (rodadas >= 3) break // poucas por tick; o resto vem no próximo

    // Anti-sobreposição (agrupar roda TODO tick, mas cada lote pode durar >1 min): se o tick anterior
    // ainda está `em_andamento` e começou há pouco, PULA — evita 2 ticks reprocessando os mesmos canais
    // (releitura dos ~18k cadastros + chamadas à API duplicadas). Se o marcador está velho (>10min), o
    // tick anterior travou → segue (retoma).
    if (auto && r.ultimo_resultado && (r.ultimo_resultado as any).status === 'em_andamento'
      && r.ultima_execucao && (agora - new Date(r.ultima_execucao).getTime()) < 10 * 60_000) continue

    // Lock otimista: só assume se ultima_execucao continua igual ao que lemos. Já grava um marcador
    // "em andamento" no ultimo_resultado — assim, se o request for cortado (proxy 5min) antes do fim,
    // o admin vê que a execução foi INTERROMPIDA, em vez de continuar vendo o resultado antigo.
    let lockQ = svc.from('simulado_curseduca_sync').update({ ultima_execucao: nowISO, ultimo_resultado: { ok: null, status: 'em_andamento', iniciado_em: nowISO } }).eq('id', r.id)
    lockQ = r.ultima_execucao ? lockQ.eq('ultima_execucao', r.ultima_execucao) : lockQ.is('ultima_execucao', null)
    const { data: lock } = await lockQ.select('id')
    if (!lock?.length) continue // outro tick pegou

    try {
      const cfg = await resolverCfg(r.tenant_id)
      if (!cfg) {
        await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: false, error: 'Credenciais Curseduca não configuradas.' } }).eq('id', r.id)
        continue
      }
      if (auto) {
        // Agrupamento automático por nome (lote por tick): vincula canal → grupo de mesmo nome.
        const { resultado, proximoCursor } = await agruparPorNomeTick(svc, r.tenant_id, cfg, (r.grupos ?? []) as number[], Number(r.sync_cursor ?? 0), !!r.descobrir_canais)
        let upd = await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: resultado, sync_cursor: proximoCursor }).eq('id', r.id)
        if (upd.error && /sync_cursor|column/i.test(upd.error.message)) { await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: resultado }).eq('id', r.id) }
      } else {
        // ENFILEIRA em vez de rodar inline: o import de TODOS os grupos pode levar minutos e estourar
        // o corte de 5 min do proxy dentro deste request. O cron /api/cron/curseduca-jobs processa em
        // background (sem limite de detalhe) e já tem recuperação de lock preso. Dedup: se já existe job
        // pendente/processando cobrindo estes grupos, não cria outro (evita pile-up a cada tick).
        const grupos = (r.grupos ?? []) as number[]
        if (!grupos.length) {
          await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: true, status: 'sem_grupos', obs: 'nenhum grupo selecionado', atualizado_em: nowISO } }).eq('id', r.id)
          rodadas++; continue
        }
        const { data: pend } = await svc.from('simulado_curseduca_jobs').select('id')
          .eq('tenant_id', r.tenant_id).in('status', ['pendente', 'processando']).contains('grupos', grupos).limit(1).maybeSingle()
        if (pend?.id) {
          await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: null, status: 'agendado', jobId: (pend as any).id, dedup: true, atualizado_em: nowISO } }).eq('id', r.id)
        } else {
          const ins = await svc.from('simulado_curseduca_jobs')
            .insert({ tenant_id: r.tenant_id, status: 'pendente', grupos, destino: r.destino ?? { tipo: 'nenhum' }, sincronizar: !!r.sincronizar, criado_por: null })
            .select('id').single()
          if (ins.error) {
            // Tabela de jobs ausente (migração não rodada) → roda inline COM limite p/ não estourar o timeout.
            const resultado = await executarImport({ tenantId: r.tenant_id, cfg }, grupos, r.destino ?? { tipo: 'nenhum' }, !!r.sincronizar, 400)
            await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: resultado }).eq('id', r.id)
          } else {
            await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: null, status: 'agendado', jobId: (ins.data as any).id, atualizado_em: nowISO } }).eq('id', r.id)
          }
        }
      }
      rodadas++
    } catch (e: any) {
      await svc.from('simulado_curseduca_sync').update({ ultimo_resultado: { ok: false, error: e?.message ?? 'Falha inesperada.' } }).eq('id', r.id)
    }
  }

  return NextResponse.json({ ok: true, rodadas })
}

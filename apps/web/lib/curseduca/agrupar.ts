import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarTodosGrupos, type CurseducaCfg } from '@/lib/curseduca/client'
import { executarImport } from '@/lib/curseduca/import-core'

/** Normaliza nome p/ casar canal da Curseduca × grupo do sistema (sem acento/caixa/espaços extras). */
export function normNome(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Orçamento de TEMPO por tick do cron (ms): processa o MÁXIMO de pares que couber, retomando no
 *  próximo tick de onde parou. Deixa folga pro corte (~5min) do proxy do cron. */
const ORCAMENTO_MS = 210_000

/**
 * Um "tick" do agrupamento automático por nome: vincula cada canal da Curseduca ao grupo do sistema
 * de MESMO NOME (cria os que faltam + entra no grupo + propaga acesso, via executarImport com
 * destino='existente'). COBERTURA DETERMINÍSTICA: ordena os pares por id do canal e usa `cursor` =
 * ÚLTIMO id processado (não índice de array), processando o máximo que couber no orçamento de tempo e
 * retomando no próximo tick a partir do próximo id. Assim nenhum canal fica de fora, mesmo que a lista
 * de canais mude de tamanho/ordem entre ticks (era a causa de alunos ficarem sem acesso por dias).
 * Devolve um resumo + o próximo cursor (0 = completou a volta → recomeça).
 *
 * `sincronizar=false`: só ADICIONA ao grupo, nunca remove (não tira aluno que saiu do canal).
 */
export async function agruparPorNomeTick(
  svc: SupabaseClient, tenantId: string, cfg: CurseducaCfg, canais: number[], cursor: number, descobrir = false,
): Promise<{ resultado: Record<string, unknown>; proximoCursor: number }> {
  // 1) Nome de cada canal da Curseduca (id → nome).
  const grupos = await listarTodosGrupos(cfg)
  const nomeCanal = new Map<number, string>(grupos.map((g) => [Number(g.id), g.nome]))

  // Descoberta automática: em vez da lista manual `canais`, considera TODOS os canais existentes na
  // Curseduca (os que tiverem grupo de mesmo id/nome no sistema entram; o resto vira `sem_grupo`).
  // Assim um canal novo passa a sincronizar sozinho, sem precisar editar a lista na tela.
  const alvo = descobrir ? grupos.map((g) => Number(g.id)) : canais

  // 2) Grupos do sistema por CÓDIGO EXTERNO (id do canal, estável) e por nome normalizado (fallback).
  //    Casar por `codigo_externo` é robusto a renomear canal/grupo; o nome só entra quando o grupo
  //    ainda não tem código gravado (aí gravamos o código — "auto-cura" — e o próximo tick já casa por id).
  const { data: sg } = await svc.from('simulado_grupos').select('id, nome, codigo_externo').eq('tenant_id', tenantId).eq('deletado', false)
  const grpPorCodigo = new Map<string, string>()
  const grpPorNome = new Map<string, string>()
  const grpComCodigo = new Set<string>()
  for (const x of (sg ?? []) as any[]) {
    if (x.codigo_externo) { grpPorCodigo.set(String(x.codigo_externo), x.id); grpComCodigo.add(x.id) }
    grpPorNome.set(normNome(x.nome), x.id)
  }

  // 3) Pares canal→grupo. Preferência: código externo (id) → nome. `curar=true` marca o par que casou
  //    por nome num grupo SEM código ainda → vamos gravar o id do canal nele após vincular.
  const pares: { canal: number; grupo: string; nome: string; via: 'id' | 'nome'; curar: boolean }[] = []
  const semGrupo: number[] = []
  let porId = 0, porNome = 0
  for (const id of alvo) {
    const canal = Number(id)
    const nome = nomeCanal.get(canal)
    const porCod = grpPorCodigo.get(String(canal))
    if (porCod) { pares.push({ canal, grupo: porCod, nome: nome ?? String(canal), via: 'id', curar: false }); porId++; continue }
    const porNm = nome ? grpPorNome.get(normNome(nome)) : undefined
    if (porNm) { pares.push({ canal, grupo: porNm, nome: nome as string, via: 'nome', curar: !grpComCodigo.has(porNm) }); porNome++; continue }
    semGrupo.push(canal)
  }
  if (!pares.length) {
    return { resultado: { ok: true, modo: 'agrupar', pares: 0, sem_grupo: semGrupo.length, obs: 'nenhum canal casou com grupo do sistema' }, proximoCursor: 0 }
  }

  // 4) ORDEM ESTÁVEL por id do canal + cursor = ÚLTIMO id processado (não índice). Começa no 1º par com
  //    canal > cursor; se não houver (passou do fim), reinicia do começo. Cobertura determinística.
  pares.sort((a, b) => a.canal - b.canal)
  let start = pares.findIndex((p) => p.canal > cursor)
  if (start < 0) start = 0

  // 5) Processa o MÁXIMO de pares que couber no orçamento de tempo (não um lote fixo), dando a volta
  //    (wrap) se sobrar. Cada executarImport é tolerante a falha (um grupo que falhe não derruba os outros).
  const t0 = Date.now()
  let vinculadosTot = 0, novosTot = 0, falhas = 0, curados = 0, processados = 0, ultimoCanal = cursor
  const detalhe: { nome: string; via: 'id' | 'nome'; vinculados: number; novos: number; erro?: string }[] = []
  for (let k = 0; k < pares.length; k++) {
    const p = pares[(start + k) % pares.length]
    try {
      const r = await executarImport({ tenantId, cfg }, [p.canal], { tipo: 'existente', grupoId: p.grupo }, false, Number.MAX_SAFE_INTEGER)
      vinculadosTot += r.vinculados ?? 0
      novosTot += r.novos ?? 0
      // Auto-cura: casou por NOME num grupo sem código → grava o id do canal (só se ainda estiver vazio,
      // p/ não sobrescrever um vínculo manual). A partir do próximo tick esse grupo casa por id.
      if (r.ok && p.curar) {
        const { error } = await svc.from('simulado_grupos').update({ codigo_externo: String(p.canal) })
          .eq('id', p.grupo).eq('tenant_id', tenantId).is('codigo_externo', null)
        if (!error) curados++
      }
      detalhe.push({ nome: p.nome, via: p.via, vinculados: r.vinculados ?? 0, novos: r.novos ?? 0, ...(r.ok ? {} : { erro: r.error }) })
      if (!r.ok) falhas++
    } catch (e: any) {
      falhas++
      detalhe.push({ nome: p.nome, via: p.via, vinculados: 0, novos: 0, erro: String(e?.message ?? e).slice(0, 120) })
    }
    ultimoCanal = p.canal; processados++
    if (Date.now() - t0 > ORCAMENTO_MS) break // acabou o tempo do tick → retoma do próximo id no próximo
  }

  // Deu a volta completa → recomeça (cursor 0). Senão, retoma do último id processado.
  const proximoCursor = processados >= pares.length ? 0 : ultimoCanal
  return {
    resultado: {
      ok: falhas === 0, modo: 'agrupar', descobrir, candidatos: alvo.length, total_pares: pares.length, processados_neste_tick: processados,
      match: { por_id: porId, por_nome: porNome }, curados,
      vinculados: vinculadosTot, novos: novosTot, falhas, sem_grupo: semGrupo.length, detalhe: detalhe.slice(0, 12),
      atualizado_em: new Date().toISOString(),
    },
    proximoCursor,
  }
}

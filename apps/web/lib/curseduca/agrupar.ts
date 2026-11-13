import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listarTodosGrupos, type CurseducaCfg } from '@/lib/curseduca/client'
import { executarImport } from '@/lib/curseduca/import-core'

/** Normaliza nome p/ casar canal da Curseduca × grupo do sistema (sem acento/caixa/espaços extras). */
export function normNome(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Chave "canônica" p/ casar nomes que só diferem em separadores/artigos ("Extensivo Setembro 2026" × "Extensivo | Turma Setembro 2026"). */
export function chaveCanonica(s?: string | null): string {
  return normNome(s).replace(/[|\-–—:/]+/g, ' ').split(' ').filter((t) => t && !['turma', 'de', 'do', 'da'].includes(t)).join(' ')
}

const distEdicao = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Grupo da plataforma com nome QUASE igual (mesmos números, ≤2 letras de diferença). Só para SUGERIR revisão humana — nunca para fundir. */
function quaseIguais(nome: string, grupos: { nome: string }[]): string | null {
  const k = chaveCanonica(nome); const nums = (s: string) => (s.match(/\d+/g) ?? []).join(',')
  let melhor: { nome: string; d: number } | null = null
  for (const g of grupos) {
    const kg = chaveCanonica(g.nome)
    if (nums(kg) !== nums(k)) continue
    const d = distEdicao(k, kg)
    if (d > 0 && d <= 2 && (!melhor || d < melhor.d)) melhor = { nome: g.nome, d }
  }
  return melhor?.nome ?? null
}

/** Canal NOVO (criado há até N dias) sem grupo equivalente → o sync CRIA o grupo da plataforma e já importa os membros. */
const CRIAR_GRUPO_ATE_DIAS = 120

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
  const criadoCanal = new Map<number, string | null>(grupos.map((g) => [Number(g.id), g.criadoEm ?? null]))

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
  // Chave canônica → grupo, SÓ quando inequívoca (se 2+ grupos colidem, não adivinha: cai p/ criação/sem_grupo).
  const grpPorCanon = new Map<string, string | null>()
  for (const x of (sg ?? []) as any[]) {
    if (x.codigo_externo) { grpPorCodigo.set(String(x.codigo_externo), x.id); grpComCodigo.add(x.id) }
    grpPorNome.set(normNome(x.nome), x.id)
    const k = chaveCanonica(x.nome)
    grpPorCanon.set(k, grpPorCanon.has(k) ? null : x.id)
  }

  // 3) Pares canal→grupo. Preferência: código externo (id) → nome. `curar=true` marca o par que casou
  //    por nome num grupo SEM código ainda → vamos gravar o id do canal nele após vincular.
  const pares: { canal: number; grupo: string; nome: string; via: 'id' | 'nome'; curar: boolean }[] = []
  const semGrupo: number[] = []
  let porId = 0, porNome = 0, criados = 0
  const sugestoes: { canal: number; nome: string; parecido_com: string }[] = []
  for (const id of alvo) {
    const canal = Number(id)
    const nome = nomeCanal.get(canal)
    const porCod = grpPorCodigo.get(String(canal))
    if (porCod) { pares.push({ canal, grupo: porCod, nome: nome ?? String(canal), via: 'id', curar: false }); porId++; continue }
    // Nome IGUAL (normalizado) → casa. Senão, igualdade CANÔNICA (ignora | - / "turma" "de"), mas só num grupo que ainda
    // NÃO pertence a outro canal (com `codigo_externo` de outro canal seria fundir dois canais diferentes).
    // NUNCA usa distância de edição: "PGE/MA" × "PGE RJ" e "Sem correção" × "Com correção" estão a 2 letras e são grupos DIFERENTES.
    const porCanonico = nome ? grpPorCanon.get(chaveCanonica(nome)) : undefined
    const porNm = nome ? (grpPorNome.get(normNome(nome)) ?? (porCanonico && !grpComCodigo.has(porCanonico) ? porCanonico : undefined)) : undefined
    if (porNm) { pares.push({ canal, grupo: porNm, nome: nome as string, via: 'nome', curar: !grpComCodigo.has(porNm) }); porNome++; continue }
    // Sem grupo equivalente: se o canal é NOVO, cria o grupo da plataforma (mesmo nome, código = id do canal) e importa.
    // Nunca fica de fora em silêncio. Grupo criado NÃO libera produto sozinho (vínculo com produto é manual/regra de venda).
    const criado = criadoCanal.get(canal)
    const novo = !!nome?.trim() && !!criado && (Date.now() - new Date(criado).getTime()) <= CRIAR_GRUPO_ATE_DIAS * 86_400_000
    if (novo) {
      // Re-checa por código (outro tick/réplica pode ter criado há instantes) p/ não duplicar o grupo.
      const { data: ja } = await svc.from('simulado_grupos').select('id').eq('tenant_id', tenantId).eq('deletado', false).eq('codigo_externo', String(canal)).limit(1).maybeSingle()
      if (ja) { pares.push({ canal, grupo: (ja as { id: string }).id, nome: nome as string, via: 'id', curar: false }); porId++; continue }
      // Quase-igual a um grupo existente (typo)? Cria mesmo assim (seguro) e SUGERE a revisão — nunca funde sozinho.
      const q = quaseIguais(nome as string, (sg ?? []) as { id: string; nome: string; codigo_externo: string | null }[])
      if (q) sugestoes.push({ canal, nome: nome as string, parecido_com: q })
      const { data: g, error } = await svc.from('simulado_grupos').insert({ tenant_id: tenantId, nome: (nome as string).trim(), codigo_externo: String(canal) }).select('id').single()
      if (!error && g) { pares.push({ canal, grupo: g.id, nome: nome as string, via: 'id', curar: false }); porId++; criados++; continue }
    }
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
      match: { por_id: porId, por_nome: porNome }, curados, grupos_criados: criados, sugestoes_revisar: sugestoes.slice(0, 10),
      vinculados: vinculadosTot, novos: novosTot, falhas, sem_grupo: semGrupo.length, detalhe: detalhe.slice(0, 12),
      atualizado_em: new Date().toISOString(),
    },
    proximoCursor,
  }
}

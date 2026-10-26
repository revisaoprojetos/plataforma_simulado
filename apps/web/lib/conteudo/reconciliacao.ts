import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { alinhar, type TrechoVersao } from './alinhamento'
import { extrairTrechosHtml } from './trechos'
import { emitirEvento } from './outbox'

// RECONCILIAÇÃO (Fase 2/6) — o coração do "grifo sobrevive à edição". Ao publicar uma nova versão:
//   1. estrutura o HTML em trechos;
//   2. ALINHA contra a versão anterior (determinístico — PoC: zero migração errada) carregando uids;
//   3. persiste os trechos da nova versão (uids carregados; trechos novos ganham identidade fresca);
//   4. reconcilia as anotações do aluno ancoradas por uid → 'ativa' (revalidada) | 'alterada' (aviso)
//      | 'orfa' (pendência); avisos idempotentes por UNIQUE(anotacao_id, versao_para_id).
// Server-only (service role + filtro tenant). A versão é IMUTÁVEL: isto só cria linhas novas.

const T_TR = 'simulado_conteudo_trechos'
const T_ID = 'simulado_conteudo_trecho_identidade'
const T_AN = 'simulado_conteudo_anotacoes'
const T_AV = 'simulado_conteudo_avisos'
const T_VER = 'simulado_conteudo_versoes'

interface TrechoDB { uid: string; ordem: number; texto: string; hash_texto: string }

export interface ResultadoReconciliacao {
  trechos: number
  carregados: number
  novos: number
  anotacoes: { ativas: number; alteradas: number; orfas: number }
  revisaoNecessaria: boolean
  erro?: string
}

/** Estrutura + alinha + reconcilia a `versaoNovaId` do documento. `versaoAnteriorId` ausente = 1ª versão. */
export async function reconciliarVersao(input: {
  documentoId: string
  versaoNovaId: string
  versaoAnteriorId?: string | null
  html: string
  forcar?: boolean
  /** Override do tenant — para contextos server-to-server (callback OnlyOffice, worker) sem host. */
  tenantId?: string
}): Promise<ResultadoReconciliacao> {
  const vazio: ResultadoReconciliacao = { trechos: 0, carregados: 0, novos: 0, anotacoes: { ativas: 0, alteradas: 0, orfas: 0 }, revisaoNecessaria: false }
  const tenantId = input.tenantId ?? await getCurrentTenantId()
  if (!tenantId) return { ...vazio, erro: 'tenant não resolvido' }
  const svc = createAdminClient()

  // idempotência leve: se a nova versão já tem trechos e não é forçado, não refaz
  const { count: jaTem } = await svc.from(T_TR).select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('versao_id', input.versaoNovaId)
  if ((jaTem ?? 0) > 0 && !input.forcar) return { ...vazio, erro: 'versão já reconciliada (use forcar)' }
  // L1: no re-run forçado, reaproveita os uids desta versão (evita vazar identidades a cada save do editor)
  let poolReuso: string[] = []
  if ((jaTem ?? 0) > 0 && input.forcar) {
    const ex = (await fetchAll<{ uid: string }>(() => svc.from(T_TR).select('uid').eq('tenant_id', tenantId).eq('versao_id', input.versaoNovaId))) ?? []
    poolReuso = ex.map((r) => r.uid)
    await svc.from(T_TR).delete().eq('tenant_id', tenantId).eq('versao_id', input.versaoNovaId)
  }

  // 1. trechos da nova versão (do HTML)
  const extraidos = extrairTrechosHtml(input.html)
  if (extraidos.length === 0) {
    // Fase 1 (mídia/office): documento SEM trechos textuais (vídeo/áudio, ou pptx/xlsx sem índice). Não
    // é erro — guardamos o original e a versão fica 'ok' sem trechos/anotações. Antes isto abortava a
    // ingestão; agora toleramos (o importador publica a versão normalmente).
    await svc.from(T_VER).update({ status_conversao: 'ok' }).eq('tenant_id', tenantId).eq('id', input.versaoNovaId)
    return { ...vazio }
  }

  // 2. trechos da versão anterior (com uid), se houver
  let velhosDB: TrechoDB[] = []
  if (input.versaoAnteriorId) {
    velhosDB = (await fetchAll<TrechoDB>(() => svc.from(T_TR)
      .select('uid, ordem, texto, hash_texto')
      .eq('tenant_id', tenantId).eq('versao_id', input.versaoAnteriorId!)
      .order('ordem', { ascending: true }))) ?? []
  }
  const oldHashByUid = new Map(velhosDB.map((v) => [v.uid, v.hash_texto]))

  // 3. ALINHAR (determinístico)
  const velhos: TrechoVersao[] = velhosDB.map((v) => ({ indice: v.ordem, texto: v.texto, uid: v.uid }))
  const novos: TrechoVersao[] = extraidos.map((t, i) => ({ indice: i, texto: t.texto }))
  const al = velhos.length ? alinhar(velhos, novos) : null

  // 4. resolve o uid de cada trecho novo (carrega / reaproveita do pool / cria identidade fresca)
  const carregadosUids = new Set<string>()
  for (let i = 0; i < extraidos.length; i++) { const a = al?.alinhamentos[i]; if (a?.uid) carregadosUids.add(a.uid) }
  const pool = poolReuso.filter((u) => !carregadosUids.has(u)) // nunca reusar um uid já carregado nesta versão
  const identidadesNovas: { uid: string; tenant_id: string; documento_id: string }[] = []
  const uidPorOrdem = new Map<number, { uid: string; origem: string; score: number }>()
  for (let i = 0; i < extraidos.length; i++) {
    const a = al?.alinhamentos[i]
    if (a && a.uid) {
      uidPorOrdem.set(i, { uid: a.uid, origem: a.origem, score: a.similaridade })
    } else {
      const reuso = pool.pop()
      if (reuso) {
        uidPorOrdem.set(i, { uid: reuso, origem: 'novo', score: 0 })
      } else {
        const uid = randomUUID()
        identidadesNovas.push({ uid, tenant_id: tenantId, documento_id: input.documentoId })
        uidPorOrdem.set(i, { uid, origem: 'novo', score: 0 })
      }
    }
  }
  if (identidadesNovas.length) {
    const { error } = await svc.from(T_ID).insert(identidadesNovas)
    if (error) return { ...vazio, erro: `falha ao criar identidades: ${error.message}` }
  }

  // persiste os trechos da nova versão
  const linhas = extraidos.map((t, i) => {
    const r = uidPorOrdem.get(i)!
    return {
      tenant_id: tenantId, versao_id: input.versaoNovaId, uid: r.uid, pai_uid: null,
      ordem: i, tipo: t.tipo, rotulo: t.rotulo, texto: t.texto, hash_texto: t.hashTexto,
      alinhamento_regra: r.origem, alinhamento_score: r.score,
    }
  })
  const { error: eTr } = await svc.from(T_TR).insert(linhas)
  if (eTr) return { ...vazio, erro: `falha ao gravar trechos: ${eTr.message}` }

  const carregados = [...uidPorOrdem.values()].filter((v) => v.origem !== 'novo').length
  const novosCount = [...uidPorOrdem.values()].filter((v) => v.origem === 'novo').length
  const baixaConfianca = linhas.some((l) => l.alinhamento_regra === 'fuzzy' && (l.alinhamento_score ?? 0) < 0.88) || (al?.ambiguos.length ?? 0) > 0

  // 5. reconcilia anotações ancoradas por uid (só faz sentido se havia versão anterior)
  const res: ResultadoReconciliacao = { trechos: linhas.length, carregados, novos: novosCount, anotacoes: { ativas: 0, alteradas: 0, orfas: 0 }, revisaoNecessaria: baixaConfianca }
  if (input.versaoAnteriorId) {
    const novoHashByUid = new Map(linhas.map((l) => [l.uid, l.hash_texto]))
    const oldTextByUid = new Map(velhosDB.map((v) => [v.uid, v.texto]))     // L7: diff antes/depois no aviso
    const novoTextByUid = new Map(linhas.map((l) => [l.uid, l.texto]))
    const anots = (await fetchAll<any>(() => svc.from(T_AN)
      .select('id, trecho_uid, estado')
      .eq('tenant_id', tenantId).eq('documento_id', input.documentoId))) ?? []
    const avisos: any[] = []
    const atualiz: { id: string; estado: string }[] = []
    for (const an of anots) {
      const uid = an.trecho_uid as string
      const antes = oldHashByUid.get(uid)
      if (!novoHashByUid.has(uid)) {
        // uid sumiu → órfã
        if (an.estado !== 'orfa') atualiz.push({ id: an.id, estado: 'orfa' })
        avisos.push({ tenant_id: tenantId, anotacao_id: an.id, versao_de_id: input.versaoAnteriorId, versao_para_id: input.versaoNovaId, trecho_antes: oldTextByUid.get(uid) ?? null, trecho_depois: null, status: 'pendente' })
        res.anotacoes.orfas++
      } else if (antes !== undefined && antes !== novoHashByUid.get(uid)) {
        // uid sobreviveu, texto mudou → alterada + aviso
        if (an.estado !== 'alterada') atualiz.push({ id: an.id, estado: 'alterada' })
        avisos.push({ tenant_id: tenantId, anotacao_id: an.id, versao_de_id: input.versaoAnteriorId, versao_para_id: input.versaoNovaId, trecho_antes: oldTextByUid.get(uid) ?? null, trecho_depois: novoTextByUid.get(uid) ?? null, status: 'pendente' })
        res.anotacoes.alteradas++
      } else {
        // texto idêntico de novo → revalida (M1: se estava alterada/órfã, volta a ativa)
        if (an.estado !== 'ativa') atualiz.push({ id: an.id, estado: 'ativa' })
        res.anotacoes.ativas++
      }
    }
    for (const u of atualiz) await svc.from(T_AN).update({ estado: u.estado, versao_validada_id: input.versaoNovaId, atualizada_em: new Date().toISOString() }).eq('tenant_id', tenantId).eq('id', u.id)
    // anotações que já estavam ativas apontam para a nova versão validada
    await svc.from(T_AN).update({ versao_validada_id: input.versaoNovaId }).eq('tenant_id', tenantId).eq('documento_id', input.documentoId).eq('estado', 'ativa')
    if (avisos.length) await svc.from(T_AV).upsert(avisos, { onConflict: 'anotacao_id,versao_para_id', ignoreDuplicates: true })
  }

  // marca a conversão e emite evento
  await svc.from(T_VER).update({ status_conversao: baixaConfianca ? 'revisao_necessaria' : 'ok' }).eq('tenant_id', tenantId).eq('id', input.versaoNovaId)

  // HTML RICO: DESATIVADO (2026-10) — a leitura do aluno é 100% via PDF fiel (carregarLeituraPdf); o
  // caminho HTML (carregarLeitura) está morto e, se reativado, `regenerarHtmlRico` recria sob demanda a
  // partir do .docx original. Gravar aqui custava ~10 MB/edição (imagens base64 inline) e acumulava GBs
  // de peso morto no Postgres sem ninguém ler → removido para cortar write-amplification/egress.
  // (Se um dia o leitor HTML voltar, externalizar as imagens para o storage antes de regravar.)
  await emitirEvento(svc, tenantId, 'anotacao.reconciliar', { documento_id: input.documentoId, versao_id: input.versaoNovaId, revisao: baixaConfianca })
  return res
}

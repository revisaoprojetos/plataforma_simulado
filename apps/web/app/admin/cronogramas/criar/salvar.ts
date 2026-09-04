'use server'

/**
 * Criação em uma tacada só: cronograma (rascunho) + metas + links de aula + vínculo aos
 * grupos de acesso. Nada é gravado antes daqui — o assistente monta tudo em memória e este é
 * o único ponto de escrita.
 *
 * O cronograma nasce reusando `criarCronograma` (slug + validação já provados). Se as metas
 * falharem, o cronograma recém-criado é desfeito para não deixar casca órfã. Links e vínculos
 * são complementares: uma falha ali vira aviso, não derruba a criação.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { SLUG_PDF, SLUG_VIDEO } from '@/lib/cronograma/tipos'
import { garantirPlataformaVideo, garantirPlataformaPdf } from '@/lib/cronograma/plataforma-video'
import { criarCronograma, alternarLiberacao } from '../actions'
import type { CronogramaDraft } from './criar-context'

export async function criarCronogramaCompletoAction(
  draft: CronogramaDraft,
): Promise<{ ok?: boolean; id?: string; avisos?: string[]; error?: string }> {
  if (!(await checkPermission('cronogramas:create'))) return { error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { error: 'Tenant não resolvido.' }
  const tenantId = access.tenantId
  const svc = createAdminClient()
  const avisos: string[] = []

  // 1. Cronograma (rascunho) — reusa a action provada (slug + validação + auditoria).
  const r = await criarCronograma({
    nome: draft.nome,
    subtitulo: draft.subtitulo.trim() || null,
    carga_horaria: draft.cargaHoraria,
    total_semanas: draft.totalSemanas,
    dias_curso: draft.diasCurso,
    dias_nome: draft.diasNome,
    semanas_revisao: draft.semanasRevisao,
    categoria_id: draft.categoriaId,
    ordem: 0,
  })
  if (!r.ok || !r.id) return { error: r.error ?? 'Não foi possível criar o cronograma.' }
  const id = r.id

  // 2. Metas — se falhar, desfaz o cronograma (não deixa casca órfã).
  if (draft.metas.length) {
    const linhas = draft.metas.map((m) => ({
      tenant_id: tenantId,
      cronograma_id: id,
      semana: m.semana,
      dia: m.dia,
      tipo: m.tipo,
      disciplina: m.disciplina.trim(),
      disciplina_id: m.disciplina_id || null,
      aula: m.aula?.trim() || null,
      conteudo: m.conteudo?.trim() || null,
      duracao: m.duracao?.trim() || null,
      ordem: m.ordem ?? 0,
    }))
    const { data: metasRows, error: eMetas } = await svc.from('simulado_cronograma_metas').insert(linhas).select('id')
    if (eMetas) {
      await svc.from('simulado_cronogramas').delete().eq('id', id).eq('tenant_id', tenantId)
      return { error: `Não foi possível gravar as metas: ${eMetas.message}` }
    }

    // 2b. Questões anexadas (via Montagem) → meta_questoes. O INSERT devolve os ids na ORDEM de
    // entrada, então metasRows[i] casa com draft.metas[i]. Só vincula se a contagem bater (defensivo).
    const ids = (metasRows ?? []) as { id: string }[]
    const temQuestoes = draft.metas.some((m) => (m.questaoIds?.length ?? 0) > 0)
    if (temQuestoes && ids.length === draft.metas.length) {
      const mq: { tenant_id: string; meta_id: string; questao_id: string; ordem: number }[] = []
      draft.metas.forEach((m, i) => (m.questaoIds ?? []).forEach((qid, k) => mq.push({ tenant_id: tenantId, meta_id: ids[i].id, questao_id: qid, ordem: k })))
      if (mq.length) {
        const { error: eMq } = await svc.from('simulado_cronograma_meta_questoes').upsert(mq, { onConflict: 'meta_id,questao_id', ignoreDuplicates: true })
        if (eMq) avisos.push(`Questões das metas: ${eMq.message}`)
      }
    } else if (temQuestoes) {
      avisos.push('As questões anexadas não puderam ser vinculadas às metas (contagem divergente).')
    }
  }

  // 3. Links de aula (complementar) — (disciplina, aula) → tema + uma URL por plataforma.
  if (draft.links.length) {
    const { data: plats } = await svc
      .from('simulado_cronograma_plataformas')
      .select('id, slug')
      .eq('tenant_id', tenantId)
    const idPorSlug = new Map((plats ?? []).map((p: any) => [p.slug as string, p.id as string]))
    // Vídeo e PDF vêm da montagem como links sob plataformas próprias — garante que existam.
    if (!idPorSlug.has(SLUG_VIDEO) && draft.links.some((l) => l.urls[SLUG_VIDEO]?.trim())) {
      const vid = await garantirPlataformaVideo(svc, tenantId)
      if (vid) idPorSlug.set(SLUG_VIDEO, vid)
    }
    if (!idPorSlug.has(SLUG_PDF) && draft.links.some((l) => l.urls[SLUG_PDF]?.trim())) {
      const pid = await garantirPlataformaPdf(svc, tenantId)
      if (pid) idPorSlug.set(SLUG_PDF, pid)
    }
    for (const l of draft.links) {
      const disc = l.disciplina.trim()
      const aula = l.aula.trim()
      if (!disc || !aula) continue
      const { data: linkRow, error: eLink } = await svc
        .from('simulado_cronograma_links')
        .upsert(
          { tenant_id: tenantId, disciplina: disc, disciplina_id: l.disciplina_id || null, aula, tema: l.tema.trim() || null },
          { onConflict: 'tenant_id,disciplina,aula' },
        )
        .select('id')
        .single()
      if (eLink || !linkRow) {
        avisos.push(`Link ${disc}/${aula}: ${eLink?.message ?? 'falhou'}`)
        continue
      }
      const linkId = (linkRow as any).id as string
      const urls = Object.entries(l.urls).filter(([slug, url]) => idPorSlug.has(slug) && String(url).trim())
      if (urls.length) {
        const linhas = urls.map(([slug, url]) => ({
          tenant_id: tenantId,
          link_id: linkId,
          plataforma_id: idPorSlug.get(slug),
          url: String(url).trim(),
        }))
        const { error: eUrl } = await svc.from('simulado_cronograma_aula_links').upsert(linhas, { onConflict: 'link_id,plataforma_id' })
        if (eUrl) avisos.push(`URLs de ${disc}/${aula}: ${eUrl.message}`)
      }
    }
  }

  // 4. Vínculo aos grupos de acesso (pacotes) — complementar.
  if (draft.pacoteIds.length) {
    const linhas = draft.pacoteIds.map((pacoteId) => ({ tenant_id: tenantId, pacote_id: pacoteId, cronograma_id: id }))
    const { error: ePac } = await svc
      .from('simulado_cronograma_pacote_itens')
      .upsert(linhas, { onConflict: 'pacote_id,cronograma_id', ignoreDuplicates: true })
    if (ePac) avisos.push(`Vínculo a grupos de acesso: ${ePac.message}`)
  }

  // 5. Publicar já, se pedido (e houver metas). Falha aqui vira aviso — o cronograma já existe.
  if (draft.liberar && draft.metas.length) {
    const rl = await alternarLiberacao(id, true)
    if (!rl.ok) avisos.push(rl.error ?? 'Não foi possível liberar agora — ficou como rascunho.')
  }

  return { ok: true, id, avisos: avisos.length ? avisos : undefined }
}

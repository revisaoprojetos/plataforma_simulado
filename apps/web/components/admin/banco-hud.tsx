import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { carregarHudBanco } from '@/app/admin/banco-questoes/actions'
import { BancoHudPreview } from '@/components/admin/banco-hud-preview'

/** Aba "HUD do simulado" do banco: mostra a prévia do tema salvo; edição fica na rota /hud dedicada. */
export async function BancoHud({ bancoId }: { bancoId: string; cor?: string }) {
  const { base, porPagina } = await carregarHudBanco(bancoId)
  const svc = createAdminClient()
  const tid = (await getCurrentTenantId()) ?? '00000000-0000-0000-0000-000000000000'
  const { data } = await svc.from('simulado_pastas').select('nome').eq('id', bancoId).eq('tenant_id', tid).maybeSingle()
  const titulo = ((data as { nome?: string } | null)?.nome ?? 'Simulado') as string

  // Primeiras questões reais do banco → usadas na prévia navegável da tela "Prova" (em vez de questão demo).
  type QPrev = { id: string; enunciado: string; disciplina: string | null; imagem_url: string | null; alternativas: { id: string; texto: string }[] }
  let questoesIniciais: QPrev[] = []
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tid).order('questao_id', { ascending: true }).limit(10)
  const ids = (vinc as { questao_id: string }[] | null ?? []).map((v) => v.questao_id)
  if (ids.length) {
    let qr: { data: any[] | null; error: { message: string } | null } = await svc.from('simulado_questoes').select('id, enunciado, imagem_url, disciplinas:simulado_disciplinas(nome)').in('id', ids).eq('tenant_id', tid)
    if (qr.error) qr = await svc.from('simulado_questoes').select('id, enunciado, disciplinas:simulado_disciplinas(nome)').in('id', ids).eq('tenant_id', tid)
    if (qr.error) qr = await svc.from('simulado_questoes').select('id, enunciado').in('id', ids).eq('tenant_id', tid)
    const { data: alts } = await svc.from('simulado_alternativas').select('id, texto, ordem, questao_id').in('questao_id', ids).eq('tenant_id', tid).order('ordem', { ascending: true })
    const altMap = new Map<string, { id: string; texto: string }[]>()
    for (const a of (alts as { id: string; texto: string; questao_id: string }[] | null ?? [])) {
      const arr = altMap.get(a.questao_id) ?? []; arr.push({ id: a.id, texto: a.texto }); altMap.set(a.questao_id, arr)
    }
    const ordem = new Map(ids.map((id, i) => [id, i]))
    questoesIniciais = ((qr.data as { id: string; enunciado: string | null; imagem_url?: string | null; disciplinas?: { nome?: string } | null }[] | null) ?? [])
      .filter(Boolean)
      .sort((x, y) => (ordem.get(x.id) ?? 0) - (ordem.get(y.id) ?? 0))
      .map((q) => ({ id: q.id, enunciado: q.enunciado ?? '', disciplina: q.disciplinas?.nome ?? null, imagem_url: q.imagem_url ?? null, alternativas: altMap.get(q.id) ?? [] }))
      .filter((q) => q.alternativas.length)
  }

  return <BancoHudPreview bancoId={bancoId} titulo={titulo} base={base} porPagina={porPagina} questoesIniciais={questoesIniciais} />
}

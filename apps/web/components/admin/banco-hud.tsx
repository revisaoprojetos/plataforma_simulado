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

  // Primeira questão real do banco → usada na prévia da tela "Prova" (em vez da questão demo).
  let questaoInicial: { id: string; enunciado: string; disciplina: string | null; alternativas: { id: string; texto: string }[] } | null = null
  const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tid).order('questao_id', { ascending: true }).limit(1)
  const qid = (vinc as { questao_id: string }[] | null)?.[0]?.questao_id
  if (qid) {
    let qr = await svc.from('simulado_questoes').select('id, enunciado, disciplinas:simulado_disciplinas(nome)').eq('id', qid).maybeSingle()
    if (qr.error) qr = await svc.from('simulado_questoes').select('id, enunciado').eq('id', qid).maybeSingle()
    const q = qr.data as { id: string; enunciado: string | null; disciplinas?: { nome?: string } | null } | null
    if (q) {
      const { data: alts } = await svc.from('simulado_alternativas').select('id, texto, ordem').eq('questao_id', qid).order('ordem', { ascending: true })
      questaoInicial = {
        id: q.id, enunciado: q.enunciado ?? '', disciplina: q.disciplinas?.nome ?? null,
        alternativas: (alts as { id: string; texto: string }[] | null ?? []).map((a) => ({ id: a.id, texto: a.texto })),
      }
    }
  }

  return <BancoHudPreview bancoId={bancoId} titulo={titulo} base={base} porPagina={porPagina} questaoInicial={questaoInicial} />
}

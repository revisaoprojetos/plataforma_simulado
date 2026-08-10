import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernoTesteBuilder } from '@/components/admin/caderno-teste/builder'
import { normalizarBuilder, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { previewQuestoesBanco, dadosBancoTeste } from '../actions'

export const dynamic = 'force-dynamic'

export default async function CadernoTesteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  const svc = createAdminClient()

  const [caderno, bancos] = await Promise.all([
    svc.from('simulado_cadernos_teste').select('id, nome, config').eq('id', id).eq('tenant_id', tid).maybeSingle().then((r) => r.data),
    (async (): Promise<{ id: string; nome: string; capa: string | null }[]> => {
      const sel = (cols: string) => svc.from('simulado_pastas').select(cols).eq('tenant_id', tid).order('nome')
      let r: { data: any[] | null; error: { message: string } | null } = await sel('id, nome, is_folder, capa_url, capa_card_url')
      if (r.error) r = await sel('id, nome, is_folder, capa_url')
      if (r.error) r = await sel('id, nome, is_folder')
      return (r.data ?? []).filter((b: any) => !b.is_folder).map((b: any) => ({ id: b.id, nome: b.nome, capa: b.capa_card_url ?? b.capa_url ?? null }))
    })(),
  ])
  if (!caderno) notFound()

  const builder = normalizarBuilder((caderno as any).config, (caderno as any).nome)
  // Caderno recém-criado (sem builderV3 salvo) → abre o seletor de modelo em vez de vir com o padrão pronto.
  const ehNovo = !(((caderno as any).config?.builderV3?.itens?.length) > 0)
  let questoes: PreviewQuestao[] = []
  let registros: any[] = []
  let disciplinas: any[] = []
  if (builder.bancoId) {
    const [rq, rd] = await Promise.all([previewQuestoesBanco(builder.bancoId), dadosBancoTeste(builder.bancoId)])
    questoes = rq.questoes ?? []
    if (rd.ok) { registros = rd.registros; disciplinas = rd.disciplinas }
  }

  return (
    <CadernoTesteBuilder cadernoId={caderno.id} builderInicial={builder} bancos={(bancos ?? []) as { id: string; nome: string }[]} questoesIniciais={questoes} registrosIniciais={registros} disciplinasIniciais={disciplinas} abrirPickerInicial={ehNovo} />
  )
}

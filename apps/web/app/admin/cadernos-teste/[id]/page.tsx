import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { CadernoTesteBuilder } from '@/components/admin/caderno-teste/builder'
import { normalizarBuilder, type PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { previewQuestoesBanco } from '../actions'

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
  // Caderno recém-criado (sem builder salvo) → abre o pop-up de modelos automaticamente.
  const novo = !((caderno as any).config?.builderV3)
  let questoes: PreviewQuestao[] = []
  if (builder.bancoId) { const r = await previewQuestoesBanco(builder.bancoId); questoes = r.questoes ?? [] }

  return (
    <CadernoTesteBuilder cadernoId={caderno.id} builderInicial={builder} bancos={(bancos ?? []) as { id: string; nome: string }[]} questoesIniciais={questoes} abrirPickerInicial={novo} />
  )
}

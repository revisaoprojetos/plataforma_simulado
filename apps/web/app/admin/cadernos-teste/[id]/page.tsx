import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { dataComQuestao } from '@/lib/caderno-designer/blocks'
import { getTenantTheme } from '@/lib/tenant-theme'
import type { CadernoData } from '@/lib/caderno-designer/types'
import { EditorProvider } from '@/components/admin/caderno-editor/store/use-editor-store'
import { CadernoEditorShell } from '@/components/admin/caderno-editor/caderno-editor-shell'
import { normalizarConfig } from '@/components/admin/caderno-editor/store/normalizar'

// Área de TESTE: abre o caderno SEMPRE no editor novo (unificado), sem depender da flag e sem
// alterar o fluxo de "Cadernos de Prova". Reusa a mesma carga de dados do editor atual.
export const dynamic = 'force-dynamic'
const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function CadernoEditorTestePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  const [caderno, bancos, temaRes] = await Promise.all([
    (async (): Promise<any> => {
      const r = await svc.from('simulado_cadernos_designer').select('id, nome, config, pasta_id, cor, icone, capa_url').eq('id', id).eq('tenant_id', tid).maybeSingle()
      if (r.error && /pasta_id|cor|icone|capa_url|column/i.test(r.error.message)) {
        const r2 = await svc.from('simulado_cadernos_designer').select('id, nome, config').eq('id', id).eq('tenant_id', tid).maybeSingle()
        return r2.data
      }
      return r.data
    })(),
    (async (): Promise<{ id: string; nome: string }[]> => {
      const r = await svc.from('simulado_pastas').select('id, nome, is_folder').eq('tenant_id', tid).order('nome')
      if (r.error) return ((await svc.from('simulado_pastas').select('id, nome').eq('tenant_id', tid).order('nome')).data ?? []) as any
      return (r.data ?? []).filter((b: any) => !b.is_folder).map((b: any) => ({ id: b.id, nome: b.nome }))
    })(),
    getTenantTheme(),
  ])
  if (!caderno) notFound()
  const pastaId: string | null = (caderno as any).pasta_id ?? null
  const config = (caderno.config ?? {}) as any
  const bancoId: string | null = config.bancoId ?? null
  const bancoNome = bancoId ? bancos.find((b) => b.id === bancoId)?.nome ?? null : null

  let questoes: any[] | null = null
  if (bancoId) {
    const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tid).order('questao_id', { ascending: true }))
    const ids = vinc.map((v) => v.questao_id)
    questoes = ids.length
      ? await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor').in('id', chunk).eq('tenant_id', tid).order('id', { ascending: true }))
      : []
  } else {
    questoes = await fetchAll<any>(() => svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor').eq('tenant_id', tid).eq('status', 'publicada').order('created_at', { ascending: false }))
  }

  const amostraIds = (questoes ?? []).map((q: any) => q.id)
  const [alts, registros] = await Promise.all([
    amostraIds.length
      ? fetchAllByIn<any>(amostraIds, (chunk) => svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta, comentario, lei').in('questao_id', chunk).eq('tenant_id', tid).order('questao_id', { ascending: true }))
      : Promise.resolve([] as any[]),
    bancoId ? carregarRegistros(svc, tid, bancoId, bancoNome ?? caderno.nome, undefined, undefined, 500) : Promise.resolve([] as any[]),
  ])
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }

  const previewData: CadernoData = {
    numQuestoes: (questoes ?? []).length || 20,
    numAlternativas: 5,
    questoes: (questoes ?? []).map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo, comentario: q.comentario_professor ?? '',
      alternativas: (altMap.get(q.id) ?? []).sort((x, y) => x.ordem - y.ordem).map((a, j) => ({ letra: LETRAS[j] ?? '?', texto: a.texto ?? '', correta: !!a.correta, comentario: a.comentario ?? '', lei: a.lei ?? '' })),
    })),
    vars: {
      nome: 'João da Silva', email: 'joao.silva@email.com', telefone: '(11) 90000-0000', classificacao: '',
      simulado: bancoNome ?? caderno.nome, acertos: '14', erros: '6', total_questoes: String((questoes ?? []).length || 20),
      nota: '7,0', percentual: '70%',
      data: '14/06/2026', inicio: '09:42', termino: '12:56', tempo_total: '194min', respondidas: '98', em_branco: '2',
    },
  }
  if (registros.length) previewData.vars = { ...previewData.vars, ...registros[0].vars }
  previewData.gabaritoLiberado = true
  if (previewData.questoes[0]) {
    const base = dataComQuestao(previewData, previewData.questoes[0])
    previewData.vars = base.vars
    previewData.questaoAtual = base.questaoAtual
  }

  const { tema, tenantNome } = temaRes
  const ti = (tema ?? {}) as any
  const branding = {
    nome: ti.nome_site ?? tenantNome ?? 'Simulado',
    logoUrl: ti.logo_url ?? null,
    logoGrandeUrl: ti.logo_grande_url ?? null,
    logoBg: ti.logo_png_bg ?? '#ffffff',
    logoEstilo: ti.logo_estilo ?? 'arredondado',
  }

  const { inicial, meta } = normalizarConfig(config, { nome: caderno.nome, cor: (caderno as any).cor ?? null, icone: (caderno as any).icone ?? null, capa: (caderno as any).capa_url ?? null })
  return (
    <EditorProvider cadernoId={caderno.id} inicial={inicial} meta={meta}>
      <CadernoEditorShell previewData={previewData} bancos={(bancos ?? []) as { id: string; nome: string }[]} registros={registros} branding={branding} pastaId={pastaId} voltarHref="/admin/cadernos-teste" />
    </EditorProvider>
  )
}

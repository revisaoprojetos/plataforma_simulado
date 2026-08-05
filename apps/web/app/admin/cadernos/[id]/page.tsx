import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { CadernoEditorV2 } from '@/components/admin/caderno-editor-v2'
import { carregarRegistros } from '@/lib/caderno-designer/merge'
import { dataComQuestao } from '@/lib/caderno-designer/blocks'
import { getTenantTheme } from '@/lib/tenant-theme'
import type { CadernoData } from '@/lib/caderno-designer/types'

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function CadernoEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()

  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Caderno (tolerante à coluna pasta_id), lista de bancos do tenant e tema — independentes entre si.
  const [caderno, bancos, temaRes] = await Promise.all([
    (async (): Promise<any> => {
      const r = await svc.from('simulado_cadernos_designer').select('id, nome, config, pasta_id').eq('id', id).eq('tenant_id', tid).maybeSingle()
      if (r.error && /pasta_id|column/i.test(r.error.message)) {
        const r2 = await svc.from('simulado_cadernos_designer').select('id, nome, config').eq('id', id).eq('tenant_id', tid).maybeSingle()
        return r2.data
      }
      return r.data
    })(),
    // Bancos (pastas is_folder=false) para o seletor do header — exclui as pastas-folder.
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

  // Questões: do banco vinculado (se houver) ou publicadas do tenant.
  let questoes: any[] | null = null
  if (bancoId) {
    // fetchAll/fetchAllByIn: banco com >1000 questões truncava (vínculos + questões) → caderno incompleto.
    const vinc = await fetchAll<{ questao_id: string }>(() => svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).eq('tenant_id', tid).order('questao_id', { ascending: true }))
    const ids = vinc.map((v) => v.questao_id)
    questoes = ids.length
      ? await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor').in('id', chunk).eq('tenant_id', tid).order('id', { ascending: true }))
      : []
  } else {
    questoes = await fetchAll<any>(() => svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo, comentario_professor')
      .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
      .eq('status', 'publicada')
      .order('created_at', { ascending: false }))
  }

  // Alternativas do preview + mala direta (alunos do banco) em paralelo — independentes entre si.
  // Preview do editor: só os primeiros alunos populam o seletor (não os milhares do banco).
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

  // Mala direta (registros) já resolvida acima em paralelo com as alternativas.
  if (registros.length) previewData.vars = { ...previewData.vars, ...registros[0].vars }

  previewData.gabaritoLiberado = true // no editor a correção sempre aparece (para desenhar)

  // Base: a 1ª questão preenche as variáveis de questão ({q_enunciado}, {q_alternativas}…)
  // mesmo fora do repetidor, para o preview ter uma referência.
  if (previewData.questoes[0]) {
    const base = dataComQuestao(previewData, previewData.questoes[0])
    previewData.vars = base.vars
    previewData.questaoAtual = base.questaoAtual
  }

  // Branding do sistema (logo + nome) para o preview do HUD refletir a config. Tema já resolvido acima.
  const { tema, tenantNome } = temaRes
  const ti = (tema ?? {}) as any
  const branding = {
    nome: ti.nome_site ?? tenantNome ?? 'Simulado',
    logoUrl: ti.logo_url ?? null,
    logoGrandeUrl: ti.logo_grande_url ?? null,
    logoBg: ti.logo_png_bg ?? '#ffffff',
    logoEstilo: ti.logo_estilo ?? 'arredondado',
  }

  return (
    <CadernoEditorV2
      cadernoId={caderno.id}
      nome={caderno.nome}
      inicial={{ docsV2: config.docsV2, modalidadesV2: config.modalidadesV2, cores: config.cores, hudCores: config.hudCores, hudPorPagina: config.hudPorPagina }}
      previewData={previewData}
      bancos={(bancos ?? []) as { id: string; nome: string }[]}
      bancoIdInicial={bancoId}
      registros={registros}
      branding={branding}
      pastaId={pastaId}
    />
  )
}

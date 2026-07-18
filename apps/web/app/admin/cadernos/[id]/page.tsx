import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
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

  const { data: caderno } = await svc
    .from('simulado_cadernos_designer')
    .select('id, nome, config')
    .eq('id', id)
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (!caderno) notFound()

  const config = (caderno.config ?? {}) as any
  const bancoId: string | null = config.bancoId ?? null

  // Bancos (pastas) do tenant para o seletor do header.
  const { data: bancos } = await svc
    .from('simulado_pastas')
    .select('id, nome')
    .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
    .order('nome')
  const bancoNome = bancoId ? (bancos ?? []).find((b: any) => b.id === bancoId)?.nome ?? null : null

  // Questões: do banco vinculado (se houver) ou publicadas do tenant.
  let questoes: any[] | null = null
  if (bancoId) {
    const { data: vinc } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId)
    const ids = (vinc ?? []).map((v: any) => v.questao_id)
    questoes = ids.length
      ? (await svc.from('simulado_questoes').select('id, enunciado, tipo, comentario_professor').in('id', ids).limit(80)).data
      : []
  } else {
    questoes = (await svc
      .from('simulado_questoes')
      .select('id, enunciado, tipo, comentario_professor')
      .eq('tenant_id', access.tenantId ?? '00000000-0000-0000-0000-000000000000')
      .eq('status', 'publicada')
      .order('created_at', { ascending: false })
      .limit(60)).data
  }

  const amostraIds = (questoes ?? []).slice(0, 6).map((q: any) => q.id)
  const { data: alts } = amostraIds.length
    ? await svc.from('simulado_alternativas').select('questao_id, texto, ordem, correta').in('questao_id', amostraIds)
    : { data: [] as any[] }
  const altMap = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altMap.get(a.questao_id) ?? []; arr.push(a); altMap.set(a.questao_id, arr) }

  const previewData: CadernoData = {
    numQuestoes: (questoes ?? []).length || 20,
    numAlternativas: 5,
    questoes: (questoes ?? []).slice(0, 6).map((q: any, i: number) => ({
      id: q.id, numero: i + 1, enunciado: q.enunciado ?? '', tipo: q.tipo, comentario: q.comentario_professor ?? '',
      alternativas: (altMap.get(q.id) ?? []).sort((x, y) => x.ordem - y.ordem).map((a, j) => ({ letra: LETRAS[j] ?? '?', texto: a.texto ?? '', correta: !!a.correta })),
    })),
    vars: {
      nome: 'João da Silva', email: 'joao.silva@email.com', telefone: '(11) 90000-0000', classificacao: '',
      simulado: bancoNome ?? caderno.nome, acertos: '14', total_questoes: String((questoes ?? []).length || 20),
      nota: '7,0', percentual: '70%',
      data: '14/06/2026', inicio: '09:42', termino: '12:56', tempo_total: '194min', respondidas: '98', em_branco: '2',
    },
  }

  // Mala direta: alunos do banco vinculado, com suas variáveis reais.
  const registros = bancoId ? await carregarRegistros(svc, access.tenantId ?? '00000000-0000-0000-0000-000000000000', bancoId, bancoNome ?? caderno.nome) : []
  if (registros.length) previewData.vars = { ...previewData.vars, ...registros[0].vars }

  previewData.gabaritoLiberado = true // no editor a correção sempre aparece (para desenhar)

  // Base: a 1ª questão preenche as variáveis de questão ({q_enunciado}, {q_alternativas}…)
  // mesmo fora do repetidor, para o preview ter uma referência.
  if (previewData.questoes[0]) {
    const base = dataComQuestao(previewData, previewData.questoes[0])
    previewData.vars = base.vars
    previewData.questaoAtual = base.questaoAtual
  }

  // Branding do sistema (logo + nome) para o preview do HUD refletir a config.
  const { tema, tenantNome } = await getTenantTheme()
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
    />
  )
}

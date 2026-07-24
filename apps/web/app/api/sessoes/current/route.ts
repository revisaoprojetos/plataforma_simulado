import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createAdminClient } from '@/lib/supabase/server'
import { type HudCores } from '@/lib/caderno-designer/types'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'

// GET /api/sessoes/current?token={embed_token}&st={sessao_id}
// Carrega o estado da sessão para o runner do aluno.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st') // sessao_id (UUID)
  if (!st) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, status, iniciado_em, tenant_id')
    .eq('id', st)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }

  const { data: simulado } = await supabase
    .from('simulado_simulados')
    .select('tempo_limite_min, titulo')
    .eq('id', sessao.simulado_id)
    .single()

  // Tolerante à coluna imagem_url (pode não ter sido migrada ainda): tenta com ela, cai sem.
  const selQ = (cols: string) => supabase
    .from('simulado_prova_questoes')
    .select(`ordem, questoes:simulado_questoes(${cols})`)
    .eq('simulado_id', sessao.simulado_id)
    // Tolerante a null: exclui só as explicitamente anuladas (dados migrados vêm com anulada=null).
    .not('anulada', 'is', true)
    .order('ordem')
  let sqr = await selQ('id, tipo, enunciado, imagem_url, alternativas:simulado_alternativas(id, texto, ordem)')
  if (sqr.error && /imagem_url|column/i.test(sqr.error.message)) {
    sqr = await selQ('id, tipo, enunciado, alternativas:simulado_alternativas(id, texto, ordem)')
  }
  const sq = sqr.data

  const questoes = (sq ?? []).map((row: any) => ({
    id: row.questoes?.id,
    tipo: row.questoes?.tipo ?? 'objetiva',
    enunciado: row.questoes?.enunciado ?? '',
    imagem_url: row.questoes?.imagem_url ?? null,
    alternativas: (row.questoes?.alternativas ?? [])
      .slice()
      .sort((a: any, b: any) => a.ordem - b.ordem)
      .map((a: any) => ({ id: a.id, texto: a.texto, ordem: a.ordem })),
  }))

  const { data: respostas } = await supabase
    .from('simulado_respostas_objetivas')
    .select('questao_id, alternativa_id')
    .eq('sessao_id', sessao.id)

  const respMap: Record<string, string> = {}
  for (const r of respostas ?? []) {
    if (r.alternativa_id) respMap[r.questao_id as string] = r.alternativa_id as string
  }

  // Respostas discursivas já escritas nesta sessão.
  const { data: disc } = await supabase
    .from('simulado_respostas_discursivas')
    .select('questao_id, texto')
    .eq('sessao_id', sessao.id)
  const respDisc: Record<string, string> = {}
  for (const d of disc ?? []) respDisc[d.questao_id as string] = (d.texto as string) ?? ''

  // Cores do HUD do caderno vinculado ao simulado — recolore a prova com o tema do caderno.
  const hud = await resolverHudConfig(sessao.simulado_id, sessao.tenant_id)
  const hudCores: HudCores = hud.base
  const hudPorPagina = hud.porPagina

  // Branding do tenant (logo + nome) — o header da prova segue a configuração do sistema.
  let branding: { nome: string; logoUrl: string | null; logoGrandeUrl: string | null; logoBg: string; logoEstilo: string } | null = null
  try {
    const admin = createAdminClient()
    const { data: t } = await admin.from('simulado_tenants').select('nome, tema').eq('id', sessao.tenant_id).maybeSingle()
    const tema = (t?.tema ?? {}) as any
    branding = {
      nome: tema.nome_site ?? t?.nome ?? 'Simulado',
      logoUrl: tema.logo_url ?? null,
      logoGrandeUrl: tema.logo_grande_url ?? null,
      logoBg: tema.logo_png_bg ?? '#ffffff',
      logoEstilo: tema.logo_estilo ?? 'arredondado',
    }
  } catch { /* sem branding */ }

  return NextResponse.json({
    id: sessao.id,
    questoes,
    simuladoTitulo: simulado?.titulo ?? 'Simulado',
    tempo_limite_min: simulado?.tempo_limite_min ?? null,
    iniciado_em: sessao.iniciado_em,
    status: sessao.status,
    respostas: respMap,
    respostas_discursivas: respDisc,
    hudCores,
    hudPorPagina,
    branding,
  })
}

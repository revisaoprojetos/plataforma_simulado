import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { type HudCores } from '@/lib/caderno-designer/types'
import { resolverHudConfig } from '@/lib/hud/resolve-hud'
import { funcaoEtiquetaPorQuestao, funcaoBloqueia } from '@/lib/simulado/etiqueta-funcao'
import { etiquetasPorQuestao } from '@/lib/aluno/etiquetas-questao'
import { memoEstatico } from '@/lib/cache/memo-estatico'

// GET /api/sessoes/current?token={embed_token}&st={sessao_id}
// Carrega o estado da sessão para o runner do aluno.
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
//
// ESCALA (1000+ alunos no mesmo simulado): o CONTEÚDO (questões + alternativas + metadados + branding)
// é IGUAL pra todos → cacheado com `remember` (Redis em prod, memória no dev) p/ 1500 alunos não lerem
// as 60 questões do banco 1500×. Só o PER-ALUNO (respostas/discursivas da sessão) é lido ao vivo.
// Invalida por TTL curto (anulação/alteração durante a prova reflete em ≤ alguns min; a re-correção
// server-side cuida da PONTUAÇÃO de qualquer jeito). Degrada com elegância (Redis fora → computa direto).
export const dynamic = 'force-dynamic'

/** Bundle COMPARTILHADO por simulado (igual p/ todos os alunos) — o que é caro de ler e repetido. */
interface Compartilhado {
  questoes: any[]
  simuladoTitulo: string
  tempo_limite_min: number | null
  hudCores: HudCores
  hudPorPagina: any
  branding: { nome: string; logoUrl: string | null; logoGrandeUrl: string | null; logoBg: string; logoEstilo: string } | null
}

async function carregarCompartilhado(simuladoId: string, tenantId: string): Promise<Compartilhado> {
  const supabase = createAdminClient()
  const admin = createAdminClient()

  // Tolerante à coluna imagem_url (pode não ter sido migrada): tenta com ela, cai sem.
  const selQ = (cols: string) => supabase
    .from('simulado_prova_questoes')
    .select(`ordem, anulada, questoes:simulado_questoes(${cols})`)
    .eq('simulado_id', simuladoId)
    // Defesa em profundidade: só serve questões DO tenant da sessão (service role bypassa RLS;
    // impede que uma linha cross-tenant eventualmente injetada na prova apareça na prova do aluno).
    .eq('tenant_id', tenantId)
    // Anuladas NÃO são escondidas: aparecem no runner com as assertivas, porém bloqueadas
    // para resposta (ponto garantido a todos). A flag `anulada` vai no payload.
    .order('ordem')

  const [{ data: simulado }, sq, hud, branding] = await Promise.all([
    supabase.from('simulado_simulados').select('tempo_limite_min, titulo').eq('id', simuladoId).single(),
    (async () => {
      let sqr = await selQ('id, tipo, enunciado, imagem_url, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem)')
      if (sqr.error && /imagem_url|column/i.test(sqr.error.message)) sqr = await selQ('id, tipo, enunciado, disciplinas:simulado_disciplinas(nome), alternativas:simulado_alternativas(id, texto, ordem)')
      if (sqr.error) sqr = await selQ('id, tipo, enunciado, alternativas:simulado_alternativas(id, texto, ordem)')
      return sqr.data
    })(),
    resolverHudConfig(simuladoId, tenantId),
    (async (): Promise<Compartilhado['branding']> => {
      try {
        const { data: t } = await admin.from('simulado_tenants').select('nome, tema').eq('id', tenantId).maybeSingle()
        const tema = (t?.tema ?? {}) as any
        return {
          nome: tema.nome_site ?? t?.nome ?? 'Simulado',
          logoUrl: tema.logo_url ?? null,
          logoGrandeUrl: tema.logo_grande_url ?? null,
          logoBg: tema.logo_png_bg ?? '#ffffff',
          logoEstilo: tema.logo_estilo ?? 'arredondado',
        }
      } catch { return null }
    })(),
  ])

  const questoes = (sq ?? []).map((row: any) => ({
    id: row.questoes?.id,
    tipo: row.questoes?.tipo ?? 'objetiva',
    anulada: row.anulada === true,
    bloqueada: row.anulada === true, // bloqueia responder (anulada do simulado OU etiqueta funcional — abaixo)
    aviso: null as { nome: string; cor: string | null; funcao: string } | null, // faixa no topo (anulada/desatualizada/aviso)
    enunciado: row.questoes?.enunciado ?? '',
    disciplina: row.questoes?.disciplinas?.nome ?? null,
    imagem_url: row.questoes?.imagem_url ?? null,
    etiquetas: [] as { nome: string; cor: string | null }[], // badges de exibição — preenchidas abaixo
    pontuacao_total: null as number | null, // discursiva: preenchido abaixo (tolerante)
    linhas: null as number | null,
    categoria_discursiva: null as string | null,
    alternativas: (row.questoes?.alternativas ?? [])
      .slice()
      .sort((a: any, b: any) => a.ordem - b.ordem)
      .map((a: any) => ({ id: a.id, texto: a.texto, ordem: a.ordem })),
  }))

  // Campos informativos da discursiva (pontuação total + nº de linhas) — tolerante (podem não estar migrados).
  try {
    const qids = questoes.map((q) => q.id).filter(Boolean)
    if (qids.length) {
      const { data: extras } = await admin.from('simulado_questoes').select('id, pontuacao_total, linhas, categoria_discursiva').in('id', qids)
      const ex = new Map((extras ?? []).map((r: any) => [r.id, r]))
      for (const q of questoes) { const e = ex.get(q.id); if (e) { q.pontuacao_total = e.pontuacao_total ?? null; q.linhas = e.linhas ?? null; q.categoria_discursiva = e.categoria_discursiva ?? null } }
    }
  } catch { /* colunas não migradas */ }

  // Etiquetas FUNCIONAIS por questão → aviso no topo + bloqueio (anular/desconsiderar bloqueiam; avisar não).
  try {
    const qids = questoes.map((q) => q.id).filter(Boolean)
    const funcs = await funcaoEtiquetaPorQuestao(admin, qids)
    for (const q of questoes) {
      const ef = funcs.get(q.id)
      if (ef) { q.aviso = { nome: ef.nome, cor: ef.cor, funcao: ef.funcao }; if (funcaoBloqueia(ef.funcao)) q.bloqueada = true }
      else if (q.anulada) q.aviso = { nome: 'Questão anulada', cor: '#ef4444', funcao: 'anular' } // anulada do simulado sem etiqueta
    }
  } catch { /* etiquetas ausentes */ }

  // Etiquetas de EXIBIÇÃO (badges nome + cor) por questão — mostradas no pop-up de expandir.
  try {
    const qids = questoes.map((q) => q.id).filter(Boolean)
    const map = await etiquetasPorQuestao(admin, tenantId, qids)
    for (const q of questoes) q.etiquetas = map.get(q.id) ?? []
  } catch { /* etiquetas ausentes */ }

  return {
    questoes,
    simuladoTitulo: simulado?.titulo ?? 'Simulado',
    tempo_limite_min: simulado?.tempo_limite_min ?? null,
    hudCores: hud.base,
    hudPorPagina: hud.porPagina,
    branding,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const st = searchParams.get('st') // sessao_id (UUID)
  if (!st) {
    return NextResponse.json({ message: 'Sessão ausente.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: sessao } = await supabase
    .from('simulado_sessoes_prova')
    .select('id, simulado_id, estudante_id, status, iniciado_em, tenant_id')
    .eq('id', st)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ message: 'Sessão não encontrada.' }, { status: 404 })
  }

  const tenantId = (sessao as { tenant_id?: string }).tenant_id ?? '00000000-0000-0000-0000-000000000000'

  // CONTEÚDO compartilhado (questões + metadados) — cacheado por simulado (TTL curto). Em escala,
  // 1500 alunos reutilizam o mesmo bundle em vez de recarregar as questões do banco.
  const admin = createAdminClient()
  const [compartilhado, { data: respostas }, { data: disc }] = await Promise.all([
    // Conteúdo estático da prova (questões/alternativas/enunciados) — cache de vida longa POR RÉPLICA
    // (protege o banco mesmo sem Redis) + Redis entre réplicas. 1500 alunos reutilizam o mesmo bundle.
    memoEstatico(`sim-prova:questoes:${sessao.simulado_id}`, 600, () => carregarCompartilhado(sessao.simulado_id, tenantId)),
    // PER-ALUNO (ao vivo): respostas objetivas e discursivas DESTA sessão.
    supabase.from('simulado_respostas_objetivas').select('questao_id, alternativa_id').eq('sessao_id', sessao.id),
    supabase.from('simulado_respostas_discursivas').select('id, questao_id, texto').eq('sessao_id', sessao.id),
  ])

  const respMap: Record<string, string> = {}
  for (const r of respostas ?? []) {
    if (r.alternativa_id) respMap[r.questao_id as string] = r.alternativa_id as string
  }

  const respDisc: Record<string, string> = {}
  for (const d of disc ?? []) respDisc[d.questao_id as string] = (d.texto as string) ?? ''

  // Nº de páginas (fotos) enviadas por questão discursiva — para o runner marcar "respondida".
  // Tolerante: se a tabela de junção ainda não foi migrada, ignora (fica vazio).
  const respDiscPaginas: Record<string, number> = {}
  const respIds = (disc ?? []).map((d: any) => d.id).filter(Boolean)
  if (respIds.length) {
    try {
      const { data: js } = await admin.from('simulado_resposta_arquivos').select('resposta_id').in('resposta_id', respIds)
      const porResp = new Map<string, number>()
      for (const j of (js ?? []) as any[]) porResp.set(j.resposta_id, (porResp.get(j.resposta_id) ?? 0) + 1)
      for (const d of (disc ?? []) as any[]) { const n = porResp.get(d.id) ?? 0; if (n > 0) respDiscPaginas[d.questao_id] = n }
    } catch { /* tabela ainda não migrada */ }
  }

  return NextResponse.json({
    id: sessao.id,
    questoes: compartilhado.questoes,
    simuladoTitulo: compartilhado.simuladoTitulo,
    tempo_limite_min: compartilhado.tempo_limite_min,
    iniciado_em: sessao.iniciado_em,
    status: sessao.status,
    respostas: respMap,
    respostas_discursivas: respDisc,
    paginas_discursivas: respDiscPaginas,
    hudCores: compartilhado.hudCores,
    hudPorPagina: compartilhado.hudPorPagina,
    branding: compartilhado.branding,
  })
}

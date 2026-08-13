import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverGruposCatalogo } from '@/lib/aluno/grupos-catalogo'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { idsSimuladosGratuitos } from '@/lib/simulado/gratuito'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { getGamConfig } from '@/lib/gamificacao'
import { resumoGamificacao, missoesHoje, atividadeSemana, conquistasProgresso, type ResumoGamificacao, type MissaoView, type DiaAtivo, type ConquistaProgresso } from '@/lib/gamificacao/leitura'
import type { GamConfig } from '@/lib/gamificacao/config'
import type { Trilha } from '@/components/aluno/trilha-simulados'

export interface GamRail { resumo: ResumoGamificacao; missoes: MissaoView[]; semana: DiaAtivo[]; conquistas: ConquistaProgresso[]; config: GamConfig }

/**
 * Monta as trilhas de simulados do aluno (por grupo/pasta, nós concluído → atual → disponível),
 * o mesmo dado usado na Início. Extraído para ser reaproveitado pela página dedicada /aluno/trilha.
 */
export async function carregarTrilhasAluno(): Promise<{ trilhas: Trilha[]; gamAtivo: boolean; nome: string; gam: GamRail | null }> {
  const sessao = await getSessaoAluno()
  if (!sessao) return { trilhas: [], gamAtivo: false, nome: 'Aluno', gam: null }
  const svc = await createServiceClient()
  const estId = sessao.estudanteId

  const [{ data: mats }, { data: acs }, { data: sessAll }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    svc.from('simulado_sessoes_prova').select('simulado_id, status, nota').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
  ])

  const gratuitoIds = await idsSimuladosGratuitos(svc, sessao.tenantId)
  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
    ...gratuitoIds,
  ].filter(Boolean))]

  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  if (ids.length) {
    sims = await fetchAllByIn<any>(ids, (chunk) => svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at').in('id', chunk).eq('deletado', false).order('id', { ascending: true }))
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }
  const feitosSet = new Set(sims.filter((s) => (sessoesPorSim.get(s.id) ?? []).some((x) => x.status === 'finalizada')).map((s) => s.id))

  const visual = await resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras })))
  const itensAll = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.refazer || i.statusLabel === 'Agendado')

  const [{ grupoPorSim, grupos }, enunUrls] = await Promise.all([
    resolverGruposCatalogo(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
    resolverEnunciadoUrls(svc, itensAll.map((i) => ({ id: i.id, regras: i.regras }))),
  ])
  const itensCat = itensAll.map((i) => {
    const info = enunUrls.get(i.id)
    const liberado = (i.regras as any)?.enunciado_liberado !== false
    const url = !liberado ? null
      : info?.pdf ? info.pdf
      : (info?.temCaderno && i.embed_token) ? `/api/aluno/caderno-teste-questoes?token=${encodeURIComponent(i.embed_token)}` : null
    return { ...i, grupoId: grupoPorSim.get(i.id) ?? null, enunciadoUrl: url }
  })

  // Gamificação: baseXp só quando ativo + bundle da coluna direita (meta/sequência/missões/liga/conquistas).
  const gamConfig = await getGamConfig(svc, sessao.tenantId)
  const baseXp = gamConfig?.ativo ? (gamConfig.xp_regras.simulado.base || 0) : 0
  let gam: GamRail | null = null
  if (gamConfig?.ativo) {
    const [resumo, missoes, semana, conquistas] = await Promise.all([
      resumoGamificacao(svc, sessao.tenantId, estId, gamConfig),
      missoesHoje(svc, sessao.tenantId, estId, gamConfig),
      atividadeSemana(svc, sessao.tenantId, estId, gamConfig.timezone),
      conquistasProgresso(svc, sessao.tenantId, estId, gamConfig),
    ])
    if (resumo) gam = { resumo, missoes, semana, conquistas, config: gamConfig }
  }

  // Contagem de questões (válidas) por simulado.
  const cntQ = new Map<string, number>()
  {
    const idsTrilha = [...new Set(itensCat.map((i) => i.id))]
    if (idsTrilha.length) {
      const rows = await fetchAllByIn<any>(idsTrilha, (chunk) => svc.from('simulado_prova_questoes').select('simulado_id, anulada').in('simulado_id', chunk).order('simulado_id'))
      for (const r of rows) if (!r.anulada) cntQ.set(r.simulado_id, (cntQ.get(r.simulado_id) ?? 0) + 1)
    }
  }

  const lanc = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  const dataTitulo = (tit?: string) => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(tit || ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null }
  const ordKey = (i: any) => dataTitulo(i.titulo) ?? lanc(i)

  const trilhas: Trilha[] = grupos.map((g) => {
    const its = itensCat.filter((i) => i.grupoId === g.id).sort((a, b) => ordKey(a) - ordKey(b) || (a.titulo || '').localeCompare(b.titulo || ''))
    let primeiroPendente = true
    const nodes = its.map((i) => {
      const sess = sessoesPorSim.get(i.id) ?? []
      const notas = sess.filter((s: any) => s.status === 'finalizada' && s.nota != null).map((s: any) => Number(s.nota))
      const done = feitosSet.has(i.id)
      const acerto = notas.length ? Math.round(Math.max(...notas)) : null
      let estado: 'concluido' | 'atual' | 'disponivel'
      if (done) estado = 'concluido'
      else if (primeiroPendente) { estado = 'atual'; primeiroPendente = false }
      else estado = 'disponivel'
      const runner = i.embed_token ? `/simulado/${i.embed_token}` : `/aluno/simulados/${i.id}`
      const podeRefazer = i.refazer || i.podeFazer || i.emAndamento
      const href = done ? (podeRefazer ? runner : `/aluno/simulados/${i.id}`) : runner
      const acao = done ? (podeRefazer ? 'Refazer' : 'Ver resultado') : i.emAndamento ? 'Continuar' : 'Fazer agora'
      const vis = visual.get(i.id)
      const capa = vis?.capa ?? null
      const capaBanner = vis?.capaBanner ?? vis?.capa ?? null
      const nota = notas.length ? Math.max(...notas) : null
      return { id: i.id, titulo: i.titulo, quando: i.quando, estado, acerto, nota, tentativas: notas.length, statusLabel: i.statusLabel, questoes: cntQ.get(i.id) ?? 0, xp: baseXp, href, acao, capa, capaBanner, cadernoUrl: i.enunciadoUrl ?? null }
    })
    return { id: g.id, nome: g.nome, cor: g.cor ?? null, capa: (g as any).capa ?? null, total: nodes.length, done: nodes.filter((n) => n.estado === 'concluido').length, trilhaXp: baseXp * nodes.length, nodes }
  }).filter((tr) => tr.nodes.length > 0)

  return { trilhas, gamAtivo: !!gamConfig?.ativo, nome: sessao.nome, gam }
}

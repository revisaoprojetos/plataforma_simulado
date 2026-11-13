import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { ContextoAluno, avaliarSegmentos } from '@/lib/segmentos/avaliar'
import { regrasSegmentoDoAluno } from '@/lib/segmentos/regras-produto'
import { efeitoDeAcesso, estadoDoConteudo, regrasDoProduto } from '@/lib/segmentos/visibilidade'
import { acessoAoProduto } from './aluno'
import { matriculaNoProduto, momentoLiberacao, normDisp } from './curriculo-aluno'
import {
  detalheCronogramaDoAluno, liberacaoAulasDoAluno, ehSentinelaBloqueio, ehSentinelaMeta, type Item, type Mod,
} from './liberacao-aulas-aluno'
import { PARAMS_PADRAO } from './liberacao-aulas-decisao'
import type { NucleoAluno } from './liberacao-consulta-aluno'
import { hrefLiberacaoAulas, hrefProduto, type EfeitoRegra } from './mapa-regras-tipos'

/**
 * "POR QUE este aluno vê / não vê esta aula?" — cadeia de camadas e a vencedora.
 * Reaproveita o MESMO código do aluno: acessoAoProduto (acesso), estadoDoConteudo (visibilidade por segmento),
 * regrasSegmentoDoAluno + liberacaoAulasDoAluno (disponibilidade/cronograma/exceção, que por dentro usa decidirAulaComExcecao)
 * e momentoLiberacao (datas). Nada aqui altera o que o aluno vê; é só leitura.
 */

type Svc = ReturnType<typeof createAdminClient>
const dBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

export interface CamadaExplicada {
  chave: 'produto' | 'visibilidade' | 'liberacao'
  titulo: string
  efeito: EfeitoRegra
  rotulo: string
  /** Frases (cada passo da cadeia dentro da camada). */
  passos: string[]
  origem: { rotulo: string; href: string | null } | null
  vencedora: boolean
}
export interface ExplicacaoAulaAluno {
  alvoId: string
  titulo: string
  tipo: 'modulo' | 'aula'
  disciplina: string
  liberada: boolean
  estado: EfeitoRegra
  resumo: string
  camadas: CamadaExplicada[]
}
export interface ExplicacaoAluno {
  aluno: { id: string; nome: string; email: string }
  produto: { id: string; nome: string }
  verTudo: boolean
  acesso: { tem: boolean; expiraEm: string | null; fatos: Array<{ rotulo: string; ok: boolean | null; detalhe: string }> }
  itens: ExplicacaoAulaAluno[]
}

const chunk80 = <T,>(a: T[]): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += 80) o.push(a.slice(i, i + 80)); return o }

async function carregarEstrutura(svc: Svc, tenantId: string, produtoId: string) {
  const [modulos, itens] = await Promise.all([
    fetchAll<Mod & { titulo: string; ordem: number }>(() => svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem, disponibilidade').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }) as any).catch(() => [] as any[]),
    fetchAll<Item>(() => svc.from('simulado_produto_modulo_itens').select('id, modulo_id, ref_id, tipo_ref, disponibilidade').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).eq('situacao', 'ativo').order('id', { ascending: true }) as any).catch(() => [] as any[]),
  ])
  return { modulos, itens }
}

/** Alvos (módulos e aulas) do produto cujo título casa com o termo — para escolher no painel. */
export async function buscarAlvosProduto(tenantId: string, produtoId: string, termo: string): Promise<Array<{ id: string; titulo: string; tipo: 'modulo' | 'aula'; disciplina: string }>> {
  const svc = createAdminClient()
  const { modulos } = await carregarEstrutura(svc, tenantId, produtoId)
  const porId = new Map(modulos.map((m) => [m.id, m]))
  const raiz = (m: Mod & { titulo: string }) => { let c = m; let g = 0; while (c.pai_id && porId.has(c.pai_id) && g++ < 50) c = porId.get(c.pai_id)! as any; return c }
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const t = norm(termo.trim())
  return modulos
    .filter((m) => !t || norm(m.titulo).includes(t) || norm(raiz(m).titulo).includes(t))
    .slice(0, 40)
    .map((m) => ({ id: m.id, titulo: m.titulo, tipo: (!m.pai_id || !porId.has(m.pai_id) ? 'modulo' : 'aula') as 'modulo' | 'aula', disciplina: raiz(m).titulo }))
}

export async function explicarAlunoNoProduto(tenantId: string, estudanteId: string, produtoId: string, alvoIds: string[]): Promise<ExplicacaoAluno | null> {
  const svc = createAdminClient()
  const agora = new Date()
  const agoraIso = agora.toISOString()
  const [{ data: est }, { data: prodRow }] = await Promise.all([
    svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', tenantId).eq('id', estudanteId).maybeSingle(),
    svc.from('simulado_produtos').select('id, nome, ativo, acesso_bloqueado, acesso_gratuito').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
      .then((r: any) => (r.error ? svc.from('simulado_produtos').select('id, nome, ativo').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle() : r)),
  ])
  const aluno = est as any, prod = prodRow as any
  if (!aluno || !prod) return null

  const ctx = new ContextoAluno(svc, tenantId, estudanteId)
  const { modulos, itens } = await carregarEstrutura(svc, tenantId, produtoId)
  const porId = new Map(modulos.map((m) => [m.id, m]))

  // ── A) acesso ao produto: verdade = acessoAoProduto (o mesmo do aluno); fatos = por que ──────────
  const [real, regrasProd, grupoVinc, assin] = await Promise.all([
    acessoAoProduto(svc, tenantId, estudanteId, produtoId).catch(() => null),
    regrasDoProduto(svc, tenantId, produtoId),
    svc.from('simulado_produto_itens').select('item_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').eq('ativo', true).limit(500),
    svc.from('simulado_assinaturas').select('expira_em').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('produto_id', produtoId).eq('status', 'ativo').limit(1).maybeSingle(),
  ])
  const regrasAcesso = regrasProd.filter((r) => r.alvo_tipo === 'produto')
  const segIdsAcesso = regrasAcesso.map((r) => r.segmento_id)
  const noSegAcesso = await avaliarSegmentos(ctx, segIdsAcesso).catch(() => new Map<string, boolean>())
  const efSegAcesso = efeitoDeAcesso(regrasAcesso, noSegAcesso)
  const gids = ((grupoVinc.data ?? []) as any[]).map((r) => r.item_id as string)
  const membros = await ctx.grupos().catch(() => new Map<string, { expira_em: string | null }>())
  const gruposDele = gids.filter((g) => { const m = membros.get(g) as any; return m && (!m.expira_em || m.expira_em > agoraIso) })
  const gruposVencidos = gids.filter((g) => { const m = membros.get(g) as any; return m && m.expira_em && m.expira_em <= agoraIso })
  const nomeGrupos = new Map<string, string>()
  for (const c of chunk80([...gruposDele, ...gruposVencidos])) { const { data } = await svc.from('simulado_grupos').select('id, nome').eq('tenant_id', tenantId).in('id', c); for (const g of (data ?? []) as any[]) nomeGrupos.set(g.id, g.nome) }
  const segNomes = new Map<string, string>()
  const todosSegIds = new Set<string>(segIdsAcesso)
  const fatos: ExplicacaoAluno['acesso']['fatos'] = []
  if (prod.acesso_bloqueado) fatos.push({ rotulo: 'Produto em atualização', ok: false, detalhe: 'Bloqueia TODOS os alunos até voltar a Publicado.' })
  if (prod.ativo === false) fatos.push({ rotulo: 'Produto em rascunho', ok: false, detalhe: 'Fora do ar: não abre para ninguém.' })
  if (efSegAcesso === 'bloquear') fatos.push({ rotulo: 'Segmento de acesso: BLOQUEAR', ok: false, detalhe: 'Bloquear por segmento vence tudo (assinatura, grupo, gratuito).' })
  fatos.push({ rotulo: 'Assinatura ativa', ok: !!assin.data, detalhe: assin.data ? `Ativa${(assin.data as any).expira_em ? ` até ${dBr((assin.data as any).expira_em.slice(0, 10))}` : ' sem prazo'}.` : 'Sem assinatura ativa neste produto.' })
  fatos.push({ rotulo: 'Grupo de acesso vinculado', ok: gruposDele.length > 0, detalhe: gruposDele.length ? `Membro vigente de: ${gruposDele.map((g) => nomeGrupos.get(g) ?? g.slice(0, 8)).join(', ')}.` : gruposVencidos.length ? `Participação VENCIDA em: ${gruposVencidos.map((g) => nomeGrupos.get(g) ?? g.slice(0, 8)).join(', ')}.` : gids.length ? `O produto tem ${gids.length} grupo(s) vinculado(s) e o aluno não é membro de nenhum.` : 'O produto não tem grupo vinculado.' })
  if (prod.acesso_gratuito) fatos.push({ rotulo: 'Liberado para todos os alunos', ok: true, detalhe: 'Todo aluno da plataforma acessa sem prazo.' })
  if (efSegAcesso === 'liberar') fatos.push({ rotulo: 'Segmento de acesso: LIBERAR', ok: true, detalhe: 'O aluno está num segmento que concede acesso sem prazo.' })
  const tem = !!real && !prod.acesso_bloqueado && prod.ativo !== false
  const acesso = { tem, expiraEm: real?.expira_em ?? null, fatos }

  // ── B) visibilidade por segmento (por alvo) ───────────────────────────────────────────────────
  const regrasConteudo = regrasProd.filter((r) => r.alvo_tipo !== 'produto' && r.alvo_id)
  const noSegConteudo = await avaliarSegmentos(ctx, regrasConteudo.map((r) => r.segmento_id)).catch(() => new Map<string, boolean>())
  regrasConteudo.forEach((r) => todosSegIds.add(r.segmento_id))
  const regrasPorAlvo = new Map<string, typeof regrasConteudo>()
  for (const r of regrasConteudo) { const l = regrasPorAlvo.get(r.alvo_id!) ?? []; l.push(r); regrasPorAlvo.set(r.alvo_id!, l) }

  // ── C) liberação: o MESMO caminho do currículo do aluno ───────────────────────────────────────
  const porSegBase = await regrasSegmentoDoAluno(svc, tenantId, estudanteId, produtoId, ctx).catch(() => null)
  const libAulas = await liberacaoAulasDoAluno(svc, tenantId, estudanteId, produtoId, { porSeg: porSegBase, modulos, itens, ctxAluno: ctx }).catch(() => null)
  const porSeg = libAulas && porSegBase ? { ...porSegBase, disp: libAulas.disp } : libAulas ? { capa: () => null, disp: libAulas.disp } : porSegBase
  const matricula = await matriculaNoProduto(svc, tenantId, estudanteId, produtoId).catch(() => null)
  const { verTudo, detalhe } = await detalheCronogramaDoAluno(svc, tenantId, estudanteId, produtoId, { modulos, itens, porSeg: porSegBase, ctxAluno: ctx })
  // regra de segmento (disponibilidade) que casou — para nomear a origem
  const dispSegRows = await fetchAll<any>(() => svc.from('simulado_produto_disponibilidade_seg').select('id, segmento_id, alvo_id, prioridade, criado_em').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('id', { ascending: true }) as any).catch(() => [] as any[])
  const noSegDisp = await avaliarSegmentos(ctx, dispSegRows.map((r) => r.segmento_id)).catch(() => new Map<string, boolean>())
  dispSegRows.forEach((r) => todosSegIds.add(r.segmento_id))
  for (const c of chunk80([...todosSegIds])) { const { data } = await svc.from('simulado_segmentos').select('id, nome').eq('tenant_id', tenantId).in('id', c); for (const s of (data ?? []) as any[]) segNomes.set(s.id, s.nome) }
  const nomeSeg = (id: string) => segNomes.get(id) ?? '(segmento)'
  const segDispDe = (alvoId: string) => dispSegRows.filter((r) => r.alvo_id === alvoId && noSegDisp.get(r.segmento_id)).sort((a, b) => a.prioridade - b.prioridade || (a.criado_em < b.criado_em ? -1 : 1))[0] ?? null

  const momentoDe = (id: string): Date | null => {
    const m = porId.get(id); if (!m) return null
    const disp = porSeg ? porSeg.disp(id, m.disponibilidade) : m.disponibilidade
    return momentoLiberacao(normDisp(disp), matricula)
  }
  const ancestrais = (id: string): string[] => { const o: string[] = []; let cur = porId.get(id)?.pai_id ?? null; let g = 0; while (cur && g++ < 50) { o.push(cur); cur = porId.get(cur)?.pai_id ?? null } return o }
  const raizDe = (id: string): string => { const a = ancestrais(id); return porId.get(a[a.length - 1] ?? id)?.titulo ?? '' }

  const out: ExplicacaoAulaAluno[] = []
  for (const alvoId of alvoIds.slice(0, 20)) {
    const m = porId.get(alvoId); if (!m) continue
    const tipo: 'modulo' | 'aula' = !m.pai_id || !porId.has(m.pai_id) ? 'modulo' : 'aula'
    const cadeia = [alvoId, ...ancestrais(alvoId)]

    // camada 1 — produto
    const bloqProd = !tem
    const camProduto: CamadaExplicada = {
      chave: 'produto', titulo: 'Acesso ao produto', efeito: bloqProd ? 'bloqueado' : 'liberado', rotulo: bloqProd ? 'Sem acesso' : 'Com acesso', vencedora: false,
      passos: fatos.map((f) => `${f.ok === false ? 'Não' : f.ok ? 'Sim' : '·'} — ${f.rotulo}: ${f.detalhe}`).concat(real ? [`Resultado do motor: acesso ${real.expira_em ? `até ${dBr(real.expira_em.slice(0, 10))}` : 'sem prazo'}.`] : ['Resultado do motor: o aluno NÃO tem acesso ao produto.']),
      origem: { rotulo: 'Grupos de acesso do produto', href: hrefProduto(produtoId, 'grupos') },
    }

    // camada 2 — visibilidade (pior da cadeia)
    let pior: 'visivel' | 'cadeado' | 'oculto' = 'visivel'
    const passosVis: string[] = []
    for (const id of cadeia) {
      const rs = regrasPorAlvo.get(id) ?? []
      if (!rs.length) continue
      const est = estadoDoConteudo(rs, noSegConteudo)
      const quem = id === alvoId ? (tipo === 'modulo' ? 'o módulo' : 'a aula') : `o módulo "${porId.get(id)?.titulo}"`
      const mostrar = rs.filter((r) => r.efeito === 'mostrar')
      passosVis.push(est === 'visivel'
        ? `Regra em ${quem}: o aluno passa (${rs.map((r) => `${r.efeito === 'mostrar' ? 'mostrar somente para' : 'ocultar para'} ${nomeSeg(r.segmento_id)}${noSegConteudo.get(r.segmento_id) ? ' [casa]' : ' [não casa]'}`).join('; ')}).`
        : `Regra em ${quem} barra o aluno: ${mostrar.length && !mostrar.some((r) => noSegConteudo.get(r.segmento_id)) ? `visível somente para ${mostrar.map((r) => nomeSeg(r.segmento_id)).join(', ')} e ele não está` : `ele está num segmento "ocultar para"`} → ${est === 'oculto' ? 'some' : 'aparece com cadeado'}.`)
      if (est === 'oculto' || (est === 'cadeado' && pior === 'visivel')) pior = est
    }
    const camVis: CamadaExplicada = {
      chave: 'visibilidade', titulo: 'Visibilidade por segmento', efeito: pior === 'visivel' ? 'liberado' : pior, rotulo: pior === 'visivel' ? (passosVis.length ? 'Passa' : 'Sem regra') : pior === 'oculto' ? 'Oculto' : 'Cadeado',
      passos: passosVis.length ? passosVis : ['Nenhuma regra de visibilidade neste módulo/aula nem nos módulos acima.'], vencedora: false,
      origem: { rotulo: 'Aba Visibilidade do produto', href: hrefProduto(produtoId, 'visibilidade') },
    }

    // camada 3 — liberação (exceção > cronograma > regra de segmento > base; herda o módulo)
    const base = m.disponibilidade
    const det = detalhe(alvoId, base)
    const passosLib: string[] = []
    let origemLib: CamadaExplicada['origem'] = { rotulo: 'Disponibilidade do módulo/aula', href: hrefProduto(produtoId, 'conteudos') }
    const segRow = segDispDe(alvoId)
    if (verTudo) passosLib.push('Aluno é testador global / impersonation: o motor de cronograma abre tudo para ele.')
    if (det.excecao) { passosLib.push(`Exceção manual vigente: ${det.excecao.acao === 'liberar' ? 'LIBERA' : 'BLOQUEIA'}${det.excecao.motivo ? ` — ${det.excecao.motivo}` : ''}. Vence cronograma, planilha, plano e disponibilidade.`); origemLib = { rotulo: 'Exceções da Liberação de aulas', href: hrefLiberacaoAulas(produtoId, 'excecoes') } }
    if (det.governada) {
      passosLib.push(`Regra de cronograma vale (${det.regraOrigem === 'segmento' ? 'regra de segmento' : det.regraOrigem === 'ancestral' ? 'herdada de um módulo acima' : 'disponibilidade do módulo/aula'}); parâmetros: sem plano = ${det.params?.sem_plano}, com plano = ${det.params?.com_plano}, antecedência ${det.params?.dias_antes}d.`)
      if (det.semLinha) passosLib.push('A aula não tem linha na planilha: o motor deixa aberta.')
      else {
        passosLib.push(`Data-base: ${det.dataBase ? dBr(det.dataBase) : '—'} (${det.trilha ? `cronograma de referência "${det.trilha}"` : 'planilha'}).`)
        passosLib.push(det.plano.tem ? (det.plano.noPlano ? `Plano fixado: a aula está no plano${det.plano.dataMeta ? ` (meta em ${dBr(det.plano.dataMeta)})` : ''}${det.plano.concluida ? ' e a meta foi CONCLUÍDA' : ''}.` : 'Plano fixado, mas a aula não está nele (vale a planilha).') : 'Aluno sem cronograma fixado (vale "sem plano").')
        if (det.decisao) passosLib.push(`Decisão do motor: ${det.decisao.liberada ? 'LIBERADA' : 'BLOQUEADA'} (${det.decisao.motivo})${det.decisao.liberaEm ? ` — libera em ${dBr(det.decisao.liberaEm)}` : ''}${det.rotulo ? ` · "${det.rotulo}"` : ''}.`)
      }
      if (!det.excecao) origemLib = { rotulo: 'Liberação de aulas', href: hrefLiberacaoAulas(produtoId) }
    } else if (!det.excecao) {
      if (det.dataPlanilha) passosLib.push(`Há data na planilha (${dBr(det.dataPlanilha)}), mas nenhuma regra de cronograma governa esta aula: a data NÃO tem efeito.`)
      if (segRow) { passosLib.push(`Regra de segmento "${nomeSeg(segRow.segmento_id)}" (prioridade ${segRow.prioridade}) substitui a disponibilidade base.`); origemLib = { rotulo: 'Regra de segmento (aba Conteúdos)', href: hrefProduto(produtoId, 'conteudos') } }
      else passosLib.push('Sem regra de segmento: vale a disponibilidade base do módulo/aula.')
    }
    // data efetiva final (a mesma conta do currículo: o mais tardio entre o alvo e os módulos acima)
    let lib: Date | null = momentoDe(alvoId)
    for (const a of cadeia.slice(1)) { const x = momentoDe(a); if (x && (!lib || x > lib)) lib = x }
    const noPrazo = !lib || +lib <= +agora
    const motivoBloq = !noPrazo ? (ehSentinelaMeta(lib) ? 'Aguarda concluir a meta no cronograma do aluno.' : ehSentinelaBloqueio(lib) ? 'Bloqueado pelo administrador (exceção).' : `Libera em ${dBr(lib!.toISOString().slice(0, 10))}.`) : null
    if (cadeia.length > 1) { const herd = cadeia.slice(1).map(momentoDe).filter(Boolean) as Date[]; if (herd.length) passosLib.push(`Módulos acima: a liberação mais tardia entre eles é ${dBr(herd.sort((a, b) => +b - +a)[0].toISOString().slice(0, 10))} (a aula nunca libera antes do módulo).`) }
    passosLib.push(noPrazo ? 'Resultado do motor: dentro do prazo (liberada).' : `Resultado do motor: ${motivoBloq}`)
    const efLib: EfeitoRegra = noPrazo ? 'liberado' : lib && ehSentinelaBloqueio(lib) ? 'bloqueado' : 'cadeado'
    const camLib: CamadaExplicada = { chave: 'liberacao', titulo: 'Liberação (data / cronograma / exceção)', efeito: efLib, rotulo: noPrazo ? 'No prazo' : motivoBloq ?? 'Aguardando', passos: passosLib, origem: origemLib, vencedora: false }

    // vencedora: a 1ª camada que barra; se nenhuma barra, a liberação com regra explícita (senão o acesso)
    const camadas = [camProduto, camVis, camLib]
    const barra = camadas.find((c) => c.efeito !== 'liberado')
    const explicita = !!det.excecao || det.governada || !!segRow
    const venc = barra ?? (explicita ? camLib : camProduto)
    venc.vencedora = true
    const estado: EfeitoRegra = barra ? barra.efeito : 'liberado'
    const liberada = !barra
    out.push({
      alvoId, titulo: m.titulo, tipo, disciplina: raizDe(alvoId), liberada, estado, camadas,
      resumo: liberada ? `Liberada para o aluno. Camada decisiva: ${venc.titulo}${venc.chave === 'liberacao' && explicita ? ` — ${det.excecao ? 'exceção manual' : det.governada ? 'regra de cronograma' : 'regra de segmento'}` : ''}.`
        : `${estado === 'oculto' ? 'Oculta' : 'Bloqueada'} para o aluno pela camada "${venc.titulo}": ${venc.chave === 'liberacao' ? motivoBloq : venc.passos.find((p) => /barra|Não|NÃO|bloque|rascunho|atualização/i.test(p)) ?? venc.rotulo}`,
    })
  }
  return { aluno: { id: aluno.id, nome: aluno.nome ?? '(sem nome)', email: aluno.email ?? '' }, produto: { id: prod.id, nome: prod.nome }, verTudo, acesso, itens: out }
}

/**
 * Núcleo por aluno para `explicarLiberacaoAluno` (painel Liberação de aulas > Alunos): quais aulas têm regra de cronograma,
 * parâmetros efetivos e o plano fixado — tudo vindo do mesmo caminho do motor.
 */
export async function nucleoDoAluno(tenantId: string, estudanteId: string, produtoId: string): Promise<NucleoAluno> {
  const svc = createAdminClient()
  const ctx = new ContextoAluno(svc, tenantId, estudanteId)
  const { modulos, itens } = await carregarEstrutura(svc, tenantId, produtoId)
  const porSeg = await regrasSegmentoDoAluno(svc, tenantId, estudanteId, produtoId, ctx).catch(() => null)
  const { detalhe } = await detalheCronogramaDoAluno(svc, tenantId, estudanteId, produtoId, { modulos, itens, porSeg, ctxAluno: ctx })
  const baseDe = new Map(modulos.map((m) => [m.id, m.disponibilidade]))
  const memo = new Map<string, ReturnType<typeof detalhe>>()
  const d = (id: string) => { let x = memo.get(id); if (!x) { x = detalhe(id, baseDe.get(id)); memo.set(id, x) } return x }
  return { paramsDe: (id) => d(id).params ?? PARAMS_PADRAO, governada: (id) => d(id).governada, plano: (id) => d(id).plano }
}

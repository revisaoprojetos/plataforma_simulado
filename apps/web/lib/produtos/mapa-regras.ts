import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { hojeBrtISO } from '@/lib/brt'
import { gruposDoProduto } from '@/lib/produtos/estudio'
import { grupoUnicoDaRegra } from '@/lib/segmentos/grupo-unico'
import { normalizarRegra } from '@/lib/segmentos/tipos'
import { liberaEmTrilha } from './liberacao-trilhas-calc'
import { ehDispCronograma, regraCronogramaGovernante } from './liberacao-aulas-decisao'
import {
  CAMADAS_INFO, hrefLiberacaoAulas, hrefProduto,
  type AlertaRegra, type CamadaRegra, type CelulaMatriz, type DadosMatriz, type EfeitoRegra, type FiltroMapa, type FiltroMatriz, type NoArvore, type ResumoModulo, type KpisMapa, type LinhaMatriz, type LinhaRegra,
  type MapaRegras, type PublicoCol,
} from './mapa-regras-tipos'

/**
 * READ-MODEL do "Mapa de regras" do Produto (Extensivo). Agrega, num só lugar, as camadas que decidem o que cada público vê:
 *   A acesso ao produto · B regra de venda · C visibilidade por segmento · D disponibilidade (base e por segmento)
 *   E cronograma de referência/planilha/exceções · F ACL de documentos (não entra: é por pasta/documento, outra tela)
 *   G plano do aluno (com_plano da cfg — vale por aluno, aparece no painel "por que este aluno") · H validade por membro (alertas).
 * SÓ LÊ. Filtro/ordenação/paginação no servidor sobre um instantâneo cacheado 20 s por produto. Tolerante a tabelas ausentes.
 * As decisões POR ALUNO usam o núcleo do motor (liberacao-aulas-decisao.ts) em explicar-aluno.ts; aqui é a visão por PÚBLICO.
 */

type Svc = ReturnType<typeof createAdminClient>
const semTabela = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204' || /schema cache|does not exist/i.test(String(e.message ?? '')))
const dBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')

interface Mod { id: string; pai_id: string | null; titulo: string; ordem: number; disponibilidade: any }
interface VisRow { id: string; segmento_id: string; alvo_tipo: string; alvo_id: string | null; efeito: string; sem_acesso: string }
interface DispSeg { id: string; segmento_id: string; alvo_tipo: string; alvo_id: string; disponibilidade: any; prioridade: number; criado_em: string }
interface Exc { id: string; alvo_tipo: string; alvo_id: string; estudante_id: string | null; grupo_id: string | null; acao: string; motivo: string | null; expira_em: string | null; criado_em: string }
interface Trilha { id: string; nome: string; offset_dias: number; segmento_ids: string[]; ordem: number }

/** Instantâneo completo (JSON-serializável → cacheável). */
interface Snapshot {
  produto: MapaRegras['produto']
  publicos: PublicoCol[]
  linhas: LinhaRegra[]
  matriz: LinhaMatriz[]
  alertas: AlertaRegra[]
  regrasAtivas: number
  tabelasAusentes: string[]
  geradoEm: string
}

const ordemEfeito = (e: EfeitoRegra) => ({ bloqueado: 0, oculto: 1, cadeado: 2, liberado: 3 }[e])

/** Disponibilidade → efeito/rotulo (sem cronograma; esse é resolvido à parte). */
function efeitoDeDisp(d: any, hoje: string): { efeito: EfeitoRegra; rotulo: string; quando: string | null; texto: string } {
  const t = d?.tipo
  const antes = d?.antes === 'oculto' ? 'oculto' : 'cadeado'
  if (t === 'data' && d.data) {
    const dia = String(d.data).slice(0, 10)
    return dia > hoje ? { efeito: antes, rotulo: dBr(dia), quando: dia, texto: `libera em ${dBr(dia)}` } : { efeito: 'liberado', rotulo: dBr(dia), quando: dia, texto: `liberada desde ${dBr(dia)}` }
  }
  if (t === 'intervalo') return { efeito: 'liberado', rotulo: `+${Number(d.dias) || 0}d`, quando: null, texto: `${Number(d.dias) || 0} dia(s) após a matrícula` }
  if (t === 'data_e_intervalo') return { efeito: 'liberado', rotulo: `${dBr(String(d.data ?? '').slice(0, 10))} / +${Number(d.dias) || 0}d`, quando: null, texto: 'a data OU o intervalo após a matrícula, o que for mais tarde' }
  if (t === 'dia_semana_e_intervalo') return { efeito: 'liberado', rotulo: `+${Number(d.dias) || 0}d (dia fixo)`, quando: null, texto: 'intervalo após a matrícula, no próximo dia da semana definido' }
  return { efeito: 'liberado', rotulo: 'Na matrícula', quando: null, texto: 'liberada na matrícula' }
}

async function nomesPorId(svc: Svc, tabela: string, tenantId: string, ids: string[], col = 'nome'): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  const u = [...new Set(ids.filter(Boolean))]
  if (!u.length) return m
  const rows = await fetchAllByIn<any>(u, (c) => svc.from(tabela).select(`id, ${col}`).eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }) as any).catch(() => [] as any[])
  for (const r of rows) m.set(r.id, r[col] ?? '(sem nome)')
  return m
}

async function montarSnapshot(tenantId: string, produtoId: string): Promise<Snapshot | null> {
  const svc = createAdminClient()
  const hoje = hojeBrtISO()
  const agora = new Date().toISOString()
  const ausentes: string[] = []

  // ── fontes (em paralelo) ──────────────────────────────────────────────────────────────────────
  const prodP = (async () => {
    let r: any = await svc.from('simulado_produtos').select('id, nome, ativo, acesso_bloqueado, acesso_gratuito').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
    if (r.error) r = await svc.from('simulado_produtos').select('id, nome, ativo').eq('tenant_id', tenantId).eq('id', produtoId).maybeSingle()
    return r.data as any
  })()
  const [prod, mods, itens, visR, dispR, tr, cfgR, planR, excR, vendaR, grupos, segTodosR] = await Promise.all([
    prodP,
    fetchAll<Mod>(() => svc.from('simulado_produto_modulos').select('id, pai_id, titulo, ordem, disponibilidade').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).order('ordem', { ascending: true }).order('id', { ascending: true }) as any).catch(() => [] as Mod[]),
    fetchAll<any>(() => svc.from('simulado_produto_modulo_itens').select('id, modulo_id, ref_id, tipo_ref, titulo, disponibilidade').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).eq('situacao', 'ativo').order('id', { ascending: true }) as any).catch(() => [] as any[]),
    svc.from('simulado_produto_visibilidade').select('id, segmento_id, alvo_tipo, alvo_id, efeito, sem_acesso').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(5000),
    svc.from('simulado_produto_disponibilidade_seg').select('id, segmento_id, alvo_tipo, alvo_id, disponibilidade, prioridade, criado_em').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(5000),
    svc.from('simulado_liberacao_trilhas').select('id, nome, offset_dias, segmento_ids, ordem').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).order('ordem', { ascending: true }).limit(200),
    svc.from('simulado_produto_liberacao_cfg').select('ativo, sem_plano, com_plano, dias_antes').eq('tenant_id', tenantId).eq('produto_id', produtoId).maybeSingle(),
    svc.from('simulado_produto_liberacao_aulas').select('id, aula_id, data_liberacao, titulo').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).not('aula_id', 'is', null).limit(5000),
    svc.from('simulado_liberacao_excecoes').select('id, alvo_tipo, alvo_id, estudante_id, grupo_id, acao, motivo, expira_em, criado_em').eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('ativo', true).limit(5000),
    svc.from('simulado_liberacao_regra_produtos').select('regra_id').eq('tenant_id', tenantId).eq('produto_id', produtoId).limit(500),
    gruposDoProduto(tenantId, produtoId).catch(() => [] as { id: string; nome: string; membros: number | null }[]),
    svc.from('simulado_segmentos').select('id, nome, regra').eq('tenant_id', tenantId).eq('deletado', false).limit(1000),
  ])
  if (!prod) return null
  const vis: VisRow[] = visR.error ? (semTabela(visR.error) && ausentes.push('simulado_produto_visibilidade'), []) : (visR.data ?? [])
  const dispSeg: DispSeg[] = dispR.error ? (semTabela(dispR.error) && ausentes.push('simulado_produto_disponibilidade_seg'), []) : (dispR.data ?? [])
  const trilhas: Trilha[] = tr.error ? (semTabela(tr.error) && ausentes.push('simulado_liberacao_trilhas'), []) : ((tr.data ?? []) as any[]).map((t) => ({ id: t.id, nome: t.nome, offset_dias: Number(t.offset_dias) || 0, segmento_ids: t.segmento_ids ?? [], ordem: t.ordem ?? 0 }))
  const cfg = cfgR.error ? null : (cfgR.data as any)
  if (planR.error && semTabela(planR.error)) ausentes.push('simulado_produto_liberacao_aulas')
  const planilhaRows = (planR.error ? [] : (planR.data ?? [])) as Array<{ id: string; aula_id: string; data_liberacao: string; titulo: string }>
  const excs: Exc[] = excR.error ? (semTabela(excR.error) && ausentes.push('simulado_liberacao_excecoes'), []) : (excR.data ?? [])
  const regraIdsVenda = (vendaR.error ? [] : (vendaR.data ?? []) as any[]).map((r) => r.regra_id as string)

  const produto: MapaRegras['produto'] = {
    id: prod.id, nome: prod.nome, ativo: prod.ativo !== false, acessoBloqueado: !!prod.acesso_bloqueado, acessoGratuito: !!prod.acesso_gratuito,
    gateCronograma: !!cfg?.ativo, regrasVendaFlag: process.env.NEXT_PUBLIC_LIBERACAO_REGRAS_ATIVO === 'true' || process.env.NEXT_PUBLIC_LIBERACAO_REGRAS_ATIVO === '1',
  }

  // trilha_aulas (datas por aula/trilha)
  const linhaParaAula = new Map(planilhaRows.map((r) => [r.id, r.aula_id]))
  const trilhaAulas = trilhas.length
    ? await fetchAllByIn<any>(trilhas.map((t) => t.id), (ids) => svc.from('simulado_liberacao_trilha_aulas').select('trilha_id, liberacao_aula_id, data_cronograma, data_manual').eq('tenant_id', tenantId).in('trilha_id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[])
    : []
  const offsetTrilha = new Map(trilhas.map((t) => [t.id, t.offset_dias]))
  // aulaId -> [{trilhaId, data}]
  const datasTrilha = new Map<string, Array<{ trilhaId: string; data: string }>>()
  for (const r of trilhaAulas) {
    const aula = linhaParaAula.get(r.liberacao_aula_id); if (!aula) continue
    const d = liberaEmTrilha({ data_cronograma: r.data_cronograma, data_manual: r.data_manual, offset_dias: offsetTrilha.get(r.trilha_id) ?? 0 })
    if (!d) continue
    const l = datasTrilha.get(aula) ?? []; l.push({ trilhaId: r.trilha_id, data: d }); datasTrilha.set(aula, l)
  }
  const planilhaPorAula = new Map<string, string>()
  for (const r of planilhaRows) { const ex = planilhaPorAula.get(r.aula_id); if (!ex || r.data_liberacao < ex) planilhaPorAula.set(r.aula_id, r.data_liberacao) }

  // venda
  const regrasVenda = regraIdsVenda.length
    ? await fetchAllByIn<any>(regraIdsVenda, (ids) => svc.from('simulado_liberacao_regras').select('id, nome, status, prioridade').eq('tenant_id', tenantId).in('id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[])
    : []

  // nomes
  const segIds = [...new Set([...vis.map((v) => v.segmento_id), ...dispSeg.map((d) => d.segmento_id), ...trilhas.flatMap((t) => t.segmento_ids)])]
  const excGrupoIds = [...new Set(excs.map((e) => e.grupo_id).filter(Boolean) as string[])]
  const excAlunoIds = [...new Set(excs.map((e) => e.estudante_id).filter(Boolean) as string[])].slice(0, 300)
  const [segNome, grupoNomeExc, alunoNome] = await Promise.all([
    nomesPorId(svc, 'simulado_segmentos', tenantId, segIds),
    nomesPorId(svc, 'simulado_grupos', tenantId, excGrupoIds),
    nomesPorId(svc, 'simulado_estudantes', tenantId, excAlunoIds),
  ])
  const segNomeTodos = new Map<string, string>(segTodosR.error ? [] : ((segTodosR.data ?? []) as any[]).map((x) => [x.id as string, (x.nome as string) ?? '(sem nome)']))
  const nomeSeg = (id: string) => segNome.get(id) ?? segNomeTodos.get(id) ?? '(segmento removido)'
  const nomeGrupo = (id: string) => grupos.find((g) => g.id === id)?.nome ?? grupoNomeExc.get(id) ?? '(grupo)'

  // ── árvore de alvos ───────────────────────────────────────────────────────────────────────────
  const porId = new Map(mods.map((m) => [m.id, m]))
  const raizDe = (m: Mod): Mod => { let cur = m; let g = 0; while (cur.pai_id && porId.has(cur.pai_id) && g++ < 50) cur = porId.get(cur.pai_id)!; return cur }
  const ancestrais = (id: string): string[] => { const o: string[] = []; let cur = porId.get(id)?.pai_id ?? null; let g = 0; while (cur && g++ < 50) { o.push(cur); cur = porId.get(cur)?.pai_id ?? null } return o }
  const raizes = mods.filter((m) => !m.pai_id || !porId.has(m.pai_id))
  const filhos = new Map<string, Mod[]>()
  for (const m of mods) if (m.pai_id && porId.has(m.pai_id)) { const l = filhos.get(m.pai_id) ?? []; l.push(m); filhos.set(m.pai_id, l) }
  const alvosOrdenados: Array<{ m: Mod; tipo: 'modulo' | 'aula'; disciplina: string }> = []
  const visitar = (m: Mod, nivel: number, disc: string) => {
    alvosOrdenados.push({ m, tipo: nivel === 0 ? 'modulo' : 'aula', disciplina: disc })
    for (const f of filhos.get(m.id) ?? []) visitar(f, nivel + 1, disc)
  }
  for (const r of raizes) visitar(r, 0, r.titulo)
  const tipoAlvo = new Map(alvosOrdenados.map((a) => [a.m.id, a.tipo]))
  const tituloAlvo = (id: string | null) => (id ? porId.get(id)?.titulo ?? '(removido)' : produto.nome)
  const discAlvo = (id: string | null) => (id && porId.get(id) ? raizDe(porId.get(id)!).titulo : '')

  // ── índices ───────────────────────────────────────────────────────────────────────────────────
  const visPorAlvo = new Map<string, VisRow[]>()
  for (const v of vis) if (v.alvo_id && v.alvo_tipo !== 'produto') { const l = visPorAlvo.get(v.alvo_id) ?? []; l.push(v); visPorAlvo.set(v.alvo_id, l) }
  const dispPorAlvo = new Map<string, DispSeg[]>()
  for (const d of dispSeg) { const l = dispPorAlvo.get(d.alvo_id) ?? []; l.push(d); dispPorAlvo.set(d.alvo_id, l) }
  const ordemDisp = (a: DispSeg, b: DispSeg) => a.prioridade - b.prioridade || (a.criado_em < b.criado_em ? -1 : 1)
  const excPorAlvo = new Map<string, Exc[]>()
  for (const e of excs) { const l = excPorAlvo.get(e.alvo_id) ?? []; l.push(e); excPorAlvo.set(e.alvo_id, l) }
  const excVigente = (e: Exc) => !e.expira_em || e.expira_em > agora

  // ── públicos (colunas) ────────────────────────────────────────────────────────────────────────
  const peso = new Map<string, number>()
  const somar = (id: string) => peso.set(id, (peso.get(id) ?? 0) + 1)
  vis.forEach((v) => somar(v.segmento_id)); dispSeg.forEach((d) => somar(d.segmento_id)); trilhas.forEach((t) => t.segmento_ids.forEach(somar))
  // Segmentos "de um grupo só" (criados pela aba Regras para dar regra a um GRUPO) valem para a coluna do grupo — não viram coluna própria.
  const segsDoGrupo = new Map<string, string[]>()
  const segDeGrupo = new Set<string>()
  const gruposVinc = new Set(grupos.map((g) => g.id))
  if (!segTodosR.error) for (const s of (segTodosR.data ?? []) as any[]) {
    const gid = grupoUnicoDaRegra(normalizarRegra(s.regra))
    if (gid && gruposVinc.has(gid)) { const l = segsDoGrupo.get(gid) ?? []; l.push(s.id); segsDoGrupo.set(gid, l); segDeGrupo.add(s.id) }
  }
  const publicos: PublicoCol[] = [
    { chave: 'todos', tipo: 'todos', id: null, nome: 'Todos (regra base)' },
    ...grupos.map((g): PublicoCol => ({ chave: `grupo:${g.id}`, tipo: 'grupo', id: g.id, nome: g.nome, membros: g.membros })),
    ...[...peso.entries()].filter(([id]) => !segDeGrupo.has(id)).sort((a, b) => b[1] - a[1]).map(([id]): PublicoCol => ({ chave: `segmento:${id}`, tipo: 'segmento', id, nome: nomeSeg(id), comRegra: true })),
    // Segmentos do tenant ainda SEM regra neste produto: ficam disponíveis para virar coluna (e receber a primeira regra).
    ...[...segNomeTodos.entries()].filter(([id]) => !peso.has(id) && !segDeGrupo.has(id)).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).slice(0, 100)
      .map(([id, nome]): PublicoCol => ({ chave: `segmento:${id}`, tipo: 'segmento', id, nome, comRegra: false })),
  ]
  /** Segmentos que valem para a coluna: o próprio (segmento) ou os "de um grupo só" (grupo). */
  const segsDe = (p: PublicoCol): string[] => (p.tipo === 'segmento' ? [p.id!] : p.tipo === 'grupo' ? segsDoGrupo.get(p.id!) ?? [] : [])

  // ── célula (alvo × público) ───────────────────────────────────────────────────────────────────
  const hrefConteudos = hrefProduto(produtoId, 'conteudos')
  const hrefVis = hrefProduto(produtoId, 'visibilidade')
  const hrefAulas = hrefLiberacaoAulas(produtoId)
  const hrefExc = hrefLiberacaoAulas(produtoId, 'excecoes')

  const melhorDispSeg = (alvoId: string, segIds: string[]): DispSeg | null => {
    const l = (dispPorAlvo.get(alvoId) ?? []).filter((d) => segIds.includes(d.segmento_id)).sort(ordemDisp)
    return l[0] ?? null
  }
  const celula = (alvoId: string, p: PublicoCol): CelulaMatriz => {
    const cadeia = [alvoId, ...ancestrais(alvoId)]
    const segs = segsDe(p)
    // 1) exceção de grupo (bloquear vence liberar; módulo vale p/ dentro)
    let excB: Exc | null = null, excL: Exc | null = null
    if (p.tipo === 'grupo') for (const id of cadeia) for (const e of excPorAlvo.get(id) ?? []) {
      if (e.grupo_id !== p.id || !excVigente(e)) continue
      if (e.acao === 'bloquear') excB = excB ?? e; else excL = excL ?? e
    }
    if (excB) return { efeito: 'bloqueado', rotulo: 'Bloqueado', camada: 'excecao', origem: 'Exceção do grupo', porque: `Exceção bloqueia ${tipoAlvo.get(excB.alvo_id) === 'modulo' ? 'o módulo' : 'a aula'} para o grupo ${p.nome}${excB.motivo ? ` — ${excB.motivo}` : ''}.`, href: hrefExc }
    // 2) visibilidade por segmento (pior caso da cadeia)
    let barra: { efeito: 'oculto' | 'cadeado'; porque: string } | null = null
    for (const id of cadeia) {
      const rs = visPorAlvo.get(id) ?? []
      if (!rs.length) continue
      const mostrar = rs.filter((r) => r.efeito === 'mostrar')
      const barrou: VisRow[] = []
      if (mostrar.length && !(segs.length && mostrar.some((r) => segs.includes(r.segmento_id)))) barrou.push(...mostrar)
      if (segs.length) for (const r of rs) if (r.efeito === 'ocultar' && segs.includes(r.segmento_id)) barrou.push(r)
      if (!barrou.length) continue
      const efeito = barrou.some((r) => r.sem_acesso === 'oculto') ? 'oculto' : 'cadeado'
      const porque = mostrar.length && barrou[0].efeito === 'mostrar'
        ? `Visível somente para o(s) segmento(s): ${mostrar.map((r) => nomeSeg(r.segmento_id)).join(', ')}${segs.length ? '' : ' (depende de o aluno estar neles)'}.`
        : `Oculto para ${p.tipo === 'grupo' ? 'o grupo' : 'o segmento'} ${p.nome}.`
      if (!barra || (efeito === 'oculto' && barra.efeito !== 'oculto')) barra = { efeito, porque }
    }
    if (barra) return { efeito: barra.efeito, rotulo: barra.efeito === 'oculto' ? 'Oculto' : 'Cadeado', camada: 'visibilidade', origem: 'Visibilidade por segmento', porque: barra.porque, href: hrefVis }
    if (excL) return { efeito: 'liberado', rotulo: 'Liberado', camada: 'excecao', origem: 'Exceção do grupo', porque: `Exceção libera para o grupo ${p.nome}${excL.motivo ? ` — ${excL.motivo}` : ''}. Vence cronograma e disponibilidade (não derruba visibilidade).`, href: hrefExc }
    // 3) disponibilidade efetiva (segmento > base) / cronograma
    const baseDe = (id: string) => porId.get(id)?.disponibilidade
    const propria = (id: string, base: unknown): { d: unknown; seg: boolean } => {
      if (segs.length) { const s = melhorDispSeg(id, segs); if (s) return { d: s.disponibilidade, seg: true } }
      return { d: base, seg: false }
    }
    const pr = propria(alvoId, baseDe(alvoId))
    const regraCrono = regraCronogramaGovernante(alvoId, baseDe(alvoId), porId as any, propria)
    if (regraCrono) {
      const origem = pr.seg ? 'Regra de segmento (Cronograma)' : 'Disponibilidade (Cronograma)'
      if (tipoAlvo.get(alvoId) === 'modulo') return { efeito: 'liberado', rotulo: 'Por aula', camada: pr.seg ? 'segmento' : 'cronograma', origem, porque: 'O módulo segue o cronograma: cada aula libera na sua data.', href: hrefAulas }
      const comTrilha = (datasTrilha.get(alvoId) ?? []).filter((x) => segs.some((sg) => trilhas.find((t) => t.id === x.trilhaId)?.segmento_ids.includes(sg)))
      const data = comTrilha.length ? comTrilha.map((x) => x.data).sort()[0] : planilhaPorAula.get(alvoId) ?? null
      const fonte = comTrilha.length ? `cronograma de referência "${trilhas.find((t) => t.id === comTrilha[0].trilhaId)?.nome}"` : 'planilha'
      if (!data) return { efeito: 'liberado', rotulo: 'Sem data', camada: 'cronograma', origem, porque: 'Há regra de cronograma, mas a aula não tem data na planilha: fica aberta.', href: hrefAulas }
      return data > hoje
        ? { efeito: 'cadeado', rotulo: dBr(data), camada: 'cronograma', origem, porque: `Libera em ${dBr(data)} pelo ${fonte}${(regraCrono as any).com_plano && (regraCrono as any).com_plano !== 'concluir_meta' ? '' : ''}. Quem fixou plano pode ter outra data (ver "Por que este aluno").`, href: hrefAulas }
        : { efeito: 'liberado', rotulo: dBr(data), camada: 'cronograma', origem, porque: `Liberada desde ${dBr(data)} pelo ${fonte}.`, href: hrefAulas }
    }
    const e = efeitoDeDisp(pr.d, hoje)
    const explicita = pr.seg || (pr.d && (pr.d as any).tipo && (pr.d as any).tipo !== 'na_matricula')
    if (!explicita) return { efeito: 'liberado', rotulo: 'Aberto', camada: 'base', origem: 'Sem regra', porque: 'Nenhuma regra específica: vale o padrão (liberado na matrícula).', href: hrefConteudos }
    return { efeito: e.efeito, rotulo: e.rotulo, camada: pr.seg ? 'segmento' : 'disponibilidade', origem: pr.seg ? 'Regra de segmento' : 'Disponibilidade do módulo/aula', porque: `${pr.seg ? `Regra ${p.tipo === 'grupo' ? 'do grupo' : 'do segmento'} ${p.nome}: ` : 'Regra base: '}${e.texto}.`, href: hrefConteudos }
  }

  const matriz: LinhaMatriz[] = alvosOrdenados.map(({ m, tipo, disciplina }) => {
    const celulas: Record<string, CelulaMatriz> = {}
    for (const p of publicos) celulas[p.chave] = celula(m.id, p)
    const regras = (visPorAlvo.get(m.id)?.length ?? 0) + (dispPorAlvo.get(m.id)?.length ?? 0) + (excPorAlvo.get(m.id)?.length ?? 0)
      + (m.disponibilidade && (m.disponibilidade as any).tipo && (m.disponibilidade as any).tipo !== 'na_matricula' ? 1 : 0)
    return { alvoId: m.id, alvoTipo: tipo, titulo: m.titulo, disciplina, regras, paiId: m.pai_id && porId.has(m.pai_id) ? m.pai_id : null, raizId: raizDe(m).id, nivel: tipo === 'modulo' ? 0 : ancestrais(m.id).length, celulas }
  })

  // ── lista de regras ───────────────────────────────────────────────────────────────────────────
  const linhas: LinhaRegra[] = []
  const add = (l: Omit<LinhaRegra, 'disciplina'> & { disciplina?: string }) => linhas.push({ disciplina: l.disciplina ?? discAlvo(l.alvoId), ...l })
  // A) acesso
  for (const g of grupos) add({ id: `ac-g-${g.id}`, alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'acesso', origem: { tabela: 'simulado_produto_itens', id: g.id, rotulo: 'Grupo de acesso vinculado', href: hrefProduto(produtoId, 'grupos') }, efeito: 'liberado', quandoRotulo: 'enquanto o membro estiver vigente', quando: null, quem: { tipo: 'grupo', id: g.id, nome: g.nome }, prioridade: null, validade: null, descricao: `Membros do grupo ${g.nome}${g.membros != null ? ` (${g.membros})` : ''} entram no produto.` })
  if (produto.acessoGratuito) add({ id: 'ac-gratis', alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'acesso', origem: { tabela: 'simulado_produtos', id: produtoId, rotulo: 'Liberado para todos os alunos', href: hrefProduto(produtoId, 'grupos') }, efeito: 'liberado', quandoRotulo: 'sempre, sem prazo', quando: null, quem: { tipo: 'todos', id: null, nome: 'Todos os alunos' }, prioridade: null, validade: null, descricao: 'Todo aluno da plataforma acessa o produto sem prazo.' })
  for (const v of vis.filter((x) => x.alvo_tipo === 'produto')) add({ id: `ac-s-${v.id}`, alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'acesso', origem: { tabela: 'simulado_produto_visibilidade', id: v.id, rotulo: 'Segmento de acesso', href: hrefVis }, efeito: v.efeito === 'bloquear' ? 'bloqueado' : 'liberado', quandoRotulo: 'sempre', quando: null, quem: { tipo: 'segmento', id: v.segmento_id, nome: nomeSeg(v.segmento_id) }, prioridade: null, validade: null, descricao: v.efeito === 'bloquear' ? 'Bloquear vence tudo: nem assinatura nem grupo dão acesso.' : 'Concede acesso sem prazo a quem está no segmento.' })
  // B) venda
  for (const r of regrasVenda) add({ id: `vd-${r.id}`, alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'venda', origem: { tabela: 'simulado_liberacao_regras', id: r.id, rotulo: `Regra de venda: ${r.nome}`, href: '/admin/liberacao' }, efeito: r.status === 'active' && produto.regrasVendaFlag ? 'liberado' : 'bloqueado', quandoRotulo: r.status === 'active' ? (produto.regrasVendaFlag ? 'na compra aprovada' : 'flag desligada') : r.status === 'paused' ? 'pausada' : 'cancelada', quando: null, quem: { tipo: 'compradores', id: null, nome: 'Compradores (webhook)' }, prioridade: Number(r.prioridade) || null, validade: null, descricao: 'Concede o produto quando o pedido casa os filtros da regra.' })
  // C) visibilidade
  for (const v of vis.filter((x) => x.alvo_tipo !== 'produto' && x.alvo_id)) add({ id: `vi-${v.id}`, alvoTipo: v.alvo_tipo === 'modulo' ? 'modulo' : 'aula', alvoId: v.alvo_id, alvoTitulo: tituloAlvo(v.alvo_id), camada: 'visibilidade', origem: { tabela: 'simulado_produto_visibilidade', id: v.id, rotulo: 'Visibilidade por segmento', href: hrefVis }, efeito: v.efeito === 'ocultar' || v.efeito === 'mostrar' ? (v.sem_acesso === 'oculto' ? 'oculto' : 'cadeado') : 'liberado', quandoRotulo: v.efeito === 'mostrar' ? 'somente para o segmento' : 'oculto para o segmento', quando: null, quem: { tipo: 'segmento', id: v.segmento_id, nome: nomeSeg(v.segmento_id) }, prioridade: null, validade: null, descricao: v.efeito === 'mostrar' ? 'Só quem está no segmento vê; os demais ficam sem acesso.' : 'Quem está no segmento perde o acesso.' })
  // D) disponibilidade por segmento + base
  for (const d of dispSeg) {
    const cr = ehDispCronograma(d.disponibilidade)
    const e = efeitoDeDisp(d.disponibilidade, hoje)
    add({ id: `ds-${d.id}`, alvoTipo: d.alvo_tipo === 'modulo' ? 'modulo' : 'aula', alvoId: d.alvo_id, alvoTitulo: tituloAlvo(d.alvo_id), camada: cr ? 'cronograma' : 'segmento', origem: { tabela: 'simulado_produto_disponibilidade_seg', id: d.id, rotulo: cr ? 'Regra de segmento (Cronograma)' : 'Regra de segmento', href: hrefConteudos }, efeito: cr ? 'liberado' : e.efeito, quandoRotulo: cr ? 'conforme o cronograma' : e.rotulo, quando: cr ? null : e.quando, quem: { tipo: 'segmento', id: d.segmento_id, nome: nomeSeg(d.segmento_id) }, prioridade: d.prioridade, validade: null, descricao: cr ? 'Libera pela planilha/cronograma de referência e plano do aluno.' : `Para o segmento, ${e.texto}.` })
  }
  for (const { m, tipo } of alvosOrdenados) {
    const d = m.disponibilidade as any
    if (!d?.tipo || d.tipo === 'na_matricula') continue
    const cr = ehDispCronograma(d); const e = efeitoDeDisp(d, hoje)
    add({ id: `db-${m.id}`, alvoTipo: tipo, alvoId: m.id, alvoTitulo: m.titulo, camada: cr ? 'cronograma' : 'disponibilidade', origem: { tabela: 'simulado_produto_modulos', id: m.id, rotulo: cr ? 'Disponibilidade (Cronograma)' : 'Disponibilidade base', href: hrefConteudos }, efeito: cr ? 'liberado' : e.efeito, quandoRotulo: cr ? 'conforme o cronograma' : e.rotulo, quando: cr ? null : e.quando, quem: { tipo: 'todos', id: null, nome: 'Todos' }, prioridade: null, validade: null, descricao: cr ? 'Libera pela planilha/cronograma de referência e plano do aluno.' : `Para todos, ${e.texto}.` })
  }
  // E) cronograma de referência + exceções
  for (const t of trilhas) add({ id: `tr-${t.id}`, alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'cronograma', origem: { tabela: 'simulado_liberacao_trilhas', id: t.id, rotulo: `Cronograma de referência: ${t.nome}`, href: hrefLiberacaoAulas(produtoId, 'cronogramas') }, efeito: 'liberado', quandoRotulo: `${t.offset_dias} dia(s) de antecedência`, quando: null, quem: t.segmento_ids.length ? { tipo: 'segmento', id: t.segmento_ids[0], nome: t.segmento_ids.map(nomeSeg).join(', ') } : { tipo: 'segmento', id: null, nome: '(nenhum segmento)' }, prioridade: t.ordem, validade: null, descricao: 'Define a data-base das aulas para os alunos que casam no(s) segmento(s). Só vale onde há regra do tipo Cronograma.' })
  for (const e of excs) {
    const quem = e.estudante_id ? { tipo: 'aluno' as const, id: e.estudante_id, nome: alunoNome.get(e.estudante_id) ?? 'Aluno' } : { tipo: 'grupo' as const, id: e.grupo_id, nome: e.grupo_id ? nomeGrupo(e.grupo_id) : 'Grupo' }
    add({ id: `ex-${e.id}`, alvoTipo: e.alvo_tipo === 'modulo' ? 'modulo' : 'aula', alvoId: e.alvo_id, alvoTitulo: tituloAlvo(e.alvo_id), camada: 'excecao', origem: { tabela: 'simulado_liberacao_excecoes', id: e.id, rotulo: 'Exceção manual', href: hrefExc }, efeito: e.acao === 'liberar' ? 'liberado' : 'bloqueado', quandoRotulo: e.expira_em ? `até ${dBr(e.expira_em.slice(0, 10))}` : 'sem validade', quando: e.expira_em ? e.expira_em.slice(0, 10) : null, quem, prioridade: null, validade: e.expira_em, descricao: `${e.acao === 'liberar' ? 'Libera' : 'Bloqueia'} manualmente${e.motivo ? ` — ${e.motivo}` : ''}.` })
  }
  // manutenção/estado
  if (produto.acessoBloqueado || !produto.ativo) add({ id: 'mt-estado', alvoTipo: 'produto', alvoId: null, alvoTitulo: 'Produto inteiro', camada: 'manutencao', origem: { tabela: 'simulado_produtos', id: produtoId, rotulo: produto.acessoBloqueado ? 'Em atualização' : 'Rascunho', href: hrefProduto(produtoId, 'informacoes') }, efeito: 'bloqueado', quandoRotulo: 'até publicar', quando: null, quem: { tipo: 'todos', id: null, nome: 'Todos os alunos' }, prioridade: null, validade: null, descricao: produto.acessoBloqueado ? 'Bloqueia TODOS (até pagantes) com aviso de atualização.' : 'Fora do ar: não aparece nem abre para ninguém.' })

  // ── ALERTAS ───────────────────────────────────────────────────────────────────────────────────
  const alertas: AlertaRegra[] = []
  const novo = (a: Omit<AlertaRegra, 'id'>) => alertas.push({ id: `${a.tipo}-${alertas.length}`, ...a })
  if (produto.acessoBloqueado) novo({ tipo: 'produto_bloqueado', severidade: 'aviso', titulo: 'Produto em atualização', detalhe: 'O produto bloqueia TODOS os alunos (até pagantes). Nenhuma outra regra tem efeito enquanto isso.', href: hrefProduto(produtoId, 'informacoes'), hrefRotulo: 'Mudar estado', alvoId: null })
  if (!produto.ativo) novo({ tipo: 'produto_bloqueado', severidade: 'aviso', titulo: 'Produto em rascunho', detalhe: 'O produto está fora do ar: não abre para ninguém.', href: hrefProduto(produtoId, 'informacoes'), hrefRotulo: 'Mudar estado', alvoId: null })

  // regra de cronograma "existente" em algum lugar (base ou segmento)?
  const temRegraCrono = mods.some((m) => ehDispCronograma(m.disponibilidade)) || itens.some((i) => ehDispCronograma(i.disponibilidade)) || dispSeg.some((d) => ehDispCronograma(d.disponibilidade))
  const aulasComData = new Set<string>([...planilhaPorAula.keys(), ...datasTrilha.keys()])
  if (aulasComData.size && !temRegraCrono) novo({ tipo: 'planilha_sem_regra', severidade: 'erro', titulo: 'Planilha/cronograma sem regra: as datas não têm efeito', detalhe: `${aulasComData.size} aula(s) têm data na planilha ou em cronograma de referência, mas NENHUMA regra do tipo "Cronograma" está ligada a módulo/aula/segmento. Os alunos vêem tudo pela disponibilidade normal.`, href: hrefProduto(produtoId, 'conteudos'), hrefRotulo: 'Criar regra de cronograma', alvoId: null })
  else if (temRegraCrono) {
    const propriaBase = (id: string, base: unknown) => ({ d: base, seg: false })
    const segTemCrono = (id: string) => (dispPorAlvo.get(id) ?? []).some((d) => ehDispCronograma(d.disponibilidade))
    const descobertas = [...aulasComData].filter((aulaId) => {
      const cadeia = [aulaId, ...ancestrais(aulaId)]
      if (cadeia.some(segTemCrono)) return false
      return !regraCronogramaGovernante(aulaId, porId.get(aulaId)?.disponibilidade, porId as any, propriaBase)
    })
    if (descobertas.length) novo({ tipo: 'planilha_sem_regra', severidade: 'aviso', titulo: `${descobertas.length} aula(s) com data sem regra de cronograma`, detalhe: `Estas aulas têm data na planilha/cronograma de referência mas nenhuma regra de cronograma as governa (data sem efeito): ${descobertas.slice(0, 5).map((id) => tituloAlvo(id)).join(', ')}${descobertas.length > 5 ? '…' : ''}.`, href: hrefProduto(produtoId, 'conteudos'), hrefRotulo: 'Ajustar disponibilidade', alvoId: descobertas[0] })
  }
  for (const t of trilhas) if (!t.segmento_ids.length) novo({ tipo: 'trilha_sem_segmento', severidade: 'aviso', titulo: `Cronograma de referência "${t.nome}" sem segmento`, detalhe: 'Sem segmento de condição ninguém casa neste cronograma automaticamente.', href: hrefLiberacaoAulas(produtoId, 'cronogramas'), hrefRotulo: 'Editar cronograma', alvoId: null })

  // empate de prioridade (regras de segmento no mesmo alvo)
  for (const [alvoId, ds] of dispPorAlvo) {
    const porPrio = new Map<number, DispSeg[]>()
    for (const d of ds) { const l = porPrio.get(d.prioridade) ?? []; l.push(d); porPrio.set(d.prioridade, l) }
    for (const [prio, l] of porPrio) {
      const segs = [...new Set(l.map((x) => x.segmento_id))]
      if (segs.length > 1) novo({ tipo: 'empate_prioridade', severidade: 'aviso', titulo: `Empate de prioridade em "${tituloAlvo(alvoId)}"`, detalhe: `Os segmentos ${segs.map(nomeSeg).join(' e ')} têm a mesma prioridade (${prio}) neste ${tipoAlvo.get(alvoId) === 'modulo' ? 'módulo' : 'item'}. Para quem está em mais de um, vale em silêncio a regra mais ANTIGA. Defina prioridades diferentes.`, href: hrefProduto(produtoId, 'conteudos'), hrefRotulo: 'Ajustar prioridade', alvoId })
    }
  }
  // exceção anulada
  for (const e of excs) {
    if (!excVigente(e)) { novo({ tipo: 'excecao_anulada', severidade: 'info', titulo: 'Exceção vencida ainda ativa', detalhe: `A exceção em "${tituloAlvo(e.alvo_id)}" venceu em ${dBr(e.expira_em?.slice(0, 10))} e não tem mais efeito. Desative ou apague.`, href: hrefExc, hrefRotulo: 'Ver exceções', alvoId: e.alvo_id }); continue }
    if (e.acao !== 'liberar') continue
    const cadeia = [e.alvo_id, ...ancestrais(e.alvo_id)]
    const sub = [e.alvo_id, ...(filhos.get(e.alvo_id) ?? []).map((f) => f.id)]
    const porSegmento = sub.some((id) => (visPorAlvo.get(id) ?? []).length) || cadeia.some((id) => (visPorAlvo.get(id) ?? []).length)
    const bloqueada = cadeia.some((id) => (excPorAlvo.get(id) ?? []).some((x) => x.acao === 'bloquear' && excVigente(x) && x.id !== e.id && (x.estudante_id === e.estudante_id && x.grupo_id === e.grupo_id)))
    const quem = e.estudante_id ? alunoNome.get(e.estudante_id) ?? 'aluno' : nomeGrupo(e.grupo_id ?? '')
    if (produto.acessoBloqueado) novo({ tipo: 'excecao_anulada', severidade: 'aviso', titulo: 'Exceção "liberar" anulada pela manutenção', detalhe: `A exceção de ${quem} em "${tituloAlvo(e.alvo_id)}" não tem efeito: o produto está em atualização.`, href: hrefExc, hrefRotulo: 'Ver exceções', alvoId: e.alvo_id })
    else if (bloqueada) novo({ tipo: 'excecao_anulada', severidade: 'aviso', titulo: 'Exceção "liberar" anulada por exceção "bloquear"', detalhe: `Para ${quem}, "${tituloAlvo(e.alvo_id)}" tem exceção de liberar E de bloquear (módulo/aula): bloquear vence.`, href: hrefExc, hrefRotulo: 'Ver exceções', alvoId: e.alvo_id })
    else if (porSegmento) novo({ tipo: 'excecao_anulada', severidade: 'aviso', titulo: 'Exceção "liberar" pode ser anulada por visibilidade de segmento', detalhe: `A exceção de ${quem} em "${tituloAlvo(e.alvo_id)}" não derruba "ocultar/mostrar somente" por segmento: se o aluno estiver barrado pelo segmento, continuará sem ver.`, href: hrefVis, hrefRotulo: 'Ver visibilidade', alvoId: e.alvo_id })
  }

  // produto sem público
  const assinaturas = await svc.from('simulado_assinaturas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('status', 'ativo').then((r: any) => (r.error ? null : r.count ?? 0), () => null)
  const temAcessoSeg = vis.some((v) => v.alvo_tipo === 'produto' && v.efeito === 'liberar')
  const vendaAtiva = regrasVenda.some((r) => r.status === 'active') && produto.regrasVendaFlag
  if (!grupos.length && !produto.acessoGratuito && !temAcessoSeg && !vendaAtiva && !assinaturas) novo({ tipo: 'sem_publico', severidade: 'erro', titulo: 'Produto sem público', detalhe: 'Nenhum grupo vinculado, nenhuma assinatura ativa, nenhum segmento de acesso, regra de venda ativa ou "liberado para todos": ninguém consegue entrar.', href: hrefProduto(produtoId, 'grupos'), hrefRotulo: 'Vincular grupo', alvoId: null })
  // alvos cuja regra "mostrar somente" aponta para segmento removido
  const segExistentes = segNome
  for (const v of vis) if (v.alvo_id && v.efeito === 'mostrar' && !segExistentes.has(v.segmento_id)) novo({ tipo: 'sem_publico', severidade: 'erro', titulo: `"${tituloAlvo(v.alvo_id)}" visível só para um segmento removido`, detalhe: 'A regra "mostrar somente para" aponta para um segmento que não existe mais: ninguém vê este conteúdo.', href: hrefVis, hrefRotulo: 'Corrigir visibilidade', alvoId: v.alvo_id })
  // grupos sem membros / validade vencendo (H)
  for (const g of grupos) if (g.membros === 0) novo({ tipo: 'grupo_sem_membros', severidade: 'aviso', titulo: `Grupo "${g.nome}" vinculado sem membros vigentes`, detalhe: 'O grupo dá acesso, mas não tem nenhum membro com participação válida.', href: hrefProduto(produtoId, 'grupos'), hrefRotulo: 'Ver grupos', alvoId: null })
  const em14 = new Date(Date.now() + 14 * 864e5).toISOString()
  const vencendo = await Promise.all(grupos.slice(0, 30).map((g) =>
    svc.from('simulado_grupo_membros').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('grupo_id', g.id).gt('expira_em', agora).lt('expira_em', em14)
      .then((r: any) => (r.error ? 0 : r.count ?? 0), () => 0)))
  grupos.slice(0, 30).forEach((g, i) => { if (vencendo[i] > 0) novo({ tipo: 'validade_vencendo', severidade: 'info', titulo: `${vencendo[i]} membro(s) de "${g.nome}" vencem em 14 dias`, detalhe: 'Ao vencer a participação, o aluno perde o acesso por este grupo.', href: `/admin/grupos/${g.id}`, hrefRotulo: 'Abrir grupo', alvoId: null }) })
  // regra de venda
  for (const r of regrasVenda) if (r.status !== 'active') novo({ tipo: 'regra_venda_inativa', severidade: 'info', titulo: `Regra de venda "${r.nome}" ${r.status === 'paused' ? 'pausada' : 'cancelada'}`, detalhe: 'Ela concede este produto mas está inativa: novos compradores não são liberados por ela.', href: '/admin/liberacao', hrefRotulo: 'Abrir regras de venda', alvoId: null })
  if (regrasVenda.some((r) => r.status === 'active') && !produto.regrasVendaFlag) novo({ tipo: 'regra_venda_inativa', severidade: 'aviso', titulo: 'Regras de venda ativas, mas a flag está desligada', detalhe: 'Há regra de venda concedendo este produto, porém NEXT_PUBLIC_LIBERACAO_REGRAS_ATIVO está desligada: elas não rodam.', href: '/admin/liberacao', hrefRotulo: 'Abrir regras de venda', alvoId: null })

  // documento em 2 produtos com decisões diferentes
  const docs = [...new Set(itens.filter((i) => i.tipo_ref === 'documento_biblioteca' && i.ref_id).map((i) => i.ref_id as string))]
  if (docs.length) {
    const outros = await fetchAllByIn<any>(docs, (ids) => svc.from('simulado_produto_modulo_itens').select('id, produto_id, ref_id, disponibilidade').eq('tenant_id', tenantId).eq('tipo_ref', 'documento_biblioteca').eq('deletado', false).eq('situacao', 'ativo').neq('produto_id', produtoId).in('ref_id', ids).order('id', { ascending: true }) as any).catch(() => [] as any[])
    const minhas = new Map<string, string>()
    for (const i of itens) if (i.ref_id) minhas.set(i.ref_id, JSON.stringify(i.disponibilidade ?? null))
    const dup = new Set<string>(), div = new Set<string>()
    for (const o of outros) { dup.add(o.ref_id); if (JSON.stringify(o.disponibilidade ?? null) !== minhas.get(o.ref_id) || ehDispCronograma(o.disponibilidade) !== ehDispCronograma(JSON.parse(minhas.get(o.ref_id) ?? 'null'))) div.add(o.ref_id) }
    if (dup.size) novo({ tipo: 'doc_duplicado', severidade: div.size ? 'aviso' : 'info', titulo: `${dup.size} documento(s) também estão em outro produto${div.size ? ` — ${div.size} com regras diferentes` : ''}`, detalhe: 'O leitor libera o documento se QUALQUER produto do aluno o liberar. Se um produto bloqueia e outro libera, o aluno lê mesmo assim.', href: hrefProduto(produtoId, 'conteudos'), hrefRotulo: 'Ver conteúdos', alvoId: null })
  }

  // alvos sem nenhuma regra
  const regrasAtivas = linhas.length
  alertas.sort((a, b) => ({ erro: 0, aviso: 1, info: 2 }[a.severidade] - { erro: 0, aviso: 1, info: 2 }[b.severidade]))
  return { produto, publicos, linhas, matriz, alertas, regrasAtivas, tabelasAusentes: ausentes, geradoEm: new Date().toISOString() }
}

const SORT_LINHA: Record<string, (l: LinhaRegra) => string | number> = {
  alvo: (l) => l.alvoTitulo.toLowerCase(), camada: (l) => CAMADAS_INFO[l.camada].rotulo, efeito: (l) => l.efeito, quando: (l) => l.quando ?? '9999', prioridade: (l) => l.prioridade ?? 9999, quem: (l) => l.quem.nome.toLowerCase(),
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Mapa de regras do produto, filtrado/ordenado/paginado no servidor. `null` = produto não encontrado neste tenant. */
export async function mapaRegrasDoProduto(tenantId: string, produtoId: string, f: FiltroMapa & { cols?: string } = {}): Promise<MapaRegras | null> {
  const snap = await remember<Snapshot | null>(`mapa-regras:${tenantId}:${produtoId}`, 20, () => montarSnapshot(tenantId, produtoId).catch(() => null))
  if (!snap) return null
  const pp = [10, 25, 50, 100].includes(Number(f.pp)) ? Number(f.pp) : 25
  const page = Math.max(1, Math.floor(Number(f.page)) || 1)
  const q = norm(f.q ?? '')

  // colunas da matriz: escolhidas (cols=chave1,chave2) ou as 8 primeiras
  const escolhidas = (f.cols ?? '').split(',').filter(Boolean)
  let colunas = escolhidas.length ? snap.publicos.filter((p) => escolhidas.includes(p.chave)) : snap.publicos.slice(0, 8)
  if (f.publico && !colunas.some((c) => c.chave === f.publico)) { const p = snap.publicos.find((x) => x.chave === f.publico); if (p) colunas = [p, ...colunas].slice(0, 8) }
  if (!colunas.length) colunas = snap.publicos.slice(0, 1)

  // matriz
  const camadaDoAlvo = (l: LinhaMatriz) => l.celulas
  let mrows = snap.matriz.filter((m) => (!f.alvo || f.alvo === 'todos' || m.alvoTipo === f.alvo) && (!q || norm(`${m.titulo} ${m.disciplina}`).includes(q)))
  if (f.camada) mrows = mrows.filter((m) => Object.values(camadaDoAlvo(m)).some((c) => c.camada === f.camada))
  if (f.efeito) mrows = mrows.filter((m) => colunas.some((c) => m.celulas[c.chave]?.efeito === f.efeito))
  const mTotal = mrows.length
  mrows = mrows.slice((page - 1) * pp, page * pp).map((m) => ({ ...m, celulas: Object.fromEntries(colunas.map((c) => [c.chave, m.celulas[c.chave]])) }))

  // lista
  let lrows = snap.linhas.filter((l) =>
    (!f.alvo || f.alvo === 'todos' || l.alvoTipo === f.alvo) && (!f.camada || l.camada === f.camada) && (!f.efeito || l.efeito === f.efeito)
    && (!f.publico || (f.publico === 'todos' ? l.quem.tipo === 'todos' : f.publico === `${l.quem.tipo}:${l.quem.id}`))
    && (!q || norm(`${l.alvoTitulo} ${l.disciplina} ${l.origem.rotulo} ${l.quem.nome} ${l.descricao}`).includes(q)))
  const key = SORT_LINHA[f.sort ?? ''] ?? SORT_LINHA.camada
  const dir = f.dir === 'desc' ? -1 : 1
  lrows = [...lrows].sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')) * dir || a.id.localeCompare(b.id) })
  const lTotal = lrows.length
  lrows = lrows.slice((page - 1) * pp, page * pp)

  const kpis: KpisMapa = {
    alvos: snap.matriz.length, publicos: snap.publicos.length, regrasAtivas: snap.regrasAtivas,
    semRegra: snap.matriz.filter((m) => m.regras === 0).length,
    alertasErro: snap.alertas.filter((a) => a.severidade === 'erro').length, alertasAviso: snap.alertas.filter((a) => a.severidade === 'aviso').length,
  }
  return { produto: snap.produto, publicos: snap.publicos, kpis, alertas: snap.alertas, matriz: { rows: mrows, total: mTotal, colunas }, lista: { rows: lrows, total: lTotal }, tabelasAusentes: snap.tabelasAusentes, geradoEm: snap.geradoEm }
}

/** Exportação CSV (todas as linhas do filtro, sem paginação; teto 5000). */
export async function regrasParaCsv(tenantId: string, produtoId: string, f: FiltroMapa = {}): Promise<string | null> {
  const snap = await remember<Snapshot | null>(`mapa-regras:${tenantId}:${produtoId}`, 20, () => montarSnapshot(tenantId, produtoId).catch(() => null))
  if (!snap) return null
  const q = norm(f.q ?? '')
  const rows = snap.linhas.filter((l) => (!f.alvo || f.alvo === 'todos' || l.alvoTipo === f.alvo) && (!f.camada || l.camada === f.camada) && (!f.efeito || l.efeito === f.efeito)
    && (!f.publico || (f.publico === 'todos' ? l.quem.tipo === 'todos' : f.publico === `${l.quem.tipo}:${l.quem.id}`))
    && (!q || norm(`${l.alvoTitulo} ${l.origem.rotulo} ${l.quem.nome} ${l.descricao}`).includes(q))).slice(0, 5000)
  const esc = (v: unknown) => { const s = String(v ?? '').replace(/\r?\n/g, ' '); return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const cab = ['Alvo', 'Tipo', 'Disciplina', 'Camada', 'Origem', 'Efeito', 'Quando', 'Quem', 'Prioridade', 'Validade', 'Descrição']
  const linhas = rows.map((l) => [l.alvoTitulo, l.alvoTipo, l.disciplina, CAMADAS_INFO[l.camada].rotulo, l.origem.rotulo, l.efeito, l.quandoRotulo, `${l.quem.tipo}: ${l.quem.nome}`, l.prioridade ?? '', l.validade ?? '', l.descricao].map(esc).join(';'))
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n')
}

// ───────────────────────────── matriz hierárquica (módulo > aula) ─────────────────────────────

const vazioResumo = (): ResumoModulo => ({ total: 0, liberado: 0, cadeado: 0, oculto: 0, bloqueado: 0, diferentes: 0 })

/** Matriz para a UI nova: árvore completa (leve) + células SÓ dos módulos raiz e dos expandidos; filtros, busca e resumo no servidor. */
export async function matrizDoProduto(tenantId: string, produtoId: string, f: FiltroMatriz): Promise<DadosMatriz | null> {
  const snap = await remember<Snapshot | null>(`mapa-regras:${tenantId}:${produtoId}`, 20, () => montarSnapshot(tenantId, produtoId).catch(() => null))
  if (!snap) return null
  const pedidas = [...new Set((f.cols ?? []).filter(Boolean))].slice(0, 40)
  let colunas = snap.publicos.filter((p) => pedidas.includes(p.chave))
  if (!colunas.length) colunas = snap.publicos.slice(0, 8)
  const chaves = colunas.map((c) => c.chave)
  const q = norm(f.q ?? '')
  const filtrando = !!(q || f.efeito || f.soDiferencas)
  const expandir = new Set((f.expandir ?? []).slice(0, 60))

  type L = (typeof snap.matriz)[number]
  const pick = (m: L): L => ({ ...m, celulas: Object.fromEntries(chaves.filter((c) => m.celulas[c]).map((c) => [c, m.celulas[c]])) })
  const passa = (m: L) =>
    (!f.efeito || chaves.some((c) => m.celulas[c]?.efeito === f.efeito)) && (!f.soDiferencas || chaves.some((c) => m.celulas[c] && m.celulas[c].camada !== 'base'))

  const porRaiz = new Map<string, L[]>()
  for (const m of snap.matriz) { const l = porRaiz.get(m.raizId) ?? []; l.push(m); porRaiz.set(m.raizId, l) }
  const nFilhos = new Map<string, number>()
  for (const m of snap.matriz) if (m.paiId) nFilhos.set(m.paiId, (nFilhos.get(m.paiId) ?? 0) + 1)
  const arvore: NoArvore[] = snap.matriz.map((m) => ({ id: m.alvoId, titulo: m.titulo, paiId: m.paiId, raizId: m.raizId, nivel: m.nivel, filhos: nFilhos.get(m.alvoId) ?? 0, regras: m.regras }))

  const raizes: DadosMatriz['raizes'] = []
  const filhos: DadosMatriz['filhos'] = {}
  const resumo: DadosMatriz['resumo'] = {}
  const auto: string[] = []
  for (const [raizId, linhas] of porRaiz) {
    if (f.modulo && f.modulo !== raizId) continue
    const raiz = linhas[0]; const filhas = linhas.slice(1)
    const raizQ = !q || norm(raiz.titulo).includes(q)
    const filhasOk = filhas.filter((m) => passa(m) && (!q || raizQ || norm(`${m.titulo} ${m.disciplina}`).includes(q)))
    const raizOk = raizQ && passa(raiz)
    if (filtrando && !raizOk && !filhasOk.length) continue
    const r = vazioResumo()
    for (const m of linhas) for (const c of chaves) {
      const cel = m.celulas[c]; if (!cel) continue
      r.total++; r[cel.efeito]++; if (cel.camada !== 'base') r.diferentes++
    }
    resumo[raizId] = r
    raizes.push(pick(raiz))
    const abrir = filtrando ? filhasOk.length > 0 : expandir.has(raizId)
    if (abrir && Object.keys(filhos).length < 60) {
      filhos[raizId] = (filtrando ? filhasOk : filhas).map(pick)
      if (filtrando) auto.push(raizId)
    }
  }
  return { produto: snap.produto, publicos: snap.publicos, colunas, arvore, raizes, filhos, autoExpandidos: auto, resumo, totalAlvos: snap.matriz.length, geradoEm: snap.geradoEm }
}

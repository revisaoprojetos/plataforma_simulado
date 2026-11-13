import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { MAX_SEM, REV_OPCOES_NOVAS, REV_PADRAO } from '@/lib/cronograma/adaptativo/motor30'
import { paginasEfetivasDocs, type PaginasDoc } from '@/lib/conteudo/paginas-efetivas'
import { carregarConteudoBanco } from '@/lib/cronograma/adaptativo/conteudo-banco'
import { definicoesDoConteudo } from '@/lib/cronograma/adaptativo/meta-def'
import { lerOverride } from '@/lib/cronograma/adaptativo/catalogo-override-db'
import { lerCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
import { lerFiltros } from '@/lib/cronograma/adaptativo/qf-db'
import { contarQuestoesFiltro } from '@/lib/cronograma/adaptativo/qf-questoes'
import { chaveDisciplina, numeroAula } from '@/lib/cronograma/adaptativo/catalogo-html'
import { crDef, crNormalizar, crAlteradas, crMin, CR_MOTOR, CAMPOS_DISC, type CampoDisc, type ValoresRegras } from './cronograma-schema'

// Cronograma Adaptativo (admin Plataforma Revisão) — camada de LEITURA/escrita de dados.
// A página só LÊ: aqui a cobertura (aula × material) e o tempo total já saem prontos, filtrados/ordenados/paginados no servidor.
// Fonte da cobertura = conteúdo EFETIVO do Adaptativo (catálogo + Biblioteca + edições do Catálogo de metas) — a mesma
// fonte da "Definição e análise" (meta_def), sem depender da tabela sincronizada.

const T_REG = 'simulado_revisao_cron_regras'
const T_DISC = 'simulado_revisao_cron_disciplinas'
const T_VER = 'simulado_revisao_cron_versoes'
const T_SPR = 'simulado_revisao_cron_sprints'

export const TABELA_AUSENTE = /relation .* does not exist|could not find the table|schema cache|does not exist/i

// ───────────────────────────── regras ─────────────────────────────

/** Regras do tenant: as SALVAS aqui + o valor REAL vigente no motor para as que têm equivalente (essas nunca são gravadas aqui).  = migração não aplicada. */
export async function lerRegras(svc: SupabaseClient, tenantId: string): Promise<{ valores: ValoresRegras; migrado: boolean; atualizadoEm: string | null }> {
  const [{ data, error }, motor] = await Promise.all([
    svc.from(T_REG).select('valores, atualizado_em').eq('tenant_id', tenantId).maybeSingle(),
    valoresDoMotor(svc, tenantId).catch(() => ({}) as Record<string, number>),
  ])
  if (error) return { valores: { ...crDef(), ...motor }, migrado: !TABELA_AUSENTE.test(error.message), atualizadoEm: null }
  const r = data as { valores: unknown; atualizado_em: string } | null
  return { valores: { ...crNormalizar(r?.valores), ...motor }, migrado: true, atualizadoEm: r?.atualizado_em ?? null }
}

/** Remove as regras que pertencem ao motor (têm equivalente em Metas & inteligência): essas não são gravadas aqui. */
export function semRegrasDoMotor(v: ValoresRegras): ValoresRegras {
  const o = { ...v }
  for (const k of Object.keys(CR_MOTOR)) delete o[k]
  return o
}

/** "Motor atual": valor de cada regra mapeada no parâmetro equivalente do motor em produção (informativo). */
export async function valoresDoMotor(svc: SupabaseClient, tenantId: string): Promise<Record<string, number>> {
  const cfg = (await lerCfgMetas(svc, tenantId)) as unknown as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [k, m] of Object.entries(CR_MOTOR)) {
    const n = Number(cfg[m.param])
    if (Number.isFinite(n)) out[k] = Math.round(n * (m.escala ?? 1) * 100) / 100
  }
  return out
}

// ───────────────────────────── catálogo → cobertura ─────────────────────────────

export interface AulaBase {
  chave: string
  qfKey: string
  ordem: number
  disc: string
  numero: string
  titulo: string
  pag: number
  flashPag: number
  flashTem: boolean
  fightPag: number
  fightTem: boolean
  /** há filtro de questões da plataforma configurado para a aula (Catálogo de metas) */
  qFiltro: boolean
  /** há link de questões (QConcursos/TEC) cadastrado na aula */
  qLink: boolean
  /** há documento de Questões na Biblioteca para a aula */
  qDoc: boolean
  documentoId: string | null
}

interface ApoioAula { flashPag: number; flashTem: boolean; fightPag: number; fightTem: boolean; qDoc: boolean }

/** Materiais de apoio da Biblioteca (PDFlash, PDFight, Questões) por "disciplina|nº da aula", com as páginas da versão atual. */
async function materiaisApoio(svc: SupabaseClient, tenantId: string): Promise<Map<string, ApoioAula>> {
  const out = new Map<string, ApoioAula>()
  // Sem limit silencioso: pagina com .range() e ordenação por coluna única (id).
  const pastas = await fetchAll<{ id: string; pai_id: string | null; disciplina_id: string | null; cronograma_tipo_material: string | null }>(
    () => svc.from('simulado_pastas').select('id, pai_id, disciplina_id, cronograma_tipo_material').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id'), 1000, 'revisao-cron:pastas')
  if (!pastas.length) return out
  const pai = new Map(pastas.map((p) => [p.id, p.pai_id])), tipo = new Map(pastas.map((p) => [p.id, p.cronograma_tipo_material]))
  const filhos = new Map<string, string[]>()
  for (const p of pastas) if (p.pai_id) (filhos.get(p.pai_id) ?? filhos.set(p.pai_id, []).get(p.pai_id)!).push(p.id)
  const discDa = new Map<string, string>()
  for (const p of pastas) if (p.disciplina_id) { const pil = [p.id]; while (pil.length) { const c = pil.pop()!; if (!discDa.has(c)) { discDa.set(c, p.disciplina_id); (filhos.get(c) ?? []).forEach((f) => pil.push(f)) } } }
  const herdado = (id: string): string | null => { const seen = new Set<string>(); let c: string | null = id; while (c && !seen.has(c)) { seen.add(c); const t = tipo.get(c); if (t) return t; c = pai.get(c) ?? null } return null }
  const alvo = new Set(['pdflash', 'pdfight', 'questoes'])
  const pastaIds = [...discDa.keys()].filter((id) => alvo.has(herdado(id) ?? ''))
  if (!pastaIds.length) return out
  const [docs, discs] = await Promise.all([
    fetchAllByIn<{ id: string; titulo: string; pasta_id: string; versao_atual_id: string | null }>(pastaIds, (l) => svc.from('simulado_conteudo_documentos').select('id, titulo, pasta_id, versao_atual_id').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).in('pasta_id', l).order('id'), { chunk: 80, rotulo: 'revisao-cron:docs' }),
    fetchAll<{ id: string; nome: string }>(() => svc.from('simulado_disciplinas').select('id, nome').eq('tenant_id', tenantId).order('id'), 1000, 'revisao-cron:disciplinas'),
  ])
  const dn = new Map(discs.map((d) => [d.id, d.nome]))
  // páginas EFETIVAS (versão atual − página inicial): função única compartilhada com o Adaptativo e a Meta
  const pg = await paginasEfetivasDocs(svc, tenantId, docs.map((d) => ({ id: d.id, pasta_id: d.pasta_id, versao_atual_id: d.versao_atual_id }))).catch(() => new Map<string, PaginasDoc>())
  for (const d of docs) {
    const n = numeroAula(d.titulo); const disc = dn.get(discDa.get(d.pasta_id) ?? ''); if (!n || !disc) continue
    const k = `${chaveDisciplina(disc)}|${n}`, t = herdado(d.pasta_id)
    const e = out.get(k) ?? { flashPag: 0, flashTem: false, fightPag: 0, fightTem: false, qDoc: false }
    const p = pg.get(d.id)?.efetivas ?? 0
    if (t === 'pdflash') { e.flashTem = true; e.flashPag = e.flashPag || p } else if (t === 'pdfight') { e.fightTem = true; e.fightPag = e.fightPag || p } else e.qDoc = true
    out.set(k, e)
  }
  return out
}

/** Aulas ATIVAS do cronograma, na ordem de distribuição, com os materiais REAIS (Biblioteca + Catálogo de metas + filtros de questões). Cache curto. */
async function aulasBase(svc: SupabaseClient, tenantId: string): Promise<AulaBase[]> {
  return remember<AulaBase[]>(`revisao-cron:aulas2:${tenantId}`, 45, async () => {
    const [c, ov, apoio, filtros] = await Promise.all([
      carregarConteudoBanco(svc, tenantId), lerOverride(svc, tenantId).catch(() => null), materiaisApoio(svc, tenantId).catch(() => new Map<string, ApoioAula>()),
      lerFiltros(svc, tenantId).catch(() => ({})),
    ])
    const defs = definicoesDoConteudo(tenantId, { AS: c.AS as unknown as Array<Array<unknown>>, ordem: c.ordem, LP: c.LP })
    const matDe = (chave: string) => {
      const base = chave.replace(/#\d+$/, '')
      return ov?.aulas?.[chave]?.mat ?? ov?.aulas?.[base]?.mat ?? ov?.novas?.find((n) => n.k === chave || n.k === base)?.mat
    }
    return defs
      .filter((d) => d.tipo === 'aula' && d.ativa)
      .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || (a.ref_pos ?? 0) - (b.ref_pos ?? 0))
      .map((d, i): AulaBase => {
        const m = matDe(d.chave)
        const n = Number(d.numero) || numeroAula(d.titulo ?? '') || 0
        const ap = apoio.get(`${chaveDisciplina(d.disciplina ?? '')}|${n}`)
        const qfKey = (d.ref_pos != null ? c.chaves?.[d.ref_pos] : undefined) ?? d.chave
        const fp = Number(m?.pdflashPaginas) || ap?.flashPag || 0, gp = Number(m?.pdfightPaginas) || ap?.fightPag || 0
        return {
          chave: d.chave, qfKey, ordem: i + 1, disc: d.disciplina ?? 'Sem disciplina', numero: d.numero ?? '', titulo: d.titulo ?? '',
          pag: d.paginas ?? 0, flashPag: fp, flashTem: fp > 0 || !!ap?.flashTem, fightPag: gp, fightTem: gp > 0 || !!ap?.fightTem,
          qFiltro: !!(filtros as Record<string, unknown>)[qfKey], qLink: !!(d.link_qc || d.link_tec), qDoc: !!ap?.qDoc, documentoId: d.documento_id,
        }
      })
  })
}

// ───────────────────────────── disciplinas ─────────────────────────────

export interface DisciplinaCfg { id: string | null; nome: string; pdflash: boolean; pdfight: boolean; pdfull: boolean; juris: boolean; legproc: boolean; ativa: boolean; manual: boolean; aulas: number; salva: boolean }
export { CAMPOS_DISC, type CampoDisc }

/** Disciplinas = as do catálogo (com padrão vindo do motor) ∪ as criadas aqui; linhas salvas sobrescrevem o padrão. */
export async function listarDisciplinasCfg(svc: SupabaseClient, tenantId: string): Promise<{ lista: DisciplinaCfg[]; migrado: boolean; tiposMigrado: boolean }> {
  type LinhaDisc = { id: string; nome: string; pdflash: boolean; pdfight: boolean; ativa: boolean; manual: boolean; pdfull?: boolean; juris?: boolean; legproc?: boolean }
  let tiposMigrado = true
  const [aulas, cfg, rows] = await Promise.all([
    aulasBase(svc, tenantId),
    lerCfgMetas(svc, tenantId),
    // paginado (sem limit silencioso); `nome` é único por tenant (onConflict tenant_id,nome)
    // colunas pdfull/juris/legproc vêm da migração 20261113030000; sem ela, cai para o select antigo (tiposMigrado=false)
    fetchAll<LinhaDisc>(() => svc.from(T_DISC).select('id, nome, pdflash, pdfight, pdfull, juris, legproc, ativa, manual').eq('tenant_id', tenantId).order('nome', { ascending: true }), 500, 'revisao-cron:disc-cfg')
      .catch(() => { tiposMigrado = false; return fetchAll<LinhaDisc>(() => svc.from(T_DISC).select('id, nome, pdflash, pdfight, ativa, manual').eq('tenant_id', tenantId).order('nome', { ascending: true }), 500, 'revisao-cron:disc-cfg-v1') })
      .then((data) => ({ data, error: null as { message: string } | null }))
      .catch((e: { message?: string }) => ({ data: [] as LinhaDisc[], error: { message: e?.message ?? '' } })),
  ])
  const migrado = !rows.error || !TABELA_AUSENTE.test(rows.error.message)
  const salvas = new Map(rows.data.map((r) => [r.nome, r]))
  const sem = new Set(cfg.semFlash)
  const cont = new Map<string, number>()
  for (const a of aulas) cont.set(a.disc, (cont.get(a.disc) ?? 0) + 1)
  const nomes = new Set<string>([...cont.keys(), ...salvas.keys()])
  const lista = [...nomes].map((nome): DisciplinaCfg => {
    const s = salvas.get(nome)
    return { id: s?.id ?? null, nome, pdflash: s ? s.pdflash : !sem.has(nome), pdfight: s ? s.pdfight : true, pdfull: s?.pdfull !== false, juris: s?.juris !== false, legproc: s?.legproc !== false, ativa: s ? s.ativa : true, manual: !!s?.manual, aulas: cont.get(nome) ?? 0, salva: !!s }
  })
  return { lista: lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), migrado, tiposMigrado }
}

// ───────────────────────────── cobertura (aba 1) ─────────────────────────────

export interface LinhaCobertura extends AulaBase {
  rotulo: string
  precisaFlash: boolean
  precisaFight: boolean
  pendentes: number
  tempoMin: number
  temFlash: boolean
  temFight: boolean
  temQuestoes: boolean
  /** nº de questões da plataforma que casam com o filtro da aula (só preenchido nas linhas da página mostrada) */
  questoesQtd: number | null
}
export interface FiltroCobertura { q?: string; disc?: string; situ?: 'pendentes' | 'completas' | ''; ordem?: string; dir?: 'asc' | 'desc'; pagina?: number; porPagina?: number }

export interface KpisCobertura { aulas: number; paginas: number; pendentes: number }
export interface BaseCobertura { linhas: LinhaCobertura[]; disciplinas: string[]; kpis: KpisCobertura }

export async function montarCobertura(svc: SupabaseClient, tenantId: string, regras: ValoresRegras): Promise<BaseCobertura> {
  const [aulas, { lista }] = await Promise.all([aulasBase(svc, tenantId), listarDisciplinasCfg(svc, tenantId)])
  const cfg = new Map(lista.map((d) => [d.nome, d]))
  const ritmo = Number(regras.ritmoPadrao) || 17, bloco = Number(regras.blocoArred) || 30, porPag = !!regras.tempoPorPagina
  const linhas: LinhaCobertura[] = []
  for (const a of aulas) {
    const d = cfg.get(a.disc)
    if (d && !d.ativa) continue // disciplina desligada sai do cronograma
    const precisaFlash = d ? d.pdflash : true, precisaFight = d ? d.pdfight : true
    const temFlash = a.flashTem, temFight = a.fightTem, temQuestoes = a.qFiltro || a.qLink || a.qDoc
    const pendentes = (a.pag ? 0 : 1) + (precisaFlash && !temFlash ? 1 : 0) + (precisaFight && !temFight ? 1 : 0) + (temQuestoes ? 0 : 1)
    const tFl = precisaFlash && temFlash ? (porPag ? (a.flashPag ? crMin(a.flashPag, ritmo, bloco) : Number(regras.tPdflash) || 0) : Number(regras.tPdflash) || 0) : 0
    const tFi = precisaFight && temFight ? (porPag ? (a.fightPag ? crMin(a.fightPag, ritmo, bloco) : Number(regras.tPdfight) || 0) : Number(regras.tPdfight) || 0) : 0
    linhas.push({
      ...a, rotulo: a.numero ? `Aula ${a.numero} – ${a.titulo}` : a.titulo, precisaFlash, precisaFight, pendentes,
      tempoMin: crMin(a.pag, ritmo, bloco) + tFl + tFi + (temQuestoes ? Number(regras.tQuestoes) || 0 : 0),
      temFlash, temFight, temQuestoes, questoesQtd: null,
    })
  }
  // KPIs somados aqui (servidor): a página só exibe.
  const kpis: KpisCobertura = { aulas: linhas.length, paginas: 0, pendentes: 0 }
  for (const l of linhas) { kpis.paginas += l.pag; kpis.pendentes += l.pendentes }
  return { linhas, disciplinas: [...new Set(linhas.map((l) => l.disc))].sort((a, b) => a.localeCompare(b, 'pt-BR')), kpis }
}

export interface PaginaCobertura {
  linhas: LinhaCobertura[]; total: number; pagina: number; porPagina: number
  kpis: KpisCobertura
  disciplinas: string[]
}

/** Filtra/ordena/pagina NO SERVIDOR (busca, disciplina, situação, ordenação por coluna). */
export function paginarCobertura(base: BaseCobertura, f: FiltroCobertura): PaginaCobertura {
  const kpis = base.kpis
  const q = (f.q ?? '').trim().toLowerCase()
  let L = base.linhas.filter((l) =>
    (!q || `${l.rotulo} ${l.disc}`.toLowerCase().includes(q)) && (!f.disc || l.disc === f.disc) &&
    (f.situ === 'pendentes' ? l.pendentes > 0 : f.situ === 'completas' ? l.pendentes === 0 : true))
  const dir = f.dir === 'desc' ? -1 : 1
  const chave: Record<string, (l: LinhaCobertura) => string | number> = {
    ordem: (l) => l.ordem, aula: (l) => l.rotulo.toLowerCase(), disc: (l) => l.disc.toLowerCase(), pag: (l) => l.pag, tempo: (l) => l.tempoMin, pend: (l) => l.pendentes,
  }
  const k = chave[f.ordem ?? 'ordem'] ?? chave.ordem
  L = [...L].sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.ordem - b.ordem })
  const porPagina = Math.min(100, Math.max(5, f.porPagina ?? 25))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), Math.max(1, Math.ceil(L.length / porPagina)))
  return { linhas: L.slice((pagina - 1) * porPagina, pagina * porPagina), total: L.length, pagina, porPagina, kpis, disciplinas: base.disciplinas }
}

/** Conta, no banco, as questões da plataforma que casam com o filtro de cada aula da página (só as linhas mostradas; cache 120 s). */
export async function preencherQuestoes(svc: SupabaseClient, tenantId: string, linhas: LinhaCobertura[]): Promise<void> {
  const alvo = linhas.filter((l) => l.qFiltro)
  if (!alvo.length) return
  const filtros = await lerFiltros(svc, tenantId).catch(() => ({}) as Awaited<ReturnType<typeof lerFiltros>>)
  await Promise.all(alvo.map(async (l) => {
    const f = filtros[l.qfKey]
    if (!f) return
    l.questoesQtd = await remember<number>(`revisao-cron:qtd:${tenantId}:${l.qfKey}`, 120, () => contarQuestoesFiltro(svc, tenantId, f)).catch(() => null)
  }))
}

// ───────────────────────────── disciplinas paginadas (aba Disciplinas) ─────────────────────────────

export interface FiltroDisciplinas { q?: string; situ?: string; ordem?: string; dir?: 'asc' | 'desc'; pagina?: number; porPagina?: number }
export interface PaginaDisciplinas { itens: DisciplinaCfg[]; total: number; totalGeral: number; pagina: number; porPagina: number; migrado: boolean; tiposMigrado: boolean }

/** Busca + filtro + ordenação + fatia no SERVIDOR (a lista é catálogo ∪ salvas: não há uma tabela única para .range()). */
export async function paginarDisciplinas(svc: SupabaseClient, tenantId: string, f: FiltroDisciplinas): Promise<PaginaDisciplinas> {
  const { lista, migrado, tiposMigrado } = await listarDisciplinasCfg(svc, tenantId)
  const q = (f.q ?? '').trim().toLowerCase(), dir = f.dir === 'desc' ? -1 : 1
  const L = lista.filter((d) => (!q || d.nome.toLowerCase().includes(q)) && (f.situ === 'fora' ? !d.ativa : f.situ === 'no' ? d.ativa : true))
  const chave = f.ordem === 'aulas' ? (d: DisciplinaCfg) => d.aulas : (d: DisciplinaCfg) => d.nome.toLowerCase()
  L.sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.nome.localeCompare(b.nome, 'pt-BR') })
  const porPagina = Math.min(100, Math.max(5, f.porPagina ?? 25))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), Math.max(1, Math.ceil(L.length / porPagina)))
  return { itens: L.slice((pagina - 1) * porPagina, pagina * porPagina), total: L.length, totalGeral: lista.length, pagina, porPagina, migrado, tiposMigrado }
}

/** Resumo JSON (regras + disciplinas) para a aba de exportação — montado no servidor. */
export async function resumoExportacao(svc: SupabaseClient, tenantId: string, valores: ValoresRegras, aulas: number): Promise<string> {
  const { lista } = await listarDisciplinasCfg(svc, tenantId)
  return JSON.stringify({ produto: 'Cronograma Adaptativo', baseVersao: '2.0', regras: valores, disciplinas: lista.map((d) => ({ nome: d.nome, pdflash: d.pdflash, pdfight: d.pdfight, pdfull: d.pdfull, juris: d.juris, legproc: d.legproc, ativa: d.ativa })), materiais: `${aulas} aulas (a lista completa vai no botão Copiar configuração)` }, null, 2)
}

// ───────────────────────────── gerador de cronograma (motor 3.0) ─────────────────────────────

export type GrupoGerador = 'faixas' | 'especial'
export interface ItemGerador { id: string; grupo: GrupoGerador; nome: string; valor: string; descricao: string; origem: 'regra fixa do motor' | 'configurável' }
export interface FiltroGerador { grupo: GrupoGerador; q?: string; origem?: string; ordem?: string; dir?: 'asc' | 'desc'; pagina?: number; porPagina?: number }
export interface PaginaGerador { itens: ItemGerador[]; total: number; pagina: number; porPagina: number; atualizadoEm: string | null }

/** Parâmetros reais do gerador (motor 3.0): faixas de horas, limites e semana especial. Os configuráveis vêm de "Metas & inteligência". */
async function itensGerador(svc: SupabaseClient, tenantId: string): Promise<{ itens: ItemGerador[]; atualizadoEm: string | null }> {
  const c = await lerCfgMetas(svc, tenantId)
  const fixo = 'regra fixa do motor' as const, cfg = 'configurável' as const
  const itens: ItemGerador[] = [
    { id: 'f1', grupo: 'faixas', nome: 'Faixa 1 — até 14h30 por semana', valor: '10h a 14h30', descricao: 'Um PDFull novo por dia de leitura; questões e LegProc só nos dias de revisão; LegProc limitado a 2 por dia.', origem: fixo },
    { id: 'f2', grupo: 'faixas', nome: 'Faixa 2 — de 15h a 24h por semana', valor: '15h a 24h', descricao: 'Questões também no dia de PDF quando há 30 min livres; LegProc limitado a 2 por dia.', origem: fixo },
    { id: 'f3', grupo: 'faixas', nome: 'Faixa 3 — acima de 24h por semana', valor: 'mais de 24h', descricao: 'Segundo PDFull no dia (só após concluir um PDFull regular hoje); questões e LegProc em qualquer dia ativo; LegProc até 4 por dia.', origem: fixo },
    { id: 'f4', grupo: 'faixas', nome: 'Mínimo da rotina do aluno', valor: '2h por dia · 10h por semana', descricao: 'Cada dia de estudo precisa de pelo menos 2h, em intervalos de 30 min, e a semana de pelo menos 10h.', origem: fixo },
    { id: 'f5', grupo: 'faixas', nome: 'Horizonte máximo do plano', valor: `${MAX_SEM} semanas`, descricao: 'Se o plano não couber no horizonte, nada é gravado (sem plano truncado).', origem: fixo },
    { id: 'f6', grupo: 'faixas', nome: 'Dia curto', valor: `${c.diaCurtoMin} min`, descricao: 'Dia com menos tempo de estudo que isto não recebe PDFull (prioriza questões).', origem: cfg },
    { id: 'f7', grupo: 'faixas', nome: 'Ritmo de leitura padrão', valor: `${c.velPadrao} páginas/hora`, descricao: 'Usado quando o aluno pula o teste de leitura.', origem: cfg },
    { id: 'e1', grupo: 'especial', nome: 'Frequência da semana especial', valor: `a cada ${REV_OPCOES_NOVAS.join(', ')} semanas (padrão ${REV_PADRAO})`, descricao: 'Opções de planos novos; 10 e 12 só são preservadas em planos que já existiam.', origem: fixo },
    { id: 'e2', grupo: 'especial', nome: 'Escolha dos temas pelo desempenho', valor: 'abaixo de 50% · 50 a 70% · acima de 70%', descricao: 'Abaixo de 50% volta o PDFull; de 50% a 70% (inclusive) entra o PDFlash; acima de 70% fica de fora.', origem: fixo },
    { id: 'e3', grupo: 'especial', nome: 'Duração da revisão na semana especial', valor: `${c.durRf} min`, descricao: 'Tempo de cada meta de revisão adaptativa.', origem: cfg },
    { id: 'e4', grupo: 'especial', nome: 'Duração das questões na semana especial', valor: `${c.durRq} min`, descricao: 'Tempo de cada meta de questões da semana especial.', origem: cfg },
    { id: 'e5', grupo: 'especial', nome: 'Revisão após o PDFull', valor: `${c.offsetRevisao} sem. de conteúdo`, descricao: 'As semanas especiais não contam nesse intervalo.', origem: cfg },
    { id: 'e6', grupo: 'especial', nome: 'Questões após o PDFull', valor: `${c.offsetQuestoes} sem. de conteúdo`, descricao: 'As semanas especiais não contam nesse intervalo.', origem: cfg },
    { id: 'e7', grupo: 'especial', nome: 'Acerto mínimo para tema prioritário', valor: `${c.acertoMin}%`, descricao: 'Tema com acerto abaixo disto entra primeiro na revisão adaptativa.', origem: cfg },
  ]
  return { itens, atualizadoEm: c.atualizadoEm ?? null }
}

export async function listarGerador(svc: SupabaseClient, tenantId: string, f: FiltroGerador): Promise<PaginaGerador> {
  const { itens, atualizadoEm } = await itensGerador(svc, tenantId)
  const q = (f.q ?? '').trim().toLowerCase(), dir = f.dir === 'desc' ? -1 : 1
  const L = itens.filter((i) => i.grupo === f.grupo && (!q || `${i.nome} ${i.descricao} ${i.valor}`.toLowerCase().includes(q)) &&
    (f.origem === 'fixo' ? i.origem === 'regra fixa do motor' : f.origem === 'cfg' ? i.origem === 'configurável' : true))
  if (f.ordem === 'nome' || f.ordem === 'origem') {
    const chave = (i: ItemGerador) => (f.ordem === 'origem' ? i.origem : i.nome.toLowerCase())
    L.sort((a, b) => { const x = chave(a), y = chave(b); return (x < y ? -1 : x > y ? 1 : 0) * dir })
  }
  const porPagina = Math.min(100, Math.max(5, f.porPagina ?? 25))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), Math.max(1, Math.ceil(L.length / porPagina)))
  return { itens: L.slice((pagina - 1) * porPagina, pagina * porPagina), total: L.length, pagina, porPagina, atualizadoEm }
}

// ───────────────────────────── versões ─────────────────────────────

export interface VersaoCron { id: string; numero: number; nAlteradas: number; aulas: number; criadoEm: string }
export async function listarVersoes(svc: SupabaseClient, tenantId: string, f: { q?: string; ordem?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }): Promise<{ itens: VersaoCron[]; total: number; migrado: boolean }> {
  let qb = svc.from(T_VER).select('id, numero, n_alteradas, aulas, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  const busca = (f.q ?? '').trim()
  if (busca) qb = qb.eq('numero', Math.trunc(Number(busca)) || -1) // busca pelo número da versão
  const col = f.ordem === 'aulas' ? 'aulas' : f.ordem === 'alteradas' ? 'n_alteradas' : f.ordem === 'data' ? 'criado_em' : 'numero'
  const { data, count, error } = await qb.order(col, { ascending: f.ordem ? f.dir !== 'desc' : false }).order('id', { ascending: false }).range((f.pagina - 1) * f.por, f.pagina * f.por - 1)
  if (error) return { itens: [], total: 0, migrado: !TABELA_AUSENTE.test(error.message) }
  return {
    itens: ((data ?? []) as Array<{ id: string; numero: number; n_alteradas: number; aulas: number; criado_em: string }>)
      .map((r) => ({ id: r.id, numero: r.numero, nAlteradas: r.n_alteradas, aulas: r.aulas, criadoEm: r.criado_em })),
    total: count ?? 0, migrado: true,
  }
}
export async function totalVersoes(svc: SupabaseClient, tenantId: string): Promise<number> {
  const { count } = await svc.from(T_VER).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
  return count ?? 0
}

// ───────────────────────────── sprints ─────────────────────────────

export type StatusSprint = 'rascunho' | 'ativo' | 'encerrado'
export interface SprintCron { id: string; nome: string; dias: number; metas: number; status: StatusSprint; observacao: string | null; criadoEm: string }
export async function listarSprints(svc: SupabaseClient, tenantId: string, f: { q?: string; status?: string; ordem?: string; dir?: 'asc' | 'desc'; pagina: number; por: number }): Promise<{ itens: SprintCron[]; total: number; migrado: boolean }> {
  let q = svc.from(T_SPR).select('id, nome, dias, metas, status, observacao, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  if (f.status === 'rascunho' || f.status === 'ativo' || f.status === 'encerrado') q = q.eq('status', f.status)
  const b = (f.q ?? '').trim().replace(/[%_,()]/g, ' ')
  if (b) q = q.ilike('nome', `%${b}%`)
  const { data, count, error } = await q.order(f.ordem === 'nome' ? 'nome' : f.ordem === 'dias' ? 'dias' : f.ordem === 'metas' ? 'metas' : 'criado_em', { ascending: f.ordem ? f.dir !== 'desc' : false }).order('id', { ascending: false }).range((f.pagina - 1) * f.por, f.pagina * f.por - 1)
  if (error) return { itens: [], total: 0, migrado: !TABELA_AUSENTE.test(error.message) }
  return {
    itens: ((data ?? []) as Array<{ id: string; nome: string; dias: number; metas: number; status: StatusSprint; observacao: string | null; criado_em: string }>)
      .map((r) => ({ id: r.id, nome: r.nome, dias: r.dias, metas: r.metas, status: r.status, observacao: r.observacao, criadoEm: r.criado_em })),
    total: count ?? 0, migrado: true,
  }
}

// ───────────────────────────── exportação ─────────────────────────────

/** JSON completo (regras, disciplinas e a lista de aulas/materiais) — contrato para o time de tecnologia (`crExport()` do protótipo). */
export async function exportarConfiguracao(svc: SupabaseClient, tenantId: string): Promise<string> {
  const { valores } = await lerRegras(svc, tenantId)
  const [{ lista }, base] = await Promise.all([listarDisciplinasCfg(svc, tenantId), montarCobertura(svc, tenantId, valores)])
  return JSON.stringify({
    produto: 'Cronograma Adaptativo', baseVersao: '2.0', geradoEm: new Date().toISOString(), regras: valores,
    disciplinas: lista.map((d) => ({ nome: d.nome, pdflash: d.pdflash, pdfight: d.pdfight, pdfull: d.pdfull, juris: d.juris, legproc: d.legproc, ativa: d.ativa })),
    materiais: base.linhas.map((l) => ({ ordem: l.ordem, disciplina: l.disc, aula: l.rotulo, pdfullPaginas: l.pag, pdflashPaginas: l.flashPag, pdflashNoAr: l.temFlash, pdfightPaginas: l.fightPag, pdfightNoAr: l.temFight, questoesFiltro: l.qFiltro, questoesLink: l.qLink, questoesMaterial: l.qDoc, tempoMin: l.tempoMin })),
  }, null, 2)
}

export { crAlteradas }

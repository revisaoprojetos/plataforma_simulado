import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { materialDoItem, MATERIAIS, type Disponibilidade, type TipoRef, type MaterialChave } from './curriculo'
import { parseReferenciaVideoProprio, referenciaVideoProprio } from '@/lib/biblioteca/video-provedor'
import { visibilidadeDeConteudos } from '@/lib/segmentos/visibilidade'
import { regrasSegmentoDoAluno } from '@/lib/segmentos/regras-produto'
import { liberacaoAulasDoAluno, ehSentinelaMeta, ehSentinelaBloqueio, MSG_AGUARDA_META, MSG_BLOQUEADO_ADMIN } from './liberacao-aulas-aluno'
import { ContextoAluno } from '@/lib/segmentos/avaliar'
import { resumoCronogramaDoAluno, type ResumoCronograma } from './resumo-cronograma'

/**
 * CURRÍCULO do produto visto pelo ALUNO — os módulos/submódulos e as aulas montados no configurador
 * do Estúdio (simulado_produto_modulos / simulado_produto_modulo_itens). Antes NENHUMA tela do aluno lia
 * essas tabelas: o configurador salvava, mas o extensivo do aluno só mostrava "Acessos incluídos".
 *
 * Regras:
 *  - só aulas com situacao='ativo' e não deletadas (rascunho não aparece);
 *  - DISPONIBILIDADE (do módulo e da aula — vale a mais tardia): antes de liberar a aula aparece com
 *    cadeado e a data, ou some (antes='oculto'). Base = data de matrícula do aluno NO PRODUTO.
 *  - SEGMENTOS (aba Visibilidade do produto): módulo/aula fora do segmento some ou aparece com cadeado
 *    (`exclusivo`), e o bloqueio de um módulo vale para tudo dentro dele;
 *  - o acesso ao PRODUTO é checado por quem chama (getExtensivoDoAluno / acessoAoProduto).
 */

export interface AulaAluno {
  id: string
  titulo: string
  subtipo: string | null
  tipoRef: TipoRef
  href: string | null       // null = sem destino (ex.: link vazio)
  externo: boolean          // abre em nova aba (vídeo/link)
  liberada: boolean
  liberaEm: string | null   // ISO, quando ainda bloqueada
  bloqueioMsg?: string | null // bloqueada sem data (ex.: aguarda concluir a meta no cronograma do aluno)
  liberaRotulo?: string | null // rótulo do cadeado conforme o cronograma ("Libera em seg., 16/11/2026 · semana 3 …"); null = usar liberaEm/bloqueioMsg
  lida: boolean             // documento já aberto pelo aluno (simulado_conteudo_leitura_progresso)
  exclusivo: boolean        // bloqueada por segmento (conteúdo exclusivo de outro público)
  quizDocId?: string | null // JurisClub: documento-âncora das questões da meta (meta.quiz_documento_id)
  material?: MaterialChave  // tipo de material (agrupamento da página do módulo) — derivado no servidor
  cronograma?: ResumoCronograma | null // item 'cronograma': resumo curto do plano do aluno (lido no servidor)
  /** Progresso de leitura (null = nunca abriu). Campos novos podem vir null se a migração ainda não foi aplicada. */
  leitura?: LeituraAluno | null
  /** Mesmo progresso já FORMATADO no servidor (a tela só renderiza). null = nada a mostrar. */
  leituraFmt?: LeituraFmt | null
}
export interface LeituraAluno { pagina: number | null; totalPaginas: number | null; pct: number | null; ultimoAcessoEm: string | null; concluidoEm: string | null }
export interface LeituraFmt { onde: string | null; pct: number | null; ultimo: string | null; concluida: string | null }
export interface ModuloAluno {
  id: string
  titulo: string
  descricao: string | null
  imagemUrl: string | null
  ocultarTitulo?: boolean   // capa já traz o texto: não sobrepor o título
  aberto: boolean           // exibicao 'aberto' | 'recolhido'
  liberado: boolean
  liberaEm: string | null
  bloqueioMsg?: string | null // bloqueado sem data (aguarda meta do cronograma)
  liberaRotulo?: string | null // idem AulaAluno.liberaRotulo
  exclusivo: boolean        // bloqueado por segmento
  aulas: AulaAluno[]
  submodulos: ModuloAluno[]
}

/** Grupo de aulas de um MÓDULO por tipo de material, com progresso JÁ calculado (a tela só renderiza). */
export interface GrupoMaterial {
  chave: MaterialChave; label: string; curto: string
  total: number; lidas: number; pct: number
  liberadas: number          // aulas abertas (não bloqueadas)
  liberaEm: string | null    // se NADA está aberto: a data mais próxima de liberação (ISO); senão null
  aulas: AulaAluno[]
}
export interface ModuloAgrupado { grupos: GrupoMaterial[]; cronogramas: AulaAluno[]; total: number; lidas: number; pct: number }

/** Agrupa TODAS as aulas do módulo (incluindo submódulos) por tipo de material; cronograma sai à parte. Ordem fixa de MATERIAIS. */
export function agruparModulo(m: ModuloAluno): ModuloAgrupado {
  const todas: AulaAluno[] = []
  const coleta = (x: ModuloAluno) => { todas.push(...x.aulas); x.submodulos.forEach(coleta) }
  coleta(m)
  const cronogramas = todas.filter((a) => a.tipoRef === 'cronograma')
  const mapa = new Map<MaterialChave, AulaAluno[]>()
  for (const a of todas) {
    if (a.tipoRef === 'cronograma') continue
    const k = a.material ?? 'outros'
    const l = mapa.get(k) ?? []; l.push(a); mapa.set(k, l)
  }
  const grupos: GrupoMaterial[] = []
  for (const d of MATERIAIS) {
    const aulas = mapa.get(d.v); if (!aulas?.length) continue
    const lidas = aulas.filter((x) => x.lida).length
    grupos.push({ chave: d.v, label: d.label, curto: d.curto, total: aulas.length, lidas, pct: Math.round((lidas / aulas.length) * 100), liberadas: aulas.filter((x) => x.liberada).length, liberaEm: aulas.some((x) => x.liberada) ? null : (aulas.map((x) => x.liberaEm).filter(Boolean).sort()[0] ?? null), aulas })
  }
  const total = grupos.reduce((s, g) => s + g.total, 0), lidas = grupos.reduce((s, g) => s + g.lidas, 0)
  return { grupos, cronogramas, total, lidas, pct: total ? Math.round((lidas / total) * 100) : 0 }
}

/** Submódulo (ou módulo) SEM as aulas, com o progresso já calculado — o client só renderiza o card/linha. */
export interface SubmoduloResumo { m: ModuloAluno; total: number; lidas: number; pct: number; filhos: number }

export function resumirSubmodulos(m: ModuloAluno): SubmoduloResumo[] {
  return m.submodulos.map((s) => {
    const a = agruparModulo(s)
    return { m: { ...s, aulas: [], submodulos: [] }, total: a.total, lidas: a.lidas, pct: a.pct, filhos: s.submodulos.length }
  })
}

/** Localiza um módulo em qualquer nível da árvore, devolvendo o pai (null = módulo de topo) e os irmãos do mesmo nível. */
export function localizarModulo(raiz: ModuloAluno[], id: string): { atual: ModuloAluno; pai: ModuloAluno | null; irmaos: ModuloAluno[] } | null {
  const rec = (lista: ModuloAluno[], pai: ModuloAluno | null): { atual: ModuloAluno; pai: ModuloAluno | null; irmaos: ModuloAluno[] } | null => {
    for (const x of lista) {
      if (x.id === id) return { atual: x, pai, irmaos: lista }
      const r = rec(x.submodulos, x); if (r) return r
    }
    return null
  }
  return rec(raiz, null)
}

export interface AchadoSubmodulo { id: string; titulo: string; aulas: AulaAluno[] }

/** Busca por título nas aulas DENTRO dos submódulos (servidor; resultado agrupado pelo submódulo de origem e limitado). */
export function buscarAulasEmSubmodulos(m: ModuloAluno, termo: string, limite = 60): AchadoSubmodulo[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = fold(termo.trim()); if (!q) return []
  const out: AchadoSubmodulo[] = []
  let n = 0
  const rec = (x: ModuloAluno) => {
    if (n >= limite) return
    const aulas = x.aulas.filter((a) => a.tipoRef !== 'cronograma' && fold(a.titulo).includes(q)).slice(0, limite - n)
    if (aulas.length) { out.push({ id: x.id, titulo: x.titulo, aulas }); n += aulas.length }
    x.submodulos.forEach(rec)
  }
  m.submodulos.forEach(rec)
  return out
}

const DIA = 86400000

/** dd/mm (dd/mm/aaaa se o ano difere do atual), em America/Sao_Paulo. */
function dataCurta(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso); if (isNaN(+d)) return null
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(d)
  const ano = f({ year: 'numeric' }), anoAgora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date())
  return ano === anoAgora ? f({ day: '2-digit', month: '2-digit' }) : f({ day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatarLeitura(l: LeituraAluno | null): LeituraFmt | null {
  if (!l) return null
  const pct = l.pct != null ? Math.max(0, Math.min(100, Math.round(l.pct))) : null
  const onde = l.pagina != null && l.pagina > 0
    ? (l.totalPaginas ? `Parou na folha ${l.pagina} de ${l.totalPaginas}` : `Parou na folha ${l.pagina}`)
    : pct != null ? `Progresso ${pct}%` : null
  const f = { onde, pct, ultimo: dataCurta(l.ultimoAcessoEm), concluida: dataCurta(l.concluidoEm) }
  return f.onde || f.ultimo || f.concluida ? f : null
}

export function normDisp(v: any): Disponibilidade {
  const d = v && typeof v === 'object' ? v : {}
  return {
    tipo: d.tipo ?? 'na_matricula', data: d.data ?? null, dias: d.dias ?? null,
    diaSemana: d.diaSemana ?? null, antes: d.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado',
  }
}

/** Momento em que a disponibilidade libera, dada a matrícula. null = sem restrição (já liberado). */
export function momentoLiberacao(d: Disponibilidade, matricula: Date | null): Date | null {
  // Sem data de matrícula conhecida (ex.: membro antigo de grupo sem criado_em) os intervalos contam
  // como cumpridos — o aluno já está no produto há tempo indeterminado.
  const base = matricula ?? new Date(0)
  const mais = (dias: number | null | undefined) => new Date(base.getTime() + Math.max(0, Number(dias) || 0) * DIA)
  const data = d.data ? new Date(d.data) : null
  switch (d.tipo) {
    case 'data': return data && !isNaN(+data) ? data : null
    case 'intervalo': return mais(d.dias)
    case 'data_e_intervalo': {
      const a = mais(d.dias)
      return data && !isNaN(+data) && data > a ? data : a
    }
    case 'dia_semana_e_intervalo': {
      const a = mais(d.dias)
      const alvo = Math.min(6, Math.max(0, Number(d.diaSemana ?? 1)))
      const r = new Date(a)
      while (r.getDay() !== alvo) r.setTime(r.getTime() + DIA)
      r.setHours(0, 0, 0, 0)
      return r
    }
    default: return null
  }
}

function hrefDaAula(tipo: TipoRef, refId: string | null, refUrl: string | null, meta: any, voltar: string, produtoId?: string): { href: string | null; externo: boolean } {
  if (tipo === 'documento_biblioteca') return refId ? { href: `/aluno/biblioteca/${refId}?voltar=${encodeURIComponent(voltar)}${produtoId ? `&produto=${produtoId}` : ''}`, externo: false } : { href: null, externo: false }
  if (tipo === 'simulado' || tipo === 'quiz') return { href: '/aluno/simulados', externo: false }
  if (tipo === 'cronograma') return { href: '/aluno/cronograma', externo: false }
  // Vídeo próprio (hospedado): `video-proprio:<courseId>:<lessonId>` abre o player interno, na mesma aba.
  const propria = parseReferenciaVideoProprio(refUrl ?? '')
  if (propria) return { href: `/aluno/video/${propria.courseId}/${propria.lessonId}`, externo: false }
  const url = String(refUrl || meta?.embedUrl || '').trim()
  return /^https?:\/\//i.test(url) ? { href: url, externo: true } : { href: null, externo: false }
}

/**
 * Data de matrícula do aluno no produto: a mais ANTIGA entre a assinatura (inicio_em ?? criado_em) e a
 * entrada nos grupos vinculados ao produto (criado_em). null se nenhuma fonte tiver data.
 */
export async function matriculaNoProduto(svc: any, tenantId: string, estudanteId: string, produtoId: string): Promise<Date | null> {
  const datas: number[] = []
  const { data: ass } = await svc.from('simulado_assinaturas').select('inicio_em, criado_em')
    .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).eq('produto_id', produtoId).eq('status', 'ativo')
  for (const a of (ass ?? []) as any[]) { const t = Date.parse(a.inicio_em ?? a.criado_em ?? ''); if (!isNaN(t)) datas.push(t) }
  const { data: its } = await svc.from('simulado_produto_itens').select('item_id')
    .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').eq('ativo', true)
  const grupos = ((its ?? []) as any[]).map((i) => i.item_id)
  if (grupos.length) {
    const { data: gm } = await svc.from('simulado_grupo_membros').select('criado_em')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId).in('grupo_id', grupos)
    for (const m of (gm ?? []) as any[]) { const t = Date.parse(m.criado_em ?? ''); if (!isNaN(t)) datas.push(t) }
  }
  return datas.length ? new Date(Math.min(...datas)) : null
}

/** Árvore do currículo (módulo → submódulos → aulas) pronta para o aluno. */
/** `voltar` = para onde o "Voltar" do leitor retorna; função → recebe o id do módulo RAIZ da aula (página do módulo). */
export async function curriculoDoAluno(svc: any, tenantId: string, estudanteId: string, produtoId: string, voltar: string | ((moduloRaizId: string) => string)): Promise<ModuloAluno[]> {
  const [mrows, irows, matricula] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_produto_modulos')
      .select('*') // '*': tolerante à coluna ocultar_titulo ainda não migrada
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false)
      .order('ordem', { ascending: true }).order('id', { ascending: true }), 1000, 'aluno:produto_modulos').catch(() => [] as any[]),
    fetchAll<any>(() => svc.from('simulado_produto_modulo_itens')
      .select('id, modulo_id, ordem, tipo_ref, subtipo, ref_id, ref_url, titulo, situacao, meta, disponibilidade')
      .eq('tenant_id', tenantId).eq('produto_id', produtoId).eq('deletado', false).eq('situacao', 'ativo')
      .order('ordem', { ascending: true }).order('id', { ascending: true }), 1000, 'aluno:produto_itens').catch(() => [] as any[]),
    matriculaNoProduto(svc, tenantId, estudanteId, produtoId).catch(() => null),
  ])
  const visivel = await visibilidadeDeConteudos(svc, tenantId, estudanteId, produtoId).catch(() => (() => 'visivel' as const))
  // Liberação e capa POR SEGMENTO (migração 20261115010000): o aluno do segmento recebe a disponibilidade/capa própria do módulo/aula.
  const ctxAluno = new ContextoAluno(svc, tenantId, estudanteId) // compartilhado: segmentos das regras, das trilhas e grupos das exceções
  const porSegBase = await regrasSegmentoDoAluno(svc, tenantId, estudanteId, produtoId, ctxAluno).catch(() => null)
  // Disponibilidade tipo 'cronograma' (planilha + cronograma fixado): null = nenhuma regra → nada muda.
  const libAulas = await liberacaoAulasDoAluno(svc, tenantId, estudanteId, produtoId, { porSeg: porSegBase, modulos: mrows, itens: irows, ctxAluno }).catch(() => null)
  const porSeg = libAulas && porSegBase ? { ...porSegBase, disp: libAulas.disp } : libAulas ? { capa: () => null, disp: libAulas.disp } : porSegBase
  // Aulas-documento que o aluno já abriu (histórico de leitura) → marca de "lida" e progresso por módulo.
  const docIds = [...new Set(irows.filter((i: any) => i.tipo_ref === 'documento_biblioteca' && i.ref_id).map((i: any) => i.ref_id as string))]
  // Documentos que NÃO abrem para ninguém (rascunho / sem versão publicada / apagados): a aula aparece "Em preparação" em vez de um link morto.
  const emPreparo = new Set<string>()
  try {
    const achados = new Set<string>()
    const blocos: string[][] = []; for (let k = 0; k < docIds.length; k += 80) blocos.push(docIds.slice(k, k + 80))
    const rs = await Promise.all(blocos.map((b) => svc.from('simulado_conteudo_documentos').select('id, status, versao_atual_id, deletado').eq('tenant_id', tenantId).in('id', b)))
    for (const r of rs) for (const d of (r.data ?? []) as any[]) { achados.add(d.id); if (d.deletado || !d.versao_atual_id || d.status !== 'publicado') emPreparo.add(d.id) }
    if (rs.every((r) => !r.error)) for (const id of docIds) if (!achados.has(id)) emPreparo.add(id) // documento inexistente
  } catch { /* sem a checagem: comportamento anterior */ }
  const lidos = new Map<string, LeituraAluno>()
  let colunasNovas = true // tolerância à migração ausente (pagina/total_paginas/pct/concluido_em)
  for (let k = 0; k < docIds.length; k += 80) {
    const bloco = docIds.slice(k, k + 80)
    const consulta = (cols: string) => svc.from('simulado_conteudo_leitura_progresso').select(cols)
      .eq('tenant_id', tenantId).eq('aluno_id', estudanteId).in('documento_id', bloco)
    let res = await consulta(colunasNovas ? 'documento_id, ultima_leitura_em, pagina, total_paginas, pct, concluido_em' : 'documento_id, ultima_leitura_em')
    if (res.error && colunasNovas) { colunasNovas = false; res = await consulta('documento_id, ultima_leitura_em') }
    for (const r of (res.data ?? []) as any[]) {
      lidos.set(r.documento_id, {
        pagina: r.pagina ?? null, totalPaginas: r.total_paginas ?? null, pct: r.pct ?? null,
        ultimoAcessoEm: r.ultima_leitura_em ?? null, concluidoEm: r.concluido_em ?? null,
      })
    }
  }
  // Total de páginas ausente: usa a contagem da versão atual do documento (tolerante).
  const semTotal = [...lidos.entries()].filter(([, l]) => l.pagina != null && !l.totalPaginas).map(([id]) => id)
  if (semTotal.length) {
    try {
      for (let k = 0; k < semTotal.length; k += 80) {
        const { data: docs } = await svc.from('simulado_conteudo_documentos').select('id, versao_atual_id').eq('tenant_id', tenantId).in('id', semTotal.slice(k, k + 80))
        const vids = [...new Set(((docs ?? []) as any[]).map((d) => d.versao_atual_id).filter(Boolean))] as string[]
        if (!vids.length) continue
        const { data: vers } = await svc.from('simulado_conteudo_versoes').select('id, paginas').in('id', vids)
        const pg = new Map(((vers ?? []) as any[]).map((v) => [v.id, v.paginas as number | null]))
        for (const d of (docs ?? []) as any[]) { const n = pg.get(d.versao_atual_id); const l = lidos.get(d.id); if (l && n && n > 0) l.totalPaginas = n }
      }
    } catch { /* sem contagem: mostra só a folha */ }
  }
  // Item 'cronograma': resumo lido UMA vez (snapshot do painel / última emissão) — só se houver o item.
  const itensCrono = irows.filter((i: any) => i.tipo_ref === 'cronograma')
  const resumoCrono = itensCrono.length
    ? await resumoCronogramaDoAluno(svc, tenantId, estudanteId, [...new Set(itensCrono.map((i: any) => i.ref_id as string | null).filter(Boolean) as string[])]).catch(() => null)
    : null
  const agora = Date.now()
  const maisTarde = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b)

  const aulasPorModulo = new Map<string, any[]>()
  for (const i of irows) { const l = aulasPorModulo.get(i.modulo_id) ?? []; l.push(i); aulasPorModulo.set(i.modulo_id, l) }
  const filhos = new Map<string | null, any[]>()
  const ids = new Set(mrows.map((m: any) => m.id))
  for (const m of mrows) { const pai = m.pai_id && ids.has(m.pai_id) ? m.pai_id : null; const l = filhos.get(pai) ?? []; l.push(m); filhos.set(pai, l) }

  // herdado = liberação do(s) módulo(s) acima: uma aula nunca libera antes do módulo que a contém.
  // segHerdado = módulo acima bloqueado por segmento (cadeado) → tudo dentro fica bloqueado.
  const montar = (m: any, herdado: Date | null, raizId: string, segHerdado: boolean): ModuloAluno | null => {
    const volta = typeof voltar === 'function' ? voltar(raizId) : voltar
    const segM = visivel(m.id)
    if (segM === 'oculto') return null
    const exclusivoM = segHerdado || segM === 'cadeado'
    const dm = normDisp(porSeg ? porSeg.disp(m.id, m.disponibilidade) : m.disponibilidade)
    const capaSeg = porSeg?.capa('modulo', m.id) ?? null
    const libM = maisTarde(herdado, momentoLiberacao(dm, matricula))
    const modLiberado = !libM || +libM <= agora
    const rotuloM = !modLiberado ? libAulas?.rotulo(m.id, m.disponibilidade) ?? null : null // família da aula: mesmo rótulo p/ módulo e itens
    const msgM = !modLiberado ? (ehSentinelaMeta(libM) ? MSG_AGUARDA_META : ehSentinelaBloqueio(libM) ? MSG_BLOQUEADO_ADMIN : null) : null
    if (!modLiberado && dm.antes === 'oculto') return null
    const aulas: AulaAluno[] = []
    // FAMÍLIA DA AULA: os materiais da mesma aula (PDFull, PDFlash, LegProc…) seguem a MESMA liberação. Item sem data
    // própria (na matrícula) herda a mais tardia das datas dos irmãos; data explícita no próprio item é respeitada.
    const irmaos = aulasPorModulo.get(m.id) ?? []
    const dispItem = (i: any) => normDisp(porSeg ? porSeg.disp(i.id, i.disponibilidade) : i.disponibilidade)
    const libFamilia = irmaos.reduce<Date | null>((acc, i) => maisTarde(acc, momentoLiberacao(dispItem(i), matricula)), null)
    for (const i of irmaos) {
      const segA = visivel(i.id)
      if (segA === 'oculto') continue
      const exclusivo = exclusivoM || segA === 'cadeado'
      const di = normDisp(porSeg ? porSeg.disp(i.id, i.disponibilidade) : i.disponibilidade)
      const libProprio = momentoLiberacao(di, matricula)
      const lib = maisTarde(libM, libProprio ?? libFamilia)
      const noPrazo = !lib || +lib <= agora
      const msgA = !noPrazo ? (ehSentinelaMeta(lib) ? MSG_AGUARDA_META : ehSentinelaBloqueio(lib) ? MSG_BLOQUEADO_ADMIN : null) : null
      if (!noPrazo && (di.antes === 'oculto' || dm.antes === 'oculto')) continue
      const tipo = (i.tipo_ref ?? 'link') as TipoRef
      const indisponivel = tipo === 'documento_biblioteca' && !!i.ref_id && emPreparo.has(i.ref_id)
      const liberada = noPrazo && !exclusivo && !indisponivel
      const { href, externo } = hrefDaAula(tipo, i.ref_id ?? null, i.ref_url ?? null, i.meta, volta, produtoId)
      aulas.push({ id: i.id, titulo: i.titulo, subtipo: i.subtipo ?? null, tipoRef: tipo, href: liberada ? href : null, externo, liberada, liberaEm: noPrazo || !lib || msgA ? null : lib.toISOString(), bloqueioMsg: msgA ?? (indisponivel && noPrazo && !exclusivo ? 'Em preparação — será publicado em breve' : null), liberaRotulo: !noPrazo && !(!!i.ref_id && lidos.has(i.ref_id)) ? rotuloM : null, lida: !!i.ref_id && lidos.has(i.ref_id), leitura: (i.ref_id && lidos.get(i.ref_id)) || null, leituraFmt: formatarLeitura((i.ref_id && lidos.get(i.ref_id)) || null), exclusivo, material: materialDoItem(i.subtipo, tipo, String(i.titulo ?? '')), quizDocId: typeof i.meta?.quiz_documento_id === 'string' ? i.meta.quiz_documento_id : null, cronograma: tipo === 'cronograma' && liberada ? resumoCrono : null })
    }
    const submodulos = (filhos.get(m.id) ?? []).map((s) => montar(s, libM, raizId, exclusivoM)).filter(Boolean) as ModuloAluno[]
    if (!aulas.length && !submodulos.length) return null // módulo vazio para o aluno: não mostra
    return {
      id: m.id, titulo: capaSeg?.titulo ?? m.titulo, descricao: capaSeg?.descricao ?? m.descricao ?? null, imagemUrl: capaSeg?.imagem_url ?? m.imagem_url ?? null,
      ocultarTitulo: capaSeg ? (!!capaSeg.imagem_url && capaSeg.ocultar_titulo) || (!capaSeg.imagem_url && !!m.ocultar_titulo && !!m.imagem_url) : !!m.ocultar_titulo && !!m.imagem_url,
      aberto: m.exibicao !== 'recolhido', liberado: modLiberado && !exclusivoM, liberaEm: modLiberado || !libM || msgM ? null : libM.toISOString(), bloqueioMsg: msgM, liberaRotulo: rotuloM,
      exclusivo: exclusivoM, aulas, submodulos,
    }
  }
  return (filhos.get(null) ?? []).map((m) => montar(m, null, m.id, false)).filter(Boolean) as ModuloAluno[]
}

/**
 * O documento está numa AULA (ativa e já liberada) do currículo de algum produto a que o aluno tem
 * acesso? Usado pelo leitor: um material colocado SÓ no extensivo (fora das pastas liberadas ao aluno)
 * abria 404 ao clicar na aula. `temAcesso` é o gate de produto (assinatura ativa ou grupo vinculado).
 */
export async function docLiberadoPorProduto(
  svc: any, tenantId: string, estudanteId: string, documentoId: string,
  temAcesso: (produtoId: string) => Promise<boolean>,
): Promise<boolean> {
  const { data: itens } = await svc.from('simulado_produto_modulo_itens')
    .select('id, produto_id, modulo_id, disponibilidade')
    .eq('tenant_id', tenantId).eq('ref_id', documentoId).eq('tipo_ref', 'documento_biblioteca')
    .eq('deletado', false).eq('situacao', 'ativo').limit(50)
  return itensLiberadosPorProduto(svc, tenantId, estudanteId, (itens ?? []) as any[], temAcesso)
}

/**
 * A aula de vídeo próprio `video-proprio:<courseId>:<lessonId>` está num item ATIVO e já liberado do currículo
 * de algum produto a que o aluno tem acesso? Mesma regra de `docLiberadoPorProduto` (reuso exato do núcleo).
 * Uma consulta indexada por (tenant, ref_url) + checagens por produto. Limite: só cobre aulas colocadas no
 * currículo de produtos (não cobre vídeos dentro de documentos da Biblioteca).
 */
export async function videoLiberadoPorProduto(
  svc: any, tenantId: string, estudanteId: string, courseId: string, lessonId: string,
  temAcesso: (produtoId: string) => Promise<boolean>,
): Promise<boolean> {
  const { data: itens } = await svc.from('simulado_produto_modulo_itens')
    .select('id, produto_id, modulo_id, disponibilidade')
    .eq('tenant_id', tenantId).eq('ref_url', referenciaVideoProprio(courseId, lessonId))
    .eq('deletado', false).eq('situacao', 'ativo').limit(50)
  return itensLiberadosPorProduto(svc, tenantId, estudanteId, (itens ?? []) as any[], temAcesso)
}

/** Núcleo compartilhado: algum dos itens (aulas) está liberado ao aluno via produto (acesso + segmentos + disponibilidade)? */
async function itensLiberadosPorProduto(
  svc: any, tenantId: string, estudanteId: string, lista: any[],
  temAcesso: (produtoId: string) => Promise<boolean>,
): Promise<boolean> {
  if (!lista.length) return false
  for (const produtoId of [...new Set(lista.map((i) => i.produto_id as string))]) {
    const { data: prod } = await svc.from('simulado_produtos').select('id').eq('tenant_id', tenantId).eq('id', produtoId).eq('ativo', true).maybeSingle()
    if (!prod || !(await temAcesso(produtoId))) continue
    // Disponibilidade: a aula (e o módulo dela) precisam já estar liberados para este aluno.
    const matricula = await matriculaNoProduto(svc, tenantId, estudanteId, produtoId).catch(() => null)
    // Segmentos: a aula, o módulo e o módulo pai precisam estar visíveis (nem oculto nem cadeado).
    const visivel = await visibilidadeDeConteudos(svc, tenantId, estudanteId, produtoId).catch(() => (() => 'visivel' as const))
    const porSeg = await regrasSegmentoDoAluno(svc, tenantId, estudanteId, produtoId).catch(() => null)
    const doProduto = lista.filter((i) => i.produto_id === produtoId)
    const libAulas = await liberacaoAulasDoAluno(svc, tenantId, estudanteId, produtoId, { porSeg, itens: doProduto }).catch(() => null)
    const dEf = (id: string, base: unknown) => (libAulas ? libAulas.disp(id, base) : porSeg ? porSeg.disp(id, base) : base)
    for (const it of doProduto) {
      if (visivel(it.id) !== 'visivel' || visivel(it.modulo_id) !== 'visivel') continue
      const { data: mod } = await svc.from('simulado_produto_modulos').select('disponibilidade, pai_id, deletado').eq('tenant_id', tenantId).eq('id', it.modulo_id).maybeSingle()
      if (!mod || (mod as any).deletado) continue
      let lib = momentoLiberacao(normDisp(dEf(it.id, it.disponibilidade)), matricula)
      if (!lib) { // sem data própria: herda a mais tardia dos materiais irmãos da mesma aula (PDFull/PDFlash/LegProc…)
        const { data: irm } = await svc.from('simulado_produto_modulo_itens').select('id, disponibilidade').eq('tenant_id', tenantId).eq('modulo_id', it.modulo_id).eq('deletado', false).eq('situacao', 'ativo').limit(50)
        for (const x of (irm ?? []) as any[]) { const lx = momentoLiberacao(normDisp(dEf(x.id, x.disponibilidade)), matricula); if (lx && (!lib || lx > lib)) lib = lx }
      }
      const lm = momentoLiberacao(normDisp(dEf(it.modulo_id, (mod as any).disponibilidade)), matricula)
      if (lm && (!lib || lm > lib)) lib = lm
      if ((mod as any).pai_id) {
        const { data: pai } = await svc.from('simulado_produto_modulos').select('disponibilidade, deletado').eq('tenant_id', tenantId).eq('id', (mod as any).pai_id).maybeSingle()
        if (pai && (pai as any).deletado) continue
        if (visivel((mod as any).pai_id) !== 'visivel') continue
        const lp = pai ? momentoLiberacao(normDisp(dEf((mod as any).pai_id, (pai as any).disponibilidade)), matricula) : null
        if (lp && (!lib || lp > lib)) lib = lp
      }
      if (!lib || +lib <= Date.now()) return true
    }
  }
  return false
}

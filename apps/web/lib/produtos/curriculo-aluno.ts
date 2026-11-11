import 'server-only'
import { fetchAll } from '@/lib/supabase/fetch-all'
import type { Disponibilidade, TipoRef } from './curriculo'
import { parseReferenciaVideoProprio, referenciaVideoProprio } from '@/lib/biblioteca/video-provedor'
import { visibilidadeDeConteudos } from '@/lib/segmentos/visibilidade'

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
  lida: boolean             // documento já aberto pelo aluno (simulado_conteudo_leitura_progresso)
  exclusivo: boolean        // bloqueada por segmento (conteúdo exclusivo de outro público)
  quizDocId?: string | null // JurisClub: documento-âncora das questões da meta (meta.quiz_documento_id)
}
export interface ModuloAluno {
  id: string
  titulo: string
  descricao: string | null
  imagemUrl: string | null
  ocultarTitulo?: boolean   // capa já traz o texto: não sobrepor o título
  aberto: boolean           // exibicao 'aberto' | 'recolhido'
  liberado: boolean
  liberaEm: string | null
  exclusivo: boolean        // bloqueado por segmento
  aulas: AulaAluno[]
  submodulos: ModuloAluno[]
}

const DIA = 86400000

function normDisp(v: any): Disponibilidade {
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
  // Aulas-documento que o aluno já abriu (histórico de leitura) → marca de "lida" e progresso por módulo.
  const docIds = [...new Set(irows.filter((i: any) => i.tipo_ref === 'documento_biblioteca' && i.ref_id).map((i: any) => i.ref_id as string))]
  const lidos = new Set<string>()
  for (let k = 0; k < docIds.length; k += 200) {
    const { data } = await svc.from('simulado_conteudo_leitura_progresso').select('documento_id')
      .eq('tenant_id', tenantId).eq('aluno_id', estudanteId).in('documento_id', docIds.slice(k, k + 200))
    for (const r of (data ?? []) as any[]) lidos.add(r.documento_id)
  }
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
    const dm = normDisp(m.disponibilidade)
    const libM = maisTarde(herdado, momentoLiberacao(dm, matricula))
    const modLiberado = !libM || +libM <= agora
    if (!modLiberado && dm.antes === 'oculto') return null
    const aulas: AulaAluno[] = []
    for (const i of aulasPorModulo.get(m.id) ?? []) {
      const segA = visivel(i.id)
      if (segA === 'oculto') continue
      const exclusivo = exclusivoM || segA === 'cadeado'
      const di = normDisp(i.disponibilidade)
      const lib = maisTarde(libM, momentoLiberacao(di, matricula))
      const noPrazo = !lib || +lib <= agora
      if (!noPrazo && (di.antes === 'oculto' || dm.antes === 'oculto')) continue
      const liberada = noPrazo && !exclusivo
      const tipo = (i.tipo_ref ?? 'link') as TipoRef
      const { href, externo } = hrefDaAula(tipo, i.ref_id ?? null, i.ref_url ?? null, i.meta, volta, produtoId)
      aulas.push({ id: i.id, titulo: i.titulo, subtipo: i.subtipo ?? null, tipoRef: tipo, href: liberada ? href : null, externo, liberada, liberaEm: noPrazo || !lib ? null : lib.toISOString(), lida: !!i.ref_id && lidos.has(i.ref_id), exclusivo, quizDocId: typeof i.meta?.quiz_documento_id === 'string' ? i.meta.quiz_documento_id : null })
    }
    const submodulos = (filhos.get(m.id) ?? []).map((s) => montar(s, libM, raizId, exclusivoM)).filter(Boolean) as ModuloAluno[]
    if (!aulas.length && !submodulos.length) return null // módulo vazio para o aluno: não mostra
    return {
      id: m.id, titulo: m.titulo, descricao: m.descricao ?? null, imagemUrl: m.imagem_url ?? null, ocultarTitulo: !!m.ocultar_titulo && !!m.imagem_url,
      aberto: m.exibicao !== 'recolhido', liberado: modLiberado && !exclusivoM, liberaEm: modLiberado || !libM ? null : libM.toISOString(),
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
    for (const it of lista.filter((i) => i.produto_id === produtoId)) {
      if (visivel(it.id) !== 'visivel' || visivel(it.modulo_id) !== 'visivel') continue
      const { data: mod } = await svc.from('simulado_produto_modulos').select('disponibilidade, pai_id, deletado').eq('tenant_id', tenantId).eq('id', it.modulo_id).maybeSingle()
      if (!mod || (mod as any).deletado) continue
      let lib = momentoLiberacao(normDisp(it.disponibilidade), matricula)
      const lm = momentoLiberacao(normDisp((mod as any).disponibilidade), matricula)
      if (lm && (!lib || lm > lib)) lib = lm
      if ((mod as any).pai_id) {
        const { data: pai } = await svc.from('simulado_produto_modulos').select('disponibilidade, deletado').eq('tenant_id', tenantId).eq('id', (mod as any).pai_id).maybeSingle()
        if (pai && (pai as any).deletado) continue
        if (visivel((mod as any).pai_id) !== 'visivel') continue
        const lp = pai ? momentoLiberacao(normDisp((pai as any).disponibilidade), matricula) : null
        if (lp && (!lib || lp > lib)) lib = lp
      }
      if (!lib || +lib <= Date.now()) return true
    }
  }
  return false
}

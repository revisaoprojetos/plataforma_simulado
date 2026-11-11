import 'server-only'
import type { VitrineAluno, VitrineSecao } from './aluno'
import type { ModuloAluno } from './curriculo-aluno'
import { resumoCronogramaDoAluno, type ResumoCronograma } from './resumo-cronograma'
import {
  completarBlocos, configModulosImplicita, normConfigCronograma, normConfigModulos, formatoParaLayout, type ConfigCronograma,
  TITULO_MODULOS_PADRAO, TITULO_OUTROS_PADRAO, type LinhaBloco,
} from './blocos-pagina'
import type { VitrineLayout } from './tipos'

/**
 * PÁGINA do extensivo montada NO SERVIDOR: lista ordenada de blocos prontos (a tela só renderiza).
 *  progresso → card "Seu progresso / Continuar";  cronograma → "Plano de estudo" (resumo lido 1x, reusa resumo-cronograma);
 *  modulos → prateleira (agrupamento por seção SEM N+1: o currículo já vem com visibilidade/disponibilidade/progresso);
 *  vitrine → banner/carrossel de itens (como antes).
 * Módulo sem seção cai na seção "restantes" (ou em "Outros módulos") — nenhum módulo some.
 */
export type BlocoAluno =
  | { kind: 'progresso'; key: string }
  | { kind: 'modulos'; key: string; titulo: string; layout: VitrineLayout; agruparPrefixo: boolean; recolhivel: boolean; recolhida: boolean; implicita: boolean; modulos: ModuloAluno[] }
  | { kind: 'cronograma'; key: string; cfg: ConfigCronograma; resumo: ResumoCronograma | null }
  | { kind: 'vitrine'; key: string; secao: VitrineSecao }

export async function montarPaginaExtensivo(
  svc: any, o: {
    tenantId: string; estudanteId: string; vit: Pick<VitrineAluno, 'vitrine_layout'> & Partial<Pick<VitrineAluno, 'secoes' | 'estrutura'>>; curriculo: ModuloAluno[]
    /** Resumos de cronograma já lidos (por id de bloco). Presente ⇒ montar NÃO consulta nada (modo editor / loader unificado). */
    resumos?: Record<string, ResumoCronograma | null>
    /** Editor visual (BlocoV1): linhas e seções já resolvidas no lugar de `vit.estrutura`/`vit.secoes`. Sem isto = comportamento legado. */
    linhas?: (LinhaBloco & { id: string })[]; secoes?: VitrineSecao[]
  },
): Promise<BlocoAluno[]> {
  const { vit, curriculo } = o
  const porId = new Map((o.secoes ?? vit.secoes ?? []).map((s) => [s.id, s]))
  // Linhas em ordem (banner/carrossel inativos já ficaram de fora de `vit.secoes`).
  type L = LinhaBloco & { id: string }
  const base: L[] = (o.linhas ?? vit.estrutura ?? [])
    .filter((e) => (e.tipo === 'banner' || e.tipo === 'carrossel') ? porId.has(e.id) : true)
    .map((e) => ({ id: e.id, tipo: e.tipo, nome: e.nome, ativo: e.ativo, config: e.config }))
  const linhas = completarBlocos<L>(base, (t) => t === 'progresso'
    ? { id: 'implicito:progresso', tipo: 'progresso', nome: null, ativo: true, config: {} }
    : { id: 'implicito:modulos', tipo: 'modulos', nome: TITULO_MODULOS_PADRAO, ativo: true, config: configModulosImplicita() })

  // Módulos já atribuídos a alguma seção (inclusive ocultas: ocultar a seção oculta os módulos dela).
  const atribuidos = new Set<string>()
  for (const l of linhas) if (l.tipo === 'modulos') for (const id of normConfigModulos(l.config).modulo_ids) atribuidos.add(id)
  const porModulo = new Map(curriculo.map((m) => [m.id, m]))
  const sobras = curriculo.filter((m) => !atribuidos.has(m.id))
  const temRestantes = linhas.some((l) => l.tipo === 'modulos' && l.ativo && normConfigModulos(l.config).restantes)
  // Sobras sem seção "restantes" ativa (ex.: ela foi ocultada ou nunca marcada): rede de segurança no fim das seções de módulos.
  const restantesOculta = linhas.some((l) => l.tipo === 'modulos' && !l.ativo && normConfigModulos(l.config).restantes)
  const precisaOutros = sobras.length > 0 && !temRestantes && !restantesOculta

  // Resumo do cronograma: lido UMA vez por bloco 'resumo' ativo.
  const out: BlocoAluno[] = []
  let primeiraRestantes = true
  let ultimoModulos = -1
  for (const l of linhas) {
    if (!l.ativo) continue
    if (l.tipo === 'progresso') { if (curriculo.length) out.push({ kind: 'progresso', key: l.id }); continue }
    if (l.tipo === 'cronograma') {
      const c = normConfigCronograma(l.config)
      // Lê o resumo só se algum conteúdo dinâmico estiver ligado (senão é só título + botão).
      const precisaDados = c.mostrar_metas || c.mostrar_progresso || c.mostrar_hoje || c.mostrar_atrasadas
      const resumo = o.resumos ? (o.resumos[l.id] ?? null) : precisaDados
        ? await resumoCronogramaDoAluno(svc, o.tenantId, o.estudanteId, c.cronograma_id ? [c.cronograma_id] : [], c.qtd_metas).catch(() => null)
        : null
      out.push({ kind: 'cronograma', key: l.id, cfg: { ...c, titulo: c.titulo.trim() || l.nome?.trim() || '' }, resumo })
      continue
    }
    if (l.tipo === 'modulos') {
      const c = normConfigModulos(l.config)
      const proprios = c.modulo_ids.map((id) => porModulo.get(id)).filter(Boolean) as ModuloAluno[]
      const extra = c.restantes && primeiraRestantes ? sobras : []
      if (c.restantes) primeiraRestantes = false
      const modulos = [...proprios, ...extra]
      if (!modulos.length) continue
      out.push({
        kind: 'modulos', key: l.id, titulo: l.nome?.trim() || TITULO_MODULOS_PADRAO, layout: l.config?.formato === 'trilha_imagem' ? 'trilha_imagem' : formatoParaLayout(c.formato, vit.vitrine_layout),
        agruparPrefixo: c.agrupar_prefixo, recolhivel: c.recolhivel, recolhida: c.recolhivel && c.recolhida, implicita: l.id.startsWith('implicito:'), modulos,
      })
      ultimoModulos = out.length - 1
      continue
    }
    const sec = porId.get(l.id)
    if (sec) out.push({ kind: 'vitrine', key: l.id, secao: sec })
  }
  if (precisaOutros) {
    const bloco: BlocoAluno = { kind: 'modulos', key: 'implicito:outros', titulo: TITULO_OUTROS_PADRAO, layout: vit.vitrine_layout, agruparPrefixo: false, recolhivel: false, recolhida: false, implicita: true, modulos: sobras }
    out.splice(ultimoModulos >= 0 ? ultimoModulos + 1 : out.length, 0, bloco)
  }
  return out
}
